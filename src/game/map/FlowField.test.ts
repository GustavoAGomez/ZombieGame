import { describe, expect, it } from 'vitest';
import { buildRoom01Map } from '../../../scripts/gen-placeholder-map';
import { BLOCK_ALL, buildCollisionGrid, setDoorBlocking, type CollisionGrid } from './CollisionGrid';
import { UNREACHABLE, computeFlowField, createFlowField, distanceAt, flowDirection, sourcesChanged } from './FlowField';
import { parseMap, type MapData } from './MapLoader';

/**
 * Minimal map from ASCII: '.' floor, '#' wall. One zone covering everything.
 */
function asciiMap(rows: string[]): { map: MapData; grid: CollisionGrid } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const floor = new Int16Array(width * height).fill(-1);
  const cells = new Uint8Array(width * height);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '.') floor[y * width + x] = 0;
      else cells[y * width + x] = BLOCK_ALL;
    }),
  );
  const map = {
    width,
    height,
    tileSize: 10,
    floor,
    cellZone: new Int16Array(width * height).fill(0),
  } as unknown as MapData;
  return { map, grid: { width, height, tileSize: 10, cells } };
}

const center = (x: number, y: number) => [(x + 0.5) * 10, (y + 0.5) * 10] as const;

describe('FlowField (synthetic maps)', () => {
  it('stores BFS steps from the source', () => {
    const { map, grid } = asciiMap(['.....', '.....', '.....']);
    const field = createFlowField(5, 3, 10);
    computeFlowField(field, map, grid, [true], [0]);
    expect(Array.from(field.dist)).toEqual([0, 1, 2, 3, 4, 1, 2, 3, 4, 5, 2, 3, 4, 5, 6]);
  });

  it('routes around a wall', () => {
    const { map, grid } = asciiMap([
      '.....',
      '.###.',
      '.....',
    ]);
    const field = createFlowField(5, 3, 10);
    computeFlowField(field, map, grid, [true], [2 * 5 + 2]); // source below the wall
    // Top-middle has to go around: 2 right, 2 down, 2 back left = 6 steps.
    expect(field.dist[2]).toBe(6);
    expect(field.dist[1 * 5 + 2]).toBe(UNREACHABLE); // the wall itself
    // From the top-middle cell the first step is sideways, not into the wall.
    const out = { x: 0, y: 0 };
    const [x, y] = center(2, 0);
    expect(flowDirection(field, x, y, out)).toBe(true);
    expect(Math.abs(out.x)).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
  });

  it('moves diagonally in open space', () => {
    const { map, grid } = asciiMap(['....', '....', '....', '....']);
    const field = createFlowField(4, 4, 10);
    computeFlowField(field, map, grid, [true], [15]);
    const out = { x: 0, y: 0 };
    const [x, y] = center(0, 0);
    flowDirection(field, x, y, out);
    expect(out.x).toBeCloseTo(Math.SQRT1_2);
    expect(out.y).toBeCloseTo(Math.SQRT1_2);
  });

  it('never cuts corners', () => {
    const { map, grid } = asciiMap([
      '..',
      '#.',
    ]);
    const field = createFlowField(2, 2, 10);
    computeFlowField(field, map, grid, [true], [3]); // bottom-right
    const out = { x: 0, y: 0 };
    const [x, y] = center(0, 0);
    flowDirection(field, x, y, out);
    // Diagonal (1,1) is blocked by the wall at (0,1): go right first.
    expect(out.x).toBeCloseTo(1);
    expect(out.y).toBeCloseTo(0);
  });

  it('returns false on the source cell and on unreachable cells', () => {
    const { map, grid } = asciiMap(['.#.']);
    const field = createFlowField(3, 1, 10);
    computeFlowField(field, map, grid, [true], [0]);
    const out = { x: 0, y: 0 };
    expect(flowDirection(field, ...center(0, 0), out)).toBe(false);
    expect(flowDirection(field, ...center(2, 0), out)).toBe(false);
    expect(distanceAt(field, ...center(2, 0))).toBe(UNREACHABLE);
  });

  it('supports several sources (co-op) and detects when they move', () => {
    const { map, grid } = asciiMap(['.....']);
    const field = createFlowField(5, 1, 10);
    computeFlowField(field, map, grid, [true], [0, 4]);
    expect(Array.from(field.dist)).toEqual([0, 1, 2, 1, 0]);
    expect(sourcesChanged(field, [0, 4])).toBe(false);
    expect(sourcesChanged(field, [1, 4])).toBe(true);
    expect(sourcesChanged(field, [0])).toBe(true);
  });
});

describe('FlowField (room01)', () => {
  const map = parseMap(buildRoom01Map());

  function fieldFromSpawn(doorsOpen: boolean[], zonesUnlocked: boolean[]) {
    const grid = buildCollisionGrid(map, doorsOpen);
    const field = createFlowField(map.width, map.height, map.tileSize);
    const cell = Math.floor(map.playerSpawn.y / 32) * map.width + Math.floor(map.playerSpawn.x / 32);
    computeFlowField(field, map, grid, zonesUnlocked, [cell]);
    return { field, grid };
  }

  it('covers the starting room and stops at closed doors and windows', () => {
    const { field } = fieldFromSpawn([false, false], [true, false, false]);
    for (const w of map.windows) {
      expect(field.dist[w.tileY * map.width + w.tileX]).toBe(UNREACHABLE);
    }
    const w1 = map.windows[0]!;
    expect(distanceAt(field, w1.interior.x, w1.interior.y)).toBeGreaterThan(0);
    const pasillo = map.zones[1]!;
    expect(distanceAt(field, pasillo.x + 16, pasillo.y + 16)).toBe(UNREACHABLE);
  });

  it('reaches the corridor through D1 once it is open and unlocked', () => {
    const doors = [true, false];
    const { field, grid } = fieldFromSpawn(doors, [true, true, false]);
    setDoorBlocking(grid, map.doors[0]!, false);
    const w4 = map.windows[3]!; // corridor window
    expect(distanceAt(field, w4.interior.x, w4.interior.y)).toBeGreaterThan(0);
    const almacen = map.zones[2]!;
    expect(distanceAt(field, almacen.x + 16, almacen.y + 16)).toBe(UNREACHABLE);
  });
});
