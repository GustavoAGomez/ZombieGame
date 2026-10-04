import { describe, expect, it } from 'vitest';
import { BULLETS } from '../../config/balance';
import { buildRoom01Map } from '../../../scripts/gen-placeholder-map';
import { contextFor, createMansionContext } from '../../test/fixtures';
import { updateBullets } from '../systems/BulletSystem';
import { BLOCK_BULLET, BLOCK_SIGHT, buildCollisionGrid, cellBlocks, pointBlocksShaped, segmentClearShaped, segmentHitShaped } from './CollisionGrid';
import { WALL_SHAPE_DOOR_VERTICAL, WALL_SHAPE_FULL, WALL_SHAPE_SOLID_NORTH_OPEN, WALL_SHAPE_THIN, parseMap } from './MapLoader';
import type { TiledMap, TiledTileLayer } from './tiled';

const T = 32;
const N = 1;
const E = 2;
const S = 4;
const W = 8;

/**
 * room01 plus a 52-tile kit like the PixelLab ones (tiles 0–15 with their
 * neighbour `mask`, 16–19 thick walls), and inside the starting room a short
 * vertical wall (x 8, y 6–8), a horizontal one (x 12–14, y 10) and a thick
 * tile open to the north (x 16, y 5).
 */
function kitMap(): TiledMap {
  const map = structuredClone(buildRoom01Map());
  const base = map.tilesets[0]!;
  const kit = base.firstgid + base.tilecount;
  map.tilesets.push({
    firstgid: kit, name: 'kit_test', tilewidth: 32, tileheight: 32, tilecount: 52, columns: 13,
    image: 'kit.png', imagewidth: 416, imageheight: 128, margin: 0, spacing: 0,
    tiles: [
      ...Array.from({ length: 16 }, (_, mask) => ({
        id: mask,
        properties: [
          { name: 'collides', type: 'bool' as const, value: true },
          { name: 'mask', type: 'int' as const, value: mask },
        ],
      })),
      ...Array.from({ length: 4 }, (_, i) => ({ id: 16 + i, properties: [{ name: 'collides', type: 'bool' as const, value: true }] })),
    ],
  });
  const walls = map.layers.find((l) => l.name === 'walls') as TiledTileLayer;
  const put = (x: number, y: number, tile: number): void => {
    walls.data[y * map.width + x] = kit + tile;
  };
  put(8, 6, S);
  put(8, 7, N | S);
  put(8, 8, N);
  put(12, 10, E);
  put(13, 10, E | W);
  put(14, 10, W);
  put(16, 5, 16 + 2); // thick, north open
  return map;
}

const map = parseMap(kitMap());
const grid = buildCollisionGrid(map, map.doors.map(() => false));
const shapeAt = (x: number, y: number): number => grid.shapes[y * map.width + x] ?? -1;
/** A point inside tile (tx, ty), at (lx, ly) px from its corner. */
const at = (tx: number, ty: number, lx: number, ly: number): [number, number] => [tx * T + lx, ty * T + ly];

