import type { BulletState } from '../../core/GameState';
import { BLOCK_BULLET, pointBlocks } from '../map/CollisionGrid';
import { damageZombie, isZombieAlive } from './Combat';
import { bodyEntry } from './shotGeometry';
import type { SimContext } from './SimContext';

/**
 * Moves pooled bullets. A bullet stops at the first wall or zombie it
 * touches, or when it has travelled its weapon's range. Zombie hits are
 * tested along the whole segment of the tick so fast bullets cannot skip
 * over a zombie.
 *
 * Walls stop a bullet on the ground plane, but zombies are hit where it is
 * drawn (from the gun's muzzle, drawX/drawY): if it visibly touches a
 * zombie's body (ZOMBIES.hurtbox), it hits. Shots that looked like hits used
 * to miss because the drawing and the collision used different heights.
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
  let hitIndex = -1;
  let hitT = Infinity;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z)) continue;
    const t = bodyEntry(b.x + b.drawX, b.y + b.drawY, b.dirX, b.dirY, step, z.x, z.y);
    if (t < hitT) {
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
  damageZombie(ctx, z, b.damage, b.owner);
  return true;
}

export function activeBulletCount(bullets: readonly BulletState[]): number {
  let n = 0;
  for (let i = 0; i < bullets.length; i++) if (bullets[i]?.active) n++;
  return n;
}
