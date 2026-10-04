import { BOSS, PLAYER, ZOMBIES } from '../../config/balance';
import { BOSS_VARIANTS, BOSSES, bossHp, type BossId, type BossVariantId } from '../../config/bosses';
import type { BossPhase, BossState, PlayerState } from '../../core/GameState';
import {
  BOSS_UNREACHABLE,
  bossNextPosition,
  bossStepsAt,
  computeBossNav,
  footprintFits,
  positionCentre,
  refreshBossNav,
  updateBossBlocking,
  type BossNav,
} from '../map/BossNav';
import { BLOCK_PLAYER, BLOCK_ZOMBIE, moveCircle, resolveCircle } from '../map/CollisionGrid';
import { crushFurniture, moveBody, pushOutOfBox, pushPlayerOut } from './BossBody';
import { computeLevels, type MapLevels } from '../map/levels';
import type { MapData } from '../map/MapLoader';
import { chooseAttack, startAttack, updateAttack, updatePuddles, updateWave, walkTime } from './BossAttacks';
import { bossHalf, isBossAlive, isBossSolid } from './BossCombat';
import { bodyHitPoint, damageZombie, isZombieAlive } from './Combat';
import { damagePlayer, isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { pushable } from './ZombieSystem';

/**
 * Bosses on the map (spec 07). A boss comes out of the floor (§3): a crack
 * opens on the boss spot nearest its target by walking among those at
 * least BOSS.spotMinTiles away (warning), it climbs out, unhurt by
 * anything, and whoever stands in the crack takes a blow and is thrown out
 * (emerging), and it roars, its health bar showing from then on. Then it
 * walks after its target (the nearest player alive) on its own way round
 * the map (BossNav), crushing the furniture its footprint touches: the
 * furniture loses its collision for good and turns into rubble. Walking, it
 * shoves the zombies in its way aside and pushes players without hurting
 * them (it is solid for them; the dash goes through). When its target goes
 * to another level, or it has no way to them for a while, it sinks and
 * comes out again near them, with its health. Dead, its corpse stays a moment.
 */

const scratchCentre = { x: 0, y: 0 };

export function updateBosses(ctx: SimContext, dt: number): void {
  const { bosses } = ctx.state;
  for (let i = 0; i < bosses.length; i++) {
    const b = bosses[i];
    if (!b?.active) continue;
    b.prevX = b.x;
    b.prevY = b.y;
    b.moving = false;
    b.timer -= dt;
    switch (b.phase) {
      case 'warning':
        if (b.timer <= 0) climbOut(ctx, b);
        break;
      case 'emerging':
        if (b.timer <= 0) {
          setPhase(ctx, b, 'roaring', BOSS.roarTime);
          b.introduced = true;
          ctx.events.emit('boss:roar', { x: b.x, y: b.y });
        }
        break;
      case 'roaring':
        if (b.timer <= 0) {
          setPhase(ctx, b, 'walking', 0);
          b.walkTimer = walkTime(ctx, b);
        }
        break;
      case 'walking':
        if (mustSink(ctx, b, i, dt)) {
          setPhase(ctx, b, 'sinking', BOSS.sinkTime);
          break;
        }
        if (b.furyPending) {
          roarInFury(ctx, b);
          break;
        }
        walk(ctx, b, i, dt);
        b.walkTimer -= dt;
        if (b.walkTimer <= 0) attackIfAble(ctx, b, i);
        break;
      case 'attacking':
        if (updateAttack(ctx, b, i, targetOf(ctx, b), dt)) endAttack(ctx, b);
        break;
      case 'sinking':
        // Gone under: out again near its target (if no spot will do yet, it tries again next tick).
        if (b.timer <= 0) {
          const target = targetOf(ctx, b);
          if (target) emergeNear(ctx, b, i, target);
        }
        break;
      case 'dead':
        if (b.timer <= 0) b.active = false;
        break;
    }
    // The ring of its last landing goes on growing whatever it does next.
    updateWave(ctx, b, i, dt);
  }
  updatePuddles(ctx, dt);
  separateBosses(ctx);
  for (const b of bosses) {
    if (!isBossSolid(b)) continue;
    shoveZombies(ctx, b);
    for (const p of ctx.state.players) pushPlayerOut(ctx, b, p);
  }
}

/** Its walk is over: the attack that suits (or the one forced from the debug panel), or it walks on a little longer. */
function attackIfAble(ctx: SimContext, b: BossState, slot: number): void {
  const target = targetOf(ctx, b);
  if (!target) return;
  // Another boss started an attack a moment ago: it waits its turn, so their warnings never fall all at once (spec 07 §6).
  const since = ctx.state.time - ctx.state.bossAttackAt;
  if (since < BOSS.attackStagger) {
    b.walkTimer = BOSS.attackStagger - since;
    return;
  }
  const attack = b.forcedAttack ?? chooseAttack(ctx, b, slot, target);
  b.forcedAttack = null;
  if (attack) {
    startAttack(ctx, b, attack, target);
    ctx.state.bossAttackAt = ctx.state.time;
  } else b.walkTimer = BOSS.rethinkTime;
}

/** The attack is over: it walks again for a while, after the nearest player alive (spec 07 §9); first its fury's roar, if due. */
function endAttack(ctx: SimContext, b: BossState): void {
  b.lastAttack = b.attack;
  b.attack = null;
  b.stage = 'none';
  setPhase(ctx, b, 'walking', 0);
  b.walkTimer = walkTime(ctx, b);
  b.target = nearestPlayer(ctx, b.x, b.y)?.id ?? -1;
  if (b.furyPending) roarInFury(ctx, b);
}

/** Under half its health (spec 07 §5): it roars (a red flash), and is enraged until it dies. */
function roarInFury(ctx: SimContext, b: BossState): void {
  b.furyPending = false;
  setPhase(ctx, b, 'roaring', BOSSES[b.boss].fury.roarTime);
  ctx.events.emit('boss:roar', { x: b.x, y: b.y });
}

function setPhase(ctx: SimContext, b: BossState, phase: BossPhase, timer: number): void {
  b.phase = phase;
  b.timer = timer;
  b.phaseTick = ctx.state.tick;
}

/** Its levels (ground floor, basement, roof), worked out once per map. */
const levelsByMap = new WeakMap<MapData, MapLevels>();

/** Level of the zone at (x, y), or -1 off every zone (a doorway: it says nothing). */
export function levelAt(map: MapData, x: number, y: number): number {
  let levels = levelsByMap.get(map);
  if (!levels) {
    levels = computeLevels(map);
    levelsByMap.set(map, levels);
  }
  const tx = Math.floor(x / map.tileSize);
  const ty = Math.floor(y / map.tileSize);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return -1;
  const zone = map.cellZone[ty * map.width + tx] ?? -1;
  return zone >= 0 ? (levels.zoneLevel[zone] ?? -1) : -1;
}

/**
 * It has to sink and come out near its target (spec 07 §3): the target went
 * to another level, or it has had no way to them for BOSS.noPathTime.
 */
function mustSink(ctx: SimContext, b: BossState, slot: number, dt: number): boolean {
  const target = targetOf(ctx, b);
  const nav = ctx.bossNavs[slot];
  if (!target || !nav) return false;
  const mine = levelAt(ctx.map, b.x, b.y);
  const theirs = levelAt(ctx.map, target.x, target.y);
  if (mine >= 0 && theirs >= 0 && mine !== theirs) return true;
  refreshBossNav(nav, ctx.map, ctx.state, target.x, target.y, 0);
  b.noPathTime = bossStepsAt(nav, b.x, b.y) === BOSS_UNREACHABLE ? b.noPathTime + dt : 0;
  return b.noPathTime >= BOSS.noPathTime;
}

/**
 * The crack has opened: it climbs out. Furniture in the crack is crushed,
 * and whoever stands in it takes BOSS.crackDamage (× its variant's damage)
 * and is thrown out of it; zombies in it take it too, with no points.
 */
function climbOut(ctx: SimContext, b: BossState): void {
  setPhase(ctx, b, 'emerging', BOSS.emergeTime);
  const nav = ctx.bossNavs[ctx.state.bosses.indexOf(b)];
  const half = (BOSS.crackTiles * ctx.map.tileSize) / 2;
  if (nav) crushFurniture(ctx, nav, b.x, b.y, half);
  const damage = BOSS.crackDamage * BOSS_VARIANTS[b.variant].damage;
  for (const p of ctx.state.players) {
    if (!isPlayerAlive(p)) continue;
    const reach = half + PLAYER.hitboxRadius;
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    if (Math.abs(dx) >= reach || Math.abs(dy) >= reach) continue;
    damagePlayer(ctx, p, damage, b.x, b.y);
    // Out by the nearest side of the crack.
    if (reach - Math.abs(dx) < reach - Math.abs(dy)) moveCircle(ctx.grid, p, (dx >= 0 ? reach : -reach) - dx + Math.sign(dx || 1), 0, PLAYER.hitboxRadius, BLOCK_PLAYER);
    else moveCircle(ctx.grid, p, 0, (dy >= 0 ? reach : -reach) - dy + Math.sign(dy || 1), PLAYER.hitboxRadius, BLOCK_PLAYER);
  }
  for (const z of ctx.state.zombies) {
    if (isZombieAlive(z) && Math.abs(z.x - b.x) < half && Math.abs(z.y - b.y) < half) damageZombie(ctx, z, damage, -1, bodyHitPoint(z, 0, -1));
  }
}

/** Two bosses never stand on each other: overlapping footprints push apart, half each, along the shallower axis. */
function separateBosses(ctx: SimContext): void {
  const { bosses } = ctx.state;
  const ts = ctx.map.tileSize;
  for (let i = 0; i < bosses.length; i++) {
    const a = bosses[i];
    if (!a || !isBossSolid(a)) continue;
    for (let j = i + 1; j < bosses.length; j++) {
      const b = bosses[j];
      if (!b || !isBossSolid(b)) continue;
      const reach = bossHalf(a, ts) + bossHalf(b, ts);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const overlapX = reach - Math.abs(dx);
      const overlapY = reach - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const alongX = overlapX < overlapY;
      const push = (alongX ? overlapX : overlapY) / 2;
      // Perfectly stacked: apart along x, by their slots.
      const sign = (alongX ? dx : dy) === 0 ? 1 : Math.sign(alongX ? dx : dy);
      moveBody(ctx, a, i, alongX ? -sign * push : 0, alongX ? 0 : -sign * push);
      moveBody(ctx, b, j, alongX ? sign * push : 0, alongX ? 0 : sign * push);
    }
  }
}

/** The player a boss goes for: the nearest one alive (spec 07 §9). */
export function nearestPlayer(ctx: SimContext, x: number, y: number): PlayerState | undefined {
  let best: PlayerState | undefined;
  let bestSq = Infinity;
  for (const p of ctx.state.players) {
    if (!isPlayerAlive(p)) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestSq) {
      bestSq = d;
      best = p;
    }
  }
  return best;
}

