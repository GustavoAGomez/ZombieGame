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
  speed: 88,
  hitboxRadius: 6,
  regenDelay: 3,
  regenPerSecond: 40,
  lowHpThreshold: 30,
  hitFlashDuration: 0.2,
  hitKnockback: 6,
  /** Distance from the player's centre to the muzzle, where bullets spawn. */
  muzzleDistance: 9,
} as const;

export type WeaponId = 'pistol' | 'smg';

export interface WeaponStats {
  damage: number;
  /** Shots per second. */
  fireRate: number;
  magazine: number;
  startReserve: number;
  reloadTime: number;
  /** Total cone angle in degrees; each shot deviates up to ±spread/2. */
  spread: number;
  range: number;
  bulletSpeed: number;
}

export const WEAPONS: Readonly<Record<WeaponId, WeaponStats>> = {
  pistol: {
    damage: 20,
    fireRate: 4,
    magazine: 8,
    startReserve: 64,
    reloadTime: 1.6,
    spread: 2,
    range: 260,
    bulletSpeed: 520,
  },
  smg: {
    damage: 14,
    fireRate: 11,
    magazine: 30,
    startReserve: 120,
    reloadTime: 2.2,
    spread: 6,
    range: 220,
    bulletSpeed: 560,
  },
};

export const LOADOUT = {
  /** Both weapons from the start so switching can be tested (spec 01 §4.2). */
  startingWeapons: ['pistol', 'smg'] as const satisfies readonly WeaponId[],
  switchTime: 0.4,
} as const;

export const MELEE = {
  range: 20,
  damage: 50,
  cooldown: 0.6,
  /** Half-angle of the cone in front of the player that melee can hit. */
  coneHalfAngle: 60,
} as const;

export const BULLETS = {
  poolSize: 64,
  /** Radius used for bullet vs zombie hits. */
  radius: 1,
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
  fireKnobMaxTravel: 34,
} as const;

export type ZombieKind = 'walker' | 'runner' | 'sprinter';

export const ZOMBIES = {
  hitboxRadius: 6,
  /** Rounds 1–9: base + perRound × (r − 1). From round 10: hp(9) × growth^(r − 9). */
  hpBase: 50,
  hpPerRound: 25,
  hpLinearUntilRound: 9,
  hpGrowth: 1.1,
  kinds: {
    walker: { speed: 32, tearTime: 1.4 },
    runner: { speed: 58, tearTime: 1.0 },
    sprinter: { speed: 84, tearTime: 1.0 },
  } satisfies Record<ZombieKind, { speed: number; tearTime: number }>,
  attackRange: 16,
  attackWindup: 0.35,
  attackDamage: 40,
  attackCooldown: 1.1,
  climbTime: 0.8,
  directChaseTiles: 2,
  bloodFadeTime: 20,
  maxBloodDecals: 40,
  poolSize: 32,
} as const;

export const NAVIGATION = {
  flowFieldInterval: 0.25,
} as const;

export const BARRICADES = {
  planksPerWindow: 5,
  repairRange: 40,
  repairInterval: 0.6,
  pointsPerPlank: 10,
  maxRepairPointsPerRound: 500,
} as const;

export const POINTS = {
  start: 500,
  hit: 10,
  kill: 50,
  floatingTextMs: 600,
} as const;

export const DOORS = {
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
  restTime: 8,
} as const;
