import { BULLETS } from '../../config/balance';
import {
  TILE_COLLIDES,
  TILE_VOID,
  TILE_WATER,
  WALL_SHAPE_FULL,
  WALL_SHAPE_SOLID,
  WALL_SHAPE_SOLID_NORTH_OPEN,
  WALL_SHAPE_THIN,
  type MapData,
  type MapDoor,
} from './MapLoader';

/**
 * Per-tile blocking flags. Pure data + geometry so the same collision code
 * can run on a server. Replaces Arcade Physics for gameplay (see
 * docs/DECISIONS.md).
 */
export const BLOCK_PLAYER = 1;
export const BLOCK_ZOMBIE = 2;
export const BLOCK_BULLET = 4;
export const BLOCK_SIGHT = 8;
export const BLOCK_ALL = BLOCK_PLAYER | BLOCK_ZOMBIE | BLOCK_BULLET | BLOCK_SIGHT;
/** Windows, water and void stop bodies but let bullets and line of sight through. */
export const BLOCK_BODIES = BLOCK_PLAYER | BLOCK_ZOMBIE;
export const BLOCK_WINDOW = BLOCK_BODIES;
export const BLOCK_PROP = BLOCK_BODIES | BLOCK_BULLET;

export interface CollisionGrid {
  width: number;
  height: number;
  tileSize: number;
  cells: Uint8Array;
  /**
   * Wall shape per cell (WALL_SHAPE_*), for bullets and line of sight: they
   * stop at the wall's base (its drawn shape in 3/4), not on the empty floor
   * around a thin wall. Bodies always stop at whole tiles.
   */
  shapes: Uint8Array;
}

export function buildCollisionGrid(map: MapData, doorsOpen: readonly boolean[]): CollisionGrid {
  const cells = new Uint8Array(map.width * map.height);
  const shapes = new Uint8Array(cells.length);
  const flagsOf = (gid: number): number => (gid > 0 ? (map.gidFlags[gid] ?? 0) : 0);
  for (let i = 0; i < cells.length; i++) {
    const tileFlags = flagsOf(map.walls[i] ?? 0) | flagsOf(map.floor[i] ?? 0) | flagsOf(map.decor[i] ?? 0);
    if ((flagsOf(map.walls[i] ?? 0) & TILE_COLLIDES) !== 0) {
      cells[i] = BLOCK_ALL;
      shapes[i] = map.gidShapes[map.walls[i] ?? 0] ?? WALL_SHAPE_FULL;
    }
    else if ((tileFlags & (TILE_WATER | TILE_VOID)) !== 0) cells[i] = BLOCK_BODIES;
    // Safety net: the player can never step where there is no floor.
    else if ((map.floor[i] ?? 0) === 0) cells[i] = BLOCK_PLAYER;
  }
  for (const w of map.windows) cells[w.tileY * map.width + w.tileX] = BLOCK_WINDOW;
  // Furniture with collision stops bodies and bullets but not the line of sight.
  for (const prop of map.props) {
    if (!prop.collides) continue;
    for (const t of prop.tiles) {
      const i = t.y * map.width + t.x;
      if (t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height) cells[i] = (cells[i] ?? 0) | BLOCK_PROP;
    }
  }
  // Weapon cases are solid furniture too: bodies and bullets, not the line of sight (spec 04 §3).
  for (const c of map.weaponCases) {
    const i = c.tileY * map.width + c.tileX;
    cells[i] = (cells[i] ?? 0) | BLOCK_PROP;
  }
  const grid: CollisionGrid = { width: map.width, height: map.height, tileSize: map.tileSize, cells, shapes };
  map.doors.forEach((door, i) => setDoorBlocking(grid, door, !doorsOpen[i]));
  return grid;
}

export function setDoorBlocking(grid: CollisionGrid, door: MapDoor, closed: boolean): void {
  for (const t of door.tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= grid.width || t.y >= grid.height) continue;
    grid.cells[t.y * grid.width + t.x] = closed ? BLOCK_ALL : 0;
    grid.shapes[t.y * grid.width + t.x] = WALL_SHAPE_FULL;
  }
}