function targetOf(ctx: SimContext, b: BossState): PlayerState | undefined {
  const current = ctx.state.players.find((p) => p.id === b.target);
  if (current && isPlayerAlive(current)) return current;
  const p = nearestPlayer(ctx, b.x, b.y);
  b.target = p?.id ?? -1;
  return p;
}

/** Walking speed: its own, a quarter faster enraged (spec 07 §5). */
export function bossSpeed(b: BossState): number {
  const def = BOSSES[b.boss];
  return def.speed * (b.enraged ? def.fury.speedFactor : 1);
}

/** One step along its way to the target; it stops once next to it. */
function walk(ctx: SimContext, b: BossState, slot: number, dt: number): void {
  const target = targetOf(ctx, b);
  const nav = ctx.bossNavs[slot];
  if (!target || !nav) return;
  refreshBossNav(nav, ctx.map, ctx.state, target.x, target.y, dt);
  const next = bossNextPosition(nav, b.x, b.y);
  if (next < 0) return;
  const to = positionCentre(nav, next, scratchCentre);
  const dx = to.x - b.x;
  const dy = to.y - b.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-3) {
    // Already next to its target: it faces it and waits.
    b.facing = Math.atan2(target.y - b.y, target.x - b.x);
    return;
  }
  const step = Math.min(dist, bossSpeed(b) * dt);
  const mx = (dx / dist) * step;
  const my = (dy / dist) * step;
  const fromX = b.x;
  const fromY = b.y;
  moveBody(ctx, b, slot, mx, my);
  // Stopped on one axis (a corner of a door): the rest of the step goes along the other one, towards the next position.
  const left = step - Math.hypot(b.x - fromX, b.y - fromY);
  if (left > 1e-3) {
    const rx = to.x - b.x;
    const ry = to.y - b.y;
    if (Math.abs(b.x - fromX) < Math.abs(mx) - 1e-6 && Math.abs(ry) > 1e-3) moveBody(ctx, b, slot, 0, Math.sign(ry) * Math.min(left, Math.abs(ry)));
    else if (Math.abs(b.y - fromY) < Math.abs(my) - 1e-6 && Math.abs(rx) > 1e-3) moveBody(ctx, b, slot, Math.sign(rx) * Math.min(left, Math.abs(rx)), 0);
  }
  b.facing = Math.atan2(dy, dx);
  b.moving = true;
}

