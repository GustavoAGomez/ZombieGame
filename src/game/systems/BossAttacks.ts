import { BOSS, PLAYER, ZOMBIES } from '../../config/balance';
import { BOSS_VARIANTS, BOSSES, windupFactor, type BossAttackId } from '../../config/bosses';
import type { BossStage, BossState, PlayerState, PuddleState, ZombieState } from '../../core/GameState';
import { degToRad } from '../../core/math';
import { randomRange, random } from '../../core/Rng';
import { boxBlocked, footprintFits, updateBossBlocking } from '../map/BossNav';
import { BLOCK_BULLET, BLOCK_PLAYER, BLOCK_SIGHT, moveCircle, segmentClearShaped } from '../map/CollisionGrid';
import { crushFurniture, moveBody } from './BossBody';
import { bossHalf, isBossSolid } from './BossCombat';
import { bodyHitPoint, damageZombie, isZombieAlive, knockZombie } from './Combat';
import { damagePlayer, isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';

/**
 * A boss's attacks (spec 07 §4). Every attack is announced by its windup:
 * the boss stands still in a pose of its own until the blow. No zone is
 * drawn on the floor any more (petición del usuario); a leap shows its
 * shadow. The dash goes through all of them (damagePlayer). Windups are its
 * variant's (never under 80 %).
 *
 * The charge (§4.1): it crouches facing its target (the way follows the
 * target and locks a moment before it runs),
 * then runs straight, crushing the furniture on its way and running over
 * the zombies (they die, without points). A player it catches takes its
 * damage once and is thrown along the run. Into a wall it is stunned, and
 * takes double damage; otherwise it brakes.
 *
 * The triple slam (§4.2): three blows over an arc in front of it, each with
 * the mallet raised first; between blows it turns towards its target
 * (45° at most) and steps forward. Then it stands still a while.
 *
 * The three leaps (§4.3): to where its target stands at takeoff (the nearest
 * place its footprint fits), unhurt in the air, its shadow under it. The
 * landing hurts around it and sends out a ring that grows and hurts once
 * per leap whoever it reaches with a clear line from the landing (walls
 * stop it). Running straight away from where it will land as it takes off, the ring
 * never catches a player; walking (shooting) it does.
 *
 * Its blows hurt the zombies too, as they hurt players (the charge kills
 * them outright), with no points for anyone (petición del usuario); bosses
 * never hurt each other. The putrid one leaves puddles where it lands and
 * a trail of them along its charges.
 */

/**
 * A boss's blow on a zombie: its damage, with blood sprayed away from
 * (fromX, fromY) and no points for anyone; one that survives is pushed
 * `push` px away. Returns true if it died.
 */
function hurtZombie(ctx: SimContext, z: ZombieState, damage: number, fromX: number, fromY: number, push = 0): boolean {
  const d = Math.hypot(z.x - fromX, z.y - fromY) || 1;
  const dirX = (z.x - fromX) / d;
  const dirY = (z.y - fromY) / d;
  if (damageZombie(ctx, z, damage, -1, bodyHitPoint(z, dirX, dirY))) return true;
  knockZombie(ctx, z, dirX, dirY, push);
  return false;
}

/** Its next walk between attacks: the boss's walking time, half as long enraged (spec 07 §5). */
export function walkTime(ctx: SimContext, b: BossState): number {
  const def = BOSSES[b.boss];
  return randomRange(ctx.state, def.walkTime.min, def.walkTime.max) * (b.enraged ? def.fury.walkFactor : 1);
}

/**
 * What it does when its walking time is up (spec 07 §4.4), by the distance
 * from its centre to its target: close, the slam (70 %) or the leaps
 * (30 %); mid-range with a straight clear way, the charge (60 %) or the
 * leaps (40 %); farther or with no clear way, the leaps, if the target is
 * within a leap. Never the same attack twice running, and only those it
 * has. Null: it keeps walking.
 */
export function chooseAttack(ctx: SimContext, b: BossState, slot: number, target: PlayerState): BossAttackId | null {
  const def = BOSSES[b.boss];
  const d = Math.hypot(target.x - b.x, target.y - b.y);
  let options: readonly (readonly [BossAttackId, number])[];
  if (d < def.choice.closeRange) options = def.choice.close;
  else if (d <= def.choice.farRange && clearRun(ctx, b, slot, target.x, target.y)) options = def.choice.mid;
  else options = d <= def.leap.maxRange ? [['leap', 1]] : [];
  const allowed = options.filter(([a]) => a !== b.lastAttack && def.attacks.includes(a));
  const total = allowed.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let roll = random(ctx.state) * total;
  for (const [attack, weight] of allowed) {
    roll -= weight;
    if (roll < 0) return attack;
  }
  return allowed[allowed.length - 1]?.[0] ?? null;
}

/** Its body fits all the way from where it stands to (x, y) in a straight line (furniture does not count: it crushes it). */
export function clearRun(ctx: SimContext, b: BossState, slot: number, x: number, y: number): boolean {
  const nav = ctx.bossNavs[slot];
  if (!nav) return false;
  const half = bossHalf(b, ctx.map.tileSize) - BOSS.bodySlack;
  const dx = x - b.x;
  const dy = y - b.y;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / BOSS.maxSubstep));
  for (let i = 1; i <= steps; i++) {
    if (boxBlocked(nav, b.x + (dx * i) / steps, b.y + (dy * i) / steps, half)) return false;
  }
  return true;
}

