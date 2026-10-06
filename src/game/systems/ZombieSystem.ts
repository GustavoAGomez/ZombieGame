import { playerStats } from '../dungeon/stats';
import { holdAndSpit, lightFuse } from './EnemyKinds';
import { DUNGEON } from '../../config/dungeon';
import { rules } from '../rules';
import { NAVIGATION, PLAYER, ZOMBIES } from '../../config/balance';
import type { PlayerState, ZombieAi, ZombieState } from '../../core/GameState';
import { BLOCK_ZOMBIE, moveCircle, resolveCircle, segmentClear } from '../map/CollisionGrid';
import { UNREACHABLE, computeFlowField, distanceAt, flowDirection, flowNextCell, sourcesChanged } from '../map/FlowField';
import type { MapData, MapWindow } from '../map/MapLoader';
import { isZombieAlive } from './Combat';
import { damagePlayer, isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { isDashing } from './SpecialSystem';

/**
 * Zombie behaviour (spec 01 §4.4–4.5):
 *   toWindow  walk straight to the window's near side (the exterior point
 *             from a spawn, or whichever side the zombie is on); within
 *             windowArriveRadius of it, straight up to the planks, keeping
 *             its place along them so several can line up
 *   tearing   pull one plank every tearTime seconds while any are left,
 *             faster with a crowd at the window: every zombie tearing it or
 *             waiting close by adds its strength (up to maxTearCrowd),
 *             shared among those tearing;
 *             standing still against the planks: no zombie pushes it, and
 *             it is never pushed out of a player's way (the player is
 *             pushed out instead, MovementSystem), so it never swings while
 *             sliding
 *   climbing  0.8 s to the far side; cannot move or be pushed
 *   entering  from an open spawn off the map, walk straight in to the first
 *             tile of its zone, then chase (spec 02 §3.4, docs/DECISIONS.md)
 *   chasing   follow the flow field (straight line when close and visible)
 *
 * The flow field goes through barricaded windows at the cost of their
 * planks: a chasing zombie whose way leads into a window goes for it,
 * tears it down and climbs through, in or out, instead of walking round by
 * the open doors. A zombie heading for its window keeps at it unless the
 * field knows a way at least routeSwitchSteps shorter (the player walked
 * out to it, say: spec 02 §3.5).
 *   attacking 0.35 s windup, 40 damage if still in range, 1.1 s cooldown
 *
 * With 1 damage unit of HP or less left a zombie crawls: it walks at less
 * than half its speed (tearing, climbing and attacking are unchanged).
 *   dead      corpse for the death animation, then the slot is freed
 *
 * Going to a window, tearing it and walking in from off the map happen off
 * the map's collision on purpose (the way in from a spawn can cross the
 * void outside a grating, or the outside of the map):
 * those zombies are never pushed out of blocked tiles. A chasing zombie that
 * ends up off the flow field (shoved out through a window by the crowd)
 * goes back in through the nearest window; with none near, after
 * NAVIGATION.lostRespawnTime it leaves the map and spawns again.
 */

const sourceCells: number[] = [];
const scratchDir = { x: 0, y: 0 };
const scratchSpot = { x: 0, y: 0 };
/** Per window, this tick: zombies crowding it, and how many of them are tearing it. */
const crowdAt: number[] = [];
const tearersAt: number[] = [];

export function updateZombies(ctx: SimContext, dt: number): void {
  refreshFlowField(ctx, dt);
  countWindowCrowds(ctx);
  const { zombies } = ctx.state;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z?.active) continue;
    z.prevX = z.x;
    z.prevY = z.y;
    if (z.attackCooldown > 0) z.attackCooldown = Math.max(0, z.attackCooldown - dt);
    switch (z.ai) {
      case 'toWindow':
        if (betterWayThanWindow(ctx, z)) setState(ctx, z, 'chasing');
        else updateToWindow(ctx, z, dt);
        break;
      case 'tearing':
        if (betterWayThanWindow(ctx, z)) setState(ctx, z, 'chasing');
        else updateTearing(ctx, z, dt);
        break;
      case 'entering':
        updateEntering(ctx, z, dt);
        break;
      case 'climbing':
        updateClimbing(ctx, z, dt);
        break;
      case 'chasing':
        updateChasing(ctx, z, dt);
        break;
      case 'attacking':
        updateAttacking(ctx, z, dt);
        break;
      case 'dead':
        z.timer -= dt;
        if (z.timer <= 0) z.active = false;
        break;
      case 'idle':
        break;
    }
  }
  separateZombies(ctx);
  pushZombiesOutOfPlayers(ctx);
}

