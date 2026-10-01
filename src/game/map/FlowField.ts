import { NAVIGATION } from '../../config/balance';
import { BLOCK_ZOMBIE, type CollisionGrid } from './CollisionGrid';
import type { MapData } from './MapLoader';

/**
 * Navigation flow field (spec 01 §4.5). A shortest-path search from the
 * players' tiles over the walkable area (unlocked zones and open doors)
 * stores, per cell, the cost in steps to the nearest player. Zombies then
 * step to the 8-neighbour with the lowest cost, never cutting corners.
 *
 * Steps are 4-connected (Manhattan); choosing among 8 neighbours on top of
 * that gives diagonal moves in open space. The two ends of an open portal
 * are linked with cost 1 (spec 02 §3.6), so the field crosses between
 * islands. A barricaded window is a way through too, at the cost of
 * tearing its planks and climbing (windowStepCost): zombies break in when
 * that is shorter than walking round by the open doors, like zombies, not
 * like people who know the way.
 */
export const UNREACHABLE = -1;

export interface FlowField {
  width: number;
  height: number;
  tileSize: number;
  /** Cost in steps to the nearest source per cell, or UNREACHABLE. */
  dist: Int32Array;
  /** Preallocated binary heap of (cell, cost) for the search. */
  heapCell: Int32Array;
  heapCost: Int32Array;
  /** Window index per cell, -1 elsewhere (built on the first computation). */
  cellWindow: Int16Array;
  windowsMapped: boolean;
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
    // Each cell is pushed at most once per neighbour that improves it (4) plus as a source.
    heapCell: new Int32Array(width * height * 5 + maxSources),
    heapCost: new Int32Array(width * height * 5 + maxSources),
    cellWindow: new Int16Array(width * height).fill(-1),
    windowsMapped: false,
    sources: new Int32Array(maxSources).fill(-1),
    sourceCount: 0,
    age: Infinity,
  };
}

/** Walkable for zombie navigation: floor, not blocked, in an unlocked zone (or an open door). */
export function isNavWalkable(map: MapData, grid: CollisionGrid, zonesUnlocked: readonly boolean[], cell: number): boolean {
  if ((map.floor[cell] ?? 0) === 0) return false;
  if (((grid.cells[cell] ?? 0) & BLOCK_ZOMBIE) !== 0) return false;
  const zone = map.cellZone[cell] ?? -1;
  return zone < 0 || zonesUnlocked[zone] === true;
}

/** Cost in steps of going through a window with `planks` left: the cell, the planks and the climb. */
export function windowStepCost(planks: number): number {
  return 1 + Math.ceil(planks * NAVIGATION.barricadeStepsPerPlank + NAVIGATION.barricadeClimbSteps);
}

let heapSize = 0;

function heapPush(field: FlowField, cell: number, cost: number): void {
  const { heapCell, heapCost } = field;
  let i = heapSize++;
  while (i > 0) {
    const parent = (i - 1) >> 1;
    if ((heapCost[parent] ?? 0) <= cost) break;
    heapCell[i] = heapCell[parent] ?? 0;
    heapCost[i] = heapCost[parent] ?? 0;
    i = parent;
  }
  heapCell[i] = cell;
  heapCost[i] = cost;
}

/** Removes the cheapest entry and returns its cell (its cost is left in popped.cost). */
const popped = { cell: 0, cost: 0 };
function heapPop(field: FlowField): void {
  const { heapCell, heapCost } = field;
  popped.cell = heapCell[0] ?? 0;
  popped.cost = heapCost[0] ?? 0;
  const lastCell = heapCell[--heapSize] ?? 0;
  const lastCost = heapCost[heapSize] ?? 0;
  let i = 0;
  for (;;) {
    const left = i * 2 + 1;
    if (left >= heapSize) break;
    const right = left + 1;
    const child = right < heapSize && (heapCost[right] ?? 0) < (heapCost[left] ?? 0) ? right : left;
    if ((heapCost[child] ?? 0) >= lastCost) break;
    heapCell[i] = heapCell[child] ?? 0;
    heapCost[i] = heapCost[child] ?? 0;
    i = child;
  }
  heapCell[i] = lastCell;
  heapCost[i] = lastCost;
}

/**
 * Recomputes the field from the given source cells (Dijkstra). Only
 * allocation-free work: the heap and cost arrays are reused.
 */