/**
 * Zombies in its way are shoved aside: out of its footprint across the way
 * it is going (sideways when it walks along x, up or down when along y).
 */
function shoveZombies(ctx: SimContext, b: BossState): void {
  const half = bossHalf(b, ctx.map.tileSize) + ZOMBIES.hitboxRadius;
  const alongX = Math.abs(Math.cos(b.facing)) >= Math.abs(Math.sin(b.facing));
  for (const z of ctx.state.zombies) {
    if (!pushable(z)) continue;
    if (!pushOutOfBox(z, b.x, b.y, half, alongX)) continue;
    if (z.ai === 'chasing' || z.ai === 'attacking' || z.ai === 'idle') resolveCircle(ctx.grid, z, ZOMBIES.hitboxRadius, BLOCK_ZOMBIE);
  }
}

/**
 * Puts boss `slot` on the map, walking, centred at (x, y): `boss` with
 * `variant`, its health × `hpFactor` (the calendar's lap) × the players.
 */
export function spawnBoss(ctx: SimContext, slot: number, boss: BossId, variant: BossVariantId, x: number, y: number, hpFactor = 1): BossState | undefined {
  const b = ctx.state.bosses[slot];
  const nav = ctx.bossNavs[slot];
  if (!b || !nav) return undefined;
  const hp = bossHp(boss, variant, hpFactor, ctx.state.players.length);
  Object.assign(b, {
    active: true,
    boss,
    variant,
    x,
    y,
    prevX: x,
    prevY: y,
    facing: Math.PI / 2,
    moving: false,
    hp,
    maxHp: hp,
    phase: 'walking',
    timer: 0,
    phaseTick: ctx.state.tick,
    enraged: BOSS_VARIANTS[variant].enraged,
    spot: -1,
    introduced: false,
    noPathTime: 0,
    attack: null,
    stage: 'none',
    lastAttack: null,
    hitPlayers: 0,
    runLeft: 0,
    count: 0,
    blowTick: -1000,
    waveTime: -1,
    waveHits: 0,
    furyPending: false,
    forcedAttack: null,
    target: -1,
    contactScoreTick: -1000,
  } satisfies Partial<BossState>);
  b.walkTimer = walkTime(ctx, b);
  b.burn.timer = 0;
  b.burn.perTick = 0;
  nav.side = BOSSES[boss].footprintTiles;
  nav.age = Infinity;
  return b;
}