function setState(ctx: SimContext, z: ZombieState, ai: ZombieAi, timer = 0): void {
  z.ai = ai;
  z.timer = timer;
  z.stateTick = ctx.state.tick;
}

/**
 * True when the flow field knows a way from here clearly shorter than going
 * through the zombie's window (or the window leads nowhere any more).
 * Outside a zone the player can reach, the field does not get here: keep
 * going for the window.
 */
function betterWayThanWindow(ctx: SimContext, z: ZombieState): boolean {
  const { nav, map } = ctx;
  const here = distanceAt(nav, z.x, z.y);
  if (here === UNREACHABLE) return false;
  const w = map.windows[z.window];
  if (!w) return true;
  const through = nav.dist[w.tileY * map.width + w.tileX] ?? UNREACHABLE;
  if (through === UNREACHABLE) return true;
  const entry = z.crossOut ? w.interior : w.exterior;
  const toWindow = Math.hypot(entry.x - z.x, entry.y - z.y) / map.tileSize + 1;
  return here + NAVIGATION.routeSwitchSteps < through + toWindow;
}

/** Heads for window `index` to go through it from the side the zombie is on. */
function startCrossing(ctx: SimContext, z: ZombieState, index: number): void {
  const w = ctx.map.windows[index];
  if (!w) return;
  z.window = index;
  z.crossOut = (z.x - w.center.x) * w.outward.x + (z.y - w.center.y) * w.outward.y < 0;
  setState(ctx, z, 'toWindow');
}

/** A zombie with crawlAtHp or less left drags itself along; the brute never loses its legs (spec 09 §5.2). */
export function isCrawling(z: ZombieState): boolean {
  return z.kind !== 'brute' && z.hp > 0 && z.hp <= ZOMBIES.crawlAtHp;
}

/** Px/s now: its kind's, crawling, elite, and the curse Acosado's (spec 09 §9). */
function speedOf(ctx: SimContext, z: ZombieState): number {
  return ZOMBIES.kinds[z.kind].speed * (isCrawling(z) ? ZOMBIES.crawlSpeedFactor : 1) * (z.elite ? DUNGEON.elite.speed : 1) * playerStats(ctx.state.run).enemySpeed;
}

/** How far a zombie's claws reach (from the player's hitbox): the spitter's longer (spec 09 §5.2). */
export function attackRangeOf(z: ZombieState): number {
  return z.kind === 'spitter' ? DUNGEON.kinds.spitter.meleeRange : ZOMBIES.attackRange;
}

/** What a zombie's claw takes: the mode's, the brute's own (spec 09 §5.2). */
export function attackDamageOf(ctx: SimContext, z: ZombieState): number {
  return z.kind === 'brute' ? DUNGEON.kinds.brute.damage : rules(ctx.state).zombieDamage;
}

function updateToWindow(ctx: SimContext, z: ZombieState, dt: number): void {
  const w = ctx.map.windows[z.window];
  if (!w) return setState(ctx, z, 'chasing');
  const entry = z.crossOut ? w.interior : w.exterior;
  // Close to the window: up to the planks, at its own place along them.
  const target = Math.hypot(entry.x - z.x, entry.y - z.y) <= ZOMBIES.windowArriveRadius ? plankSpot(w, entry, z) : entry;
  const dx = target.x - z.x;
  const dy = target.y - z.y;
  const dist = Math.hypot(dx, dy);
  const step = speedOf(ctx, z) * dt;
  if (dist <= step) {
    z.x = target.x;
    z.y = target.y;
    if ((ctx.state.windowPlanks[z.window] ?? 0) > 0) {
      setState(ctx, z, 'tearing', ZOMBIES.kinds[z.kind].tearTime);
      // A new run of swings: the first one plays even right after another strike.
      z.actionTick = ctx.state.tick;
    } else startClimb(ctx, z);
    return;
  }
  z.x += (dx / dist) * step;
  z.y += (dy / dist) * step;
  z.facing = Math.atan2(dy, dx);
}

