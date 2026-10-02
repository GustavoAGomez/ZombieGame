import type { WeaponId } from './weapons';
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

export const LOADOUT = {
  /** Only the pistol: the other basic weapons are bought at weapon cases (spec 04 §2). */
  startingWeapons: ['pistol'] as const satisfies readonly WeaponId[],
  /** A player carries at most this many weapons (one slot each in the HUD's weapon column). */
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

/** Weapons that hit continuously (the laser's beam, the flamethrower's cone, spec 06 §2). */
export const CONTINUOUS = {
  /** A zombie in contact scores one hit (POINTS.hit) per this many seconds, not one per damage tick. */
  scoreInterval: 0.5,
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
  /** Legless (crawlAtHp or less) it lies on the ground: about 28–34 px tall and 25–36 px wide. */
  crawlHurtbox: { width: 28, height: 28 },
  attackWindup: 0.35,
  attackDamage: 40,
  attackCooldown: 1.1,
  climbTime: 0.8,
  directChaseTiles: 2,
  /** How close to the window's exterior point counts as "arrived". */
  windowArriveRadius: 12,
  /**
   * Zombies crowding a window tear it faster: each one tearing it or waiting
   * its turn within tearCrowdRadius px of its entry point adds one zombie's
   * strength, up to maxTearCrowd (so a horde is quick, never instant).
   */
  tearCrowdRadius: 48,
  maxTearCrowd: 4,
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
  /**
   * The same with zombies at the window (tearing it or waiting their turn,
   * ZOMBIES.tearCrowdRadius): longer than the slowest zombie's tearTime (the
   * walker's 1.4 s), so even a lone zombie gets in against nonstop repairs,
   * and a window under attack is no place to farm points.
   */
  repairTapCooldownUnderAttack: 2,
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
  /** Per bullet that hits (each shotgun pellet counts). */
  hit: 5,
  /** Per knife hit. */
  meleeHit: 10,
  kill: 50,
  floatingTextMs: 600,
} as const;

export const DOORS = {
  interactRange: 48,
  /** Seconds «COCINA DESBLOQUEADA» stays in the middle of the screen: the doors never say which room beforehand. */
  unlockedNoticeTime: 2,
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
  /**
   * Entrances from off the map (street, roof) stay off while a live player
   * is closer than this to the tile where they come in, so no zombie walks
   * in on top of a player standing at the edge (spec 02 §3.4).
   */
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
/** Weapon cases (spec 04 §3): fixed furniture that sells a basic weapon, or its ammo once carried. */
export const WEAPON_CASES = {
  /** The action button appears this close to the case's front side (px from the middle of its front edge). */
  interactRange: 40,
  /** Ammo for a weapon already carried costs this share of the weapon's price. */
  caseAmmoPriceFactor: 0.5,
  /** The price over the case shows only with the player this close (px). */
  priceLabelRange: 96,
  /** Seconds the "CAMBIAR … POR …" confirmation waits for the second tap. */
  swapConfirmTime: 3,
} as const;

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

/**
 * The Demon's Hand (spec 06 §3): a crack in the floor where, for money or
 * for blood, a hand offers a weapon drawn at random. One in the match.
 */
export const HAND = {
  price: 950,
  /** With less money than `price`, the blood pact: this much health, only while the player has more than it. */
  bloodCost: 40,
  /** The action button offers it within this distance of the crack's centre. */
  interactRange: 40,
  /** The sequence after a payment (s): rising with its fist closed, weapon outlines rolling over it, then open. */
  risingTime: 0.6,
  rollingTime: 2,
  /** Open with the weapon floating over it, for the one who paid to take; it blinks for the last blinkTime s. */
  offeringTime: 8,
  blinkTime: 3,
  /** Open and empty when the draw gave nothing; the payment is lost. */
  emptyTime: 1.2,
  sinkingTime: 0.6,
  /** A special weapon on offer: its name on the HUD for this long. */
  specialNoticeTime: 1.5,
  /**
   * What a payment draws (users' answers, docs/DECISIONS.md): nothing, a
   * special weapon or a basic one, never one the player carries. A group
   * with none left gives its share to the other.
   */
  chances: { nothing: 0.1, special: 0.2, basic: 0.7 },
  /**
   * Uses it takes in one spot before it tires (spec 06 §3.6, drawn at each
   * new spot): the payment after them gets the mocking gesture for mockTime
   * s, back, and the hand sinks; moveDelay s later it comes up in another
   * zone's spot, announced for movedNoticeTime s.
   */
  usesMin: 4,
  usesMax: 8,
  mockTime: 1.5,
  moveDelay: 2,
  movedNoticeTime: 2,
} as const;

/** Special items (spec 05): items.ts has the catalogue, activations.ts what they open. */
export const ITEMS = {
  /** Closer than this (px, feet to item) the action button offers to pick it up. */
  pickupRange: 32,
  /** A player is at an activation site within this distance (px) of its rectangle's edge. */
  useRange: 40,
  /** Inventory slots on the HUD (only the full ones are drawn). */
  maxSlots: 4,
  /** "VARITA DESGASTADA" on the HUD after picking it up (s). */
  pickupNoticeTime: 1.5,
  /** "AQUÍ NO SE USA" over the player (s); a new failed use restarts it. */
  cantUseTime: 1.2,
  /** Period of the glow pulsing under an item on the floor (s). */
  glowPeriod: 1.2,
  /** An item thrown at an activation site flies in an arc and lands with a splash (s). */
  throwTime: 0.4,
  /** When an activation completes, its place reacts (the pool boils red) for this long (s). */
  activationBurstTime: 1.5,
  /** "EL MAGO ROJO HA SIDO INVOCADO" on the HUD (s). */
  summonNoticeTime: 2.5,
} as const;

export const DEBUG = {
  /** Money added by the bigger button (spec 03 §7). */
  bigPoints: 10000,
  /** Money added by the smaller button (spec 04 §5: +5000$). */
  points: 5000,
} as const;
