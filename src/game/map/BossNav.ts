import { NAVIGATION } from '../../config/balance';
import type { GameState } from '../../core/GameState';
import { TILE_COLLIDES, TILE_VOID, TILE_WATER, type MapData } from './MapLoader';

/**
 * A boss's own way round the map (spec 07 §2): it walks on the positions
 * where its square footprint (`side` tiles) fits, so it goes through the
 * mansion's 2-tile doors and passes but never a 1-tile gap. Furniture does
 * not stop it (it crushes it); walls, water, the void, windows, closed
 * doors, locked rooms, weapon cases, stairs and hatches, the Demon's Hand's
 * hole and the merchants do. A position is the top-left cell of the
 * footprint; its centre is the footprint's centre.
 *
 * A breadth-first search from the positions next to its target (the
 * footprint within a tile of the target's cell) stores the steps to get
 * there; the boss steps to the neighbouring position with fewer, never
 * cutting a corner. Recomputed at the flow field's pace
 * (NAVIGATION.flowFieldInterval) or as soon as the target changes cell.
 * Pure data: a server can run it.
 */
export const BOSS_UNREACHABLE = -1;

export interface BossNav {
  width: number;
  height: number;
  tileSize: number;
  /** Footprint side, in tiles. */
  side: number;
  /** Cells no footprint ever covers (walls, water, void, no floor, windows, weapon cases, portals). */
  solid: Uint8Array;
  /** solid plus what changes during the match: closed doors, locked zones, the hand's hole, merchants. */
  blocked: Uint8Array;
  /** Furniture with collision per cell (index into MapData.props), -1 none: what the footprint crushes. */
  propAt: Int16Array;
  /** Steps to the target per position (its top-left cell), or BOSS_UNREACHABLE. */
  dist: Int32Array;
  queue: Int32Array;
  /** Target cell of the last computation (-1 none) and seconds since it. */
  targetCell: number;
  age: number;
}

export function createBossNav(map: MapData, side: number): BossNav {
  const n = map.width * map.height;
  const solid = new Uint8Array(n);
  const flagsOf = (gid: number): number => (gid > 0 ? (map.gidFlags[gid] ?? 0) : 0);
  for (let i = 0; i < n; i++) {
    const flags = flagsOf(map.walls[i] ?? 0) | flagsOf(map.floor[i] ?? 0) | flagsOf(map.decor[i] ?? 0);
    if ((flagsOf(map.walls[i] ?? 0) & TILE_COLLIDES) !== 0 || (flags & (TILE_WATER | TILE_VOID)) !== 0 || (map.floor[i] ?? 0) === 0) solid[i] = 1;
  }
  const mark = (x: number, y: number): void => {
    if (x >= 0 && y >= 0 && x < map.width && y < map.height) solid[y * map.width + x] = 1;
  };
  for (const w of map.windows) mark(w.tileX, w.tileY);
  for (const c of map.weaponCases) mark(c.tileX, c.tileY);
  for (const p of map.portals) for (const t of p.tiles) mark(t.x, t.y);
  const propAt = new Int16Array(n).fill(-1);
  map.props.forEach((prop, index) => {
    if (!prop.collides) return;
    for (const t of prop.tiles) if (t.x >= 0 && t.y >= 0 && t.x < map.width && t.y < map.height) propAt[t.y * map.width + t.x] = index;
  });
  return {
    width: map.width,
    height: map.height,
    tileSize: map.tileSize,
    side,
    solid,
    blocked: new Uint8Array(n),
    propAt,
    dist: new Int32Array(n).fill(BOSS_UNREACHABLE),
    queue: new Int32Array(n),
    targetCell: -1,
    age: Infinity,
  };
}