/** Starts `attack` towards `target`. */
export function startAttack(ctx: SimContext, b: BossState, attack: BossAttackId, target: PlayerState): void {
  // What stops its body, as the match is now (doors, merchants): its blows are judged against it.
  const slot = ctx.state.bosses.indexOf(b);
  const nav = ctx.bossNavs[slot];
  if (nav) updateBossBlocking(nav, ctx.map, ctx.state);
  b.phase = 'attacking';
  b.attack = attack;
  b.hitPlayers = 0;
  b.count = 0;
  aimAt(b, target);
  ctx.events.emit('boss:windup', { x: b.x, y: b.y, attack });
  if (attack === 'charge') {
    setStage(ctx, b, 'windup', chargeWindup(b));
    b.runLeft = BOSSES[b.boss].charge.distance;
  } else if (attack === 'slam') setStage(ctx, b, 'windup', slamWindup(b));
  else takeOff(ctx, b, slot, target);
}

/** Its charge's windup: the base one by its variant (never under 80 %). */
export function chargeWindup(b: BossState): number {
  return BOSSES[b.boss].charge.windup * windupFactor(b.variant);
}

/** The windup of the slam's blow under way: the first one's, or the wait between blows (each the next one's warning). */
export function slamWindup(b: BossState): number {
  const slam = BOSSES[b.boss].slam;
  return (b.count === 0 ? slam.windup : slam.between) * windupFactor(b.variant);
}

/** Seconds in the air on a leap: the circle's warning, by its variant. */
export function leapAirTime(b: BossState): number {
  return BOSSES[b.boss].leap.air * windupFactor(b.variant);
}

function setStage(ctx: SimContext, b: BossState, stage: BossStage, timer: number): void {
  b.stage = stage;
  b.timer = timer;
  b.phaseTick = ctx.state.tick;
}

function aimAt(b: BossState, target: { x: number; y: number }): void {
  const dx = target.x - b.x;
  const dy = target.y - b.y;
  const len = Math.hypot(dx, dy);
  if (len > 1e-6) {
    b.aimX = dx / len;
    b.aimY = dy / len;
  }
  b.facing = Math.atan2(b.aimY, b.aimX);
}

/** One tick of the attack under way. Returns true once it is over (the boss walks again). */
export function updateAttack(ctx: SimContext, b: BossState, slot: number, target: PlayerState | undefined, dt: number): boolean {
  switch (b.attack) {
    case 'charge':
      return updateCharge(ctx, b, slot, target, dt);
    case 'slam':
      return updateSlam(ctx, b, slot, target);
    case 'leap':
      return updateLeap(ctx, b, slot, target);
    default:
      return true;
  }
}