/** Straight in from beyond the edge to the first tile of the zone, then after the player. */
function updateEntering(ctx: SimContext, z: ZombieState, dt: number): void {
  const target = ctx.map.openSpawns[z.entry]?.entry;
  if (!target) return setState(ctx, z, 'chasing');
  const dx = target.x - z.x;
  const dy = target.y - z.y;
  const dist = Math.hypot(dx, dy);
  const step = speedOf(ctx, z) * dt;
  if (dist <= step) {
    z.x = target.x;
    z.y = target.y;
    z.entry = -1;
    setState(ctx, z, 'chasing');
    return;
  }
  z.x += (dx / dist) * step;
  z.y += (dy / dist) * step;
  z.facing = Math.atan2(dy, dx);
}

/**
 * Where a zombie stands to tear window `w`: on the line through its entry
 * point along the planks, at the zombie's own offset along them (up to
 * windowArriveRadius), so two can stand side by side.
 */
function plankSpot(w: MapWindow, entry: { x: number; y: number }, z: ZombieState): { x: number; y: number } {
  const alongX = -w.outward.y;
  const alongY = w.outward.x;
  const offset = Math.max(-ZOMBIES.windowArriveRadius, Math.min(ZOMBIES.windowArriveRadius, (z.x - entry.x) * alongX + (z.y - entry.y) * alongY));
  scratchSpot.x = entry.x + alongX * offset;
  scratchSpot.y = entry.y + alongY * offset;
  return scratchSpot;
}

/**
 * Zombies crowding each window: those tearing it, and those on their way
 * that are already within tearCrowdRadius of their entry point, waiting
 * their turn behind or beside them.
 */
function countWindowCrowds(ctx: SimContext): void {
  const { map, state } = ctx;
  crowdAt.length = 0;
  tearersAt.length = 0;
  for (let i = 0; i < map.windows.length; i++) {
    crowdAt.push(0);
    tearersAt.push(0);
  }
  for (const z of state.zombies) {
    if (!crowdsWindow(map, z, z.window)) continue;
    crowdAt[z.window] = (crowdAt[z.window] ?? 0) + 1;
    if (z.ai === 'tearing') tearersAt[z.window] = (tearersAt[z.window] ?? 0) + 1;
  }
}

/**
 * Zombie `z` is at window `index`: tearing it, or on its way and already
 * within tearCrowdRadius of its entry point.
 */
export function crowdsWindow(map: MapData, z: ZombieState, index: number): boolean {
  if (!z.active || index < 0 || z.window !== index) return false;
  if (z.ai === 'tearing') return true;
  if (z.ai !== 'toWindow') return false;
  const w = map.windows[index];
  const entry = w && (z.crossOut ? w.interior : w.exterior);
  return entry !== undefined && Math.hypot(entry.x - z.x, entry.y - z.y) <= ZOMBIES.tearCrowdRadius;
}

function updateTearing(ctx: SimContext, z: ZombieState, dt: number): void {
  const w = ctx.map.windows[z.window];
  if (!w) return setState(ctx, z, 'chasing');
  z.facing = facingThrough(w, z);
  const planks = ctx.state.windowPlanks;
  if ((planks[z.window] ?? 0) <= 0) {
    startClimb(ctx, z);
    return;
  }
  // The crowd's strength (up to maxTearCrowd), shared among the zombies tearing this window.
  z.tearRate = Math.min(crowdAt[z.window] ?? 1, ZOMBIES.maxTearCrowd) / Math.max(1, tearersAt[z.window] ?? 1);
  z.timer -= dt * z.tearRate;
  if (z.timer > 0) return;
  planks[z.window] = Math.max(0, (planks[z.window] ?? 0) - 1);
  z.actionTick = ctx.state.tick;
  ctx.events.emit('barricade:plankBroken', { x: w.center.x, y: w.center.y });
  z.timer += ZOMBIES.kinds[z.kind].tearTime;
}