/** Rebuilds `blocked` from the match: closed doors, locked zones, the hand's hole and the merchants standing on the map. */
export function updateBossBlocking(nav: BossNav, map: MapData, state: GameState): void {
  const { blocked, solid, width } = nav;
  for (let i = 0; i < blocked.length; i++) {
    const zone = map.cellZone[i] ?? -1;
    blocked[i] = solid[i] || (zone >= 0 && !state.zonesUnlocked[zone]) ? 1 : 0;
  }
  map.doors.forEach((door, i) => {
    if (state.doorsOpen[i]) return;
    for (const t of door.tiles) blocked[t.y * width + t.x] = 1;
  });
  const cellAt = (x: number, y: number): number => Math.floor(y / map.tileSize) * width + Math.floor(x / map.tileSize);
  const hole = map.handSpots[state.hand.spot];
  if (hole) blocked[cellAt(hole.x, hole.y)] = 1;
  for (const m of state.merchants) if (m.active) blocked[cellAt(m.x, m.y)] = 1;
}

/** True when the footprint whose top-left cell is (tx, ty) covers no blocked cell. */
export function footprintFits(nav: BossNav, tx: number, ty: number): boolean {
  const { side, width, height, blocked } = nav;
  if (tx < 0 || ty < 0 || tx + side > width || ty + side > height) return false;
  for (let y = ty; y < ty + side; y++) for (let x = tx; x < tx + side; x++) if (blocked[y * width + x]) return false;
  return true;
}

/** Centre (world px) of the footprint whose top-left cell is `pos`. */
export function positionCentre(nav: BossNav, pos: number, out: { x: number; y: number }): { x: number; y: number } {
  const tx = pos % nav.width;
  const ty = (pos - tx) / nav.width;
  out.x = (tx + nav.side / 2) * nav.tileSize;
  out.y = (ty + nav.side / 2) * nav.tileSize;
  return out;
}

/**
 * Recomputes the steps to the target at (x, y) from every position, from
 * the positions whose footprint lies within a tile of the target's cell.
 */
export function computeBossNav(nav: BossNav, targetX: number, targetY: number): void {
  const { width, height, dist, queue, side, tileSize } = nav;
  dist.fill(BOSS_UNREACHABLE);
  const ptx = Math.floor(targetX / tileSize);
  const pty = Math.floor(targetY / tileSize);
  nav.targetCell = ptx >= 0 && pty >= 0 && ptx < width && pty < height ? pty * width + ptx : -1;
  nav.age = 0;
  if (nav.targetCell < 0) return;
  let head = 0;
  let tail = 0;
  for (let ty = pty - side; ty <= pty + 1; ty++) {
    for (let tx = ptx - side; tx <= ptx + 1; tx++) {
      if (!footprintFits(nav, tx, ty)) continue;
      const pos = ty * width + tx;
      dist[pos] = 0;
      queue[tail++] = pos;
    }
  }
  while (head < tail) {
    const pos = queue[head++] ?? 0;
    const tx = pos % width;
    const ty = (pos - tx) / width;
    const next = (dist[pos] ?? 0) + 1;
    for (let k = 0; k < 4; k++) {
      const nx = tx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = ty + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const npos = ny * width + nx;
      if (dist[npos] !== BOSS_UNREACHABLE || !footprintFits(nav, nx, ny)) continue;
      dist[npos] = next;
      queue[tail++] = npos;
    }
  }
}

/**
 * Recomputes (blocking cells first) when the target moved to another cell
 * or NAVIGATION.flowFieldInterval has gone by.
 */
export function refreshBossNav(nav: BossNav, map: MapData, state: GameState, targetX: number, targetY: number, dt: number): void {
  nav.age += dt;
  const cell = Math.floor(targetY / nav.tileSize) * nav.width + Math.floor(targetX / nav.tileSize);
  if (nav.age < NAVIGATION.flowFieldInterval && cell === nav.targetCell) return;
  updateBossBlocking(nav, map, state);
  computeBossNav(nav, targetX, targetY);
}

/**
 * The position the boss centred at (x, y) stands on: of the aligned
 * positions around it, the one with the fewest steps to the target (-1 when
 * none reaches it).
 */
