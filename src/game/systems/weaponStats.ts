import { UPGRADE_EFFECTS, WEAPONS, type UpgradeEffect, type WeaponDef } from '../../config/weapons';
import type { BulletLook, WeaponSlotState } from '../../core/GameState';
import type { ShopReason } from '../../core/shop';

/**
 * What a weapon can do at an upgrade level (spec 04 §1). Level N applies the
 * first N effects of the weapon's own list, so each weapon decides its
 * levels; effects of the same kind multiply. One place for all of it, used
 * by the reload, the shots, the ammo pickups and the merchants. The `def`
 * functions are pure on the catalogue entry; the slot ones read WEAPONS.
 */

/** How many of the first `level` upgrades of `def` are `effect`. */
export function upgradeCount(def: WeaponDef, level: number, effect: UpgradeEffect): number {
  let n = 0;
  const reached = Math.min(level, def.upgrades.length);
  for (let i = 0; i < reached; i++) if (def.upgrades[i] === effect) n++;
  return n;
}

export interface LevelStats {
  magazine: number;
  maxReserve: number;
  fireRate: number;
  damage: number;
  reloadTime: number;
}

/** The weapon's numbers at `level`, before temporary boosts. */
export function levelStats(def: WeaponDef, level: number): LevelStats {
  const ammo = UPGRADE_EFFECTS.ammo_x2.capacityFactor ** upgradeCount(def, level, 'ammo_x2');
  const rateLevels = upgradeCount(def, level, 'fire_rate');
  const reload = def.fireRateSpeedsReload ? UPGRADE_EFFECTS.fire_rate.reloadFactor ** rateLevels : 1;
  return {
    magazine: def.magazine * ammo,
    maxReserve: def.maxReserve * ammo,
    fireRate: def.fireRate * UPGRADE_EFFECTS.fire_rate.fireRateFactor ** rateLevels,
    damage: def.damage * UPGRADE_EFFECTS.damage_x2.damageFactor ** upgradeCount(def, level, 'damage_x2'),
    reloadTime: def.reloadTime / reload,
  };
}

/** Why the red merchant cannot sell `def` another level: no list at all, or already at its end. */
export function levelUpReason(def: WeaponDef, level: number): ShopReason | null {
  if (def.upgrades.length === 0) return 'notUpgradable';
  return level >= def.upgrades.length ? 'maxLevel' : null;
}

/** Why the gold merchant cannot sell `def` its special: it has none, or the weapon already has it. */
export function specialReason(def: WeaponDef, hasSpecial: boolean): ShopReason | null {
  if (!def.special) return 'noSpecial';
  return hasSpecial ? 'hasSpecial' : null;
}

function statsOf(slot: WeaponSlotState): LevelStats {
  return levelStats(WEAPONS[slot.id], slot.level);
}

export function magazineSize(slot: WeaponSlotState): number {
  return statsOf(slot).magazine;
}

export function maxReserve(slot: WeaponSlotState): number {
  return statsOf(slot).maxReserve;
}

/** Shots per second. */
export function fireRate(slot: WeaponSlotState): number {
  return statsOf(slot).fireRate;
}

/** Damage per bullet, before temporary boosts. */
export function bulletDamage(slot: WeaponSlotState): number {
  return statsOf(slot).damage;
}

export function reloadTime(slot: WeaponSlotState): number {
  return statsOf(slot).reloadTime;
}

/** Magazine and reserve at their maximum. */
export function isFullyLoaded(slot: WeaponSlotState): boolean {
  return slot.magazine >= magazineSize(slot) && slot.reserve >= maxReserve(slot);
}

/** Levels the weapon can reach (the length of its own list). */
export function maxLevel(slot: WeaponSlotState): number {
  return WEAPONS[slot.id].upgrades.length;
}

export function isMaxLevel(slot: WeaponSlotState): boolean {
  return slot.level >= maxLevel(slot);
}

/** One level up (to the end of its list). An `ammo_x2` level refills the weapon to its new capacity. */
export function levelUp(slot: WeaponSlotState): void {
  if (isMaxLevel(slot)) return;
  const effect = WEAPONS[slot.id].upgrades[slot.level];
  slot.level++;
  if (effect === 'ammo_x2') {
    slot.magazine = magazineSize(slot);
    slot.reserve = maxReserve(slot);
  }
}

/** How its bullets look: the special (gold) over double damage (light blue) over a damage level (lighter). */
export function bulletLook(slot: WeaponSlotState, doubleDamage: boolean): BulletLook {
  if (slot.special) return 'special';
  if (doubleDamage) return 'boosted';
  return upgradeCount(WEAPONS[slot.id], slot.level, 'damage_x2') > 0 ? 'upgraded' : 'normal';
}
