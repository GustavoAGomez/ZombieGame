/**
 * Every tunable gameplay number lives here (CLAUDE.md rule 3).
 * Units: world pixels, seconds, points. Angles in degrees unless noted.
 */

export const SIM = {
  /** Fixed simulation rate. */
  hz: 60,
  /** Max simulation steps per rendered frame (avoids the spiral of death). */
  maxStepsPerFrame: 5,
  /** Longer frames are clamped to this (e.g. after a tab switch), in ms. */
  maxFrameMs: 250,
} as const;

export const PLAYER = {
  maxHp: 100,
  /** Running speed (the basic movement animation is a run). */
  speed: 140,
  hitboxRadius: 6,
  /** No regeneration: health only comes back with health pickups (PICKUPS.healthAmount). */
  lowHpThreshold: 30,
  hitKnockback: 6,
  /** Distance from the player's centre to the muzzle, where bullets spawn. */
  muzzleDistance: 9,
  /** Height of the player's drawn chest: point-blank shots are tested from there to the muzzle. */
  chestHeight: 14,
  /**
   * Speed factor while shooting: the player walks (shoot_walk animation)
   * instead of running. 1 keeps the running speed.
   */
  shootingSpeedFactor: 0.5,
} as const;

/**
 * Red frame around the screen that tells the health left (spec 01 §5): a
 * fade with no-signal TV noise that grows as health drops, plus a single
 * blink on every hit. Light on purpose: it frames the game, never covers it.
 */
export const HURT_VIGNETTE = {
  /** Curve against the health lost: above 1 the first hits barely show and the last ones a lot. */
  curve: 1.6,
  /** Opacity of the red fade and of the noise with 0 health. */
  maxFade: 0.6,
  maxNoise: 0.4,
  /** Extra opacity of the blink on each hit, which fades out in flashDuration seconds. */
  flashFade: 0.55,
  flashNoise: 0.35,
  flashDuration: 0.35,
  /** Noise: frames per second, pre-drawn frames, CSS px per noise pixel and depth in CSS px of the band at the edges. */
  noiseFps: 12,
  noiseFrames: 6,
  noisePixel: 3,
  noiseBand: 64,
} as const;

export type WeaponId = 'pistol' | 'smg';

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

export const WEAPONS: Readonly<Record<WeaponId, WeaponStats>> = {
  pistol: {
    damage: 1,
    fireRate: 4,
    magazine: 8,
    startReserve: 64,
    maxReserve: 64,
    reloadTime: 1.6,
    spread: 2,
    range: 340,
    bulletSpeed: 520,
  },
  smg: {
    damage: 1,
    fireRate: 11,
    magazine: 30,
    startReserve: 120,
    maxReserve: 120,
    reloadTime: 2.2,
    spread: 6,
    range: 300,
    bulletSpeed: 560,
  },
};

export const LOADOUT = {
  /** Both weapons from the start so switching can be tested (spec 01 §4.2). */
  startingWeapons: ['pistol', 'smg'] as const satisfies readonly WeaponId[],
  /** A player carries at most this many weapons (one icon each at the bottom of the HUD). */
  maxWeapons: 3,
  switchTime: 0.4,
} as const;

/**
 * The knife: its own button, usable at any time (and the fire button falls
 * back to it when every weapon is empty). The button turns the player to
 * the nearest zombie within reach, in any direction.
 */
export const MELEE = {
  range: 20,
  /** Damage units: kills a zombie of round 1 in one blow, as in BO1. */
  damage: 3,
  cooldown: 0.6,
  /** Seconds the slash is on screen (and the player keeps facing it). */
  swingTime: 0.25,
  /** Half-angle of the cone in front of the player that melee can hit. */
  coneHalfAngle: 60,
} as const;

export const BULLETS = {
  poolSize: 64,
  /** Radius used for bullet vs zombie hits. */
  radius: 1,
  /**
   * Gun height (world px) used when a character has no muzzle points in its
   * art; with art, bullets leave the drawn muzzle of each direction.
   */
  flightHeight: 12,
} as const;

export const DASH = {
  distance: 72,
  duration: 0.18,
  cooldown: 4,
} as const;

export const AIM = {
  /** Aim-line length drawn while dragging the fire stick. */
  lineLength: 120,
} as const;

/** Touch-control response (spec 01 §2). Sizes in CSS px. */
export const CONTROLS = {
  joystickMaxTravel: 44,
  /** Fraction of max travel ignored around the centre. */
  joystickDeadZone: 0.12,
  /** Analog speed range once outside the dead zone. */
  joystickMinSpeed: 0.35,
  joystickMaxSpeed: 1,
  /** Fraction of the screen width, from the left, that grabs the joystick. */
  joystickZoneWidth: 0.4,
  joystickReturnMs: 80,
  /** Fire-stick drag beyond this switches from auto-aim to manual aim. */
  fireAimThreshold: 12,
  fireKnobMaxTravel: 28,
} as const;

