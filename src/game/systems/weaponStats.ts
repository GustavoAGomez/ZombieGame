import { UPGRADE_KINDS, UPGRADE_LEVELS, WEAPONS, type AmmoKind, type UpgradeKind, type WeaponDef } from '../../config/weapons';
import type { BulletLook, WeaponSlotState } from '../../core/GameState';
import type { ShopReason } from '../../core/shop';

/**
 * What a weapon can do with its upgrades (spec 04 §1, then a level per kind
 * chosen at the red merchant). Each kind's level gives its factor from
 * UPGRADE_LEVELS, and each weapon says how many levels of each kind it
 * takes. One place for all of it, used by the reload, the shots, the ammo
 * pickups and the merchants. The `def` functions are pure on the catalogue
 * entry; the slot ones read WEAPONS.
 */

export type UpgradeLevels = Readonly<Record<UpgradeKind, number>>;

/** What `def` spends (spec 06 §1): a melee weapon nothing, a beam its battery, the rest rounds of ammo. */
export function ammoKind(def: WeaponDef): AmmoKind {
  if (def.attack === 'melee') return 'none';
  if (def.attack === 'beam') return 'battery';
  return 'rounds';
}

/** Levels a weapon takes of `kind` (0: not upgradable that way). */
export function maxUpgradeLevel(def: WeaponDef, kind: UpgradeKind): number {
  return Math.min(def.upgrades[kind] ?? 0, UPGRADE_LEVELS[kind].length);
}

/** The factor of `kind` at `level` (1 at level 0). */
export function upgradeFactor(kind: UpgradeKind, level: number): number {
  if (level <= 0) return 1;
  const table = UPGRADE_LEVELS[kind];
  return table[Math.min(level, table.length) - 1] ?? 1;
}

export interface LevelStats {
  magazine: number;
  maxReserve: number;
  fireRate: number;
  damage: number;
  reloadTime: number;
}

/** The weapon's numbers with `levels`, before temporary boosts. */
export function levelStats(def: WeaponDef, levels: UpgradeLevels): LevelStats {
  const level = (kind: UpgradeKind): number => Math.min(levels[kind], maxUpgradeLevel(def, kind));
  const ammo = upgradeFactor('ammo', level('ammo'));
  const rate = upgradeFactor('fire_rate', level('fire_rate'));
  return {
    magazine: Math.round(def.magazine * ammo),
    maxReserve: Math.round(def.maxReserve * ammo),
    fireRate: def.fireRate * rate,
    damage: def.damage * upgradeFactor('damage', level('damage')),
    reloadTime: def.fireRateSpeedsReload ? def.reloadTime / rate : def.reloadTime,
  };
}

/** Why the red merchant cannot sell `def` another level of `kind`: it takes none, or it is at its maximum. */
export function upgradeReason(def: WeaponDef, kind: UpgradeKind, level: number): ShopReason | null {
  const max = maxUpgradeLevel(def, kind);
  if (max === 0) return 'notUpgradable';
  return level >= max ? 'maxLevel' : null;
}

/** Why the gold merchant cannot sell `def` its special: it has none, or the weapon already has it. */
export function specialReason(def: WeaponDef, hasSpecial: boolean): ShopReason | null {
  if (!def.special) return 'noSpecial';
  return hasSpecial ? 'hasSpecial' : null;
}

function statsOf(slot: WeaponSlotState): LevelStats {
  return levelStats(WEAPONS[slot.id], slot.levels);
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

/** Levels bought, of every kind (the stars of a weapon a weapon case would replace). */
export function totalLevels(slot: WeaponSlotState): number {
  return UPGRADE_KINDS.reduce((sum, kind) => sum + slot.levels[kind], 0);
}

/** One level of `kind` up, to the weapon's maximum. An ammo level refills the weapon to its new capacity. */
export function upgradeWeapon(slot: WeaponSlotState, kind: UpgradeKind): void {
  if (upgradeReason(WEAPONS[slot.id], kind, slot.levels[kind]) !== null) return;
  slot.levels[kind]++;
  if (kind === 'ammo') {
    slot.magazine = magazineSize(slot);
    slot.reserve = maxReserve(slot);
  }
}

/** How its bullets look: the special (gold, orange for fire) over double damage (light blue) over a damage level (lighter). */
export function bulletLook(slot: WeaponSlotState, doubleDamage: boolean): BulletLook {
  if (slot.special) return WEAPONS[slot.id].special === 'fire' ? 'fire' : 'special';
  if (doubleDamage) return 'boosted';
  return slot.levels.damage > 0 ? 'upgraded' : 'normal';
}