/** A blow's push on top of the hit's own (PLAYER.hitKnockback): `total` px along (dirX, dirY) in all. */
function throwPlayer(ctx: SimContext, p: PlayerState, dirX: number, dirY: number, total: number): void {
  const extra = Math.max(0, total - PLAYER.hitKnockback);
  if (extra > 0) moveCircle(ctx.grid, p, dirX * extra, dirY * extra, PLAYER.hitboxRadius, BLOCK_PLAYER);
}

// ----------------------------------------------------------------------------- charge

function updateCharge(ctx: SimContext, b: BossState, slot: number, target: PlayerState | undefined, dt: number): boolean {
  const charge = BOSSES[b.boss].charge;
  switch (b.stage) {
    case 'windup':
      // The way follows its target until it locks, a moment before it runs.
      if (target && b.timer > charge.lockBefore * windupFactor(b.variant)) aimAt(b, target);
      if (b.timer <= 0) {
        setStage(ctx, b, 'run', 0);
        b.runLeft = charge.distance;
        b.trailLeft = 0;
      }
      return false;
    case 'run': {
      const step = Math.min(b.runLeft, charge.speed * dt);
      const fromX = b.x;
      const fromY = b.y;
      const hitWall = moveBody(ctx, b, slot, b.aimX * step, b.aimY * step);
      b.runLeft -= step;
      b.moving = true;
      runOver(ctx, b);
      // The putrid one leaves a trail of puddles along its run (petición del usuario).
      if (BOSS_VARIANTS[b.variant].puddles) leaveTrail(ctx, b, Math.hypot(b.x - fromX, b.y - fromY));
      if (hitWall) {
        setStage(ctx, b, 'stunned', charge.stunTime);
        ctx.events.emit('boss:stunned', { x: b.x, y: b.y });
      } else if (b.runLeft <= 0) setStage(ctx, b, 'brake', charge.brakeTime);
      return false;
    }
    default:
      return b.timer <= 0;
  }
}

/**
 * Running, it hits the players in its footprint (once per charge each:
 * damage × its variant's and a throw along the run; a dashing player is
 * spared) and kills the zombies there, with no points for anyone.
 */
function runOver(ctx: SimContext, b: BossState): void {
  const charge = BOSSES[b.boss].charge;
  const half = bossHalf(b, ctx.map.tileSize);
  ctx.state.players.forEach((p, i) => {
    const bit = 1 << i;
    if (!isPlayerAlive(p) || b.hitPlayers & bit) return;
    const reach = half + PLAYER.hitboxRadius;
    if (Math.abs(p.x - b.x) >= reach || Math.abs(p.y - b.y) >= reach) return;
    if (!damagePlayer(ctx, p, charge.damage * BOSS_VARIANTS[b.variant].damage, b.x, b.y)) return;
    b.hitPlayers |= bit;
    throwPlayer(ctx, p, b.aimX, b.aimY, charge.knockback);
  });
  const reach = half + ZOMBIES.hitboxRadius;
  for (const z of ctx.state.zombies) {
    if (!isZombieAlive(z) || Math.abs(z.x - b.x) >= reach || Math.abs(z.y - b.y) >= reach) continue;
    damageZombie(ctx, z, z.hp, -1);
  }
}

// ----------------------------------------------------------------------------- slam

