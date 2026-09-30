import { BLOCK_ZOMBIE, type CollisionGrid } from './CollisionGrid';
import type { MapData } from './MapLoader';

/**
 * Navigation flow field (spec 01 §4.5). A BFS from the players' tiles over
 * the walkable interior (unlocked zones and open doors) stores, per cell,
 * the number of steps to the nearest player. Zombies then step to the
 * 8-neighbour with the lowest distance, never cutting corners.
 *
 * The BFS is 4-connected (distances are Manhattan steps); choosing among
 * 8 neighbours on top of that gives diagonal moves in open space.
 */
export const UNREACHABLE = -1;

export interface FlowField {
  width: number;
  height: number;
  tileSize: number;
  /** Steps to the nearest source per cell, or UNREACHABLE. */
  dist: Int32Array;
  /** Preallocated BFS queue. */
  queue: Int32Array;
  /** Cell index of each source when last computed, to detect changes. */
  sources: Int32Array;
  sourceCount: number;
  /** Seconds since the last computation. */
  age: number;
}

export function createFlowField(width: number, height: number, tileSize: number, maxSources = 4): FlowField {
  return {
    width,
    height,
    tileSize,
    dist: new Int32Array(width * height).fill(UNREACHABLE),
    queue: new Int32Array(width * height),
    sources: new Int32Array(maxSources).fill(-1),
    sourceCount: 0,
    age: Infinity,
  };
}

/** Walkable for zombie navigation: floor, not blocked, in an unlocked zone (or an open door). */
export function isNavWalkable(map: MapData, grid: CollisionGrid, zonesUnlocked: readonly boolean[], cell: number): boolean {
  if ((map.floor[cell] ?? -1) < 0) return false;
  if (((grid.cells[cell] ?? 0) & BLOCK_ZOMBIE) !== 0) return false;
  const zone = map.cellZone[cell] ?? -1;
  return zone < 0 || zonesUnlocked[zone] === true;
}

/**
 * Recomputes the field from the given source cells. Only allocation-free
 * work: the queue and distance arrays are reused.
 */
export function computeFlowField(
  field: FlowField,
  map: MapData,
  grid: CollisionGrid,
  zonesUnlocked: readonly boolean[],
  sourceCells: readonly number[],
): void {
  const { width, height, dist, queue } = field;
  dist.fill(UNREACHABLE);
  let head = 0;
  let tail = 0;
  field.sourceCount = 0;
  for (let i = 0; i < sourceCells.length; i++) {
    const cell = sourceCells[i] ?? -1;
    if (i < field.sources.length) {
      field.sources[i] = cell;
      field.sourceCount++;
    }
    if (cell < 0 || cell >= dist.length || dist[cell] === 0) continue;
    if (!isNavWalkable(map, grid, zonesUnlocked, cell)) continue;
    dist[cell] = 0;
    queue[tail++] = cell;
  }
  while (head < tail) {
    const cell = queue[head++] ?? 0;
    const d = (dist[cell] ?? 0) + 1;
    const x = cell % width;
    const y = (cell - x) / width;
    if (x > 0) tail = visit(field, map, grid, zonesUnlocked, cell - 1, d, tail);
    if (x < width - 1) tail = visit(field, map, grid, zonesUnlocked, cell + 1, d, tail);
    if (y > 0) tail = visit(field, map, grid, zonesUnlocked, cell - width, d, tail);
    if (y < height - 1) tail = visit(field, map, grid, zonesUnlocked, cell + width, d, tail);
  }
  field.age = 0;
}

function visit(
  field: FlowField,
  map: MapData,
  grid: CollisionGrid,
  zonesUnlocked: readonly boolean[],
  cell: number,
  d: number,
  tail: number,
): number {
  if (field.dist[cell] !== UNREACHABLE) return tail;
  if (!isNavWalkable(map, grid, zonesUnlocked, cell)) return tail;
  field.dist[cell] = d;
  field.queue[tail] = cell;
  return tail + 1;
}

/** True when any source moved to another cell since the last computation. */
export function sourcesChanged(field: FlowField, sourceCells: readonly number[]): boolean {
  if (sourceCells.length !== field.sourceCount) return true;
  for (let i = 0; i < sourceCells.length; i++) if (field.sources[i] !== sourceCells[i]) return true;
  return false;
}

export function distanceAt(field: FlowField, x: number, y: number): number {
  const tx = Math.floor(x / field.tileSize);
  const ty = Math.floor(y / field.tileSize);
  if (tx < 0 || ty < 0 || tx >= field.width || ty >= field.height) return UNREACHABLE;
  return field.dist[ty * field.width + tx] ?? UNREACHABLE;
}

const NEIGHBOURS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

/**
 * Writes into `out` the unit direction from (x, y) towards the centre of
 * the best neighbouring cell. Returns false when the position is not on
 * the field (unreachable) or already on a source cell.
 */
export function flowDirection(field: FlowField, x: number, y: number, out: { x: number; y: number }): boolean {
  const { width, height, tileSize, dist } = field;
  const tx = Math.floor(x / tileSize);
  const ty = Math.floor(y / tileSize);
  if (tx < 0 || ty < 0 || tx >= width || ty >= height) return false;
  const here = dist[ty * width + tx] ?? UNREACHABLE;
  if (here <= 0) return false;

  let bestX = 0;
  let bestY = 0;
  let best = here;
  for (let i = 0; i < NEIGHBOURS.length; i++) {
    const [dx, dy] = NEIGHBOURS[i] ?? [0, 0];
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const d = dist[ny * width + nx] ?? UNREACHABLE;
    if (d === UNREACHABLE) continue;
    if (dx !== 0 && dy !== 0) {
      // No corner cutting: both orthogonal cells must be walkable.
      if ((dist[ty * width + nx] ?? UNREACHABLE) === UNREACHABLE) continue;
      if ((dist[ny * width + tx] ?? UNREACHABLE) === UNREACHABLE) continue;
    }
    // Strictly better only, so ties keep the first (orthogonal) choice.
    if (d < best) {
      best = d;
      bestX = nx;
      bestY = ny;
    }
  }
  if (best === here) return false;
  const cx = (bestX + 0.5) * tileSize - x;
  const cy = (bestY + 0.5) * tileSize - y;
  const len = Math.hypot(cx, cy) || 1;
  out.x = cx / len;
  out.y = cy / len;
  return true;
}
