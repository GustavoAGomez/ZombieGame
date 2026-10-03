import { BULLETS, CONTINUOUS, PLAYER, SIM } from '../../config/balance';
import { WEAPON_SPECIALS, WEAPONS } from '../../config/weapons';
import type { PlayerState, WeaponSlotState, ZombieState } from '../../core/GameState';
import { BLOCK_BULLET, pointBlocksShaped, segmentClearShaped, segmentHitShaped } from '../map/CollisionGrid';
import { damageFactor } from './BoostSystem';
import { damageZombie, isZombieAlive, type HitPoint } from './Combat';
import { bodyEntry, hurtboxOf, muzzleFor } from './shotGeometry';
import type { SimContext } from './SimContext';
import { removeWeapon } from './InventorySystem';
import { bulletDamage, fireRate } from './weaponStats';

/**
 * The laser's beam (spec 06 §2.1): while the fire button is held, a ray
 * from the gun's muzzle along the aim, up to its range or the first wall,
 * through every zombie in line. Judged like a bullet: zombies by their drawn
 * body, walls by the ground right under the drawn ray. Every zombie it
 * touches takes the weapon's damage once per damage tick (fireRate, through
 * the player's fire cooldown); a zombie right against the player, between
 * the chest and the drawn muzzle, is caught too.
 *
 * Its battery drains while firing and refills by itself after a pause.
 * Running dry overheats it: locked for a while, then it recharges as usual.
 * The time it overheats for battery.breaksAfter, it breaks for good: it is
 * lost, and the next weapon is taken in hand.
 */

const scoreTicks = Math.round(CONTINUOUS.scoreInterval * SIM.hz);

/** Fires the beam of `slot` (the weapon in hand) this tick, if its battery allows. */
export function fireBeam(ctx: SimContext, p: PlayerState, slot: WeaponSlotState, dt: number): void {
  const def = WEAPONS[slot.id];
  const battery = def.battery;
  if (!battery || slot.battery <= 0 || slot.overheat > 0) return;
  // "Sobrecarga" (the laser's special): twice the damage, and the battery lasts twice as long.
  const overcharge = slot.special && def.special === 'overcharge' ? WEAPON_SPECIALS.overcharge : null;
  p.beamOn = true;
  p.lastAttackTick = ctx.state.tick;
  slot.batteryIdle = 0;
  slot.battery -= battery.drain * (overcharge?.drainFactor ?? 1) * dt;
  if (slot.battery <= 0) {
    slot.battery = 0;
    slot.overheat = battery.overheatTime;
    slot.overheats++;
    if (battery.breaksAfter !== undefined && slot.overheats >= battery.breaksAfter) {
      p.beamOn = false;
      removeWeapon(p, p.weapons.indexOf(slot));
      ctx.events.emit('weapon:broken', { playerId: p.id, weapon: slot.id, lost: true });
      return;
    }
  }
  const aim = Math.atan2(p.aimY, p.aimX);
  const m = muzzleFor(ctx.muzzles, aim);
  const sx = p.x + m.x;
  const sy = p.y + m.y;
  p.beamLength = beamLength(ctx, sx, sy, p.aimX, p.aimY, def.range);
  if (p.fireCooldown > 0) return;
  p.fireCooldown += 1 / fireRate(slot);
  const damage = bulletDamage(slot) * damageFactor(p) * (overcharge?.damageFactor ?? 1);
  const { zombies } = ctx.state;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z)) continue;
    const t = onBeam(ctx, p, z, sx, sy);
    if (t === Infinity) continue;
    hitContinuously(ctx, z, damage, p.id, { x: sx + p.aimX * t, y: sy + p.aimY * t, dirX: p.aimX, dirY: p.aimY });
  }
}

/**
 * One damage tick of a continuous weapon on `z`: the damage, and a hit
 * that scores (with its blood) only once per CONTINUOUS.scoreInterval of
 * contact, or when it kills.
 */
export function hitContinuously(ctx: SimContext, z: ZombieState, damage: number, owner: number, hit: HitPoint): void {
  const scores = ctx.state.tick - z.contactScoreTick >= scoreTicks;
  if (scores) z.contactScoreTick = ctx.state.tick;
  const lethal = z.hp - damage <= 0;
  damageZombie(ctx, z, damage, owner, scores || lethal ? hit : undefined, scores ? undefined : 0);
}

/** Px from the drawn muzzle (sx, sy) along (dirX, dirY) to the first wall, or `range`. */
function beamLength(ctx: SimContext, sx: number, sy: number, dirX: number, dirY: number, range: number): number {
  const gx = sx;
  const gy = sy + BULLETS.flightHeight;
  if (pointBlocksShaped(ctx.grid, gx, gy, BLOCK_BULLET)) return 0;
  const t = segmentHitShaped(ctx.grid, gx, gy, gx + dirX * range, gy + dirY * range, BLOCK_BULLET);
  return t === Infinity ? range : t * range;
}

/** Where along the beam `z` is touched (px from the muzzle; 0 against the player), or Infinity. */
function onBeam(ctx: SimContext, p: PlayerState, z: ZombieState, sx: number, sy: number): number {
  const box = hurtboxOf(z);
  const t = bodyEntry(sx, sy, p.aimX, p.aimY, p.beamLength, z.x, z.y, box);
  if (t !== Infinity) return t;
  // Between the chest and the drawn muzzle (point-blank), with no wall in between.
  const cx = p.x;
  const cy = p.y - PLAYER.chestHeight;
  const len = Math.hypot(sx - cx, sy - cy);
  if (len < 1e-6) return Infinity;
  const close = bodyEntry(cx, cy, (sx - cx) / len, (sy - cy) / len, len, z.x, z.y, box);
  return close !== Infinity && segmentClearShaped(ctx.grid, p.x, p.y, z.x, z.y, BLOCK_BULLET) ? 0 : Infinity;
}

/**
 * Batteries of the player's beam weapons not firing this tick: the
 * overheat lock runs down, and once rechargeDelay has passed without firing
 * they refill (a holstered laser too).
 */
export function updateBatteries(p: PlayerState, dt: number): void {
  for (let i = 0; i < p.weapons.length; i++) {
    const slot = p.weapons[i];
    const battery = slot ? WEAPONS[slot.id].battery : undefined;
    if (!slot || !battery || (p.beamOn && i === p.activeSlot)) continue;
    slot.batteryIdle += dt;
    if (slot.overheat > 0) slot.overheat = Math.max(0, slot.overheat - dt);
    else if (slot.batteryIdle >= battery.rechargeDelay) slot.battery = Math.min(battery.capacity, slot.battery + battery.recharge * dt);
  }
}

/** 0..1 of a beam weapon's battery (1 for the others). */
export function batteryLevel(slot: WeaponSlotState): number {
  const battery = WEAPONS[slot.id].battery;
  return battery ? slot.battery / battery.capacity : 1;
}