function updateSlam(ctx: SimContext, b: BossState, slot: number, target: PlayerState | undefined): boolean {
  const slam = BOSSES[b.boss].slam;
  if (b.stage === 'recover') return b.timer <= 0;
  if (b.timer > 0) return false;
  slamBlow(ctx, b);
  b.count++;
  b.blowTick = ctx.state.tick;
  if (b.count >= slam.hits) {
    setStage(ctx, b, 'recover', slam.recovery);
    return false;
  }
  // Between blows: it turns towards its target (turnMax at most) and steps forward; the next arc is drawn there.
  if (target) {
    const want = Math.atan2(target.y - b.y, target.x - b.x);
    const now = Math.atan2(b.aimY, b.aimX);
    const max = degToRad(slam.turnMax);
    const turn = Math.max(-max, Math.min(max, Math.atan2(Math.sin(want - now), Math.cos(want - now))));
    b.aimX = Math.cos(now + turn);
    b.aimY = Math.sin(now + turn);
    b.facing = now + turn;
  }
  moveBody(ctx, b, slot, b.aimX * slam.step, b.aimY * slam.step);
  setStage(ctx, b, 'windup', slamWindup(b));
  return false;
}

/** True when (x, y) lies in the slam's arc of boss `b` as it stands (spec 07 §4.2). */
export function inSlamArc(b: BossState, x: number, y: number): boolean {
  const slam = BOSSES[b.boss].slam;
  const dx = x - b.x;
  const dy = y - b.y;
  const d = Math.hypot(dx, dy);
  if (d > slam.reach) return false;
  return d < 1e-6 || (dx * b.aimX + dy * b.aimY) / d >= Math.cos(degToRad(slam.arc) / 2);
}

/** A blow of the slam: every player in its arc, with no wall in between, takes its damage and a push away. */
function slamBlow(ctx: SimContext, b: BossState): void {
  const slam = BOSSES[b.boss].slam;
  for (const p of ctx.state.players) {
    if (!isPlayerAlive(p) || !inSlamArc(b, p.x, p.y)) continue;
    if (!segmentClearShaped(ctx.grid, b.x, b.y, p.x, p.y, BLOCK_BULLET)) continue;
    if (!damagePlayer(ctx, p, slam.damage * BOSS_VARIANTS[b.variant].damage, b.x, b.y)) continue;
    const d = Math.hypot(p.x - b.x, p.y - b.y) || 1;
    throwPlayer(ctx, p, (p.x - b.x) / d, (p.y - b.y) / d, slam.knockback);
  }
  for (const z of ctx.state.zombies) {
    if (!isZombieAlive(z) || !inSlamArc(b, z.x, z.y)) continue;
    if (!segmentClearShaped(ctx.grid, b.x, b.y, z.x, z.y, BLOCK_BULLET)) continue;
    hurtZombie(ctx, z, slam.damage * BOSS_VARIANTS[b.variant].damage, b.x, b.y, slam.knockback);
  }
  ctx.events.emit('boss:slam', { x: b.x + b.aimX * slam.reach * 0.6, y: b.y + b.aimY * slam.reach * 0.6 });
}

// ----------------------------------------------------------------------------- leaps

function updateLeap(ctx: SimContext, b: BossState, slot: number, target: PlayerState | undefined): boolean {
  switch (b.stage) {
    case 'air': {
      // A straight line over everything; the arc up and down is drawn by the view.
      const t = 1 - Math.max(0, b.timer) / leapAirTime(b);
      b.x = b.fromX + (b.targetX - b.fromX) * t;
      b.y = b.fromY + (b.targetY - b.fromY) * t;
      b.moving = true;
      if (b.timer <= 0) land(ctx, b, slot);
      return false;
    }
    case 'ground':
      if (b.timer <= 0) {
        if (target) takeOff(ctx, b, slot, target);
        else setStage(ctx, b, 'recover', 0);
      }
      return false;
    default:
      return b.timer <= 0;
  }
}

/** Takes off towards where its target stands now (the nearest place its footprint fits, at most a leap away). */
function takeOff(ctx: SimContext, b: BossState, slot: number, target: PlayerState): void {
  const leap = BOSSES[b.boss].leap;
  let tx = target.x;
  let ty = target.y;
  const d = Math.hypot(tx - b.x, ty - b.y);
  if (d > leap.maxRange) {
    tx = b.x + ((tx - b.x) / d) * leap.maxRange;
    ty = b.y + ((ty - b.y) / d) * leap.maxRange;
  }
  const at = landingSpot(ctx, b, slot, tx, ty) ?? { x: b.x, y: b.y };
  b.fromX = b.x;
  b.fromY = b.y;
  b.targetX = at.x;
  b.targetY = at.y;
  aimAt(b, at);
  setStage(ctx, b, 'air', leapAirTime(b));
}