export type ZombieKind = 'walker' | 'runner' | 'sprinter';

export const ZOMBIES = {
  hitboxRadius: 6,
  /**
   * HP in damage units (a bullet of the pistol or the rifle is 1): 3 in
   * rounds 1–3, then one more pistol shot every 3 rounds (4 in 4–6, 5 in 7–9…).
   */
  hpBase: 3,
  hpRoundsPerExtraHit: 3,
  hpPerExtraHit: 1,
  /**
   * With this much HP left or less a zombie drags itself along: it moves
   * at crawlSpeedFactor of its speed (later it will have lost its legs).
   */
  crawlAtHp: 1,
  crawlSpeedFactor: 0.45,
  kinds: {
    walker: { speed: 32, tearTime: 1.4 },
    runner: { speed: 58, tearTime: 1.0 },
    sprinter: { speed: 84, tearTime: 1.0 },
  } satisfies Record<ZombieKind, { speed: number; tearTime: number }>,
  /** Measured from the zombie centre to the edge of the player's hitbox. */
  attackRange: 16,
  /**
   * The zombie's drawn body, from the feet up (world px): a bullet hits when
   * its drawn path touches it. Measured on the PixelLab art: about 41 px tall
   * and 24–29 px wide with the arms out; the box covers head to feet and the
   * body without the tips of the arms. The placeholder is drawn this size.
   */
  hurtbox: { width: 20, height: 40 },
  /** Legless (crawlAtHp or less) it lies on the ground: about 24 px tall and 21–30 px wide. */
  crawlHurtbox: { width: 24, height: 24 },
  attackWindup: 0.35,
  attackDamage: 40,
  attackCooldown: 1.1,
  climbTime: 0.8,
  /** Seconds a zombie from an open spawn takes to rise before it moves (spec 02 §3.4). */
  emergeTime: 0.6,
  directChaseTiles: 2,
  /** How close to the window's exterior point counts as "arrived". */
  windowArriveRadius: 12,
  /** Seconds a dead zombie stays on screen for its death animation. */
  corpseTime: 0.6,
  /** Extra gap kept between two zombie hitboxes. */
  separationPadding: 2,
  /** Fraction of the overlap between two zombies resolved per tick. */
  separationStrength: 0.6,
  /** Speed factor when stepping sideways around a zombie in front. */
  sidestepFactor: 0.6,
  bloodFadeTime: 20,
  maxBloodDecals: 40,
  bloodVariants: 3,
  poolSize: 32,
} as const;

/** Zombie type mix per round (spec 01 §4.4). Shares are 0..1. */
export const ZOMBIE_MIX = {
  runnerRampStartRound: 3,
  runnerRampEndRound: 5,
  runnerRampStartShare: 0.2,
  runnerRampEndShare: 0.5,
  runnerLateFromRound: 6,
  runnerLateShare: 0.6,
  sprinterFromRound: 8,
  sprinterStartShare: 0.1,
  sprinterSharePerRound: 0.1,
  sprinterMaxShare: 0.3,
} as const;

export const NAVIGATION = {
  flowFieldInterval: 0.25,
  /**
   * A barricaded window is a way in for the zombies' flow field, at a cost
   * in tiles of walking: per plank left, plus the climb. Zombies break
   * through instead of walking around unless the open way is shorter than
   * that (a full window, 5 planks, costs 1 + 3 + 1 = 5 tiles).
   */
  barricadeStepsPerPlank: 0.5,
  barricadeClimbSteps: 1,
  /** A zombie heading for a window gives it up only for a way at least this many tiles shorter. */
  routeSwitchSteps: 2,
  /**
   * A chasing zombie off the flow field (pushed out through a window, say)
   * heads back for the nearest window this close (tiles), to come in again.
   */
  lostWindowRange: 3,
  /**
   * A chasing zombie off the flow field with no window near is taken off
   * the map after this long (s) and comes back from a spawn, so a stuck
   * zombie never blocks the end of a round.
   */
  lostRespawnTime: 6,
} as const;

export const BARRICADES = {
  planksPerWindow: 5,
  repairRange: 40,
  /** Each tap of the chip repairs one plank; faster taps than this are ignored. */
  repairTapCooldown: 0.2,
  pointsPerPlank: 10,
  maxRepairPointsPerRound: 500,
} as const;

