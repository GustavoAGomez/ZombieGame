import { TILE_COLLIDES, TILE_VOID, TILE_WATER, type MapData, type MapDoor } from './MapLoader';

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
}

export function buildCollisionGrid(map: MapData, doorsOpen: readonly boolean[]): CollisionGrid {
  const cells = new Uint8Array(map.width * map.height);
  const flagsOf = (gid: number): number => (gid > 0 ? (map.gidFlags[gid] ?? 0) : 0);
  for (let i = 0; i < cells.length; i++) {
    const tileFlags = flagsOf(map.walls[i] ?? 0) | flagsOf(map.floor[i] ?? 0) | flagsOf(map.decor[i] ?? 0);
    if ((flagsOf(map.walls[i] ?? 0) & TILE_COLLIDES) !== 0) cells[i] = BLOCK_ALL;
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
  const grid: CollisionGrid = { width: map.width, height: map.height, tileSize: map.tileSize, cells };
  map.doors.forEach((door, i) => setDoorBlocking(grid, door, !doorsOpen[i]));
  return grid;
}

export function setDoorBlocking(grid: CollisionGrid, door: MapDoor, closed: boolean): void {
  for (const t of door.tiles) {
    if (t.x < 0 || t.y < 0 || t.x >= grid.width || t.y >= grid.height) continue;
    grid.cells[t.y * grid.width + t.x] = closed ? BLOCK_ALL : 0;
  }
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