describe('wall shapes', () => {
  it('reads the shape of each kit tile; other walls are flat', () => {
    expect(shapeAt(8, 7)).toBe(WALL_SHAPE_THIN + (N | S));
    expect(shapeAt(13, 10)).toBe(WALL_SHAPE_THIN + (E | W));
    expect(shapeAt(16, 5)).toBe(WALL_SHAPE_SOLID_NORTH_OPEN);
    // room01's own walls (no mask) and floor.
    expect(shapeAt(3, 3)).toBe(WALL_SHAPE_FULL);
    expect(cellBlocks(grid, 3, 3, BLOCK_BULLET)).toBe(true);
  });

  it('stops bullets on the base of the wall only: the strip of a vertical wall, the bottom 7 px of a horizontal one', () => {
    // Vertical wall: the 12 px strip in the middle, not the floor beside it.
    expect(pointBlocksShaped(grid, ...at(8, 7, 4, 16), BLOCK_BULLET)).toBe(false);
    expect(pointBlocksShaped(grid, ...at(8, 7, 26, 16), BLOCK_BULLET)).toBe(false);
    expect(pointBlocksShaped(grid, ...at(8, 7, 16, 16), BLOCK_BULLET)).toBe(true);
    // Its north end stands from y 25: its cap and face are drawn above that.
    expect(pointBlocksShaped(grid, ...at(8, 6, 16, 10), BLOCK_BULLET)).toBe(false);
    expect(pointBlocksShaped(grid, ...at(8, 6, 16, 28), BLOCK_BULLET)).toBe(true);
    // Horizontal wall: band and face are drawn from y 7, but it stands on the bottom 7 px.
    expect(pointBlocksShaped(grid, ...at(13, 10, 16, 8), BLOCK_BULLET)).toBe(false);
    expect(pointBlocksShaped(grid, ...at(13, 10, 16, 20), BLOCK_BULLET)).toBe(false);
    expect(pointBlocksShaped(grid, ...at(13, 10, 16, 28), BLOCK_BULLET)).toBe(true);
    expect(pointBlocksShaped(grid, ...at(13, 10, 3, 28), BLOCK_BULLET)).toBe(true);
    // Its west end has no arm to the west: the floor there is free.
    expect(pointBlocksShaped(grid, ...at(12, 10, 4, 28), BLOCK_BULLET)).toBe(false);
    expect(pointBlocksShaped(grid, ...at(12, 10, 16, 28), BLOCK_BULLET)).toBe(true);
    // Thick wall open to the north: the whole width, from the base.
    expect(pointBlocksShaped(grid, ...at(16, 5, 2, 10), BLOCK_BULLET)).toBe(false);
    expect(pointBlocksShaped(grid, ...at(16, 5, 2, 28), BLOCK_BULLET)).toBe(true);
    // Room01's plain walls are flat squares: they block from the bullets' flight height down.
    expect(pointBlocksShaped(grid, ...at(3, 6, 1, BULLETS.flightHeight - 1), BLOCK_BULLET)).toBe(false);
    expect(pointBlocksShaped(grid, ...at(3, 6, 1, BULLETS.flightHeight + 1), BLOCK_BULLET)).toBe(true);
  });

  it('finds where a segment first meets a wall, and lets it pass beside one', () => {
    // Down the free floor beside the strip, through all three wall tiles.
    expect(segmentHitShaped(grid, ...at(8, 5, 4, 0), ...at(8, 9, 4, 31), BLOCK_BULLET)).toBe(Infinity);
    // Across the strip: it stops at the strip's west edge (x 10 of the tile).
    const [x0, y0] = at(6, 7, 16, 16);
    const [x1] = at(10, 7, 16, 16);
    const t = segmentHitShaped(grid, x0, y0, x1, y0, BLOCK_BULLET);
    expect(x0 + (x1 - x0) * t).toBeCloseTo(8 * T + 10);
    // Diagonally past the end of the horizontal wall, over its empty corner and in front of its face.
    expect(segmentClearShaped(grid, ...at(11, 9, 16, 16), ...at(12, 10, 9, 20), BLOCK_SIGHT)).toBe(true);
    expect(segmentClearShaped(grid, ...at(11, 9, 16, 16), ...at(12, 10, 14, 30), BLOCK_SIGHT)).toBe(false);
    // A whole-tile wall (room01's west wall at x 3) is met at its edge.
    const tWall = segmentHitShaped(grid, ...at(5, 6, 16, 16), ...at(2, 6, 16, 16), BLOCK_BULLET);
    expect(5 * T + 16 - 3 * T * tWall).toBeCloseTo(4 * T);
  });

  it('lets a real bullet fly past the side of a wall and stops one that hits it at the wall', () => {
    const ctx = contextFor(map);
    // Drawn at the flight height above its ground point, like a real shot.
    const fire = (index: number, x: number, y: number, dirX = 0, dirY = -1): void => {
      const b = ctx.state.bullets[index]!;
      Object.assign(b, { active: true, x, y, prevX: x, prevY: y, dirX, dirY, speed: 520, remaining: 400, damage: 1, drawX: 0, drawY: -BULLETS.flightHeight });
    };
    // Up past the floor beside the strip: on to the room's north wall (y 4 is the first floor row).
    fire(0, ...at(8, 11, 4, 16));
    // Up into the strip: it stops at the wall's south end (bottom of tile y 8).
    fire(1, ...at(8, 11, 16, 16));
    // Down onto the horizontal wall: it stops at its base, where it visibly meets the face.
    fire(2, ...at(13, 6, 16, 16), 0, 1);
    for (let i = 0; i < 60; i++) updateBullets(ctx, 1 / 60);
    const [beside, into, onto] = ctx.state.bullets;
    expect(beside?.active).toBe(false);
    expect(beside?.y).toBeCloseTo(4 * T);
    expect(into?.active).toBe(false);
    expect(into?.y).toBeCloseTo(9 * T);
    expect(onto?.active).toBe(false);
    expect(onto?.y).toBeCloseTo(10 * T + 25);
  });

  it('lets a bullet shot diagonally past the end of a wall fly on into the gap (the corner of the first room)', () => {
    const ctx = contextFor(map);
    // Standing right above the east end of the horizontal wall (x 14), shooting down and to the right.
    const b = ctx.state.bullets[0]!;
    const [x, y] = at(14, 9, 14, 26);
    const d = Math.SQRT1_2;
    Object.assign(b, { active: true, x, y, prevX: x, prevY: y, dirX: d, dirY: d, speed: 520, remaining: 200, damage: 1, drawX: 0, drawY: -BULLETS.flightHeight });
    for (let i = 0; i < 8; i++) updateBullets(ctx, 1 / 60);
    expect(b.active).toBe(true);
    expect(b.y).toBeGreaterThan(11 * T);
  });
});

