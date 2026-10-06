/**
 * The floor plan generator (spec 09 §3.1): pure and seeded. From the run's
 * seed, the floor number and the template bank it gives the plan: which
 * cell is which room, how they connect and which template each one uses.
 * Nothing of Phaser, nothing of the match: the same inputs always give the
 * same plan, and what the player does never changes the next floor.
 */
import { DUNGEON, KEYED_ROOM_TYPES, floorConfig, floorDifficulties, type RoomDifficulty, type RoomType } from '../../config/dungeon';
import { random, type RngState } from '../../core/Rng';
import type { Cell, FloorPlan, Room, RoomDoor, Side } from '../../core/RunState';

/** A template of the bank (§3.2): its id, and its difficulty (null for the rooms that have none). */
export interface TemplateEntry {
  id: string;
  difficulty: RoomDifficulty | null;
}

/** The templates of one ambient, by room type. */
export type TemplateBank = Readonly<Record<RoomType, readonly TemplateEntry[]>>;

export const SIDES: readonly Side[] = ['n', 'e', 's', 'w'];
export const OPPOSITE: Readonly<Record<Side, Side>> = { n: 's', e: 'w', s: 'n', w: 'e' };
const STEP: Readonly<Record<Side, Cell>> = { n: { x: 0, y: -1 }, e: { x: 1, y: 0 }, s: { x: 0, y: 1 }, w: { x: -1, y: 0 } };

/** A floor's own seed: the match's RNG and the other floors never touch it (§3.1). */
export function subSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b9)) | 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) | 0;
}

export class FloorGenerationError extends Error {
  override name = 'FloorGenerationError';
}

/** The plan of `floor` for `seed`: drawn again while it fails its checks (§3.1 step 5). */
export function generateFloor(seed: number, floor: number, bank: TemplateBank): FloorPlan {
  const rng: RngState = { rng: subSeed(seed, floor) };
  for (let attempt = 0; attempt < DUNGEON.maxAttempts; attempt++) {
    const plan = tryGenerate(rng, floor, bank);
    if (plan) return plan;
  }
  throw new FloorGenerationError(`no sale un plano válido para la semilla ${seed}, planta ${floor}`);
}

interface Grid {
  width: number;
  height: number;
  /** Occupied cells, in the order they grew (the start first). */
  cells: Cell[];
  /** Index into `cells` per grid cell, -1 free. */
  at: Int16Array;
}

function inside(g: Grid, c: Cell): boolean {
  return c.x >= 0 && c.y >= 0 && c.x < g.width && c.y < g.height;
}

function index(g: Grid, c: Cell): number {
  return c.y * g.width + c.x;
}

function occupied(g: Grid, c: Cell): boolean {
  return inside(g, c) && g.at[index(g, c)] !== -1;
}

function neighbour(c: Cell, side: Side): Cell {
  return { x: c.x + STEP[side].x, y: c.y + STEP[side].y };
}

function occupiedNeighbours(g: Grid, c: Cell): number {
  let n = 0;
  for (const side of SIDES) if (occupied(g, neighbour(c, side))) n++;
  return n;
}

function shuffle<T>(rng: RngState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random(rng) * (i + 1));
    const a = list[i] as T;
    list[i] = list[j] as T;
    list[j] = a;
  }
  return list;
}

/**
 * Step 2: breadth-first growth from the middle. A cell grows into a free
 * neighbour that would touch no other room (so branches, never blocks),
 * while rooms are missing and a coin falls right. A cell that grows into
 * nothing is a dead end (step 3).
 */
function grow(rng: RngState, target: number): Grid | null {
  const { width, height } = DUNGEON.grid;
  const g: Grid = { width, height, cells: [], at: new Int16Array(width * height).fill(-1) };
  const occupy = (c: Cell): void => {
    g.at[index(g, c)] = g.cells.length;
    g.cells.push(c);
  };
  occupy({ x: Math.floor(width / 2), y: Math.floor(height / 2) });
  const queue = [0];
  while (queue.length > 0 && g.cells.length < target) {
    const from = g.cells[queue.shift() as number] as Cell;
    for (const side of SIDES) {
      const c = neighbour(from, side);
      if (!inside(g, c) || occupied(g, c)) continue;
      if (occupiedNeighbours(g, c) >= 2) continue;
      if (g.cells.length >= target) break;
      if (random(rng) >= DUNGEON.growChance) continue;
      occupy(c);
      queue.push(g.cells.length - 1);
    }
  }
  return g.cells.length === target ? g : null;
}