/**
 * Where a leap aimed at (x, y) lands: right there when its body fits, or the
 * centre of the place its footprint fits nearest to it, within
 * BOSS.landingSearchTiles; never on another boss. Null when there is none.
 */
export function landingSpot(ctx: SimContext, b: BossState, slot: number, x: number, y: number): { x: number; y: number } | null {
  const nav = ctx.bossNavs[slot];
  if (!nav) return null;
  const ts = nav.tileSize;
  const side = nav.side;
  const onBoss = (px: number, py: number): boolean =>
    ctx.state.bosses.some((o) => o !== b && isBossSolid(o) && Math.abs(o.x - px) < side * ts && Math.abs(o.y - py) < side * ts);
  if (!boxBlocked(nav, x, y, bossHalf(b, ts) - BOSS.bodySlack) && !onBoss(x, y)) return { x, y };
  const cx = Math.round(x / ts - side / 2);
  const cy = Math.round(y / ts - side / 2);
  let best: { x: number; y: number } | null = null;
  let bestSq = Infinity;
  const R = BOSS.landingSearchTiles;
  for (let ty = cy - R; ty <= cy + R; ty++) {
    for (let tx = cx - R; tx <= cx + R; tx++) {
      if (!footprintFits(nav, tx, ty)) continue;
      const px = (tx + side / 2) * ts;
      const py = (ty + side / 2) * ts;
      const sq = (px - x) ** 2 + (py - y) ** 2;
      if (sq >= bestSq || onBoss(px, py)) continue;
      best = { x: px, y: py };
      bestSq = sq;
    }
  }
  return best;
}

/**
 * The landing: furniture under it is crushed, every player within
 * landRadius of its centre takes the landing's damage, and its ring starts
 * growing from there. The floor jolts.
 */
function land(ctx: SimContext, b: BossState, slot: number): void {
  const leap = BOSSES[b.boss].leap;
  b.x = b.targetX;
  b.y = b.targetY;
  const nav = ctx.bossNavs[slot];
  if (nav) crushFurniture(ctx, nav, b.x, b.y, bossHalf(b, ctx.map.tileSize));
  const landDamage = leap.landDamage * BOSS_VARIANTS[b.variant].damage;
  for (const p of ctx.state.players) {
    if (!isPlayerAlive(p) || Math.hypot(p.x - b.x, p.y - b.y) >= leap.landRadius) continue;
    damagePlayer(ctx, p, landDamage, b.x, b.y);
  }
  const bit = 1 << slot;
  for (const z of ctx.state.zombies) {
    // A new ring: none has hit it yet.
    z.waveHits &= ~bit;
    if (isZombieAlive(z) && Math.hypot(z.x - b.x, z.y - b.y) < leap.landRadius) hurtZombie(ctx, z, landDamage, b.x, b.y);
  }
  b.waveX = b.x;
  b.waveY = b.y;
  b.waveTime = 0;
  b.waveHits = 0;
  // The putrid variant leaves a puddle where it lands (spec 07 §1).
  if (BOSS_VARIANTS[b.variant].puddles) leavePuddle(ctx, b.x, b.y, BOSS.puddle.radius);
  b.count++;
  b.blowTick = ctx.state.tick;
  ctx.events.emit('boss:landed', { x: b.x, y: b.y });
  if (b.count >= leap.leaps) setStage(ctx, b, 'recover', leap.recovery);
  else setStage(ctx, b, 'ground', leap.between);
}

/** Radius (px) of the outer edge of a boss's ring `time` s after its landing. */
export function waveRadius(b: BossState, time: number): number {
  const leap = BOSSES[b.boss].leap;
  return Math.min(leap.waveRadius, leap.waveSpeed * time);
}

