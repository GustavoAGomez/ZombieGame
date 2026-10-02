import { ZOMBIES } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
import type { PlayerState, WeaponSlotState } from '../../core/GameState';
import { degToRad } from '../../core/math';
import { BLOCK_BULLET, segmentClearShaped } from '../map/CollisionGrid';
import { hitContinuously } from './BeamSystem';
import { damageFactor } from './BoostSystem';
import { igniteZombie } from './BurnSystem';
import { bodyHitPoint, isZombieAlive } from './Combat';
import type { SimContext } from './SimContext';
import { bulletDamage, fireRate } from './weaponStats';

/**
 * The flamethrower's jet (spec 06 §2.3): while the fire button is held and
 * there is fuel in the tank, a cone of `arc` degrees around the aim, up to
 * its range. It spends fuelPerSecond rounds per second; every damage tick
 * (fireRate, through the player's fire cooldown) each zombie in the cone
 * with no wall in between takes the weapon's damage and catches fire (the
 * weapon's burn, restarted on every touch, never stacked). A flamethrower
 * with its special lights hellfire, which bursts when they die burning.
 * Hits score once per CONTINUOUS.scoreInterval of contact; fire ticks never.
 */
export function fireCone(ctx: SimContext, p: PlayerState, slot: WeaponSlotState, dt: number): void {
  const def = WEAPONS[slot.id];
  if (slot.magazine <= 0) return;
  p.coneOn = true;
  p.lastAttackTick = ctx.state.tick;
  // A round at once when the jet starts, then one every 1/fuelPerSecond s.
  p.fuelTimer -= dt;
  while (p.fuelTimer <= 0 && slot.magazine > 0) {
    slot.magazine--;
    p.fuelTimer += 1 / (def.fuelPerSecond ?? 1);
  }
  if (p.fireCooldown > 0) return;
  p.fireCooldown += 1 / fireRate(slot);
  const damage = bulletDamage(slot) * damageFactor(p);
  const minCos = Math.cos(degToRad(def.arc ?? 0) / 2);
  const hellfire = slot.special && def.special === 'hellfire';
  const { zombies } = ctx.state;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z)) continue;
    const dx = z.x - p.x;
    const dy = z.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist - ZOMBIES.hitboxRadius > def.range) continue;
    const ux = dist > 0 ? dx / dist : p.aimX;
    const uy = dist > 0 ? dy / dist : p.aimY;
    if (ux * p.aimX + uy * p.aimY < minCos) continue;
    if (!segmentClearShaped(ctx.grid, p.x, p.y, z.x, z.y, BLOCK_BULLET)) continue;
    // Lit before the hit, so one the jet kills dies burning (and bursts with hellfire).
    if (def.burn) igniteZombie(z, def.burn.damage, def.burn.duration, p.id, hellfire);
    hitContinuously(ctx, z, damage, p.id, bodyHitPoint(z, ux, uy));
  }
}
