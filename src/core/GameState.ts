import { BOOSTS, BULLETS, LOADOUT, PICKUPS, PLAYER, POINTS, WAVES, ZOMBIES, type BoostKind, type PickupKind, type ZombieKind } from '../config/balance';
import { WEAPON_SPECIALS, WEAPONS, type WeaponId } from '../config/weapons';
import { MERCHANTS, type MerchantId } from '../config/merchants';
import type { ItemId } from '../config/items';
import type { MapData } from '../game/map/MapLoader';
import { placeMatchItems } from '../game/systems/itemSpawns';
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
  /** Upgrade levels bought: the first `level` effects of the weapon's own list (spec 04 §1). */
  level: number;
  /** The weapon's special from the gold merchant (pistol fan, SMG piercing). */
  special: boolean;
}

/**
 * How a bullet is drawn: plain, lighter with a damage level, light blue with
 * double damage, gold with the special, orange with the fire special.
 */
export type BulletLook = 'normal' | 'upgraded' | 'boosted' | 'special' | 'fire';

/** What the contextual action chip would do for a player right now. */
export type ContextAction = 'none' | 'repair' | 'door' | 'portal' | 'merchant' | 'weaponCase' | 'pickup';

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

  weapons: WeaponSlotState[];
  activeSlot: number;
  /** Seconds left of the weapon switch; cannot fire meanwhile. */
  switchTimer: number;
  /** Seconds left of the current reload, 0 when not reloading. */
  reloadTimer: number;
  /** Time until the next shot is allowed (can dip below 0 by < 1 tick). */
  fireCooldown: number;
  meleeCooldown: number;
  /** Seconds left of the knife slash on screen; the player keeps facing meleeAngle meanwhile. */
  meleeTimer: number;
  /** Direction of the last knife slash (radians). */
  meleeAngle: number;
  /** Tick of the last knife slash (views restart its animation). */
  meleeTick: number;
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
  /** Debug god mode (spec 01 §8): zombies cannot hurt this player. */
  godMode: boolean;
  dashDirX: number;
  dashDirY: number;
  /** Seconds until the dash can be used again. */
  dashCooldown: number;

  /** Money ($) to spend on doors, portals and merchants. */
  money: number;
  /** Points: everything earned this match, money spent or not (HUD and game over screen). */
  score: number;
  /** Points earned repairing during `repairRound` (capped per round). */
  repairPoints: number;
  repairRound: number;
  /** Seconds until the next tap can repair a plank. */
  repairCooldown: number;
  /** True right after a plank was repaired (the player faces the window). */
  repairing: boolean;
  contextAction: ContextAction;
  /** Window, door, portal, merchant or weapon case index the context action applies to, -1 when none. */
  contextTarget: number;
  /**
   * Weapon case whose purchase is waiting for a second tap (spec 04 §2): it
   * would replace an upgraded weapon. -1 when none; it lapses after
   * swapConfirmTimer seconds or when the player leaves that case.
   */
  swapConfirmCase: number;
  swapConfirmTimer: number;
  /** Merchant whose shop panel this player has open (spec 03 §3), -1 when closed. */
  shopMerchant: number;
  /** Boost bought and kept for later (spec 03 §5): one slot, kept between rounds. */
  boostStored: BoostKind | null;
  /** Boost running now, for boostTimer more seconds. */
  boostActive: BoostKind | null;
  boostTimer: number;
  /** Special items carried (spec 05), in the order they were picked up: at most ITEMS.maxSlots, never two alike. */
  items: ItemId[];

  /** Portal end just arrived at: it does not fire again until the player steps off it. -1 = none. */
  portalLock: number;
  /** Times this player went through a portal (views snap the camera when it changes). */
  teleports: number;
}

/** A special item lying on the map (spec 05 §2–3) until someone picks it up. */
export interface GroundItemState {
  item: ItemId;
  /** Still on the floor (false once picked up). */
  active: boolean;
  x: number;
  y: number;
  /** Index into MapData.itemSpots. */
  spot: number;
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
  look: BulletLook;
  /** Zombies it can still hit (the SMG's special goes through several). */
  pierce: number;
  /** Zombies (indices) it already hit, so going through one never hits it twice; -1 = free. */
  hits: number[];
  /** Distance still allowed before the bullet expires, and what it started with (for the damage falloff). */
  remaining: number;
  range: number;
  /** Full damage up to `falloffFrom` px travelled, then down linearly to `falloffMin` at `range`. 1 = no falloff. */
  falloffFrom: number;
  falloffMin: number;
  /** Sets the zombies it hits on fire (the shotgun's special). */
  burns: boolean;
  /** Px each hit pushes the zombie along the shot. */
  knockback: number;
  /**
   * Where it is drawn relative to (x, y): from the gun's drawn muzzle along
   * the same direction. Walls stop it on the ground (x, y); zombies are hit
   * where it is drawn, so what visibly touches a zombie hits it.
   */
  drawX: number;
  drawY: number;
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
  /** Index into MapData.windows of the window this zombie goes through, -1 when none. */
  window: number;
  /** Going through `window` from the inside out (the player is outside), instead of breaking in. */
  crossOut: boolean;
  /** Countdown used by the current state (tear, climb, windup, corpse). */
  timer: number;
  /** Seconds until this zombie may start another attack. */
  attackCooldown: number;
  /** Where the climb started, to interpolate to the window's interior point. */
  fromX: number;
  fromY: number;
  /** Tick when the current state started. */
  stateTick: number;
  /** Tick of the last tear or strike, or of reaching the planks (views start a swing when it changes). */
  actionTick: number;
  /**
   * How fast it tears planks: the crowd at its window (ZOMBIES.maxTearCrowd
   * at most) shared among the zombies tearing it; 1 alone. Views play its
   * swing that much faster, so the claw still lands as the plank comes off.
   */
  tearRate: number;
  /** Portal end just arrived at, as for players. -1 = none. */
  portalLock: number;
  /** Seconds spent chasing off the flow field (NAVIGATION.lostRespawnTime). */
  lostTimer: number;
  /** Burning (BurnSystem): fire on it, reusable by any weapon. */
  burn: BurnState;
}

