import type { MapData } from '../game/map/MapLoader';
import type { RngState } from './Rng';

/**
 * Flat, serialisable state of a match. Systems mutate it at a fixed 60 Hz;
 * Phaser views only read it (CLAUDE.md rule 1).
 */
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
}

export interface GameState extends RngState {
  tick: number;
  /** Simulated seconds since the match started. */
  time: number;
  /** One entry per player. The MVP has a single local player at index 0. */
  players: PlayerState[];
  /** Parallel to MapData.doors. */
  doorsOpen: boolean[];
  /** Parallel to MapData.windows. */
  windowPlanks: number[];
  /** Parallel to MapData.zones. */
  zonesUnlocked: boolean[];
}

export function createPlayerState(id: number, x = 0, y = 0): PlayerState {
  return { id, x, y, prevX: x, prevY: y, facing: Math.PI / 2 };
}

export function createGameState(map: MapData, seed = 1): GameState {
  return {
    tick: 0,
    time: 0,
    rng: seed | 0,
    players: [createPlayerState(0, map.playerSpawn.x, map.playerSpawn.y)],
    doorsOpen: map.doors.map(() => false),
    windowPlanks: map.windows.map((w) => w.planks),
    zonesUnlocked: map.zones.map((z) => z.startsUnlocked),
  };
}