export function bossPosition(nav: BossNav, x: number, y: number): number {
  const { width, tileSize, side, dist } = nav;
  const fx = x / tileSize - side / 2;
  const fy = y / tileSize - side / 2;
  let best = -1;
  let bestDist = Infinity;
  for (const tx of [Math.floor(fx), Math.ceil(fx)]) {
    for (const ty of [Math.floor(fy), Math.ceil(fy)]) {
      if (tx < 0 || ty < 0 || tx >= width || ty >= nav.height) continue;
      const d = dist[ty * width + tx] ?? BOSS_UNREACHABLE;
      if (d !== BOSS_UNREACHABLE && d < bestDist) {
        bestDist = d;
        best = ty * width + tx;
      }
    }
  }
  return best;
}

/** Steps to the target from where the boss centred at (x, y) stands, or BOSS_UNREACHABLE. */
export function bossStepsAt(nav: BossNav, x: number, y: number): number {
  const pos = bossPosition(nav, x, y);
  return pos < 0 ? BOSS_UNREACHABLE : (nav.dist[pos] ?? BOSS_UNREACHABLE);
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
 * The next position for the boss centred at (x, y): the neighbour of the
 * one it stands on with the fewest steps (diagonals only when both sides
 * are reachable too), or the one it stands on until its centre gets there.
 * -1 when the target is out of reach; the position itself when it is
 * already next to the target.
 */
export function bossNextPosition(nav: BossNav, x: number, y: number): number {
  const { width, height, dist } = nav;
  const here = bossPosition(nav, x, y);
  if (here < 0) return -1;
  const hx = here % width;
  const hy = (here - hx) / width;
  let best = here;
  let bestDist = dist[here] ?? 0;
  for (const [dx, dy] of NEIGHBOURS) {
    const nx = hx + dx;
    const ny = hy + dy;
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
    const d = dist[ny * width + nx] ?? BOSS_UNREACHABLE;
    if (d === BOSS_UNREACHABLE || d >= bestDist) continue;
    if (dx !== 0 && dy !== 0 && ((dist[hy * width + nx] ?? BOSS_UNREACHABLE) === BOSS_UNREACHABLE || (dist[ny * width + hx] ?? BOSS_UNREACHABLE) === BOSS_UNREACHABLE)) continue;
    best = ny * width + nx;
    bestDist = d;
  }
  return best;
}

/** True when the box of half-size `half` centred at (x, y) overlaps a blocked cell (outside the map counts). */
export function boxBlocked(nav: BossNav, x: number, y: number, half: number): boolean {
  const ts = nav.tileSize;
  const x0 = Math.floor((x - half) / ts);
  const x1 = Math.floor((x + half - 1e-6) / ts);
  const y0 = Math.floor((y - half) / ts);
  const y1 = Math.floor((y + half - 1e-6) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= nav.width || ty >= nav.height) return true;
      if (nav.blocked[ty * nav.width + tx]) return true;
    }
  }
  return false;
}

/**
 * Moves the boss's box (half-size `half`) by (dx, dy), one axis at a time
 * and in sub-steps of at most `maxStep` px, sliding along what blocks it.
 * Returns true when something stopped it.
 */
export function moveBossBox(nav: BossNav, pos: { x: number; y: number }, dx: number, dy: number, half: number, maxStep: number): boolean {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  const sx = dx / steps;
  const sy = dy / steps;
  const ts = nav.tileSize;
  let hit = false;
  for (let i = 0; i < steps; i++) {
    if (sx !== 0) {
      pos.x += sx;
      if (boxBlocked(nav, pos.x, pos.y, half)) {
        // Back against the edge of the cell it ran into.
        pos.x = sx > 0 ? Math.floor((pos.x + half - 1e-6) / ts) * ts - half - 1e-3 : (Math.floor((pos.x - half) / ts) + 1) * ts + half + 1e-3;
        hit = true;
      }
    }
    if (sy !== 0) {
      pos.y += sy;
      if (boxBlocked(nav, pos.x, pos.y, half)) {
        pos.y = sy > 0 ? Math.floor((pos.y + half - 1e-6) / ts) * ts - half - 1e-3 : (Math.floor((pos.y - half) / ts) + 1) * ts + half + 1e-3;
        hit = true;
      }
    }
  }
  return hit;
}