/**
 * Kit geometry on a 32 px tile (scripts/lib/wall-autotile.ts): the strip of
 * a vertical wall (x 10–21), and the top band (y 7–13) over an 18 px face.
 * In 3/4 the band is the top of the wall, drawn 18 px above its base, so the
 * wall stands on the ground from y 25 to the bottom of the tile.
 */
const KIT_TILE = 32;
const STRIP_X0 = 10;
const STRIP_X1 = 22;
const BAND_Y = 7;
const WALL_HEIGHT = 18;
const BASE_Y = BAND_Y + WALL_HEIGHT;

type Rect = readonly [x0: number, y0: number, x1: number, y1: number];

/**
 * The ground a shape stands on inside its tile, in units of a 32 px tile.
 * Things are tested with the point of the ground right under a bullet
 * (BulletSystem), which flies BULLETS.flightHeight above it, so:
 * - a kit wall stands on its base (what its drawn top would cover once
 *   lowered by the wall's height): a thin wall (WALL_SHAPE_THIN + mask) on
 *   the central strip, from the top of the tile if the wall goes on north
 *   (from the base of its end otherwise) down to the bottom, and on the base
 *   under the band of its east and west arms; a thick wall on its whole
 *   tile, from the base if the north is open. A bullet meets the wall's face
 *   where it is drawn, and one that visibly misses the wall flies on;
 * - something flat drawn on its tile (furniture, doors, walls without a kit)
 *   from the flight height down: a bullet coming from the north stops as it
 *   visibly reaches the top edge, and one fired by a player standing right
 *   in front of it still flies.
 */
function shapeRects(shape: number): readonly Rect[] {
  if (shape === WALL_SHAPE_SOLID_NORTH_OPEN) return [[0, BASE_Y, KIT_TILE, KIT_TILE]];
  if (shape === WALL_SHAPE_SOLID) return FULL_TILE;
  if (shape < WALL_SHAPE_THIN || shape >= WALL_SHAPE_THIN + 16) return [[0, FLAT_TOP, KIT_TILE, KIT_TILE]];
  const mask = shape - WALL_SHAPE_THIN;
  const rects: Rect[] = [[STRIP_X0, mask & 1 ? 0 : BASE_Y, STRIP_X1, KIT_TILE]];
  if (mask & 8) rects.push([0, BASE_Y, STRIP_X0, KIT_TILE]);
  if (mask & 2) rects.push([STRIP_X1, BASE_Y, KIT_TILE, KIT_TILE]);
  return rects;
}

const FULL_TILE: readonly Rect[] = [[0, 0, KIT_TILE, KIT_TILE]];
/** Flat things block from the bullets' flight height down (see shapeRects). */
const FLAT_TOP = Math.min(KIT_TILE, BULLETS.flightHeight);
const SHAPE_RECTS: readonly (readonly Rect[])[] = Array.from({ length: WALL_SHAPE_SOLID + 1 }, (_, shape) => shapeRects(shape));

function rectsOf(grid: CollisionGrid, index: number): readonly Rect[] {
  return SHAPE_RECTS[grid.shapes[index] ?? WALL_SHAPE_FULL] ?? FULL_TILE;
}

/** World-px rectangles [x0, y0, x1, y1] a blocking cell covers for bullets and sight (debug drawing). */
export function cellShapeRects(grid: CollisionGrid, tx: number, ty: number): Rect[] {
  const ts = grid.tileSize;
  const k = KIT_TILE / ts;
  return rectsOf(grid, ty * grid.width + tx).map(([x0, y0, x1, y1]) => [tx * ts + x0 / k, ty * ts + y0 / k, tx * ts + x1 / k, ty * ts + y1 / k] as const);
}

/** Like pointBlocks, but inside a wall tile only on the wall's base. */
export function pointBlocksShaped(grid: CollisionGrid, x: number, y: number, mask: number): boolean {
  const ts = grid.tileSize;
  const tx = Math.floor(x / ts);
  const ty = Math.floor(y / ts);
  if (!cellBlocks(grid, tx, ty, mask)) return false;
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return true;
  const k = KIT_TILE / ts;
  const lx = (x - tx * ts) * k;
  const ly = (y - ty * ts) * k;
  return rectsOf(grid, ty * grid.width + tx).some(([x0, y0, x1, y1]) => lx >= x0 && lx < x1 && ly >= y0 && ly < y1);
}

