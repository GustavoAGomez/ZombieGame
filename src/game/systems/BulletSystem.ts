import { BULLETS, ZOMBIES } from '../../config/balance';
import type { BulletState } from '../../core/GameState';
import { BLOCK_BULLET, pointBlocks } from '../map/CollisionGrid';
import { damageZombie, isZombieAlive } from './Combat';
import type { SimContext } from './SimContext';

/**
 * Moves pooled bullets. A bullet stops at the first wall or zombie it
 * touches, or when it has travelled its weapon's range. Zombie hits are
 * tested along the whole segment of the tick so fast bullets cannot skip
 * over a zombie.
 */
export function updateBullets(ctx: SimContext, dt: number): void {
  const { bullets } = ctx.state;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b?.active) continue;
    b.prevX = b.x;
    b.prevY = b.y;
    // A bullet spawned inside a wall (player hugging it) dies immediately.
    if (pointBlocks(ctx.grid, b.x, b.y, BLOCK_BULLET)) {
      b.active = false;
      continue;
    }
    const step = Math.min(b.speed * dt, b.remaining);
    const nx = b.x + b.dirX * step;
    const ny = b.y + b.dirY * step;

    if (hitZombieAlongSegment(ctx, b, step)) continue;

    b.x = nx;
    b.y = ny;
    b.remaining -= step;
    if (b.remaining <= 0 || pointBlocks(ctx.grid, nx, ny, BLOCK_BULLET)) b.active = false;
  }
}

/** Returns true (and deactivates the bullet) if it hit a zombie this tick. */
function hitZombieAlongSegment(ctx: SimContext, b: BulletState, step: number): boolean {
  const { zombies } = ctx.state;
  const reach = ZOMBIES.hitboxRadius + BULLETS.radius;
  let hitIndex = -1;
  let hitT = Infinity;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z)) continue;
    // Closest approach of the segment to the zombie centre.
    const rx = z.x - b.x;
    const ry = z.y - b.y;
    const t = Math.max(0, Math.min(step, rx * b.dirX + ry * b.dirY));
    const cx = b.x + b.dirX * t - z.x;
    const cy = b.y + b.dirY * t - z.y;
    if (cx * cx + cy * cy <= reach * reach && t < hitT) {
      hitT = t;
      hitIndex = i;
    }
  }
  const z = hitIndex >= 0 ? zombies[hitIndex] : undefined;
  if (!z) return false;
  const hx = b.x + b.dirX * hitT;
  const hy = b.y + b.dirY * hitT;
  // Walls in front of the zombie take the bullet first.
  if (pointBlocks(ctx.grid, hx, hy, BLOCK_BULLET)) return false;
  b.x = hx;
  b.y = hy;
  b.active = false;
  damageZombie(ctx, z, b.damage);
  return true;
}

export function activeBulletCount(bullets: readonly BulletState[]): number {
  let n = 0;
  for (let i = 0; i < bullets.length; i++) if (bullets[i]?.active) n++;
  return n;
}
