import { BULLETS, LOADOUT, PICKUPS, PLAYER, POINTS, WAVES, WEAPONS, ZOMBIES, type PickupKind, type WeaponId, type ZombieKind } from '../config/balance';
import type { MapData } from '../game/map/MapLoader';
import { zombiesInRound } from '../game/systems/waveFormulas';
import type { RngState } from './Rng';

/**
 * Flat, serialisable state of a match. Systems mutate it at a fixed 60 Hz;
 * Phaser views only read it (CLAUDE.md rule 1). Pools are preallocated and
 * toggled with `active` so the update loop never allocates (rule 7).
 */

export interface WeaponSlotState {
  id: WeaponId;
  magazine: number;
  reserve: number;
}

/** What the contextual action chip would do for a player right now. */
export type ContextAction = 'none' | 'repair' | 'door' | 'portal';

export interface PlayerState {
  id: number;
  /** Position of the feet / hitbox centre, in world px. */
  x: number;
  y: number;
  /** Position at the start of the last tick, for render interpolation. */
  prevX: number;
  prevY: number;
  /** Facing angle in radians (0 = east, π/2 = south). */
  facing: number;
  /** True when the player moved during the last tick. */
  moving: boolean;
  /** Analog speed factor of the last move (0..1); drives the run animation's pace. */
  moveFactor: number;
  /** Unit direction of the last move (to play shoot_walk backwards when retreating). */
  moveX: number;
  moveY: number;
  hp: number;
  maxHp: number;
  /** Simulated time of the last hit taken (regeneration waits after it). */
  lastDamageTime: number;

  weapons: WeaponSlotState[];
  activeSlot: number;
  /** Seconds left of the weapon switch; cannot fire meanwhile. */
  switchTimer: number;
  /** Seconds left of the current reload, 0 when not reloading. */
  reloadTimer: number;
  /** Time until the next shot is allowed (can dip below 0 by < 1 tick). */
  fireCooldown: number;
  meleeCooldown: number;
  /** Fire held during the last tick. */
  firing: boolean;
  /** True when aiming with a drag (draws the aim line). */
  aimManual: boolean;
  /** Unit aim direction used during the last tick. */
  aimX: number;
  aimY: number;
  /** Tick of the last shot or melee swing (for animations). */
  lastAttackTick: number;
  /** Tick of the last bullet fired (muzzle flash). */
  lastShotTick: number;

  /** Seconds left of the current dash. */
  dashTimer: number;
  dashDirX: number;
  dashDirY: number;
  /** Seconds until the dash can be used again. */
  dashCooldown: number;

  points: number;
  /** Every point earned this match, spent or not (game over screen). */
  score: number;
  /** Points earned repairing during `repairRound` (capped per round). */
  repairPoints: number;
  repairRound: number;
  /** Seconds until the next tap can repair a plank. */
  repairCooldown: number;
  /** True right after a plank was repaired (the player faces the window). */
  repairing: boolean;
  contextAction: ContextAction;
  /** Window, door or portal index the context action applies to, -1 when none. */
  contextTarget: number;

  /** Portal end just arrived at: it does not fire again until the player steps off it. -1 = none. */
  portalLock: number;
  /** Times this player went through a portal (views snap the camera when it changes). */
  teleports: number;
}

export interface BulletState {
  active: boolean;
  owner: number;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Unit direction of travel. */
  dirX: number;
  dirY: number;
  speed: number;
  damage: number;
  /** Distance still allowed before the bullet expires. */
  remaining: number;
}

/**
 * Zombie behaviour (spec 01 §4.4): toWindow → tearing → climbing →
 * chasing ⇄ attacking → dead. Open spawns start with emerging → chasing
 * (spec 02 §3.4). 'idle' stands still (tests and debug tools).
 */
export type ZombieAi = 'toWindow' | 'tearing' | 'climbing' | 'emerging' | 'chasing' | 'attacking' | 'dead' | 'idle';

export interface ZombieState {
  active: boolean;
  kind: ZombieKind;
  ai: ZombieAi;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  facing: number;
  hp: number;
  maxHp: number;
  /** Index into MapData.windows of the window this zombie comes through, -1 from an open spawn. */
  window: number;
  /** Countdown used by the current state (tear, climb, windup, corpse). */
  timer: number;
  /** Seconds until this zombie may start another attack. */
  attackCooldown: number;
  /** Where the climb started, to interpolate to the window's interior point. */
  fromX: number;
  fromY: number;
  /** Tick when the current state started. */
  stateTick: number;
  /** Tick of the last tear or strike (views restart the attack animation). */
  actionTick: number;
  /** Portal end just arrived at, as for players. -1 = none. */
  portalLock: number;
}

export interface BloodState {
  active: boolean;
  x: number;
  y: number;
  /** Seconds since it appeared. */
  age: number;
  variant: number;
}

export interface PickupState {
  active: boolean;
  kind: PickupKind;
  x: number;
  y: number;
  /** Seconds since it dropped. */
  age: number;
}