/**
 * Where the segment from (x0, y0) to (x1, y1) first touches something
 * matching `mask`, as a fraction of its length (0..1), or Infinity when it
 * gets through. Walls count only on their base (shapes); doors, furniture
 * and the outside of the map, as whole tiles.
 */
export function segmentHitShaped(grid: CollisionGrid, x0: number, y0: number, x1: number, y1: number, mask: number): number {
  const ts = grid.tileSize;
  const k = KIT_TILE / ts;
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tx = Math.floor(x0 / ts);
  let ty = Math.floor(y0 / ts);
  const endTx = Math.floor(x1 / ts);
  const endTy = Math.floor(y1 / ts);
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(ts / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(ts / dy) : Infinity;
  let tMaxX = stepX > 0 ? ((tx + 1) * ts - x0) / dx : stepX < 0 ? (tx * ts - x0) / dx : Infinity;
  let tMaxY = stepY > 0 ? ((ty + 1) * ts - y0) / dy : stepY < 0 ? (ty * ts - y0) / dy : Infinity;
  const maxIterations = Math.abs(endTx - tx) + Math.abs(endTy - ty) + 1;
  for (let i = 0; i <= maxIterations; i++) {
    if (cellBlocks(grid, tx, ty, mask)) {
      // Cells are visited in order along the segment: the first hit found is the nearest.
      const inside = tx >= 0 && ty >= 0 && tx < grid.width && ty < grid.height;
      const rects = inside ? rectsOf(grid, ty * grid.width + tx) : FULL_TILE;
      let best = Infinity;
      for (const [rx0, ry0, rx1, ry1] of rects) {
        const t = segmentRectEntry(x0, y0, dx, dy, tx * ts + rx0 / k, ty * ts + ry0 / k, tx * ts + rx1 / k, ty * ts + ry1 / k);
        if (t < best) best = t;
      }
      if (best <= 1) return best;
    }
    if (tx === endTx && ty === endTy) return Infinity;
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      tMaxY += tDeltaY;
      ty += stepY;
    }
  }
  return Infinity;
}

/** True when nothing matching `mask` lies on the segment (walls by their base). */
export function segmentClearShaped(grid: CollisionGrid, x0: number, y0: number, x1: number, y1: number, mask: number): boolean {
  return segmentHitShaped(grid, x0, y0, x1, y1, mask) === Infinity;
}

/** Slab test: fraction of (dx, dy) where the segment from (x0, y0) enters the rectangle, Infinity if it never does. */
function segmentRectEntry(x0: number, y0: number, dx: number, dy: number, rx0: number, ry0: number, rx1: number, ry1: number): number {
  let tEnter = 0;
  let tExit = 1;
  for (const [origin, d, min, max] of [
    [x0, dx, rx0, rx1],
    [y0, dy, ry0, ry1],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (origin < min || origin >= max) return Infinity;
      continue;
    }
    let t0 = (min - origin) / d;
    let t1 = (max - origin) / d;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tEnter = Math.max(tEnter, t0);
    tExit = Math.min(tExit, t1);
    if (tEnter > tExit) return Infinity;
  }
  return tEnter;
}

/** Outside the map counts as solid for everything. */
export function cellBlocks(grid: CollisionGrid, tx: number, ty: number, mask: number): boolean {
  if (tx < 0 || ty < 0 || tx >= grid.width || ty >= grid.height) return true;
  return ((grid.cells[ty * grid.width + tx] ?? BLOCK_ALL) & mask) !== 0;
}

export function pointBlocks(grid: CollisionGrid, x: number, y: number, mask: number): boolean {
  return cellBlocks(grid, Math.floor(x / grid.tileSize), Math.floor(y / grid.tileSize), mask);
}

export interface MutableVec2 {
  x: number;
  y: number;
}

/**
 * Pushes a circle out of every blocking tile it overlaps. Resolving along
 * the contact normal makes bodies slide along walls instead of sticking.
 * Returns true if any push happened.
 */
