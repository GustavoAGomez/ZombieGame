import { BOOSTS, BOSS, BULLETS, LOADOUT, PICKUPS, PLAYER, POINTS, WAVES, ZOMBIES, type BoostKind, type PickupKind, type ZombieKind } from '../config/balance';
import type { BossAttackId, BossId, BossVariantId } from '../config/bosses';
import { WEAPON_SPECIALS, WEAPONS, type UpgradeKind, type WeaponId } from '../config/weapons';
import { ACTIVATIONS } from '../config/activations';
import { MERCHANTS, type MerchantId } from '../config/merchants';
import { STARTING_ITEMS, type ItemId } from '../config/items';
import type { MapData } from '../game/map/MapLoader';
import { createHandState, emptyHand } from '../game/systems/handSpawn';
import { placeMatchItems } from '../game/systems/itemSpawns';
import { initialAccesses } from '../game/systems/ZoneSystem';
import { bossDelayOf, roundZombies } from '../game/systems/waveFormulas';
import type { GameMode } from '../config/dungeon';
import type { RngState } from './Rng';
import type { RunState } from './RunState';

/**
 * Flat, serialisable state of a match. Systems mutate it at a fixed 60 Hz;
 * Phaser views only read it (CLAUDE.md rule 1). Pools are preallocated and
 * toggled with `active` so the update loop never allocates (rule 7).
 */

export interface WeaponSlotState {
  id: WeaponId;
  magazine: number;
  reserve: number;
  /** Upgrade levels bought of each kind (spec 04 §1, chosen at the red merchant): 0 to the weapon's own maximum. */
  levels: Record<UpgradeKind, number>;
  /** The weapon's special from the gold merchant (pistol fan, SMG piercing). */
  special: boolean;
  /** A beam weapon's battery (WeaponDef.battery; 0 for the others), and the seconds since it last fired. */
  battery: number;
  batteryIdle: number;
  /** Seconds the beam weapon stays locked after running dry (spec 06 §2.1). */
  overheat: number;
  /** Seconds until a melee weapon can sweep again (the katana's cooldown); it runs down in the holster too. */
  cooldown: number;
  /** Sweeps left before a weapon that wears out breaks (WeaponDef.durability; 0 for the others, and once broken). */
  uses: number;
  /** Times a beam weapon has overheated (it breaks at WeaponDef.battery.breaksAfter). */
  overheats: number;
}

/**
 * How a bullet is drawn: plain, lighter with a damage level, light blue with
 * double damage, gold with the special, orange with the fire special.
 */
export type BulletLook = 'normal' | 'upgraded' | 'boosted' | 'special' | 'fire';

/** What the contextual action chip would do for a player right now. */
export type ContextAction = 'none' | 'repair' | 'door' | 'portal' | 'merchant' | 'weaponCase' | 'hand' | 'pickup';

/**
 * Where the Demon's Hand is in its sequence (spec 06 §3.4): waiting in its
 * crack, rising with its fist closed after a payment, weapon outlines
 * rolling over it, open with the weapon drawn (or empty: the draw gave
 * nothing), and sinking back. Tired, it mocks the payer instead of
 * rolling, and once sunk it is away for a moment before it comes up in
 * another spot (spec 06 §3.6).
 */
export type HandPhase = 'idle' | 'rising' | 'rolling' | 'offering' | 'empty' | 'mocking' | 'sinking' | 'away';

