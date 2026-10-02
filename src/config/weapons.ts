/**
 * Weapon catalogue (spec 04 §1, spec 06 §1): every weapon is data. Each one
 * says how it attacks, how many levels of each kind of upgrade it takes
 * (ammo, fire rate, damage; sold by the red merchant, the kind chosen by
 * the player) and its optional special (sold by the gold merchant); nothing
 * assumes three levels. Names shown on screen live in STRINGS.weapons.
 */

export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'katana';

/** `basic`: bought at weapon cases. `special`: only from the Demon's Hand (spec 06), never at a case. */
export type WeaponCategory = 'basic' | 'special';

/**
 * How a weapon attacks (spec 06 §1):
 *   bullets  projectiles, with rounds of ammo (pistol, SMG, shotgun)
 *   beam     a continuous ray while held, on a battery (laser)
 *   melee    a sweep in an arc ahead, no ammo (katana)
 *   cone     a continuous jet in a cone while held, with rounds of ammo (flamethrower)
 * A weapon without rounds keeps magazine, reserve and reload at 0.
 */
export type WeaponAttack = 'bullets' | 'beam' | 'melee' | 'cone';

/** What a weapon spends: rounds (magazine and reserve), its battery (beam) or nothing (melee). */
export type AmmoKind = 'rounds' | 'battery' | 'none';

/** What an upgrade improves; the red merchant sells each kind's levels separately (UPGRADE_LEVELS has the factors). */
export type UpgradeKind = 'ammo' | 'fire_rate' | 'damage';
export const UPGRADE_KINDS: readonly UpgradeKind[] = ['ammo', 'fire_rate', 'damage'];

/** A weapon's unique upgrade from the gold merchant. */
export type WeaponSpecialId = 'fan' | 'pierce' | 'fire';

export interface WeaponStats {
  /** Damage per bullet (per zombie for a sweep), in damage units (zombie HP is counted in the same units). */
  damage: number;
  /** Shots per second (sweeps per second for a melee weapon). */
  fireRate: number;
  magazine: number;
  startReserve: number;
  /** Ammo pickups never raise the reserve above this. */
  maxReserve: number;
  reloadTime: number;
  /**
   * Bullets: total cone angle in degrees. One projectile per shot deviates
   * up to ±spread/2; with several pellets, they are spread evenly across it.
   */
  spread?: number;
  /** Px; for a melee weapon, from the player to the edge of a zombie's hitbox. */
  range: number;
  bulletSpeed?: number;
  /** Melee and cone weapons: the total angle in degrees they reach, centred on the aim. */
  arc?: number;
  /** Projectiles per round (a shotgun's pellets); 1 when missing. */
  pellets?: number;
  /** Random variation of each pellet around its even place in the cone (degrees, total). */
  pelletJitter?: number;
  /** Full damage up to `fullUntil` px, then down linearly to `minFactor` at the weapon's range. */
  falloff?: { fullUntil: number; minFactor: number };
  /** Every hit pushes the zombie this many px along the shot (away from the player for a sweep). */
  knockback?: number;
  /** Size of its muzzle flash next to the pistol's, and how far the player is pushed back per shot (px). Look only. */
  muzzleFlashScale?: number;
  recoil?: number;
  /**
   * Seconds from pressing fire to the first shot of that press: time to
   * correct the aim when the thumb lands off the centre of the fire stick.
   * Holding on, it then fires at its rate. A tap shorter than this still
   * fires once, when the time is up, where it was last aimed.
   */
  firstShotDelay: number;
}

export interface WeaponDef extends WeaponStats {
  id: WeaponId;
  category: WeaponCategory;
  attack: WeaponAttack;
  /** Levels it takes of each kind of upgrade (up to UPGRADE_LEVELS' length); a kind missing or 0: not upgradable that way. */
  upgrades: Readonly<Partial<Record<UpgradeKind, number>>>;
  special?: WeaponSpecialId;
  /** `fire_rate` also speeds up the reload (slow-reloading weapons, spec 04 §1). */
  fireRateSpeedsReload?: boolean;
}

