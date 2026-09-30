import { BULLETS, LOADOUT, PICKUPS, PLAYER, WEAPONS, ZOMBIES, type PickupKind, type WeaponId, type ZombieKind } from '../config/balance';
import type { MapData } from '../game/map/MapLoader';
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

  /** Seconds left of the current dash. */
  dashTimer: number;
  dashDirX: number;
  dashDirY: number;
  /** Seconds until the dash can be used again. */
  dashCooldown: number;
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
 * chasing ⇄ attacking → dead. 'idle' stands still (tests and debug tools).
 */
export type ZombieAi = 'toWindow' | 'tearing' | 'climbing' | 'chasing' | 'attacking' | 'dead' | 'idle';

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
  /** Index into MapData.windows of the window this zombie comes through. */
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

export interface WaveState {
  round: number;
  /** Zombies still to spawn this round; -1 = unlimited. */
  toSpawn: number;
  /** Seconds until the next spawn attempt. */
  spawnTimer: number;
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
    dashTimer: 0,
    dashDirX: 0,
    dashDirY: 0,
    dashCooldown: 0,
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
  /** Zombies to spawn; -1 = unlimited (until the wave system exists). */
  toSpawn?: number;
}

export function createGameState(map: MapData, options: GameOptions = {}): GameState {
  const { seed = 1, startRound = 1, toSpawn = -1 } = options;
  return {
    tick: 0,
    time: 0,
    rng: seed | 0,
    players: [createPlayerState(0, map.playerSpawn.x, map.playerSpawn.y)],
    bullets: Array.from({ length: BULLETS.poolSize }, createBullet),
    zombies: Array.from({ length: ZOMBIES.poolSize }, createZombie),
    blood: Array.from({ length: ZOMBIES.maxBloodDecals }, createBlood),
    pickups: Array.from({ length: PICKUPS.poolSize }, createPickup),
    wave: { round: Math.max(1, Math.floor(startRound)), toSpawn, spawnTimer: 0 },
    doorsOpen: map.doors.map(() => false),
    windowPlanks: map.windows.map((w) => w.planks),
    zonesUnlocked: map.zones.map((z) => z.startsUnlocked),
  };
}