/** The Demon's Hand (spec 06 §3): one in the match, shared by every player (the offer is only for the one who paid). */
export interface HandState {
  /** Index into MapData.handSpots where it is now, -1 when the map has none. */
  spot: number;
  phase: HandPhase;
  /** Seconds left in the phase (0 while idle). */
  timer: number;
  /** Tick the phase started (views). */
  phaseTick: number;
  /** Payments it still takes in this spot before it tires (spec 06 §3.6). */
  usesLeft: number;
  /** What the payment under way drew: a weapon, or null for nothing. */
  offer: WeaponId | null;
  /** The offered weapon was taken: the hand sinks empty. */
  taken: boolean;
  /** The last weapon it offered: the next draw avoids it while there is another. */
  lastOffered: WeaponId | null;
  /** Player id of who paid for the sequence under way (only they can take the weapon), -1 none. */
  payer: number;
  /** How the sequence under way was paid (refunded if it ends in mockery; null when it was free, debug). */
  paid: 'money' | 'blood' | null;
  /** The payment under way found it tired: it mocks, gives the payment back and moves (spec 06 §3.6). */
  mock: boolean;
  /** Ids of the players who made the blood pact in this spot: once each, until it moves. */
  bloodPacts: number[];
  /** Debug (MANO GRATIS): payments cost nothing. */
  debugFree: boolean;
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
  /** Reach of the last slash (px): MELEE.range for the knife, the weapon's range for a sweep (the katana, drawn that much bigger). */
  meleeRange: number;
  /** A beam is firing this tick (the laser), `beamLength` px from the gun's muzzle along the aim to a wall or its range. */
  beamOn: boolean;
  beamLength: number;
  /** A cone weapon's jet is firing this tick (the flamethrower), and the seconds until it spends its next round. */
  coneOn: boolean;
  fuelTimer: number;
  /** Fire held during the last tick. */
  firing: boolean;
  /** Seconds since this press of the fire button began (still counting while a tap's shot waits). */
  aimTime: number;
  /**
   * The press has not fired yet: its first shot waits for the weapon's
   * firstShotDelay, and a tap released before that still fires once, when
   * the time is up.
   */
  shotPending: boolean;
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
  /** Seconds left to tap again to take the Demon's Hand's weapon in place of an upgraded one (spec 06 §3.4); 0 when not asked. */
  handConfirmTimer: number;
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

/**
 * An activation of activations.ts (spec 05 §6): what its place has received
 * so far. It belongs to the match, not to a player: the items can be thrown
 * at different moments, by anyone.
 */
export interface ActivationState {
  /** Items received, in the order they were thrown. */
  received: ItemId[];
  /** Tick each of them lands (a throw takes ITEMS.throwTime). */
  landsAt: number[];
  /** Player who threw each of them. */
  thrownBy: number[];
  /** Complete: its effect has happened and it takes nothing more. */
  done: boolean;
  /** Tick it was completed, -1 before. */
  doneTick: number;
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
 * chasing ⇄ attacking → dead. Open spawns start with entering → chasing:
 * they walk in from off the map (spec 02 §3.4, docs/DECISIONS.md). 'idle'
 * stands still (tests and debug tools).
 */
export type ZombieAi = 'toWindow' | 'tearing' | 'climbing' | 'entering' | 'chasing' | 'attacking' | 'dead' | 'idle';

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
  /** Index into MapData.openSpawns of the entrance it is walking in from, -1 when none. */
  entry: number;
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
  /** Tick of the last hit of a continuous weapon (beam, cone) that scored on it: they score once per CONTINUOUS.scoreInterval. */
  contactScoreTick: number;
  /** Bit per boss slot whose current ring (spec 07 §4.3) has already hit it: once per ring. */
  waveHits: number;
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
  /** Lit by a flamethrower with "Fuego infernal": if it dies burning, it bursts (spec 06 §2.3). */
  hellfire: boolean;
}

/**
 * Where a boss is in its life (spec 07): its landing circle filling on the
 * floor (still in the sky), falling, roaring, walking after its target,
 * jumping up into the sky to fall elsewhere, and dead (its corpse on screen
 * for BOSS.corpseTime).
 */
export type BossPhase = 'warning' | 'falling' | 'roaring' | 'walking' | 'attacking' | 'rising' | 'dead';

/**
 * Where a boss is in its attack (spec 07 §4): winding up (the zone on the
 * floor filling), running (the charge), stunned against a wall, braking,
 * or still after it (recovering).
 */
export type BossStage = 'none' | 'windup' | 'run' | 'stunned' | 'brake' | 'recover' | 'air' | 'ground';

/** A boss on the map (spec 07). Pooled: BOSS.maxAlive slots, toggled with `active`. */
export interface BossState {
  active: boolean;
  boss: BossId;
  variant: BossVariantId;
  /** Centre of its footprint (world px), and where it was at the start of the last tick (render interpolation). */
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  /** Facing angle in radians (0 = east, π/2 = south). */
  facing: number;
  /** True when it moved during the last tick (walking animation). */
  moving: boolean;
  hp: number;
  maxHp: number;
  phase: BossPhase;
  /** Seconds left in the phase (0 when it has no end). */
  timer: number;
  /** Tick the phase started (views). */
  phaseTick: number;
  /** Below half its health, or from the start for some variants (spec 07 §5). */
  enraged: boolean;
  /** Index into MapData.bossSpots of the spot it is falling on, -1 none (no spot: anywhere it fits). */
  spot: number;
  /** It has roared once: its health bar shows from then on. */
  introduced: boolean;
  /** Seconds it has gone with no way to its target (it jumps away at BOSS.noPathTime). */
  noPathTime: number;
  /** The attack under way (spec 07 §4), null while walking; where in it, and the last one it made (never twice running). */
  attack: BossAttackId | null;
  stage: BossStage;
  lastAttack: BossAttackId | null;
  /** Unit direction of the attack under way. */
  aimX: number;
  aimY: number;
  /** Px still to run in a charge. */
  runLeft: number;
  /** Px of the run until the putrid one leaves its next puddle of the trail. */
  trailLeft: number;
  /** Blows of the slam or leaps made so far in the attack under way. */
  count: number;
  /** A leap: where it took off and where it lands (world px, centre of its footprint). */
  fromX: number;
  fromY: number;
  targetX: number;
  targetY: number;
  /** Tick of its last blow or landing (views: the pose right after it). */
  blowTick: number;
  /** The wave of its last landing (spec 07 §4.3): where it started, seconds since (-1: none), and the players it already hit (bits). */
  waveX: number;
  waveY: number;
  waveTime: number;
  waveHits: number;
  /** Its health went under the fury line: it roars as soon as it is between blows (spec 07 §5). */
  furyPending: boolean;
  /** Bit per player (index into players) already hurt by this blow: once per charge. */
  hitPlayers: number;
  /** Seconds left walking before it picks its next attack. */
  walkTimer: number;
  /** Debug: the attack it makes next, as soon as it can. */
  forcedAttack: BossAttackId | null;
  /** Player id it goes for (the nearest one alive, spec 07 §9), -1 none. */
  target: number;
  /** Fire on it (the burn hurts it too). */
  burn: BurnState;
  /** Tick of the last hit of a continuous weapon that scored on it (as for zombies). */
  contactScoreTick: number;
}

/** A puddle a putrid boss leaves where it lands or runs (spec 07 §1): it hurts whoever stands in it for a while. */
export interface PuddleState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  /** Seconds left. */
  timer: number;
}

