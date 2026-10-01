import type { BulletState } from '../../core/GameState';
import { BLOCK_BULLET, pointBlocksShaped, segmentHitShaped } from '../map/CollisionGrid';
import { damageZombie, isZombieAlive } from './Combat';
import { bodyEntry } from './shotGeometry';
import type { SimContext } from './SimContext';

/**
 * Moves pooled bullets. A bullet stops at the first wall or zombie it
 * touches, or when it has travelled its weapon's range. Walls and zombies
 * are tested along the whole segment of the tick so fast bullets cannot
 * skip over them, and walls only where they are drawn: a bullet that
 * visibly passes beside a thin wall or the end of one flies on (the empty
 * floor of the wall's tile does not stop it).
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
    if (pointBlocksShaped(ctx.grid, b.x, b.y, BLOCK_BULLET)) {
      b.active = false;
      continue;
    }
    const step = Math.min(b.speed * dt, b.remaining);
    const nx = b.x + b.dirX * step;
    const ny = b.y + b.dirY * step;
    const wallT = segmentHitShaped(ctx.grid, b.x, b.y, nx, ny, BLOCK_BULLET);
    const wallDist = wallT === Infinity ? Infinity : wallT * step;

    if (hitZombieAlongSegment(ctx, b, step, wallDist)) continue;

    if (wallDist !== Infinity) {
      b.x += b.dirX * wallDist;
      b.y += b.dirY * wallDist;
      b.active = false;
      continue;
    }
    b.x = nx;
    b.y = ny;
    b.remaining -= step;
    if (b.remaining <= 0) b.active = false;
  }
}

/**
 * Returns true (and deactivates the bullet) if it hit a zombie this tick,
 * before the wall `wallDist` px ahead (Infinity when there is none).
 */
function hitZombieAlongSegment(ctx: SimContext, b: BulletState, step: number, wallDist: number): boolean {
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
  // A wall in front of the zombie takes the bullet first.
  if (!z || hitT >= wallDist) return false;
  b.x += b.dirX * hitT;
  b.y += b.dirY * hitT;
  b.active = false;
  damageZombie(ctx, z, b.damage, b.owner);
  return true;
}

export function activeBulletCount(bullets: readonly BulletState[]): number {
  let n = 0;
  for (let i = 0; i < bullets.length; i++) if (bullets[i]?.active) n++;
  return n;
}
