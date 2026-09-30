import { ZOMBIES } from '../../config/balance';
import type { BloodState, ZombieState } from '../../core/GameState';
import { random } from '../../core/Rng';
import { BLOCK_SIGHT, segmentClear } from '../map/CollisionGrid';
import { rollZombieDrop } from './PickupSystem';
import type { SimContext } from './SimContext';

export function isZombieAlive(z: ZombieState): boolean {
  return z.active && z.hp > 0 && z.ai !== 'dead';
}

/** Applies damage; returns true if this hit killed the zombie. */
export function damageZombie(ctx: SimContext, z: ZombieState, amount: number): boolean {
  if (!isZombieAlive(z)) return false;
  z.hp -= amount;
  if (z.hp > 0) return false;
  z.hp = 0;
  z.ai = 'dead';
  z.timer = ZOMBIES.corpseTime;
  z.stateTick = ctx.state.tick;
  spawnBlood(ctx, z.x, z.y);
  rollZombieDrop(ctx, z);
  ctx.events.emit('zombie:killed', { x: z.x, y: z.y, kind: z.kind });
  return true;
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
    if (distSq <= bestDistSq && segmentClear(ctx.grid, x, y, z.x, z.y, BLOCK_SIGHT)) {
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