describe('flat blockers', () => {
  it('stop a bullet from the north as it visibly reaches their top edge, and let one fired from right in front fly', () => {
    const ctx = contextFor(map);
    // Room01's door D1 (closed) at x 10–11, y 13.
    const fire = (index: number, x: number, y: number, dirX: number, dirY: number): void => {
      const b = ctx.state.bullets[index]!;
      Object.assign(b, { active: true, x, y, prevX: x, prevY: y, dirX, dirY, speed: 520, remaining: 300, damage: 1, drawX: 0, drawY: -BULLETS.flightHeight });
    };
    fire(0, ...at(10, 11, 16, 16), 0, 1);
    // Fired along the room's south wall by a player hugging it (feet 6 px above the wall's tiles).
    fire(1, ...at(5, 12, 16, 26), 1, 0);
    for (let i = 0; i < 20; i++) updateBullets(ctx, 1 / 60);
    const [down, along] = ctx.state.bullets;
    expect(down?.active).toBe(false);
    expect((down?.y ?? 0) + (down?.drawY ?? 0)).toBeCloseTo(13 * T);
    expect(along?.x).toBeGreaterThan(9 * T);
  });
});

describe('wall shapes on the mansion', () => {
  it('gives its kit walls their drawn shape', () => {
    const { grid: mansion } = createMansionContext();
    let thin = 0;
    for (const shape of mansion.shapes) if (shape >= WALL_SHAPE_THIN && shape < WALL_SHAPE_THIN + 16) thin++;
    expect(thin).toBeGreaterThan(500);
  });

  it('lets no horizontal shot or look cross a vertical wall, closed doors included', () => {
    const { grid: mansion } = createMansionContext();
    const ts = mansion.tileSize;
    // A wall stands from y 25 of its tile even at the north end of a run (its cap is drawn above).
    const base = 25;
    const free = (x: number, y: number): boolean => !cellBlocks(mansion, x, y, BLOCK_SIGHT);
    let pairs = 0;
    let doorPairs = 0;
    const leaks: string[] = [];
    for (let ty = 0; ty + 1 < mansion.height; ty++) {
      for (let tx = 1; tx + 1 < mansion.width; tx++) {
        // Two cells of a vertical wall with floor (or a see-through window) on both sides.
        if (free(tx, ty) || free(tx, ty + 1)) continue;
        if (!free(tx - 1, ty) || !free(tx + 1, ty) || !free(tx - 1, ty + 1) || !free(tx + 1, ty + 1)) continue;
        pairs++;
        if (mansion.shapes[(ty + 1) * mansion.width + tx] === WALL_SHAPE_DOOR_VERTICAL) doorPairs++;
        for (let y = ty * ts + base; y < (ty + 2) * ts; y += 0.5) {
          for (const mask of [BLOCK_SIGHT, BLOCK_BULLET]) {
            if (segmentHitShaped(mansion, (tx - 0.5) * ts, y, (tx + 1.5) * ts, y, mask) === Infinity) leaks.push(`(${tx},${ty}) y ${y} mask ${mask}`);
          }
        }
      }
    }
    expect(pairs).toBeGreaterThan(150);
    expect(doorPairs).toBeGreaterThan(0);
    expect(leaks).toEqual([]);
  });
});