/**
 * Round flow (spec 01 §4.8): `active` while the round's zombies spawn and
 * are fought, `rest` for the pause between rounds, `over` once every player
 * is dead.
 */
export type WavePhase = 'active' | 'rest' | 'over';

export interface WaveState {
  round: number;
  phase: WavePhase;
  /** Zombies still to spawn this round; -1 = unlimited. */
  toSpawn: number;
  /** Seconds until the next spawn attempt (the first one waits for the round banner). */
  spawnTimer: number;
  /** Seconds left of the rest between rounds. */
  restTimer: number;
  /** False freezes the flow on the current round (system tests). */
  auto: boolean;
}

export interface GameState extends RngState {
  tick: number;
  /** Simulated seconds since the match started. */
  time: number;
  /** One entry per player. The MVP has a single local player at index 0. */
  players: PlayerState[];
  bullets: BulletState[];
  zombies: ZombieState[];
  blood: BloodState[];
  pickups: PickupState[];
  wave: WaveState;
  /** Parallel to MapData.doors. */
  doorsOpen: boolean[];
  /** One per portal pair (MapPortal.link): both ends open together. */
  portalsOpen: boolean[];
  /** Parallel to MapData.windows. */
  windowPlanks: number[];
  /** Parallel to MapData.zones. */
  zonesUnlocked: boolean[];
}

export function createWeaponSlot(id: WeaponId): WeaponSlotState {
  const stats = WEAPONS[id];
  return { id, magazine: stats.magazine, reserve: stats.startReserve };
}

export function createPlayerState(id: number, x = 0, y = 0): PlayerState {
  return {
    id,
    x,
    y,
    prevX: x,
    prevY: y,
    facing: Math.PI / 2,
    moving: false,
    moveFactor: 0,
    moveX: 0,
    moveY: 1,
    hp: PLAYER.maxHp,
    maxHp: PLAYER.maxHp,
    lastDamageTime: -Infinity,
    weapons: LOADOUT.startingWeapons.map(createWeaponSlot),
    activeSlot: 0,
    switchTimer: 0,
    reloadTimer: 0,
    fireCooldown: 0,
    meleeCooldown: 0,
    firing: false,
    aimManual: false,
    aimX: 0,
    aimY: 1,
    lastAttackTick: -1000,
    lastShotTick: -1000,
    dashTimer: 0,
    dashDirX: 0,
    dashDirY: 0,
    dashCooldown: 0,
    points: POINTS.start,
    score: 0,
    repairPoints: 0,
    repairRound: 1,
    repairCooldown: 0,
    repairing: false,
    contextAction: 'none',
    contextTarget: -1,
    portalLock: -1,
    teleports: 0,
  };
}

function createBullet(): BulletState {
  return { active: false, owner: 0, x: 0, y: 0, prevX: 0, prevY: 0, dirX: 1, dirY: 0, speed: 0, damage: 0, remaining: 0 };
}

function createZombie(): ZombieState {
  return {
    active: false,
    kind: 'walker',
    ai: 'idle',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    facing: Math.PI / 2,
    hp: 0,
    maxHp: 0,
    window: -1,
    timer: 0,
    attackCooldown: 0,
    fromX: 0,
    fromY: 0,
    stateTick: 0,
    actionTick: -1,
    portalLock: -1,
  };
}

function createPickup(): PickupState {
  return { active: false, kind: 'ammo', x: 0, y: 0, age: 0 };
}

function createBlood(): BloodState {
  return { active: false, x: 0, y: 0, age: 0, variant: 0 };
}

export function activeWeapon(player: PlayerState): WeaponSlotState | undefined {
  return player.weapons[player.activeSlot];
}

export interface GameOptions {
  seed?: number;
  startRound?: number;
  /** Zombies to spawn in the first round; by default the round's count, -1 = unlimited. */
  toSpawn?: number;
  /** Rounds follow one another (default). Off keeps the first round going (system tests). */
  waveFlow?: boolean;
}

export function createGameState(map: MapData, options: GameOptions = {}): GameState {
  const round = Math.max(1, Math.floor(options.startRound ?? 1));
  const { seed = 1, toSpawn = zombiesInRound(round), waveFlow = true } = options;
  return {
    tick: 0,
    time: 0,
    rng: seed | 0,
    players: [createPlayerState(0, map.playerSpawn.x, map.playerSpawn.y)],
    bullets: Array.from({ length: BULLETS.poolSize }, createBullet),
    zombies: Array.from({ length: ZOMBIES.poolSize }, createZombie),
    blood: Array.from({ length: ZOMBIES.maxBloodDecals }, createBlood),
    pickups: Array.from({ length: PICKUPS.poolSize }, createPickup),
    wave: { round, phase: 'active', toSpawn, spawnTimer: WAVES.bannerDuration, restTimer: 0, auto: waveFlow },
    doorsOpen: map.doors.map(() => false),
    portalsOpen: Array.from({ length: map.portalLinks }, () => false),
    windowPlanks: map.windows.map((w) => w.planks),
    zonesUnlocked: map.zones.map((z) => z.startsUnlocked),
  };
}
