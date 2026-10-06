import { critDamage, rollIgnite } from '../dungeon/perks';
import { playerStats } from '../dungeon/stats';
import { BULLETS } from '../../config/balance';
import type { BulletState } from '../../core/GameState';
import { BLOCK_BULLET, pointBlocksShaped, segmentHitShaped } from '../map/CollisionGrid';
import { bossBodyEntry, damageBoss, isBossHittable } from './BossCombat';
import { BURN, igniteBoss, igniteZombie } from './BurnSystem';
import { damageZombie, isZombieAlive, knockZombie, type HitPoint } from './Combat';
import { bodyEntry, hurtboxOf } from './shotGeometry';
import type { SimContext } from './SimContext';

/**
 * Moves pooled bullets. A bullet stops at the first wall or zombie it
 * touches, or when it has travelled its weapon's range. Walls and zombies
 * are tested along the whole segment of the tick so fast bullets cannot
 * skip over them.
 *
 * Everything is judged from where the bullet is drawn (from the gun's
 * muzzle, drawX/drawY): zombies are hit when it visibly touches their body
 * (ZOMBIES.hurtbox, or crawlHurtbox once legless); walls when the point of the ground right under it
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
      if (b.bounces > 0) {
        bounce(ctx, b, gx, gy, wallDist);
        continue;
      }
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
 * Rebote (spec 09 §7.2): the bullet turns back off the face of the wall it
 * met (both ways in a corner), and with Perforantes gets its pierces back.
 */
function bounce(ctx: SimContext, b: BulletState, gx: number, gy: number, wallDist: number): void {
  const back = Math.max(0, wallDist - 1);
  b.x += b.dirX * back;
  b.y += b.dirY * back;
  b.remaining -= back;
  const hx = gx + b.dirX * back;
  const hy = gy + b.dirY * back;
  const probe = 2;
  const acrossX = pointBlocksShaped(ctx.grid, hx + Math.sign(b.dirX) * probe, hy, BLOCK_BULLET);
  const acrossY = pointBlocksShaped(ctx.grid, hx, hy + Math.sign(b.dirY) * probe, BLOCK_BULLET);
  if (acrossX || !acrossY) b.dirX = -b.dirX;
  if (acrossY || !acrossX) b.dirY = -b.dirY;
  b.bounces--;
  b.pierce = b.pierceMax;
  b.hits.fill(-1);
  if (b.remaining <= 0) b.active = false;
}

/** What a bullet's `hits` keeps for boss slot `i` (zombies are kept by their index, from 0). */
export function bossHitId(i: number): number {
  return -2 - i;
}

/**
 * Returns true (and deactivates the bullet) if it hit a zombie or a boss
 * this tick, before the wall `wallDist` px ahead (Infinity when there is none).
 */
function hitZombieAlongSegment(ctx: SimContext, b: BulletState, step: number, wallDist: number): boolean {
  const { zombies, bosses } = ctx.state;
  let hitIndex = -1;
  let bossIndex = -1;
  let hitT = Infinity;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z) || b.hits.includes(i)) continue;
    const t = bodyEntry(b.x + b.drawX, b.y + b.drawY, b.dirX, b.dirY, step, z.x, z.y, hurtboxOf(z));
    if (t < hitT) {
      hitT = t;
      hitIndex = i;
    }
  }
  for (let i = 0; i < bosses.length; i++) {
    const boss = bosses[i];
    if (!boss || !isBossHittable(boss) || b.hits.includes(bossHitId(i))) continue;
    const t = bossBodyEntry(boss, ctx.map.tileSize, b.x + b.drawX, b.y + b.drawY, b.dirX, b.dirY, step);
    if (t < hitT) {
      hitT = t;
      hitIndex = -1;
      bossIndex = i;
    }
  }
  // A wall in front of the zombie takes the bullet first.
  if ((hitIndex < 0 && bossIndex < 0) || hitT >= wallDist) return false;
  b.x += b.dirX * hitT;
  b.y += b.dirY * hitT;
  b.remaining -= hitT;
  const hit = { x: b.x + b.drawX, y: b.y + b.drawY, dirX: b.dirX, dirY: b.dirY };
  if (bossIndex >= 0) bulletHitsBoss(ctx, b, bossIndex, hit);
  else bulletHitsZombie(ctx, b, hitIndex, hit);
  return true;
}

/**
 * Bullet `b` hits boss slot `index` (spec 07 §2): damage (less with distance
 * for pellets) and fire for the shotgun's special, never a push. A piercing
 * bullet goes through it like through a zombie.
 */
export function bulletHitsBoss(ctx: SimContext, b: BulletState, index: number, hit: HitPoint): void {
  const boss = ctx.state.bosses[index];
  if (!boss) return;
  const free = b.hits.indexOf(-1);
  if (free >= 0) b.hits[free] = bossHitId(index);
  b.pierce--;
  if (b.pierce <= 0 || b.remaining <= 0) b.active = false;
  const perks = playerStats(ctx.state.run);
  const damage = critDamage(ctx.state, perks, b.damage * falloffFactor(b, b.range - b.remaining));
  if (damageBoss(ctx, boss, damage, b.owner, hit)) return;
  // The shotgun's special, or Incendiarias (spec 09 §7.2).
  if (b.burns || rollIgnite(ctx.state, perks)) igniteBoss(boss, damage * BURN.fireDamageFactor, BURN.fireDuration, b.owner);
}

/**
 * How much of its damage a bullet still does after travelling `travelled`
 * px: all of it up to `falloffFrom`, then down linearly to `falloffMin` at
 * its range (the shotgun's pellets, spec 04 §1).
 */
export function falloffFactor(b: Pick<BulletState, 'range' | 'falloffFrom' | 'falloffMin'>, travelled: number): number {
  if (b.falloffMin >= 1 || travelled <= b.falloffFrom) return 1;
  const span = b.range - b.falloffFrom;
  if (span <= 0) return b.falloffMin;
  const t = Math.min(1, (travelled - b.falloffFrom) / span);
  return 1 + (b.falloffMin - 1) * t;
}

/**
 * Bullet `b` hits zombie `index`: damage (less with distance for pellets),
 * blood, fire for the shotgun's special and a push for pellets; the bullet
 * goes on if it can still pierce (it carries on from the hit point next tick).
 */
export function bulletHitsZombie(ctx: SimContext, b: BulletState, index: number, hit: HitPoint): void {
  const z = ctx.state.zombies[index];
  if (!z) return;
  const free = b.hits.indexOf(-1);
  if (free >= 0) b.hits[free] = index;
  b.pierce--;
  if (b.pierce <= 0 || b.remaining <= 0) b.active = false;
  const perks = playerStats(ctx.state.run);
  const damage = critDamage(ctx.state, perks, b.damage * falloffFactor(b, b.range - b.remaining));
  const killed = damageZombie(ctx, z, damage, b.owner, hit);
  if (killed) return;
  if (b.burns || rollIgnite(ctx.state, perks)) igniteZombie(z, damage * BURN.fireDamageFactor, BURN.fireDuration, b.owner);
  knockZombie(ctx, z, b.dirX, b.dirY, b.knockback);
}

export function activeBulletCount(bullets: readonly BulletState[]): number {
  let n = 0;
  for (let i = 0; i < bullets.length; i++) if (bullets[i]?.active) n++;
  return n;
}