/**
 * Boss `boss` comes into the match through slot `slot`: a crack opens on
 * the boss spot that suits its target (the first player alive) and it
 * climbs out of it (spec 07 §3). Undefined when the slot is busy or there
 * is nowhere for it to come out.
 */
export function startBossEntry(ctx: SimContext, slot: number, boss: BossId, variant: BossVariantId, hpFactor = 1): BossState | undefined {
  const target = ctx.state.players.find(isPlayerAlive);
  if (!target || ctx.state.bosses[slot]?.active) return undefined;
  const b = spawnBoss(ctx, slot, boss, variant, target.x, target.y, hpFactor);
  if (!b) return undefined;
  b.target = target.id;
  if (emergeNear(ctx, b, slot, target)) return b;
  b.active = false;
  return undefined;
}

/** Opens its crack near `target` (on the best boss spot, or anywhere it fits when the map has none that will do). */
function emergeNear(ctx: SimContext, b: BossState, slot: number, target: PlayerState): boolean {
  const spot = chooseBossSpot(ctx, slot, target);
  const at = spot >= 0 ? ctx.map.bossSpots[spot] : spawnPositionNear(ctx, slot, target, BOSS.spotMinTiles);
  if (!at) return false;
  b.x = b.prevX = at.x;
  b.y = b.prevY = at.y;
  b.spot = spot;
  b.noPathTime = 0;
  setPhase(ctx, b, 'warning', BOSS.warningTime);
  const nav = ctx.bossNavs[slot];
  if (nav) nav.age = Infinity;
  ctx.events.emit('boss:warning', { x: at.x, y: at.y });
  return true;
}

/**
 * The boss spot a boss comes out of (spec 07 §3): of those in unlocked
 * zones it can walk from to `target`, the nearest to them by walking among
 * those at least BOSS.spotMinTiles away; when none is that far, the
 * farthest. Never one another boss is using. -1 when none will do.
 */
