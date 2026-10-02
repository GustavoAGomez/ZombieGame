/**
 * Weapon catalogue (spec 04 §1): every weapon is data. Each one lists its
 * own upgrade levels (sold by the red merchant) and its optional special
 * (sold by the gold merchant); nothing assumes three levels. Names shown on
 * screen live in STRINGS.weapons.
 */

export type WeaponId = 'pistol' | 'smg';

/** `basic`: bought at weapon cases. `special`: later weapons, with fewer levels or none. */
export type WeaponCategory = 'basic' | 'special';

/** What one upgrade level does (UPGRADE_EFFECTS has the factors). */
export type UpgradeEffect = 'ammo_x2' | 'fire_rate' | 'damage_x2';

/** A weapon's unique upgrade from the gold merchant. */
export type WeaponSpecialId = 'fan' | 'pierce';

export interface WeaponStats {
  /** Damage per bullet, in damage units (zombie HP is counted in the same units). */
  damage: number;
  /** Shots per second. */
  fireRate: number;
  magazine: number;
  startReserve: number;
  /** Ammo pickups never raise the reserve above this. */
  maxReserve: number;
  reloadTime: number;
  /** Total cone angle in degrees; each shot deviates up to ±spread/2. */
  spread: number;
  range: number;
  bulletSpeed: number;
}

export interface WeaponDef extends WeaponStats {
  id: WeaponId;
  category: WeaponCategory;
  /** Upgrade levels in order: level N applies the first N of them. Empty: not upgradable. */
  upgrades: readonly UpgradeEffect[];
  special?: WeaponSpecialId;
  /** `fire_rate` also speeds up the reload (slow-reloading weapons, spec 04 §1). */
  fireRateSpeedsReload?: boolean;
}

/** The factor of each upgrade effect; several of the same kind multiply. */
export const UPGRADE_EFFECTS = {
  /** Magazine and maximum reserve multiplied by this; the weapon is refilled to the new maximum. */
  ammo_x2: { capacityFactor: 2 },
  /** Fire rate multiplied by this (and the reload sped up by `reloadFactor` where the weapon says so). */
  fire_rate: { fireRateFactor: 1.5, reloadFactor: 1.5 },
  /** Damage multiplied by this (stacks with the double damage boost: ×4). */
  damage_x2: { damageFactor: 2 },
} as const;

/** The specials' numbers. */
export const WEAPON_SPECIALS = {
  /** Pistol: projectiles per shot, the angle between them (degrees) and one round of ammo for all. */
  fan: { projectiles: 3, angle: 12 },
  /** SMG: zombies one bullet can hit before it disappears (walls still stop it). */
  pierce: { hits: 3 },
} as const;

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  pistol: {
    id: 'pistol',
    category: 'basic',
    damage: 1,
    fireRate: 4,
    magazine: 8,
    startReserve: 64,
    maxReserve: 64,
    reloadTime: 1.6,
    spread: 2,
    range: 340,
    bulletSpeed: 520,
    upgrades: ['ammo_x2', 'fire_rate', 'damage_x2'],
    special: 'fan',
  },
  smg: {
    id: 'smg',
    category: 'basic',
    damage: 1,
    fireRate: 11,
    magazine: 30,
    startReserve: 120,
    maxReserve: 120,
    reloadTime: 2.2,
    spread: 6,
    range: 300,
    bulletSpeed: 560,
    upgrades: ['ammo_x2', 'fire_rate', 'damage_x2'],
    special: 'pierce',
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