export function resolveCircle(grid: CollisionGrid, pos: MutableVec2, radius: number, mask: number): boolean {
  const ts = grid.tileSize;
  let pushed = false;
  // Two passes settle corners where two tiles push in different directions.
  for (let pass = 0; pass < 2; pass++) {
    const minTx = Math.floor((pos.x - radius) / ts);
    const maxTx = Math.floor((pos.x + radius) / ts);
    const minTy = Math.floor((pos.y - radius) / ts);
    const maxTy = Math.floor((pos.y + radius) / ts);
    for (let ty = minTy; ty <= maxTy; ty++) {
      for (let tx = minTx; tx <= maxTx; tx++) {
        if (!cellBlocks(grid, tx, ty, mask)) continue;
        const left = tx * ts;
        const top = ty * ts;
        const nearestX = Math.max(left, Math.min(pos.x, left + ts));
        const nearestY = Math.max(top, Math.min(pos.y, top + ts));
        const dx = pos.x - nearestX;
        const dy = pos.y - nearestY;
        const distSq = dx * dx + dy * dy;
        if (distSq >= radius * radius) continue;
        if (distSq > 1e-9) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          pos.x += (dx / dist) * push;
          pos.y += (dy / dist) * push;
        } else {
          // Centre is inside the tile: leave through the closest edge.
          const toLeft = pos.x - left;
          const toRight = left + ts - pos.x;
          const toTop = pos.y - top;
          const toBottom = top + ts - pos.y;
          const min = Math.min(toLeft, toRight, toTop, toBottom);
          if (min === toLeft) pos.x = left - radius;
          else if (min === toRight) pos.x = left + ts + radius;
          else if (min === toTop) pos.y = top - radius;
          else pos.y = top + ts + radius;
        }
        pushed = true;
      }
    }
    if (!pushed) break;
  }
  return pushed;
}

/**
 * Moves a circle by (dx, dy) with sub-steps no longer than half its radius
 * so fast moves (dash) cannot tunnel through a wall.
 */
export function moveCircle(
  grid: CollisionGrid,
  pos: MutableVec2,
  dx: number,
  dy: number,
  radius: number,
  mask: number,
): void {
  const dist = Math.hypot(dx, dy);
  if (dist === 0) {
    resolveCircle(grid, pos, radius, mask);
    return;
  }
  const steps = Math.max(1, Math.ceil(dist / (radius * 0.5)));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    pos.x += sx;
    pos.y += sy;
    resolveCircle(grid, pos, radius, mask);
  }
}

/**
 * Grid ray march (Amanatides & Woo). Returns true when the segment from
 * (x0, y0) to (x1, y1) crosses no tile matching `mask`.
 */
export function segmentClear(
  grid: CollisionGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  mask: number,
): boolean {
  const ts = grid.tileSize;
  let tx = Math.floor(x0 / ts);
  let ty = Math.floor(y0 / ts);
  const endTx = Math.floor(x1 / ts);
  const endTy = Math.floor(y1 / ts);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
  const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
  const tDeltaX = stepX !== 0 ? Math.abs(ts / dx) : Infinity;
  const tDeltaY = stepY !== 0 ? Math.abs(ts / dy) : Infinity;
  let tMaxX = stepX > 0 ? ((tx + 1) * ts - x0) / dx : stepX < 0 ? (tx * ts - x0) / dx : Infinity;
  let tMaxY = stepY > 0 ? ((ty + 1) * ts - y0) / dy : stepY < 0 ? (ty * ts - y0) / dy : Infinity;

  // Bounded by the number of cells the segment can touch.
  const maxIterations = Math.abs(endTx - tx) + Math.abs(endTy - ty) + 1;
  for (let i = 0; i <= maxIterations; i++) {
    if (cellBlocks(grid, tx, ty, mask)) return false;
    if (tx === endTx && ty === endTy) return true;
    if (tMaxX < tMaxY) {
      tMaxX += tDeltaX;
      tx += stepX;
    } else {
      tMaxY += tDeltaY;
      ty += stepY;
    }
  }
  return true;
}