export function chooseBossSpot(ctx: SimContext, slot: number, target: PlayerState): number {
  const nav = ctx.bossNavs[slot];
  if (!nav) return -1;
  updateBossBlocking(nav, ctx.map, ctx.state);
  computeBossNav(nav, target.x, target.y);
  let best = -1;
  let bestSteps = Infinity;
  let far = -1;
  let farSteps = -1;
  ctx.map.bossSpots.forEach((spot, i) => {
    if (!ctx.state.zonesUnlocked[spot.zoneIndex] || spotInUse(ctx, i, slot)) return;
    const steps = stepsFromSpot(nav, spot.x, spot.y);
    if (steps === BOSS_UNREACHABLE) return;
    if (steps >= BOSS.spotMinTiles && steps < bestSteps) {
      best = i;
      bestSteps = steps;
    }
    if (steps > farSteps) {
      far = i;
      farSteps = steps;
    }
  });
  return best >= 0 ? best : far;
}

/** Fewest steps to the target from the footprint positions centred on the spot's tile. */
function stepsFromSpot(nav: BossNav, x: number, y: number): number {
  const cx = Math.floor(x / nav.tileSize);
  const cy = Math.floor(y / nav.tileSize);
  let best = BOSS_UNREACHABLE;
  for (let ty = cy - nav.side + 1; ty <= cy; ty++) {
    for (let tx = cx - nav.side + 1; tx <= cx; tx++) {
      if (tx < 0 || ty < 0 || tx >= nav.width || ty >= nav.height) continue;
      const d = nav.dist[ty * nav.width + tx] ?? BOSS_UNREACHABLE;
      if (d !== BOSS_UNREACHABLE && (best === BOSS_UNREACHABLE || d < best)) best = d;
    }
  }
  return best;
}

/** Another boss is coming out of spot `index`, or stands on its crack. */
function spotInUse(ctx: SimContext, index: number, slot: number): boolean {
  const spot = ctx.map.bossSpots[index];
  if (!spot) return true;
  const crack = (BOSS.crackTiles * ctx.map.tileSize) / 2;
  return ctx.state.bosses.some((o, j) => {
    if (j === slot || !isBossAlive(o)) return false;
    if (o.spot === index && (o.phase === 'warning' || o.phase === 'emerging' || o.phase === 'roaring')) return true;
    const reach = crack + bossHalf(o, ctx.map.tileSize);
    return isBossSolid(o) && Math.abs(o.x - spot.x) < reach && Math.abs(o.y - spot.y) < reach;
  });
}

/** A free boss slot, or -1 when BOSS.maxAlive are on the map. */
export function freeBossSlot(ctx: SimContext): number {
  return ctx.state.bosses.findIndex((b) => !b.active);
}

/**
 * Where a boss comes in when there is no boss spot: the position its
 * footprint fits in nearest to the player by walking, among those at least
 * `minSteps` steps away (the farthest when none is that far). Null when it
 * cannot reach the player at all.
 */
export function spawnPositionNear(ctx: SimContext, slot: number, p: PlayerState, minSteps: number): { x: number; y: number } | null {
  const nav = ctx.bossNavs[slot];
  if (!nav) return null;
  updateBossBlocking(nav, ctx.map, ctx.state);
  computeBossNav(nav, p.x, p.y);
  let best = -1;
  let bestSteps = Infinity;
  let far = -1;
  let farSteps = -1;
  const side = nav.side * nav.tileSize;
  for (let pos = 0; pos < nav.dist.length; pos++) {
    const d = nav.dist[pos] ?? BOSS_UNREACHABLE;
    if (d === BOSS_UNREACHABLE) continue;
    const tx = pos % nav.width;
    if (!footprintFits(nav, tx, (pos - tx) / nav.width)) continue;
    // Never on another boss.
    const c = positionCentre(nav, pos, scratchCentre);
    if (ctx.state.bosses.some((o) => isBossAlive(o) && Math.abs(o.x - c.x) < side && Math.abs(o.y - c.y) < side)) continue;
    if (d >= minSteps && d < bestSteps) {
      best = pos;
      bestSteps = d;
    }
    if (d > farSteps) {
      far = pos;
      farSteps = d;
    }
  }
  const pos = best >= 0 ? best : far;
  if (pos < 0) return null;
  const c = positionCentre(nav, pos, { x: 0, y: 0 });
  return { x: c.x, y: c.y };
}