/** A zombie on fire: damage every tick interval until `timer` runs out. */
export interface BurnState {
  /** Seconds of fire left; 0 = not burning. */
  timer: number;
  /** Seconds to the next damage tick. */
  tickTimer: number;
  /** Damage of each tick (the highest of the hits that lit it). */
  perTick: number;
  /** Who gets the kill if it dies burning (player id, -1 none). */
  owner: number;
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
 * A merchant (spec 03 §2). It stands on a merchant spot from its first
 * round on and teleports to another zone at the start of every round.
 */
export interface MerchantState {
  id: MerchantId;
  /** It can appear (merchants.ts; the debug panel will switch red and gold on). */
  enabled: boolean;
  /** On the map. */
  active: boolean;
  /** Index into MapData.merchantSpots, -1 while not on the map. */
  spot: number;
  /** Feet, in world px (the spot's point). */
  x: number;
  y: number;
  /** Spot it left at the last teleport (departure puff), -1 on its first appearance. */
  fromSpot: number;
  /** Round of its last appearance or teleport. */
  round: number;
  /** Tick of its last appearance or teleport (views play the smoke puff). */
  moveTick: number;
  /** Purchases per player (indexed like players) since it last moved: maxPurchasesPerVisit. */
  visitPurchases: number[];
  /** Boost its "round boost" sells this visit, drawn every time it moves (spec 03 §4). */
  boost: BoostKind;
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
  /** One per merchant in merchants.ts, enabled or not. */
  merchants: MerchantState[];
  /** Special items placed on the map this match (spec 05 §2): one entry each, kept once picked up (inactive). */
  groundItems: GroundItemState[];
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
  return { id, magazine: stats.magazine, reserve: stats.startReserve, level: 0, special: false };
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
    weapons: LOADOUT.startingWeapons.slice(0, LOADOUT.maxWeapons).map(createWeaponSlot),
    activeSlot: 0,
    switchTimer: 0,
    reloadTimer: 0,
    fireCooldown: 0,
    meleeCooldown: 0,
    meleeTimer: 0,
    godMode: false,
    meleeAngle: 0,
    meleeTick: -1000,
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
    money: POINTS.startMoney,
    score: 0,
    repairPoints: 0,
    repairRound: 1,
    repairCooldown: 0,
    repairing: false,
    contextAction: 'none',
    contextTarget: -1,
    swapConfirmCase: -1,
    swapConfirmTimer: 0,
    shopMerchant: -1,
    boostStored: null,
    boostActive: null,
    boostTimer: 0,
    items: [],
    portalLock: -1,
    teleports: 0,
  };
}

function createBullet(): BulletState {
  return {
    active: false,
    owner: 0,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    dirX: 1,
    dirY: 0,
    speed: 0,
    damage: 0,
    look: 'normal',
    pierce: 1,
    hits: new Array<number>(WEAPON_SPECIALS.pierce.hits).fill(-1),
    remaining: 0,
    range: 0,
    falloffFrom: 0,
    falloffMin: 1,
    burns: false,
    knockback: 0,
    drawX: 0,
    drawY: 0,
  };
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
    crossOut: false,
    timer: 0,
    attackCooldown: 0,
    fromX: 0,
    fromY: 0,
    stateTick: 0,
    actionTick: -1,
    tearRate: 1,
    portalLock: -1,
    lostTimer: 0,
    burn: { timer: 0, tickTimer: 0, perTick: 0, owner: -1 },
  };
}

function createPickup(): PickupState {
  return { active: false, kind: 'ammo', x: 0, y: 0, age: 0 };
}

function createMerchant(id: MerchantId, enabled: boolean, players: number): MerchantState {
  return {
    id,
    enabled,
    active: false,
    spot: -1,
    x: 0,
    y: 0,
    fromSpot: -1,
    round: 0,
    moveTick: -1000,
    visitPurchases: new Array<number>(players).fill(0),
    boost: BOOSTS.kinds[0],
  };
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
  const players = [createPlayerState(0, map.playerSpawn.x, map.playerSpawn.y)];
  const state: GameState = {
    tick: 0,
    time: 0,
    rng: seed | 0,
    players,
    bullets: Array.from({ length: BULLETS.poolSize }, createBullet),
    zombies: Array.from({ length: ZOMBIES.poolSize }, createZombie),
    blood: Array.from({ length: ZOMBIES.maxBloodDecals }, createBlood),
    pickups: Array.from({ length: PICKUPS.poolSize }, createPickup),
    merchants: MERCHANTS.map((m) => createMerchant(m.id, m.enabled, players.length)),
    wave: { round, phase: 'active', toSpawn, spawnTimer: WAVES.bannerDuration, restTimer: 0, auto: waveFlow },
    doorsOpen: map.doors.map(() => false),
    portalsOpen: Array.from({ length: map.portalLinks }, () => false),
    windowPlanks: map.windows.map((w) => w.planks),
    zonesUnlocked: map.zones.map((z) => z.startsUnlocked),
    groundItems: [],
  };
  // Drawn with the match's RNG as the match starts (spec 05 §2).
  state.groundItems = placeMatchItems(state, map);
  return state;
}
