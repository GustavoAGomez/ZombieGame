import { WEAPONS } from '../../config/balance';
import type { WeaponSlotState } from '../../core/GameState';

/**
 * Capacities of a weapon the player carries. One place for them, so the
 * weapon upgrades of spec 03 §6 (level 1 doubles both) change them for the
 * reload, the ammo pickups and the merchants' max ammo at once.
 */
export function magazineSize(slot: WeaponSlotState): number {
  return WEAPONS[slot.id].magazine;
}

export function maxReserve(slot: WeaponSlotState): number {
  return WEAPONS[slot.id].maxReserve;
}

/** Magazine and reserve at their maximum. */
export function isFullyLoaded(slot: WeaponSlotState): boolean {
  return slot.magazine >= magazineSize(slot) && slot.reserve >= maxReserve(slot);
}
