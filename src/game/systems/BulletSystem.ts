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
 *
 * A bullet flies at BULLETS.flightHeight and is drawn there, so it hits a
 * zombie when it crosses its body as drawn (ZOMBIES.hurtbox, from the feet
 * up), not just a small circle at its feet: diagonal shots that visibly go
 * through a zombie used to miss it.
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

/**
 * Where along the bullet's path (0..step) it enters zombie (zx, zy)'s body,
 * or Infinity. The body, seen at the bullet's flight height, is a box on
 * the ground plane centred flightHeight − height/2 below the feet.
 */
export function bulletEntry(bx: number, by: number, dirX: number, dirY: number, step: number, zx: number, zy: number): number {
  const halfW = ZOMBIES.hurtbox.width / 2 + BULLETS.radius;
  const halfH = ZOMBIES.hurtbox.height / 2 + BULLETS.radius;
  const cy = zy + BULLETS.flightHeight - ZOMBIES.hurtbox.height / 2;
  // Slab test of the segment against the box.
  let tEnter = 0;
  let tExit = step;
  for (const [origin, dir, min, max] of [
    [bx, dirX, zx - halfW, zx + halfW],
    [by, dirY, cy - halfH, cy + halfH],
  ] as const) {
    if (Math.abs(dir) < 1e-9) {
      if (origin < min || origin > max) return Infinity;
      continue;
    }
    let t0 = (min - origin) / dir;
    let t1 = (max - origin) / dir;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tEnter = Math.max(tEnter, t0);
    tExit = Math.min(tExit, t1);
    if (tEnter > tExit) return Infinity;
  }
  return tEnter;
}

/** Returns true (and deactivates the bullet) if it hit a zombie this tick. */
function hitZombieAlongSegment(ctx: SimContext, b: BulletState, step: number): boolean {
  const { zombies } = ctx.state;
  let hitIndex = -1;
  let hitT = Infinity;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z)) continue;
    const t = bulletEntry(b.x, b.y, b.dirX, b.dirY, step, z.x, z.y);
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