/** Rooms (edges) from the start to every cell, over the grown tree. */
function depths(g: Grid): number[] {
  const depth = new Array<number>(g.cells.length).fill(-1);
  depth[0] = 0;
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift() as number;
    for (const side of SIDES) {
      const c = neighbour(g.cells[i] as Cell, side);
      if (!occupied(g, c)) continue;
      const j = g.at[index(g, c)] as number;
      if (depth[j] !== -1) continue;
      depth[j] = (depth[i] as number) + 1;
      queue.push(j);
    }
  }
  return depth;
}

/**
 * The arena's 2×2 block around the boss's dead end (step 4): the other
 * three cells free and inside the grid. Of the blocks that fit, the one
 * touching the fewest other rooms (those sides are walled up).
 */
function arenaBlock(g: Grid, seed: Cell): Cell[] | null {
  const size = DUNGEON.arenaSize;
  let best: { cells: Cell[]; touching: number } | null = null;
  for (let dy = 1 - size; dy <= 0; dy++) {
    for (let dx = 1 - size; dx <= 0; dx++) {
      const cells: Cell[] = [];
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) cells.push({ x: seed.x + dx + x, y: seed.y + dy + y });
      if (!cells.every((c) => inside(g, c) && (occupied(g, c) ? c.x === seed.x && c.y === seed.y : true))) continue;
      const touching = cells.reduce((n, c) => n + (c.x === seed.x && c.y === seed.y ? 0 : occupiedNeighbours(g, c)), 0);
      if (!best || touching < best.touching) best = { cells, touching };
    }
  }
  return best?.cells ?? null;
}

function adjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/** A template of `type` for a room (step 6): unused ones first, of the drawn difficulty, then of any; a repeat only when every one was used. */
function pickTemplate(rng: RngState, bank: TemplateBank, type: RoomType, difficulty: RoomDifficulty | null, used: Set<string>): string {
  const all = bank[type];
  if (all.length === 0) return '';
  const fits = (t: TemplateEntry): boolean => difficulty === null || t.difficulty === null || t.difficulty === difficulty;
  const unused = all.filter((t) => !used.has(t.id));
  const pool = unused.filter(fits).length > 0 ? unused.filter(fits) : unused.length > 0 ? unused : all.filter(fits).length > 0 ? all.filter(fits) : all;
  const pick = pool[Math.floor(random(rng) * pool.length)] as TemplateEntry;
  used.add(pick.id);
  return pick.id;
}

function tryGenerate(rng: RngState, floor: number, bank: TemplateBank): FloorPlan | null {
  const config = floorConfig(floor);
  const challenge = random(rng) < DUNGEON.challengeChance;
  // Start, the enemy rooms, treasure, hand, maybe a challenge, and the boss's own cell (its arena grows from it).
  const target = 1 + config.enemyRooms + 2 + (challenge ? 1 : 0) + 1;
  const g = grow(rng, target);
  if (!g) return null;
  const depth = depths(g);
  const types = new Array<RoomType>(g.cells.length).fill('combat');
  types[0] = 'start';
  // Step 3: the cells that grew into nothing.
  const deadEnds = g.cells.map((_, i) => i).filter((i) => i !== 0 && occupiedNeighbours(g, g.cells[i] as Cell) === 1);
  // Step 4: the boss, in the farthest dead end with room for its arena.
  const byDistance = [...deadEnds].sort((a, b) => (depth[b] as number) - (depth[a] as number) || a - b);
  let arena: Cell[] | null = null;
  let bossIndex = -1;
  for (const i of byDistance) {
    arena = arenaBlock(g, g.cells[i] as Cell);
    if (arena) {
      bossIndex = i;
      break;
    }
  }
  if (!arena || bossIndex === -1) return null;
  const arenaCells: Cell[] = arena;
  types[bossIndex] = 'boss';
  // Step 5: the arena must not touch the start room.
  const start = g.cells[0] as Cell;
  if (arena.some((c) => adjacent(c, start))) return null;
  // Treasure, hand and challenge, in dead ends at random.
  const specials: RoomType[] = challenge ? ['treasure', 'hand', 'challenge'] : ['treasure', 'hand'];
  const free = shuffle(
    rng,
    deadEnds.filter((i) => i !== bossIndex),
  );
  if (free.length < specials.length) return null;
  specials.forEach((type, k) => (types[free[k] as number] = type));
  // The elite: the farthest enemy room left.
  let elite = -1;
  for (let i = 1; i < g.cells.length; i++) {
    if (types[i] !== 'combat') continue;
    if (elite === -1 || (depth[i] as number) > (depth[elite] as number)) elite = i;
  }
  if (elite === -1) return null;
  types[elite] = 'elite';
  // Step 5: the elite is reached without a key (a keyed room is never a way through).
  const reached = new Set<number>([0]);
  const queue = [0];
  while (queue.length > 0) {
    const i = queue.shift() as number;
    if (i !== 0 && KEYED_ROOM_TYPES.includes(types[i] as RoomType)) continue;
    for (const side of SIDES) {
      const c = neighbour(g.cells[i] as Cell, side);
      if (!occupied(g, c)) continue;
      const j = g.at[index(g, c)] as number;
      if (!reached.has(j)) {
        reached.add(j);
        queue.push(j);
      }
    }
  }
  if (!reached.has(elite)) return null;
  // Step 6: the rooms, with their doors and templates.
  const allowed = floorDifficulties(floor);
  const used = new Set<string>();
  const rooms: Room[] = g.cells.map((cell, i): Room => {
    const type = types[i] as RoomType;
    const cells = type === 'boss' ? arenaCells : [cell];
    const doors: RoomDoor[] = [];
    for (const side of SIDES) {
      const c = neighbour(cell, side);
      if (occupied(g, c)) doors.push({ side, cell, room: g.at[index(g, c)] as number });
    }
    const difficulty = type === 'combat' || type === 'elite' || type === 'challenge' ? (allowed[Math.floor(random(rng) * allowed.length)] as RoomDifficulty) : null;
    return { type, cells, template: pickTemplate(rng, bank, type, difficulty, used), difficulty, mirrored: random(rng) < DUNGEON.mirrorChance, doors, depth: depth[i] as number };
  });
  const cellRoom = new Array<number>(g.width * g.height).fill(-1);
  rooms.forEach((room, i) => room.cells.forEach((c) => (cellRoom[c.y * g.width + c.x] = i)));
  return { floor, ambient: config.ambient, width: g.width, height: g.height, rooms, start: 0, boss: bossIndex, cellRoom };
}

