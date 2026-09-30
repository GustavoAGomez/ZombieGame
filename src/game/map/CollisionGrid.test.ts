import { describe, expect, it } from 'vitest';
import { buildRoom01Map } from '../../../scripts/gen-placeholder-map';
import {
  BLOCK_ALL,
  BLOCK_BULLET,
  BLOCK_PLAYER,
  BLOCK_SIGHT,
  buildCollisionGrid,
  cellBlocks,
  moveCircle,
  pointBlocks,
  resolveCircle,
  segmentClear,
  setDoorBlocking,
  type CollisionGrid,
} from './CollisionGrid';
import { parseMap } from './MapLoader';

/** 5×5 grid, 10 px tiles, with a solid centre tile. */
function smallGrid(): CollisionGrid {
  const cells = new Uint8Array(25);
  cells[12] = BLOCK_ALL;
  return { width: 5, height: 5, tileSize: 10, cells };
}

describe('CollisionGrid from room01', () => {
  const map = parseMap(buildRoom01Map());
  const grid = buildCollisionGrid(map, map.doors.map(() => false));

  it('makes walls solid and floor free', () => {
    expect(pointBlocks(grid, map.playerSpawn.x, map.playerSpawn.y, BLOCK_PLAYER)).toBe(false);
    expect(cellBlocks(grid, 3, 5, BLOCK_PLAYER)).toBe(true);
  });

  it('blocks the player at windows but lets bullets and sight through', () => {
    const w = map.windows[0];
    if (!w) throw new Error('no windows');
    expect(cellBlocks(grid, w.tileX, w.tileY, BLOCK_PLAYER)).toBe(true);
    expect(cellBlocks(grid, w.tileX, w.tileY, BLOCK_BULLET)).toBe(false);
    expect(cellBlocks(grid, w.tileX, w.tileY, BLOCK_SIGHT)).toBe(false);
  });

  it('blocks closed doors and frees them when opened', () => {
    const d1 = map.doors[0];
    if (!d1) throw new Error('no doors');
    const t = d1.tiles[0];
    if (!t) throw new Error('door without tiles');
    expect(cellBlocks(grid, t.x, t.y, BLOCK_PLAYER)).toBe(true);
    setDoorBlocking(grid, d1, false);
    expect(cellBlocks(grid, t.x, t.y, BLOCK_ALL)).toBe(false);
    setDoorBlocking(grid, d1, true);
    expect(cellBlocks(grid, t.x, t.y, BLOCK_PLAYER)).toBe(true);
  });

  it('treats outside the map as solid', () => {
    expect(cellBlocks(grid, -1, 0, BLOCK_PLAYER)).toBe(true);
    expect(cellBlocks(grid, 0, map.height, BLOCK_PLAYER)).toBe(true);
  });
});

describe('resolveCircle', () => {
  it('pushes a circle out of a wall along the contact normal', () => {
    const grid = smallGrid();
    const pos = { x: 18, y: 25 }; // overlapping the left edge of tile (2,2) at x=20
    expect(resolveCircle(grid, pos, 4, BLOCK_PLAYER)).toBe(true);
    expect(pos.x).toBeCloseTo(16);
    expect(pos.y).toBeCloseTo(25);
  });

  it('leaves free circles untouched', () => {
    const grid = smallGrid();
    const pos = { x: 5, y: 5 };
    expect(resolveCircle(grid, pos, 4, BLOCK_PLAYER)).toBe(false);
    expect(pos).toEqual({ x: 5, y: 5 });
  });

  it('ignores tiles that do not match the mask', () => {
    const grid = smallGrid();
    grid.cells[12] = BLOCK_BULLET;
    const pos = { x: 25, y: 25 };
    expect(resolveCircle(grid, pos, 4, BLOCK_PLAYER)).toBe(false);
  });
});

describe('moveCircle', () => {
  it('slides along a wall instead of stopping', () => {
    const grid = smallGrid();
    const pos = { x: 14, y: 22 };
    moveCircle(grid, pos, 10, 3, 4, BLOCK_PLAYER); // push diagonally into tile (2,2)
    expect(pos.x).toBeLessThanOrEqual(16.0001);
    expect(pos.y).toBeCloseTo(25);
  });

  it('does not tunnel through a wall on a long move', () => {
    const grid = smallGrid();
    const pos = { x: 5, y: 25 };
    moveCircle(grid, pos, 40, 0, 4, BLOCK_PLAYER);
    expect(pos.x).toBeLessThanOrEqual(16.0001);
  });
});

describe('segmentClear', () => {
  it('detects walls between two points', () => {
    const grid = smallGrid();
    expect(segmentClear(grid, 5, 25, 45, 25, BLOCK_SIGHT)).toBe(false);
    expect(segmentClear(grid, 5, 5, 45, 5, BLOCK_SIGHT)).toBe(true);
    expect(segmentClear(grid, 5, 5, 45, 45, BLOCK_SIGHT)).toBe(false);
    expect(segmentClear(grid, 5, 45, 45, 45, BLOCK_SIGHT)).toBe(true);
  });

  it('works for zero-length and vertical segments', () => {
    const grid = smallGrid();
    expect(segmentClear(grid, 5, 5, 5, 5, BLOCK_SIGHT)).toBe(true);
    expect(segmentClear(grid, 25, 5, 25, 45, BLOCK_SIGHT)).toBe(false);
  });
});