/** A burst of hellfire waiting to go off this tick (spec 06 §2.3): queued when a hellfire-burning zombie dies. */
export interface BlastState {
  active: boolean;
  x: number;
  y: number;
  /** Who gets the kills (player id, -1 none). */
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
  /** Seconds until the round's bosses come out (spec 07 §6), -1 when none is due. */
  bossDelay: number;
  /**
   * The zombies that keep coming while a boss lives on (spec 07 §6): started
   * once the round's own are over; one every BOSS.dripInterval, at most
   * dripLeft more.
   */
  dripping: boolean;
  dripTimer: number;
  dripLeft: number;
}

export interface GameState extends RngState {
  /** Survival or the dungeon (spec 09 §1): the mode's rules ask for it in one place. */
  mode: GameMode;
  /** The dungeon run (spec 09); null in Survival. */
  run: RunState | null;
  tick: number;
  /** Simulated seconds since the match started. */
  time: number;
  /** One entry per player. The MVP has a single local player at index 0. */
  players: PlayerState[];
  bullets: BulletState[];
  zombies: ZombieState[];
  /** Spec 07: BOSS.maxAlive slots. */
  bosses: BossState[];
  /** The putrid boss's puddles (pooled, BOSS.puddle.pool), and the seconds to their next damage tick (shared: they never add up). */
  puddles: PuddleState[];
  puddleTick: number;
  /** Simulated time (s) a boss last started winding up an attack: the next one waits BOSS.attackStagger. */
  bossAttackAt: number;
  /** Hellfire bursts queued this tick, set off by BurnSystem (pooled). */
  blasts: BlastState[];
  blood: BloodState[];
  pickups: PickupState[];
  /** One per merchant in merchants.ts, enabled or not. */
  merchants: MerchantState[];
  /** Special items placed on the map this match (spec 05 §2): one entry each, kept once picked up (inactive). */
  groundItems: GroundItemState[];
  /** Parallel to ACTIVATIONS (spec 05 §6). */
  activations: ActivationState[];
  /** The Demon's Hand (spec 06 §3). */
  hand: HandState;
  wave: WaveState;
  /** Parallel to MapData.doors. */
  doorsOpen: boolean[];
  /** One per portal pair (MapPortal.link): both ends open together. */
  portalsOpen: boolean[];
  /** Parallel to MapData.windows. */
  windowPlanks: number[];
  /** Parallel to MapData.zones. */
  zonesUnlocked: boolean[];
  /** Parallel to MapData.props: furniture a boss crushed (no collision any more, drawn as rubble). */
  propsDestroyed: boolean[];
  /** Bosses killed this match: the first one drops the living heart (spec 07 §7). */
  bossKills: number;
}