/**
 * Points and money: every gain adds the same to both. Money ($) is what the
 * player spends (doors, portals, merchants); points only add up (the score).
 */
export const POINTS = {
  /** Money at the start of a match; points start at 0. */
  startMoney: 500,
  hit: 10,
  kill: 50,
  floatingTextMs: 600,
} as const;

export const DOORS = {
  interactRange: 48,
} as const;

/** Stairs, ladders and the hatch between islands (spec 02 §3.6). Costs live in the map. */
export const PORTALS = {
  /** The chip shows up within this distance of the centre of a closed portal end. */
  interactRange: 48,
} as const;

export const WAVES = {
  bannerDuration: 2.5,
  zombiesBase: 6,
  zombiesPerRound: 4,
  zombiesMax: 80,
  maxAlive: 20,
  spawnIntervalBase: 2.0,
  spawnIntervalPerRound: 0.1,
  spawnIntervalMin: 0.4,
  /**
   * Spawn weight = 1 / (1 + pathTiles / falloff): closer spawns are likelier.
   * pathTiles is the walking distance to the nearest player (flow field).
   */
  spawnFalloffTiles: 8,
  /** Spawns farther than this (walking, in tiles) are skipped while any spawn is closer. */
  spawnMaxPathTiles: 28,
  /** Open spawns (street, roof) stay off while a live player is closer than this (spec 02 §3.4). */
  openSpawnMinDistanceTiles: 8,
  restTime: 8,
} as const;

export type PickupKind = 'ammo' | 'health';

/** Drops from killed zombies. One roll per kill: ammo, else health, else nothing. */
export const PICKUPS = {
  ammoChance: 0.22,
  healthChance: 0.06,
  /** Magazines added to the reserve of every weapon, capped at maxReserve. */
  ammoMagazines: 2,
  healthAmount: 50,
  /** Seconds on the floor before disappearing; it blinks during the last ones. */
  lifetime: 15,
  blinkTime: 3,
  /** Collected when the player's hitbox touches this radius. */
  radius: 6,
  poolSize: 12,
} as const;

/** Debug panel (spec 01 §8). */
/** Weapon upgrades (spec 03 §6): levels 1–3 add up; a special per weapon, apart from the levels. */
export const WEAPON_UPGRADES = {
  maxLevel: 3,
  /** Level 1: magazine and maximum reserve multiplied by this (and the weapon refilled to the new maximum). */
  capacityFactor: 2,
  /** Level 2: fire rate multiplied by this. */
  fireRateFactor: 1.5,
  /** Level 3: damage multiplied by this (stacks with double damage: ×4). */
  damageFactor: 2,
  /** Pistol special: projectiles per shot, the angle between them (degrees) and one round of ammo for all. */
  fanProjectiles: 3,
  fanAngle: 12,
  /** SMG special: zombies one bullet can hit before it disappears (walls still stop it). */
  pierceHits: 3,
} as const;

/** The special each weapon gets (spec 03 §6). */
export const WEAPON_SPECIALS: Readonly<Record<WeaponId, 'fan' | 'pierce'>> = {
  pistol: 'fan',
  smg: 'pierce',
};

/** Temporary boosts sold by the blue merchant (spec 03 §5). */
export type BoostKind = 'speed' | 'double_damage';

export const BOOSTS = {
  /** The merchant draws one of these for its "round boost" every time it moves. */
  kinds: ['speed', 'double_damage'] as const satisfies readonly BoostKind[],
  /** Seconds a stored boost lasts once activated. */
  duration: 10,
  /** speed: the player's walking speed is multiplied by this. */
  speedFactor: 1.5,
  /** double_damage: every weapon's and the knife's damage is multiplied by this. */
  damageFactor: 2,
} as const;

/** Rules shared by every merchant (spec 03 §2); each one's colour, rounds and catalogue are in merchants.ts. */
export const MERCHANT = {
  /** Solid circle around its feet that players cannot walk through. Zombies and bullets ignore it. */
  radius: 8,
  /** Closer than this (px, feet to feet) the action button offers the merchant's shop (spec 03 §3). */
  interactRange: 40,
  /** The shop panel closes by itself when the player gets farther than this (px). */
  closeRange: 64,
  /** Smoke puff where it appears and where it left (s). */
  puffTime: 0.3,
  /** "EL MAGO AZUL SE HA MOVIDO" on the HUD (s). */
  movedNoticeTime: 2,
  /** Small arrow at the screen edge pointing to a merchant out of view. */
  offscreenIndicator: true,
} as const;

export const DEBUG = {
  /** The bigger points button of spec 03 §7. */
  bigPoints: 10000,
  /** Points added by the +1000 button. */
  points: 1000,
} as const;
