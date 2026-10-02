/**
 * Weapon catalogue (spec 04 §1, spec 06 §1): every weapon is data. Each one
 * says how it attacks, how many levels of each kind of upgrade it takes
 * (ammo, fire rate, damage; sold by the red merchant, the kind chosen by
 * the player) and its optional special (sold by the gold merchant); nothing
 * assumes three levels. Names shown on screen live in STRINGS.weapons.
 */

export type WeaponId = 'pistol' | 'smg' | 'shotgun' | 'katana' | 'laser' | 'flamethrower';

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
export type WeaponSpecialId = 'fan' | 'pierce' | 'fire' | 'blood_edge' | 'overcharge' | 'hellfire';

export interface WeaponStats {
  /**
   * Damage per bullet, in damage units (zombie HP is counted in the same
   * units); per zombie for a sweep, and per damage tick to each zombie
   * touched for a beam or a cone.
   */
  damage: number;
  /** Shots per second (sweeps for a melee weapon, damage ticks for a beam or a cone). */
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
  /**
   * A beam's battery (the laser): it drains while firing, refills by itself
   * after a pause, and once empty the weapon overheats and stays locked.
   */
  battery?: {
    capacity: number;
    /** Spent per second of beam. */
    drain: number;
    /** Gained per second, once rechargeDelay seconds have passed without firing. */
    recharge: number;
    rechargeDelay: number;
    /** Seconds locked after running dry; then it recharges as usual. */
    overheatTime: number;
  };
  /** A cone weapon (the flamethrower): rounds of ammo spent per second of jet. */
  fuelPerSecond?: number;
  /** A cone weapon: every zombie it touches burns this much in total over `duration` s (BurnSystem). */
  burn?: { damage: number; duration: number };
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
  /** Katana, "Filo de sangre" (spec 06 §2.2): each zombie it kills heals the player, up to a cap per sweep. */
  blood_edge: { healPerKill: 2, maxHealPerSweep: 10 },
  /** Laser, "Sobrecarga" (spec 06 §2.1): damage ×2 and the battery lasts twice as long. */
  overcharge: { damageFactor: 2, drainFactor: 0.5 },
  /**
   * Flamethrower, "Fuego infernal" (spec 06 §2.3): a zombie that dies burning
   * from it bursts, hitting every zombie within `radius` px for `damage` and
   * setting them on fire the same way, so the bursts can chain.
   */
  hellfire: { damage: 2, radius: 40 },
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
    /** One sweep every 5 s: the weapon's own cooldown, running in the holster too, so a swap does not skip it. */
    fireRate: 1 / 5,
    magazine: 0,
    startReserve: 0,
    maxReserve: 0,
    reloadTime: 0,
    range: 102,
    arc: 140,
    knockback: 6,
    firstShotDelay: 0,
    upgrades: {},
    special: 'blood_edge',
  },
  // Laser (spec 06 §2.1): a continuous ray through every zombie in line, on a battery instead of ammo.
  laser: {
    id: 'laser',
    category: 'special',
    attack: 'beam',
    /** 6 per second to each zombie touched, in ticks of 0.1 s. */
    damage: 0.6,
    fireRate: 10,
    magazine: 0,
    startReserve: 0,
    maxReserve: 0,
    reloadTime: 0,
    /** Walls stop it; zombies do not. */
    range: 280,
    /** 4 s of beam on a full battery. */
    battery: { capacity: 100, drain: 25, recharge: 20, rechargeDelay: 0.8, overheatTime: 3 },
    firstShotDelay: FIRST_SHOT_DELAY,
    upgrades: {},
    special: 'overcharge',
  },
  // Infernal flamethrower (spec 06 §2.3): a short jet in a cone that sets on fire everyone it touches.
  flamethrower: {
    id: 'flamethrower',
    category: 'special',
    attack: 'cone',
    /** 4 per second to each zombie in the cone, in ticks of 0.1 s. */
    damage: 0.4,
    fireRate: 10,
    /** Tank and reserve, in rounds: the blue merchant's max ammo and the ammo drops refill them. */
    magazine: 60,
    startReserve: 180,
    maxReserve: 180,
    reloadTime: 2.5,
    /** Walls stop it: a zombie out of sight does not burn. */
    range: 135,
    arc: 40,
    /** 5 s of jet per tank. */
    fuelPerSecond: 12,
    /** It does not stack: every touch restarts it. */
    burn: { damage: 2, duration: 2 },
    firstShotDelay: FIRST_SHOT_DELAY,
    upgrades: {},
    special: 'hellfire',
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];

/** The weapons weapon cases can sell (spec 06 §1: the special ones only come from the Demon's Hand). */
export const BASIC_WEAPON_IDS = WEAPON_IDS.filter((id) => WEAPONS[id].category === 'basic');
