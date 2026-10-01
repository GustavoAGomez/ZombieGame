import { BULLETS } from '../../config/balance';
import type { BulletState } from '../../core/GameState';
import { BLOCK_BULLET, pointBlocksShaped, segmentHitShaped } from '../map/CollisionGrid';
import { damageZombie, isZombieAlive, type HitPoint } from './Combat';
import { bodyEntry } from './shotGeometry';
import type { SimContext } from './SimContext';

/**
 * Moves pooled bullets. A bullet stops at the first wall or zombie it
 * touches, or when it has travelled its weapon's range. Walls and zombies
 * are tested along the whole segment of the tick so fast bullets cannot
 * skip over them.
 *
 * Everything is judged from where the bullet is drawn (from the gun's
 * muzzle, drawX/drawY): zombies are hit when it visibly touches their body
 * (ZOMBIES.hurtbox); walls when the point of the ground right under it
 * (BULLETS.flightHeight lower) reaches the wall's base. In 3/4 that is when
 * it visibly meets the wall's face, and a bullet that visibly passes beside
 * a thin wall or the end of one flies on. Testing the ground point under the
 * shooter's line instead made bullets vanish in mid air above corners.
 *
 * A piercing bullet (the SMG's special) goes on through up to `pierce`
 * zombies, never hitting the same one twice.
 */
export function updateBullets(ctx: SimContext, dt: number): void {
  const { bullets } = ctx.state;
  for (let i = 0; i < bullets.length; i++) {
    const b = bullets[i];
    if (!b?.active) continue;
    b.prevX = b.x;
    b.prevY = b.y;
    // The ground right under the drawn bullet: what walls are tested with.
    const gx = b.x + b.drawX;
    const gy = b.y + b.drawY + BULLETS.flightHeight;
    // A bullet spawned inside a wall (player hugging it) dies immediately.
    if (pointBlocksShaped(ctx.grid, gx, gy, BLOCK_BULLET)) {
      b.active = false;
      continue;
    }
    const step = Math.min(b.speed * dt, b.remaining);
    const nx = b.x + b.dirX * step;
    const ny = b.y + b.dirY * step;
    const wallT = segmentHitShaped(ctx.grid, gx, gy, gx + b.dirX * step, gy + b.dirY * step, BLOCK_BULLET);
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
    if (!z || !isZombieAlive(z) || b.hits.includes(i)) continue;
    const t = bodyEntry(b.x + b.drawX, b.y + b.drawY, b.dirX, b.dirY, step, z.x, z.y);
    if (t < hitT) {
      hitT = t;
      hitIndex = i;
    }
  }
  // A wall in front of the zombie takes the bullet first.
  if (hitIndex < 0 || hitT >= wallDist) return false;
  b.x += b.dirX * hitT;
  b.y += b.dirY * hitT;
  b.remaining -= hitT;
  bulletHitsZombie(ctx, b, hitIndex, { x: b.x + b.drawX, y: b.y + b.drawY, dirX: b.dirX, dirY: b.dirY });
  return true;
}

/**
 * Bullet `b` hits zombie `index`: damage and blood, and the bullet goes on
 * if it can still pierce (it carries on from the hit point next tick).
 */
export function bulletHitsZombie(ctx: SimContext, b: BulletState, index: number, hit: HitPoint): void {
  const z = ctx.state.zombies[index];
  if (!z) return;
  const free = b.hits.indexOf(-1);
  if (free >= 0) b.hits[free] = index;
  b.pierce--;
  if (b.pierce <= 0 || b.remaining <= 0) b.active = false;
  damageZombie(ctx, z, b.damage, b.owner, hit);
}

export function activeBulletCount(bullets: readonly BulletState[]): number {
  let n = 0;
  for (let i = 0; i < bullets.length; i++) if (bullets[i]?.active) n++;
  return n;
}