/** The room on the other side of a door, by the plan. */
export function roomAt(plan: FloorPlan, c: Cell): number {
  if (c.x < 0 || c.y < 0 || c.x >= plan.width || c.y >= plan.height) return -1;
  return plan.cellRoom[c.y * plan.width + c.x] ?? -1;
}

const LETTERS: Readonly<Record<RoomType, string>> = { start: 'S', combat: 'C', elite: 'E', treasure: 'T', hand: 'H', challenge: 'R', boss: 'B' };

/** The connector between two rooms, as the plan's text draws it: a key, the boss's key, a challenge, or plain. */
function connector(plan: FloorPlan, a: number, b: number, horizontal: boolean): string {
  const types = [plan.rooms[a]?.type, plan.rooms[b]?.type];
  if (types.includes('boss')) return 'K';
  if (types.includes('treasure')) return 'k';
  if (types.includes('challenge')) return '!';
  return horizontal ? '-' : '|';
}

/**
 * The plan as text (§3.4), one cell per room: `[S]` start, `[C]` combat,
 * `[E]` elite, `[T]` treasure, `[H]` hand, `[R]` challenge and `[B]` the
 * arena's four cells. Between rooms, `-` and `|`; `k` a key door, `K` the
 * boss's, `!` the challenge's; `=` and `:` inside the arena.
 */
export function planToText(plan: FloorPlan): string {
  const lines: string[] = [];
  for (let y = 0; y < plan.height; y++) {
    let row = '';
    let below = '';
    for (let x = 0; x < plan.width; x++) {
      const i = roomAt(plan, { x, y });
      const room = plan.rooms[i];
      row += room ? `[${LETTERS[room.type]}]` : ' . ';
      const east = roomAt(plan, { x: x + 1, y });
      const south = roomAt(plan, { x, y: y + 1 });
      const linked = (j: number, side: Side): boolean => room !== undefined && room.doors.some((d) => d.room === j && d.side === side && d.cell.x === x && d.cell.y === y);
      if (x < plan.width - 1) row += i !== -1 && i === east ? '=' : linked(east, 'e') ? connector(plan, i, east, true) : ' ';
      below += i !== -1 && i === south ? ' : ' : linked(south, 's') ? ` ${connector(plan, i, south, false)} ` : '   ';
      if (x < plan.width - 1) below += ' ';
    }
    lines.push(row.trimEnd());
    if (y < plan.height - 1) lines.push(below.trimEnd());
  }
  return lines.join('\n');
}
