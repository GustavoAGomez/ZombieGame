import { LOADOUT } from '../../config/balance';
import type { WeaponId } from '../../config/weapons';
import { createWeaponSlot, type PlayerState, type WeaponSlotState } from '../../core/GameState';
import { magazineSize, maxReserve } from './weaponStats';

/**
 * The weapons a player carries (spec 04 §2): up to LOADOUT.maxWeapons. A new
 * weapon goes into a free slot and is taken in hand; with every slot full it
 * replaces the weapon in hand, which loses its levels and its special (they
 * belong to the weapon).
 */

/** Slot of weapon `id` in the player's hands, or -1. */
export function findWeapon(p: PlayerState, id: WeaponId): number {
  return p.weapons.findIndex((w) => w.id === id);
}

/** Takes slot `index` in hand, with the usual switch time (and no reload carried over). */
export function equipSlot(p: PlayerState, index: number): void {
  if (!p.weapons[index]) return;
  p.activeSlot = index;
  p.switchTimer = LOADOUT.switchTime;
  p.reloadTimer = 0;
  p.fireCooldown = Math.max(p.fireCooldown, 0);
}

/** The weapon that buying `id` would replace (the one in hand with every slot full), or null. */
export function weaponReplacedBy(p: PlayerState, id: WeaponId): WeaponSlotState | null {
  if (findWeapon(p, id) >= 0 || p.weapons.length < LOADOUT.maxWeapons) return null;
  return p.weapons[p.activeSlot] ?? null;
}

/**
 * Gives weapon `id`: into a free slot, or in place of the weapon in hand when
 * every slot is full. Already carried, it is only taken in hand.
 */
export function giveWeapon(p: PlayerState, id: WeaponId): 'added' | 'replaced' | 'owned' {
  const owned = findWeapon(p, id);
  if (owned >= 0) {
    if (owned !== p.activeSlot) equipSlot(p, owned);
    return 'owned';
  }
  const slot = createWeaponSlot(id);
  if (p.weapons.length < LOADOUT.maxWeapons) {
    p.weapons.push(slot);
    equipSlot(p, p.weapons.length - 1);
    return 'added';
  }
  p.weapons[p.activeSlot] = slot;
  equipSlot(p, p.activeSlot);
  return 'replaced';
}

/** Magazine and reserve to their maximum at the weapon's level. */
export function refillWeapon(slot: WeaponSlotState): void {
  slot.magazine = magazineSize(slot);
  slot.reserve = maxReserve(slot);
}
