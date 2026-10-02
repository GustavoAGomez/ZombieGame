import { POINTS, ZOMBIES } from '../../config/balance';
import type { BloodState, ZombieState } from '../../core/GameState';
import { random } from '../../core/Rng';
import { BLOCK_SIGHT, segmentClearShaped } from '../map/CollisionGrid';
import { rollZombieDrop } from './PickupSystem';
import { awardPoints } from './PointsSystem';
import { hurtboxOf } from './shotGeometry';
import type { SimContext } from './SimContext';

export function isZombieAlive(z: ZombieState): boolean {
  return z.active && z.hp > 0 && z.ai !== 'dead';
}

/** Where a hit landed, as drawn, and the direction it came from (blood spray). */
export interface HitPoint {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
}

/**
 * Applies damage; returns true if this hit killed the zombie. The attacker
 * (a player id, or -1 for none) gets `hitPoints` for the hit (a bullet's
 * POINTS.hit by default; the knife's POINTS.meleeHit; 0 for fire ticks) and
 * POINTS.kill for the kill. With `hit`, blood sprays from there (zombie:hit).
 */
export function damageZombie(
  ctx: SimContext,
  z: ZombieState,
  amount: number,
  attacker = -1,
  hit?: HitPoint,
  hitPoints: number = POINTS.hit,
): boolean {
  if (!isZombieAlive(z)) return false;
  z.hp -= amount;
  if (attacker >= 0 && hitPoints > 0) awardPoints(ctx, attacker, hitPoints, 'hit');
  if (hit) ctx.events.emit('zombie:hit', { x: hit.x, y: hit.y, groundY: z.y, dirX: hit.dirX, dirY: hit.dirY, killed: z.hp <= 0 });
  if (z.hp > 0) return false;
  if (attacker >= 0) awardPoints(ctx, attacker, POINTS.kill, 'kill');
  z.hp = 0;
  z.ai = 'dead';
  z.timer = ZOMBIES.corpseTime;
  z.stateTick = ctx.state.tick;
  spawnBlood(ctx, z.x, z.y);
  rollZombieDrop(ctx, z);
  ctx.events.emit('zombie:killed', { x: z.x, y: z.y, kind: z.kind });
  return true;
}

/** The middle of a zombie's drawn body (its hurtbox): where a hit without a drawn point sprays from. */
export function bodyHitPoint(z: ZombieState, dirX: number, dirY: number): HitPoint {
  return { x: z.x, y: z.y - hurtboxOf(z).height / 2, dirX, dirY };
}

/** Leaves a blood decal; when all 40 are in use, the oldest is reused. */
export function spawnBlood(ctx: SimContext, x: number, y: number): BloodState | undefined {
  const { blood } = ctx.state;
  let slot: BloodState | undefined;
  let oldest: BloodState | undefined;
  for (let i = 0; i < blood.length; i++) {
    const b = blood[i];
    if (!b) continue;
    if (!b.active) {
      slot = b;
      break;
    }
    if (!oldest || b.age > oldest.age) oldest = b;
  }
  slot ??= oldest;
  if (!slot) return undefined;
  slot.active = true;
  slot.x = x;
  slot.y = y;
  slot.age = 0;
  slot.variant = Math.floor(random(ctx.state) * ZOMBIES.bloodVariants);
  return slot;
}

export function updateBlood(ctx: SimContext, dt: number): void {
  const { blood } = ctx.state;
  for (let i = 0; i < blood.length; i++) {
    const b = blood[i];
    if (!b?.active) continue;
    b.age += dt;
    if (b.age >= ZOMBIES.bloodFadeTime) b.active = false;
  }
}

/**
 * Auto-aim target: the nearest living zombie within `range` of (x, y) that
 * is in line of sight. Returns its index in state.zombies, or -1.
 */
export function findAutoAimTarget(ctx: SimContext, x: number, y: number, range: number): number {
  const { zombies } = ctx.state;
  let best = -1;
  let bestDistSq = range * range;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z)) continue;
    const dx = z.x - x;
    const dy = z.y - y;
    const distSq = dx * dx + dy * dy;
    // Line of sight is only checked for candidates that would win.
    // Walls by their drawn shape, as bullets see them: a zombie past a wall's end can be aimed at.
    if (distSq <= bestDistSq && segmentClearShaped(ctx.grid, x, y, z.x, z.y, BLOCK_SIGHT)) {
      best = i;
      bestDistSq = distSq;
    }
  }
  return best;
}

/**
 * Melee target: the nearest living zombie whose hitbox edge is within
 * `range` and inside the cone around (dirX, dirY). Returns its index or -1.
 */
export function findMeleeTarget(
  ctx: SimContext,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  range: number,
  coneHalfAngleRad: number,
): number {
  const { zombies } = ctx.state;
  const minCos = Math.cos(coneHalfAngleRad);
  let best = -1;
  let bestDist = Infinity;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z)) continue;
    const dx = z.x - x;
    const dy = z.y - y;
    const dist = Math.hypot(dx, dy);
    if (dist - ZOMBIES.hitboxRadius > range || dist >= bestDist) continue;
    if (dist > 0 && (dx * dirX + dy * dirY) / dist < minCos) continue;
    best = i;
    bestDist = dist;
  }
  return best;
}
