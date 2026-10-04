import { BOSS, PLAYER, ZOMBIES } from '../../config/balance';
import { BOSS_VARIANTS, BOSSES, windupFactor, type BossAttackId } from '../../config/bosses';
import type { BossState, PlayerState } from '../../core/GameState';
import { randomRange, random } from '../../core/Rng';
import { boxBlocked, updateBossBlocking } from '../map/BossNav';
import { BLOCK_PLAYER, moveCircle } from '../map/CollisionGrid';
import { moveBody } from './BossBody';
import { bossHalf } from './BossCombat';
import { damageZombie, isZombieAlive } from './Combat';
import { damagePlayer, isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';

/**
 * A boss's attacks (spec 07 §4). Every attack is announced: the boss stands
 * still in a pose of its own and the exact zone that will take the blow is
 * drawn on the floor, filling up until the blow (the views read it from the
 * boss's state). The dash goes through all of them (damagePlayer).
 *
 * The charge (§4.1): it crouches with a corridor towards its target on the
 * floor (the way follows the target and locks a moment before it runs),
 * then runs straight, crushing the furniture on its way and running over
 * the zombies (they die, without points). A player it catches takes its
 * damage once and is thrown along the run. Into a wall it is stunned, and
 * takes double damage; otherwise it brakes.
 */

/** Attacks the code knows how to make (the rest of a boss's list is left out). */
const MADE: readonly BossAttackId[] = ['charge'];

/** Its next walk between attacks: the boss's walking time. */
export function walkTime(ctx: SimContext, b: BossState): number {
  const { min, max } = BOSSES[b.boss].walkTime;
  return randomRange(ctx.state, min, max);
}

/**
 * What it does when its walking time is up (spec 07 §4.4), by the distance
 * from its centre to its target: close, the slam (70 %) or the leaps
 * (30 %); mid-range with a straight clear way, the charge (60 %) or the
 * leaps (40 %); farther or with no clear way, the leaps. Never the same
 * attack twice running, and only those it has. Null: it keeps walking.
 */
export function chooseAttack(ctx: SimContext, b: BossState, slot: number, target: PlayerState): BossAttackId | null {
  const def = BOSSES[b.boss];
  const d = Math.hypot(target.x - b.x, target.y - b.y);
  let options: [BossAttackId, number][];
  if (d < def.choice.closeRange) {
    options = [
      ['slam', 0.7],
      ['leap', 0.3],
    ];
  } else if (d <= def.choice.farRange && clearRun(ctx, b, slot, target.x, target.y)) {
    options = [
      ['charge', 0.6],
      ['leap', 0.4],
    ];
  } else options = [['leap', 1]];
  options = options.filter(([a]) => a !== b.lastAttack && def.attacks.includes(a) && MADE.includes(a));
  const total = options.reduce((sum, [, w]) => sum + w, 0);
  if (total <= 0) return null;
  let roll = random(ctx.state) * total;
  for (const [attack, weight] of options) {
    roll -= weight;
    if (roll < 0) return attack;
  }
  return options[options.length - 1]?.[0] ?? null;
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

/** How far (px, up to `distance`) its body gets along its aim before something stops it (furniture does not). */
export function runReach(ctx: SimContext, b: BossState, slot: number, distance: number): number {
  const nav = ctx.bossNavs[slot];
  if (!nav) return distance;
  const half = bossHalf(b, ctx.map.tileSize) - BOSS.bodySlack;
  const steps = Math.max(1, Math.ceil(distance / BOSS.maxSubstep));
  for (let i = 1; i <= steps; i++) {
    const d = (distance * i) / steps;
    if (boxBlocked(nav, b.x + b.aimX * d, b.y + b.aimY * d, half)) return (distance * (i - 1)) / steps;
  }
  return distance;
}

/** Starts `attack` towards `target`. */
export function startAttack(ctx: SimContext, b: BossState, attack: BossAttackId, target: PlayerState): void {
  // What stops its body, as the match is now (doors, merchants): its blows are judged against it.
  const nav = ctx.bossNavs[ctx.state.bosses.indexOf(b)];
  if (nav) updateBossBlocking(nav, ctx.map, ctx.state);
  b.phase = 'attacking';
  b.attack = attack;
  b.hitPlayers = 0;
  aimAt(b, target);
  if (attack === 'charge') {
    const charge = BOSSES[b.boss].charge;
    setStage(ctx, b, 'windup', chargeWindup(b));
    b.runLeft = charge.distance;
  }
}

/** Its charge's windup: the base one by its variant (never under 80 %). */
export function chargeWindup(b: BossState): number {
  return BOSSES[b.boss].charge.windup * windupFactor(b.variant);
}

function setStage(ctx: SimContext, b: BossState, stage: BossState['stage'], timer: number): void {
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
  if (b.attack === 'charge') return updateCharge(ctx, b, slot, target, dt);
  return true;
}

function updateCharge(ctx: SimContext, b: BossState, slot: number, target: PlayerState | undefined, dt: number): boolean {
  const charge = BOSSES[b.boss].charge;
  switch (b.stage) {
    case 'windup':
      // The way follows its target until it locks, a moment before it runs.
      if (target && b.timer > charge.lockBefore * windupFactor(b.variant)) aimAt(b, target);
      // Meanwhile runLeft is how far it will get before something stops it: the corridor drawn on the floor.
      b.runLeft = runReach(ctx, b, slot, charge.distance);
      if (b.timer <= 0) {
        setStage(ctx, b, 'run', 0);
        b.runLeft = charge.distance;
      }
      return false;
    case 'run': {
      const step = Math.min(b.runLeft, charge.speed * dt);
      const hitWall = moveBody(ctx, b, slot, b.aimX * step, b.aimY * step);
      b.runLeft -= step;
      b.moving = true;
      runOver(ctx, b);
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
    moveCircle(ctx.grid, p, b.aimX * charge.knockback, b.aimY * charge.knockback, PLAYER.hitboxRadius, BLOCK_PLAYER);
  });
  const reach = half + ZOMBIES.hitboxRadius;
  for (const z of ctx.state.zombies) {
    if (!isZombieAlive(z) || Math.abs(z.x - b.x) >= reach || Math.abs(z.y - b.y) >= reach) continue;
    damageZombie(ctx, z, z.hp, -1);
  }
}