export function createWeaponSlot(id: WeaponId): WeaponSlotState {
  const stats = WEAPONS[id];
  return {
    id,
    magazine: stats.magazine,
    reserve: stats.startReserve,
    levels: { ammo: 0, fire_rate: 0, damage: 0 },
    special: false,
    battery: stats.battery?.capacity ?? 0,
    batteryIdle: 0,
    overheat: 0,
    cooldown: 0,
    uses: stats.durability ?? 0,
    overheats: 0,
  };
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
    meleeRange: 0,
    beamOn: false,
    beamLength: 0,
    coneOn: false,
    fuelTimer: 0,
    firing: false,
    aimTime: 0,
    shotPending: false,
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
    handConfirmTimer: 0,
    shopMerchant: -1,
    boostStored: null,
    boostActive: null,
    boostTimer: 0,
    items: STARTING_ITEMS.slice(),
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
    entry: -1,
    stateTick: 0,
    actionTick: -1,
    tearRate: 1,
    portalLock: -1,
    lostTimer: 0,
    burn: { timer: 0, tickTimer: 0, perTick: 0, owner: -1, hellfire: false },
    contactScoreTick: -1000,
    waveHits: 0,
  };
}

export function createBoss(): BossState {
  return {
    active: false,
    boss: 'butcher',
    variant: 'base',
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    facing: Math.PI / 2,
    moving: false,
    hp: 0,
    maxHp: 0,
    phase: 'walking',
    timer: 0,
    phaseTick: 0,
    enraged: false,
    spot: -1,
    introduced: false,
    noPathTime: 0,
    attack: null,
    stage: 'none',
    lastAttack: null,
    aimX: 0,
    aimY: 1,
    runLeft: 0,
    trailLeft: 0,
    count: 0,
    fromX: 0,
    fromY: 0,
    targetX: 0,
    targetY: 0,
    blowTick: -1000,
    waveX: 0,
    waveY: 0,
    waveTime: -1,
    waveHits: 0,
    furyPending: false,
    hitPlayers: 0,
    walkTimer: 0,
    forcedAttack: null,
    target: -1,
    burn: { timer: 0, tickTimer: 0, perTick: 0, owner: -1, hellfire: false },
    contactScoreTick: -1000,
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
  /** Survival unless told otherwise (spec 09 §1). */
  mode?: GameMode;
  /** The dungeon run, made by src/game/dungeon/run.ts. */
  run?: RunState | null;
}

export function createGameState(map: MapData, options: GameOptions = {}): GameState {
  const round = Math.max(1, Math.floor(options.startRound ?? 1));
  const { seed = 1, toSpawn = roundZombies(round), waveFlow = true } = options;
  const players = [createPlayerState(0, map.playerSpawn.x, map.playerSpawn.y)];
  const state: GameState = {
    mode: options.mode ?? 'survival',
    run: options.run ?? null,
    tick: 0,
    time: 0,
    rng: seed | 0,
    players,
    bullets: Array.from({ length: BULLETS.poolSize }, createBullet),
    zombies: Array.from({ length: ZOMBIES.poolSize }, createZombie),
    bosses: Array.from({ length: BOSS.maxAlive }, createBoss),
    puddles: Array.from({ length: BOSS.puddle.pool }, () => ({ active: false, x: 0, y: 0, radius: 0, timer: 0 })),
    puddleTick: BOSS.puddle.tickInterval,
    bossAttackAt: -1000,
    blasts: Array.from({ length: ZOMBIES.poolSize }, () => ({ active: false, x: 0, y: 0, owner: -1 })),
    blood: Array.from({ length: ZOMBIES.maxBloodDecals }, createBlood),
    pickups: Array.from({ length: PICKUPS.poolSize }, createPickup),
    merchants: MERCHANTS.map((m) => createMerchant(m.id, m.appears?.by === 'round', players.length)),
    wave: {
      round,
      phase: 'active',
      toSpawn,
      spawnTimer: WAVES.bannerDuration,
      restTimer: 0,
      auto: waveFlow,
      bossDelay: bossDelayOf(round),
      dripping: false,
      dripTimer: BOSS.dripInterval,
      dripLeft: BOSS.dripMax,
    },
    // Open from the start only between the zones the match starts with (rooms are unlocked, not doors).
    doorsOpen: initialAccesses(map).doors,
    portalsOpen: initialAccesses(map).portals,
    windowPlanks: map.windows.map((w) => w.planks),
    zonesUnlocked: map.zones.map((z) => z.startsUnlocked),
    propsDestroyed: map.props.map(() => false),
    bossKills: 0,
    groundItems: [],
    activations: ACTIVATIONS.map(() => ({ received: [], landsAt: [], thrownBy: [], done: false, doneTick: -1 })),
    hand: emptyHand(),
  };
  // Drawn with the match's RNG as the match starts (spec 05 §2, spec 06 §3.2).
  state.groundItems = placeMatchItems(state, map);
  state.hand = createHandState(state, map);
  return state;
}