function startClimb(ctx: SimContext, z: ZombieState): void {
  z.fromX = z.x;
  z.fromY = z.y;
  setState(ctx, z, 'climbing', ZOMBIES.climbTime);
}

function updateClimbing(ctx: SimContext, z: ZombieState, dt: number): void {
  const w = ctx.map.windows[z.window];
  if (!w) return setState(ctx, z, 'chasing');
  z.timer = Math.max(0, z.timer - dt);
  const t = 1 - z.timer / ZOMBIES.climbTime;
  const exit = z.crossOut ? w.exterior : w.interior;
  z.x = z.fromX + (exit.x - z.fromX) * t;
  z.y = z.fromY + (exit.y - z.fromY) * t;
  z.facing = facingThrough(w, z);
  if (z.timer <= 0) {
    z.window = -1;
    z.crossOut = false;
    setState(ctx, z, 'chasing');
  }
}

/** Facing across the window: inwards when breaking in, outwards when going out. */
function facingThrough(w: { outward: { x: number; y: number } }, z: ZombieState): number {
  return z.crossOut ? Math.atan2(w.outward.y, w.outward.x) : Math.atan2(-w.outward.y, -w.outward.x);
}

function nearestAlivePlayer(ctx: SimContext, x: number, y: number): PlayerState | undefined {
  let best: PlayerState | undefined;
  let bestDistSq = Infinity;
  for (const p of ctx.state.players) {
    if (!isPlayerAlive(p)) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestDistSq) {
      best = p;
      bestDistSq = d;
    }
  }
  return best;
}

/** Distance from the zombie centre to the edge of the player's hitbox. */
function reachTo(z: ZombieState, p: PlayerState): number {
  return Math.hypot(p.x - z.x, p.y - z.y) - PLAYER.hitboxRadius;
}

function updateChasing(ctx: SimContext, z: ZombieState, dt: number): void {
  const target = nearestAlivePlayer(ctx, z.x, z.y);
  if (!target) return;
  if (distanceAt(ctx.nav, z.x, z.y) === UNREACHABLE) {
    if (recoverLostZombie(ctx, z, dt)) return;
  } else {
    z.lostTimer = 0;
  }
  const dx = target.x - z.x;
  const dy = target.y - z.y;
  const dist = Math.hypot(dx, dy);

  // The spitter keeps its distance while it sees the player (spec 09 §5.2).
  if (z.kind === 'spitter' && holdAndSpit(ctx, z, target, dist, dt)) return;

  if (reachTo(z, target) <= attackRangeOf(z)) {
    z.facing = Math.atan2(dy, dx);
    // The exploder does not claw: on reaching the player its fuse lights (spec 09 §5.2).
    if (z.kind === 'exploder') {
      lightFuse(ctx, z);
      return;
    }
    if (z.attackCooldown <= 0) {
      setState(ctx, z, 'attacking', ZOMBIES.attackWindup);
      z.actionTick = ctx.state.tick;
      ctx.events.emit('zombie:attack', { x: z.x, y: z.y });
    }
    return; // in reach: hold position instead of pushing into the player
  }

  let dirX: number;
  let dirY: number;
  const close = dist <= ZOMBIES.directChaseTiles * ctx.map.tileSize;
  if (close && segmentClear(ctx.grid, z.x, z.y, target.x, target.y, BLOCK_ZOMBIE)) {
    dirX = dx / dist;
    dirY = dy / dist;
  } else if (flowDirection(ctx.nav, z.x, z.y, scratchDir)) {
    // The way goes through a window: tear it down and climb through.
    const window = ctx.nav.cellWindow[flowNextCell(ctx.nav, z.x, z.y)] ?? -1;
    if (window >= 0) {
      startCrossing(ctx, z, window);
      return;
    }
    dirX = scratchDir.x;
    dirY = scratchDir.y;
  } else {
    // Off the field (e.g. squeezed into a corner): head straight for the player.
    dirX = dx / (dist || 1);
    dirY = dy / (dist || 1);
  }
  z.facing = Math.atan2(dirY, dirX);
  const step = speedOf(ctx, z) * dt;
  const blocker = blockedAhead(ctx, z, dirX, dirY, target);
  if (blocker) {
    // Sidestep away from the zombie in front to flow around it and surround the player.
    let sx = -dirY;
    let sy = dirX;
    if ((blocker.x - z.x) * sx + (blocker.y - z.y) * sy > 0) {
      sx = -sx;
      sy = -sy;
    }
    const side = step * ZOMBIES.sidestepFactor;
    moveCircle(ctx.grid, z, sx * side, sy * side, ZOMBIES.hitboxRadius, BLOCK_ZOMBIE);
    return;
  }
  moveCircle(ctx.grid, z, dirX * step, dirY * step, ZOMBIES.hitboxRadius, BLOCK_ZOMBIE);
}