/**
 * The factor each level of each kind gives (index = level − 1). It is the
 * total at that level: levels of one kind do not multiply each other.
 *   ammo       magazine and maximum reserve (the weapon is refilled to the new maximum)
 *   fire_rate  shots per second (and the reload, where the weapon says so)
 *   damage     damage per bullet (it stacks with the double damage boost)
 */
export const UPGRADE_LEVELS: Readonly<Record<UpgradeKind, readonly number[]>> = {
  ammo: [1.5, 2, 2.5],
  fire_rate: [1.25, 1.5, 1.75],
  damage: [1.5, 2, 2.5],
};

/** Every basic weapon takes the three kinds, three levels each. */
const ALL_UPGRADES = { ammo: 3, fire_rate: 3, damage: 3 } as const;

/** Time to aim before the first shot of a press, the same for every weapon for now. */
const FIRST_SHOT_DELAY = 0.3;

/** The specials' numbers. */
export const WEAPON_SPECIALS = {
  /** Pistol: projectiles per shot, the angle between them (degrees) and one round of ammo for all. */
  fan: { projectiles: 3, angle: 12 },
  /** SMG: zombies one bullet can hit before it disappears (walls still stop it). */
  pierce: { hits: 3 },
  /**
   * Shotgun: each pellet that hits sets the zombie on fire (the reusable
   * burn effect, BurnSystem). It burns for fireDamageFactor of the pellet's
   * final damage in total, in ticks every fireTickInterval for fireDuration.
   */
  fire: { fireDamageFactor: 0.4, fireTickInterval: 0.15, fireDuration: 1.5 },
} as const;

export const WEAPONS: Readonly<Record<WeaponId, WeaponDef>> = {
  pistol: {
    id: 'pistol',
    category: 'basic',
    attack: 'bullets',
    damage: 1,
    fireRate: 4,
    magazine: 8,
    startReserve: 64,
    maxReserve: 64,
    reloadTime: 1.6,
    spread: 2,
    range: 340,
    bulletSpeed: 520,
    firstShotDelay: FIRST_SHOT_DELAY,
    upgrades: ALL_UPGRADES,
    special: 'fan',
  },
  smg: {
    id: 'smg',
    category: 'basic',
    attack: 'bullets',
    damage: 1,
    fireRate: 11,
    magazine: 30,
    startReserve: 120,
    maxReserve: 120,
    reloadTime: 2.2,
    spread: 6,
    range: 300,
    bulletSpeed: 560,
    firstShotDelay: FIRST_SHOT_DELAY,
    upgrades: ALL_UPGRADES,
    special: 'pierce',
  },
  // Hunting shotgun (spec 04 §1): 6 pellets per shell, deadly up close.
  shotgun: {
    id: 'shotgun',
    category: 'basic',
    attack: 'bullets',
    /** Per pellet: 18 in the old scale where the pistol did 20 (docs/DECISIONS.md). */
    damage: 0.9,
    fireRate: 1.4,
    magazine: 2,
    startReserve: 24,
    maxReserve: 24,
    reloadTime: 1.8,
    spread: 22,
    range: 150,
    bulletSpeed: 520,
    pellets: 6,
    pelletJitter: 3,
    falloff: { fullUntil: 60, minFactor: 0.4 },
    knockback: 3,
    muzzleFlashScale: 1.6,
    recoil: 2,
    firstShotDelay: FIRST_SHOT_DELAY,
    upgrades: ALL_UPGRADES,
    special: 'fire',
    // With only 2 shells, the reload is most of its pace: the fire rate level speeds it up too.
    fireRateSpeedsReload: true,
  },
  // Katana (spec 06 §2.2): a sweep that cuts every zombie in a wide arc. No ammo, no wait before the first.
  katana: {
    id: 'katana',
    category: 'special',
    attack: 'melee',
    damage: 4,
    /** One sweep every 0.45 s. */
    fireRate: 1 / 0.45,
    magazine: 0,
    startReserve: 0,
    maxReserve: 0,
    reloadTime: 0,
    range: 34,
    arc: 140,
    knockback: 6,
    firstShotDelay: 0,
    upgrades: {},
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** The weapons weapon cases can sell (spec 06 §1: the special ones only come from the Demon's Hand). */
export const BASIC_WEAPON_IDS = WEAPON_IDS.filter((id) => WEAPONS[id].category === 'basic');
