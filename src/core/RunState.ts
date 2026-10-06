/**
 * The Dungeon mode's state (spec 09 §1): the run and the plan of its
 * current floor. Plain data, like the rest of GameState: the generator
 * (src/game/dungeon/) writes it and the systems read it.
 */
import type { Ambient, RoomDifficulty, RoomType } from '../config/dungeon';

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