/**
 * Returns another zombie, closer to the target, touching this one in front
 * (±60°). Sidestepping instead of pushing keeps crowds from collapsing
 * into one blob.
 */
function blockedAhead(
  ctx: SimContext,
  z: ZombieState,
  dirX: number,
  dirY: number,
  target: PlayerState,
): ZombieState | undefined {
  const minDist = ZOMBIES.hitboxRadius * 2 + ZOMBIES.separationPadding;
  const myDistSq = (target.x - z.x) ** 2 + (target.y - z.y) ** 2;
  const { zombies } = ctx.state;
  for (let i = 0; i < zombies.length; i++) {
    const o = zombies[i];
    if (!o || o === z || !pushable(o)) continue;
    const dx = o.x - z.x;
    const dy = o.y - z.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist || distSq < 1e-9) continue;
    if (dx * dirX + dy * dirY < 0.5 * Math.sqrt(distSq)) continue;
    if ((target.x - o.x) ** 2 + (target.y - o.y) ** 2 < myDistSq) return o;
  }
  return undefined;
}

/**
 * A chasing zombie off the flow field: back in through the nearest window
 * within NAVIGATION.lostWindowRange, or, after NAVIGATION.lostRespawnTime,
 * off the map to spawn again (the round's count is kept). Returns true when
 * it was handled this tick.
 */
function recoverLostZombie(ctx: SimContext, z: ZombieState, dt: number): boolean {
  const { map, state } = ctx;
  let best = -1;
  let bestSq = (NAVIGATION.lostWindowRange * map.tileSize) ** 2;
  map.windows.forEach((w, i) => {
    // Only windows that lead somewhere the field reaches.
    if ((ctx.nav.dist[w.tileY * map.width + w.tileX] ?? UNREACHABLE) === UNREACHABLE) return;
    const d = (w.center.x - z.x) ** 2 + (w.center.y - z.y) ** 2;
    if (d < bestSq) {
      bestSq = d;
      best = i;
    }
  });
  if (best >= 0) {
    z.lostTimer = 0;
    startCrossing(ctx, z, best);
    return true;
  }
  z.lostTimer += dt;
  if (z.lostTimer < NAVIGATION.lostRespawnTime) return false;
  z.active = false;
  z.lostTimer = 0;
  if (state.wave.toSpawn >= 0) state.wave.toSpawn++;
  return true;
}

function updateAttacking(ctx: SimContext, z: ZombieState, dt: number): void {
  const target = nearestAlivePlayer(ctx, z.x, z.y);
  if (target) z.facing = Math.atan2(target.y - z.y, target.x - z.x);
  z.timer -= dt;
  if (z.timer > 0) return;
  // The strike lands only if the player is still in reach after the windup.
  if (target && reachTo(z, target) <= attackRangeOf(z)) damagePlayer(ctx, target, attackDamageOf(ctx, z), z.x, z.y);
  z.actionTick = ctx.state.tick;
  z.attackCooldown = ZOMBIES.attackCooldown;
  setState(ctx, z, 'chasing');
}

