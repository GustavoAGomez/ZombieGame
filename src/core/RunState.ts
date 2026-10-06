/**
 * The Dungeon mode's state (spec 09 §1): the run and the plan of its
 * current floor. Plain data, like the rest of GameState: the generator
 * (src/game/dungeon/) writes it and the systems read it.
 */
import type { Ambient, RoomDifficulty, RoomType } from '../config/dungeon';
import type { ZombieKind } from '../config/balance';
import type { WeaponId } from '../config/weapons';

export interface Cell {
  x: number;
  y: number;
}

export type Side = 'n' | 'e' | 's' | 'w';

/** A room's way to a neighbour (§3.1): the side, which of the room's cells it is on, and the room it leads to. */
export interface RoomDoor {
  side: Side;
  cell: Cell;
  room: number;
}

/** One room of the plan (§2.1, §3.1). */
export interface Room {
  type: RoomType;
  /** Its cells of the grid: one, or the boss arena's 2×2 (top-left first, row-major). */
  cells: Cell[];
  /** The template it is laid out with (§3.2), and whether mirrored horizontally. */
  template: string;
  difficulty: RoomDifficulty | null;
  mirrored: boolean;
  doors: RoomDoor[];
  /** Rooms between it and the start room. */
  depth: number;
}

/** A floor's plan (§3.1): pure data from the seed, the same every time. */
export interface FloorPlan {
  floor: number;
  ambient: Ambient;
  /** The grid, in cells. */
  width: number;
  height: number;
  rooms: Room[];
  /** Indices into `rooms`. */
  start: number;
  boss: number;
  /** Room index per cell (row-major), -1 where there is none. */
  cellRoom: number[];
}

/** One enemy of a wave: its kind, and whether it is an elite (§5.2). */
export interface WaveEntry {
  kind: ZombieKind;
  elite: boolean;
}

/** A room's fight (§4): the warning before each wave, then the wave until the last enemy falls. */
export interface RoomFight {
  room: number;
  phase: 'warning' | 'fighting';
  /** Seconds left of the warning. */
  timer: number;
  /** The wave coming or under way, and how many the room brings. */
  wave: number;
  waves: number;
  /** What the coming wave spawns, and where (world px); `later`, the second wave still to come. */
  pending: WaveEntry[];
  spots: { x: number; y: number }[];
  later: WaveEntry[];
  /** Enemies spawned in the fight so far (its kills, once it is over). */
  spawned: number;
  /** The arena (§5.3): the boss falls once the timer runs out, and the fight ends with it. */
  boss: boolean;
}

/** What a door of the floor is (§4.1): the plan says it from the rooms it joins. */
export type DoorKind = 'normal' | 'key' | 'boss' | 'challenge';

/** A chest on the floor (§6.2, §6.3): where it is, what kind, and whether it was opened. */
export interface ChestState {
  x: number;
  y: number;
  room: number;
  /**
   * `open` needs no key (the treasure's); `locked` needs one; `big` the
   * challenge's; `boss` the boss's upgrade chest; `weapon` the treasure's
   * case, with the basic weapon it holds (null: both owned, so ammo and money).
   */
  kind: 'open' | 'locked' | 'big' | 'boss' | 'weapon';
  weapon: WeaponId | null;
  opened: boolean;
}

/** What the action button does in the dungeon (§4.1, §6): the thing in reach says which. */
export type DungeonAction = 'chest' | 'chestKey' | 'needKey' | 'weapon' | 'door' | 'bossDoor' | 'needBossKey' | 'challenge' | 'descend';

/** A dungeon run (§1): what carries over from floor to floor, and the floor under way. */
export interface RunState {
  seed: number;
  floor: number;
  plan: FloorPlan;
  /** Parallel to plan.rooms. */
  visited: boolean[];
  cleared: boolean[];
  /** The room the local player is in. */
  room: number;
  /** The fight in the current room (§4), or null between fights. */
  fight: RoomFight | null;
  /** The floor's banner was shown, its doors set and the HUD knows the plan. */
  announced: boolean;
  /** Parallel to the floor map's doors (§4.1): what each one is, and whether a keyed one was opened with its key. */
  doorKinds: DoorKind[];
  doorsUnlocked: boolean[];
  chests: ChestState[];
  /** The way down (§4), once the boss is dead. */
  trapdoor: { x: number; y: number } | null;
  /** Still playing, the floor's boss dead on the last floor (the run is won), or the player dead. */
  outcome: 'playing' | 'won' | 'dead';
  /** The player asked to go down: the scene builds the next floor. */
  descending: boolean;
  /** The exploders' bursts (§5.2) for the view: rings that fade. */
  explosions: { x: number; y: number; radius: number; age: number }[];
  /** Seconds of play in the run. */
  time: number;
  /** The key's extra chance built up by rooms without a prize (§6.2), and whether the floor's treasure was opened. */
  pity: number;
  treasureOpened: boolean;
  bossesKilled: number;
  /** Normal keys (§6.1), and the floor's boss key. */
  keys: number;
  bossKey: boolean;
  /** Enemy rooms cleared since the last wizard (§7.1), and in the whole run. */
  merchantCounter: number;
  roomsCleared: number;
  kills: number;
  /** Ids of src/config/upgrades.ts (§7.2, §9). */
  upgrades: string[];
  curses: string[];
}