/**
 * The ring of its last landing grows (whatever the boss does meanwhile):
 * a player inside its band, with a clear line from the landing, takes its
 * damage once per ring. It is gone once it reaches its full size.
 */
export function updateWave(ctx: SimContext, b: BossState, slot: number, dt: number): void {
  if (b.waveTime < 0) return;
  const leap = BOSSES[b.boss].leap;
  b.waveTime += dt;
  const outer = waveRadius(b, b.waveTime);
  const inner = Math.max(0, outer - leap.waveWidth);
  const damage = leap.waveDamage * BOSS_VARIANTS[b.variant].damage;
  const inBand = (x: number, y: number): boolean => {
    const d = Math.hypot(x - b.waveX, y - b.waveY);
    return d >= inner && d <= outer && segmentClearShaped(ctx.grid, b.waveX, b.waveY, x, y, BLOCK_SIGHT);
  };
  ctx.state.players.forEach((p, i) => {
    const bit = 1 << i;
    if (!isPlayerAlive(p) || b.waveHits & bit || !inBand(p.x, p.y)) return;
    if (damagePlayer(ctx, p, damage, b.waveX, b.waveY)) b.waveHits |= bit;
  });
  // The zombies too, once per ring each (the bit of this boss's slot).
  const bit = 1 << slot;
  for (const z of ctx.state.zombies) {
    if (!isZombieAlive(z) || z.waveHits & bit || !inBand(z.x, z.y)) continue;
    z.waveHits |= bit;
    hurtZombie(ctx, z, damage, b.waveX, b.waveY);
  }
  if (outer >= leap.waveRadius) b.waveTime = -1;
}

/** A putrid puddle `radius` px wide at (x, y) for BOSS.puddle.time s; with the pool full, the one with least time left goes. */
export function leavePuddle(ctx: SimContext, x: number, y: number, radius: number): void {
  const { puddles } = ctx.state;
  let slot = puddles.find((p) => !p.active);
  if (!slot) slot = puddles.reduce<PuddleState | undefined>((least, p) => (!least || p.timer < least.timer ? p : least), undefined);
  if (!slot) return;
  Object.assign(slot, { active: true, x, y, radius, timer: BOSS.puddle.time });
}

/** Along its charge, the putrid one leaves a puddle every BOSS.puddle.trailSpacing px it runs (`moved` this tick). */
function leaveTrail(ctx: SimContext, b: BossState, moved: number): void {
  b.trailLeft -= moved;
  if (b.trailLeft > 0) return;
  leavePuddle(ctx, b.x, b.y, BOSS.puddle.trailRadius);
  b.trailLeft += BOSS.puddle.trailSpacing;
}

/** True when (x, y) lies in an active puddle. */
export function inPuddle(ctx: SimContext, x: number, y: number): boolean {
  return ctx.state.puddles.some((pd) => pd.active && Math.hypot(x - pd.x, y - pd.y) < pd.radius);
}

/**
 * The puddles dry up, and every tickInterval whoever stands in any of them
 * takes its damage once (overlapping puddles do not add up): players with
 * no push (hurt from where they stand; the dash spares them, as from any
 * blow), and zombies too, with no points for anyone.
 */
export function updatePuddles(ctx: SimContext, dt: number): void {
  const { puddle } = BOSS;
  const { state } = ctx;
  for (const pd of state.puddles) {
    if (!pd.active) continue;
    pd.timer -= dt;
    if (pd.timer <= 0) pd.active = false;
  }
  state.puddleTick -= dt;
  if (state.puddleTick > 0) return;
  state.puddleTick += puddle.tickInterval;
  const damage = puddle.damagePerSecond * puddle.tickInterval;
  for (const p of state.players) if (isPlayerAlive(p) && inPuddle(ctx, p.x, p.y)) damagePlayer(ctx, p, damage, p.x, p.y);
  for (const z of state.zombies) if (isZombieAlive(z) && inPuddle(ctx, z.x, z.y)) damageZombie(ctx, z, damage, -1);
}