function refreshFlowField(ctx: SimContext, dt: number): void {
  const { nav, state, map } = ctx;
  nav.age += dt;
  sourceCells.length = 0;
  for (const p of state.players) {
    if (!isPlayerAlive(p)) continue;
    sourceCells.push(Math.floor(p.y / map.tileSize) * map.width + Math.floor(p.x / map.tileSize));
  }
  if (nav.age >= NAVIGATION.flowFieldInterval || sourcesChanged(nav, sourceCells)) {
    computeFlowField(nav, map, ctx.grid, state.zonesUnlocked, sourceCells, state.portalsOpen, state.windowPlanks);
  }
}

export function pushable(z: ZombieState): boolean {
  return isZombieAlive(z) && z.ai !== 'climbing' && z.kind !== 'brute';
}

/** Tearing planks: it pushes the crowd away but nothing moves it, so it only swings standing still. */
function anchored(z: ZombieState): boolean {
  return z.ai === 'tearing';
}

/**
 * Going to a window, tearing it and walking in from off the map ignore the
 * map (the way from a spawn can cross the void outside a grating, or the
 * outside of the map): pushing those zombies out of blocked tiles threw
 * them a tile away every tick, and they never reached the window.
 */
function followsMap(z: ZombieState): boolean {
  return z.ai !== 'toWindow' && z.ai !== 'tearing' && z.ai !== 'entering';
}

/** Zombies push each other softly so they never stack on one spot. */
function separateZombies(ctx: SimContext): void {
  const { zombies } = ctx.state;
  const minDist = ZOMBIES.hitboxRadius * 2 + ZOMBIES.separationPadding;
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i];
    if (!a || !pushable(a)) continue;
    for (let j = i + 1; j < zombies.length; j++) {
      const b = zombies[j];
      if (!b || !pushable(b)) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist) continue;
      let dist = Math.sqrt(distSq);
      if (dist < 1e-6) {
        // Perfectly stacked: split them along a fixed per-pair direction.
        const angle = ((i * 7 + j * 13) % 16) * (Math.PI / 8);
        dx = Math.cos(angle);
        dy = Math.sin(angle);
        dist = 1;
      } else {
        dx /= dist;
        dy /= dist;
      }
      // Each takes half the push; next to one tearing planks, the other takes all of it.
      const aFixed = anchored(a);
      const bFixed = anchored(b);
      if (aFixed && bFixed) continue;
      const push = (minDist - Math.min(dist, minDist)) * ZOMBIES.separationStrength;
      const aShare = aFixed ? 0 : bFixed ? 1 : 0.5;
      a.x -= dx * push * aShare;
      a.y -= dy * push * aShare;
      b.x += dx * push * (1 - aShare);
      b.y += dy * push * (1 - aShare);
    }
  }
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z && pushable(z) && followsMap(z)) resolveCircle(ctx.grid, z, ZOMBIES.hitboxRadius, BLOCK_ZOMBIE);
  }
}

/**
 * Zombies never push the player: when one ends up overlapping a player
 * (separation, sidestep), it is the zombie that moves out. So a horde
 * surrounds you instead of shoving you around. Dashing players are
 * intangible. The player's own moves are blocked in MovementSystem.
 */
function pushZombiesOutOfPlayers(ctx: SimContext): void {
  const minDist = PLAYER.hitboxRadius + ZOMBIES.hitboxRadius;
  for (const p of ctx.state.players) {
    if (!isPlayerAlive(p) || isDashing(p)) continue;
    for (const z of ctx.state.zombies) {
      if (!pushable(z) || anchored(z)) continue;
      const dx = z.x - p.x;
      const dy = z.y - p.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= minDist * minDist || distSq < 1e-9) continue;
      const dist = Math.sqrt(distSq);
      z.x += (dx / dist) * (minDist - dist);
      z.y += (dy / dist) * (minDist - dist);
      if (followsMap(z)) resolveCircle(ctx.grid, z, ZOMBIES.hitboxRadius, BLOCK_ZOMBIE);
    }
  }
}
