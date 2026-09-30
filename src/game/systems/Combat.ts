import { ZOMBIES } from '../../config/balance';
import type { ZombieState } from '../../core/GameState';
import { BLOCK_SIGHT, segmentClear } from '../map/CollisionGrid';
import type { SimContext } from './SimContext';

export function isZombieAlive(z: ZombieState): boolean {
  return z.active && z.hp > 0;
}

/** Applies damage; returns true if this hit killed the zombie. */
export function damageZombie(_ctx: SimContext, z: ZombieState, amount: number): boolean {
  if (!isZombieAlive(z)) return false;
  z.hp -= amount;
  if (z.hp > 0) return false;
  z.hp = 0;
  return true;
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
