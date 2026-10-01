import { WEAPON_UPGRADES, WEAPONS } from '../../config/balance';
import type { BulletLook, WeaponSlotState } from '../../core/GameState';

/**
 * What a weapon the player carries can do, with its upgrades (spec 03 §6):
 * level 1 doubles the magazine and the reserve, level 2 multiplies the fire
 * rate by 1.5, level 3 doubles the damage. One place for all of it, used by
 * the reload, the shots, the ammo pickups and the merchants.
 */
export function magazineSize(slot: WeaponSlotState): number {
  return WEAPONS[slot.id].magazine * (slot.level >= 1 ? WEAPON_UPGRADES.capacityFactor : 1);
}

export function maxReserve(slot: WeaponSlotState): number {
  return WEAPONS[slot.id].maxReserve * (slot.level >= 1 ? WEAPON_UPGRADES.capacityFactor : 1);
}

/** Shots per second. */
export function fireRate(slot: WeaponSlotState): number {
  return WEAPONS[slot.id].fireRate * (slot.level >= 2 ? WEAPON_UPGRADES.fireRateFactor : 1);
}

/** Damage per bullet, before temporary boosts. */
export function bulletDamage(slot: WeaponSlotState): number {
  return WEAPONS[slot.id].damage * (slot.level >= 3 ? WEAPON_UPGRADES.damageFactor : 1);
}

/** Magazine and reserve at their maximum. */
export function isFullyLoaded(slot: WeaponSlotState): boolean {
  return slot.magazine >= magazineSize(slot) && slot.reserve >= maxReserve(slot);
}

export function isMaxLevel(slot: WeaponSlotState): boolean {
  return slot.level >= WEAPON_UPGRADES.maxLevel;
}

/** One level up (to the maximum). Reaching level 1, the weapon is refilled to its new capacity. */
export function levelUp(slot: WeaponSlotState): void {
  if (isMaxLevel(slot)) return;
  slot.level++;
  if (slot.level === 1) {
    slot.magazine = magazineSize(slot);
    slot.reserve = maxReserve(slot);
  }
}

/** How its bullets look: the special (gold) over double damage (light blue) over level 3 (lighter). */
export function bulletLook(slot: WeaponSlotState, doubleDamage: boolean): BulletLook {
  if (slot.special) return 'special';
  if (doubleDamage) return 'boosted';
  return slot.level >= 3 ? 'upgraded' : 'normal';
}