export function computeFlowField(
  field: FlowField,
  map: MapData,
  grid: CollisionGrid,
  zonesUnlocked: readonly boolean[],
  sourceCells: readonly number[],
  portalsOpen: readonly boolean[] = [],
  windowPlanks: readonly number[] = [],
): void {
  const { width, height, dist } = field;
  if (!field.windowsMapped) {
    map.windows.forEach((w, i) => {
      if (w.tileX >= 0 && w.tileY >= 0 && w.tileX < width && w.tileY < height) field.cellWindow[w.tileY * width + w.tileX] = i;
    });
    field.windowsMapped = true;
  }
  dist.fill(UNREACHABLE);
  heapSize = 0;
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
    heapPush(field, cell, 0);
  }
  const relax = (cell: number, cost: number): void => {
    const known = dist[cell] ?? UNREACHABLE;
    if (known !== UNREACHABLE && known <= cost) return;
    dist[cell] = cost;
    heapPush(field, cell, cost);
  };
  /** Cost of stepping into `cell`, or -1 when zombies cannot go there. */
  const stepCost = (cell: number): number => {
    const window = field.cellWindow[cell] ?? -1;
    if (window >= 0) return windowStepCost(windowPlanks[window] ?? 0);
    return isNavWalkable(map, grid, zonesUnlocked, cell) ? 1 : -1;
  };
  const step = (from: number, cell: number): void => {
    const c = stepCost(cell);
    if (c > 0) relax(cell, from + c);
  };
  while (heapSize > 0) {
    heapPop(field);
    const { cell, cost } = popped;
    if (cost > (dist[cell] ?? UNREACHABLE)) continue; // stale entry
    const x = cell % width;
    const y = (cell - x) / width;
    if (x > 0) step(cost, cell - 1);
    if (x < width - 1) step(cost, cell + 1);
    if (y > 0) step(cost, cell - width);
    if (y < height - 1) step(cost, cell + width);
    const portal = map.portals[map.cellPortal[cell] ?? -1];
    if (portal && portalsOpen[portal.link]) {
      for (const t of map.portals[portal.other]?.tiles ?? []) {
        const other = t.y * width + t.x;
        if (isNavWalkable(map, grid, zonesUnlocked, other)) relax(other, cost + 1);
      }
    }
  }
  field.age = 0;
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
 * The neighbouring cell (8 neighbours, no corner cutting) with the lowest
 * cost from (x, y), or -1 when the position is not on the field or already
 * on a source cell. It can be a window cell: the way goes through it.
 */
export function flowNextCell(field: FlowField, x: number, y: number): number {
  const { width, height, tileSize, dist } = field;
  const tx = Math.floor(x / tileSize);
  const ty = Math.floor(y / tileSize);
  if (tx < 0 || ty < 0 || tx >= width || ty >= height) return -1;
  const here = dist[ty * width + tx] ?? UNREACHABLE;
  if (here <= 0) return -1;

  let bestCell = -1;
  let best = here;
  for (let i = 0; i < NEIGHBOURS.length; i++) {
    const [dx, dy] = NEIGHBOURS[i] ?? [0, 0];
    const nx = tx + dx;
    const ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const d = dist[ny * width + nx] ?? UNREACHABLE;
    if (d === UNREACHABLE) continue;
    if (dx !== 0 && dy !== 0) {
      // No corner cutting: both orthogonal cells must be walkable (and not windows).
      const side1 = ty * width + nx;
      const side2 = ny * width + tx;
      if ((dist[side1] ?? UNREACHABLE) === UNREACHABLE || (field.cellWindow[side1] ?? -1) >= 0) continue;
      if ((dist[side2] ?? UNREACHABLE) === UNREACHABLE || (field.cellWindow[side2] ?? -1) >= 0) continue;
      if ((field.cellWindow[ny * width + nx] ?? -1) >= 0) continue;
    }
    // Strictly better only, so ties keep the first (orthogonal) choice.
    if (d < best) {
      best = d;
      bestCell = ny * width + nx;
    }
  }
  return bestCell;
}

/**
 * Writes into `out` the unit direction from (x, y) towards the centre of
 * the best neighbouring cell. Returns false when the position is not on
 * the field (unreachable) or already on a source cell.
 */
export function flowDirection(field: FlowField, x: number, y: number, out: { x: number; y: number }): boolean {
  const next = flowNextCell(field, x, y);
  if (next < 0) return false;
  const nx = next % field.width;
  const ny = (next - nx) / field.width;
  const cx = (nx + 0.5) * field.tileSize - x;
  const cy = (ny + 0.5) * field.tileSize - y;
  const len = Math.hypot(cx, cy) || 1;
  out.x = cx / len;
  out.y = cy / len;
  return true;
}
