/**
 * Room templates (spec 09 §3.2): hand-made plans of one room in the ASCII
 * format of maps/src/ (skill level-design), in maps/src/rooms/<ambient>/.
 * A template is 20×10 tiles (18×8 of floor inside its walls; the boss arena
 * 39×19, four cells with shared walls), with one door hole per side at a
 * fixed place, marked `o`. Under the plan, its tables: `## Sala` (type,
 * difficulty, ambient), `## Enemigos`, `## Magos`, `## Cofre`, `## Bosses`,
 * `## Mano` and `## Atrezo`, in the room's own coordinates.
 *
 * npm run rooms:build parses and checks them and writes them for the game,
 * which lays them on the floor plan (assembleFloor.ts). Pure: no files.
 */
import { DUNGEON, type Ambient, type RoomDifficulty, type RoomType } from '../../config/dungeon';
import type { Cell, Side } from '../../core/RunState';
import { readTables, type AsciiProp } from '../map/ascii/asciiMap';

export interface RoomTemplate {
  /** `<ambient>/<file>`, e.g. `mansion/combat_01`. */
  id: string;
  type: RoomType;
  difficulty: RoomDifficulty | null;
  ambient: Ambient;
  /** In plan cells: 1×1, or the arena's 2×2. */
  cellsX: number;
  cellsY: number;
  /** In tiles, walls included. */
  width: number;
  height: number;
  grid: string[];
  /** Where its enemies appear (§4), in tiles. */
  enemies: Cell[];
  merchants: Cell[];
  chests: Cell[];
  bossSpots: Cell[];
  hands: Cell[];
  /** The `P` of the start room. */
  player: Cell | null;
  props: AsciiProp[];
  mirrored: boolean;
}

/** One of a template's door holes: its side, the plan cell it belongs to (0,0 but in the arena) and its tiles. */
export interface DoorHole {
  side: Side;
  cell: Cell;
  tiles: Cell[];
}

export class RoomTemplateError extends Error {
  override name = 'RoomTemplateError';
  constructor(
    readonly id: string,
    readonly problems: string[],
  ) {
    super(`La plantilla ${id} tiene ${problems.length} error(es):\n  - ${problems.join('\n  - ')}`);
  }
}

const TYPES: readonly RoomType[] = ['start', 'combat', 'elite', 'treasure', 'hand', 'challenge', 'boss'];
const DIFFICULTIES: readonly RoomDifficulty[] = ['easy', 'medium', 'hard'];
const AMBIENTS: readonly Ambient[] = ['mansion', 'basement', 'garden'];
/** What a room's inside may hold: its floors, inner walls, and the start's player. */
const FLOORS = '.kbc';
const INSIDE = `${FLOORS}#P`;

/** Tiles between two rooms' origins, in each axis (their shared wall counts once). */
export const ROOM_PITCH = { x: DUNGEON.room.floor.width + 1, y: DUNGEON.room.floor.height + 1 } as const;

/** The size in tiles of a template spanning `cellsX`×`cellsY` plan cells, walls included. */
export function templateSize(cellsX: number, cellsY: number): { width: number; height: number } {
  return { width: cellsX * ROOM_PITCH.x + 1, height: cellsY * ROOM_PITCH.y + 1 };
}

/** How many plan cells a room of `type` spans. */
export function cellsOf(type: RoomType): { cellsX: number; cellsY: number } {
  const n = type === 'boss' ? DUNGEON.arenaSize : 1;
  return { cellsX: n, cellsY: n };
}

/**
 * The door holes of a template of `cellsX`×`cellsY` cells (§3.2): on the
 * outer wall of each cell, `doorSpan` tiles, in the middle of the north and
 * south walls and just under the middle of the west and east ones.
 */
export function doorHoles(cellsX: number, cellsY: number): DoorHole[] {
  const { floor, doorSpan } = DUNGEON.room;
  const { width, height } = templateSize(cellsX, cellsY);
  const holes: DoorHole[] = [];
  const dx0 = 1 + Math.floor((floor.width - doorSpan) / 2);
  const dy0 = 1 + Math.floor(floor.height / 2);
  for (let j = 0; j < cellsY; j++) {
    for (let i = 0; i < cellsX; i++) {
      const ox = i * ROOM_PITCH.x;
      const oy = j * ROOM_PITCH.y;
      const span = (n: number): number[] => Array.from({ length: doorSpan }, (_, k) => n + k);
      const cell = { x: i, y: j };
      if (j === 0) holes.push({ side: 'n', cell, tiles: span(ox + dx0).map((x) => ({ x, y: 0 })) });
      if (j === cellsY - 1) holes.push({ side: 's', cell, tiles: span(ox + dx0).map((x) => ({ x, y: height - 1 })) });
      if (i === 0) holes.push({ side: 'w', cell, tiles: span(oy + dy0).map((y) => ({ x: 0, y })) });
      if (i === cellsX - 1) holes.push({ side: 'e', cell, tiles: span(oy + dy0).map((y) => ({ x: width - 1, y })) });
    }
  }
  return holes;
}

/** The tile just inside a hole tile. */
export function inward(hole: DoorHole, tile: Cell): Cell {
  return hole.side === 'n' ? { x: tile.x, y: tile.y + 1 } : hole.side === 's' ? { x: tile.x, y: tile.y - 1 } : hole.side === 'w' ? { x: tile.x + 1, y: tile.y } : { x: tile.x - 1, y: tile.y };
}

function cellsOfText(text: string, problems: string[], what: string): Cell[] {
  const cells: Cell[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const m = /^(-?\d+),(-?\d+)$/.exec(token);
    if (m) cells.push({ x: Number(m[1]), y: Number(m[2]) });
    else problems.push(`${what}: casilla "${token}" no válida (formato x,y)`);
  }
  return cells;
}

function areaOf(text: string, problems: string[], what: string): Cell[] {
  const [a, b] = cellsOfText(text, problems, what);
  if (!a) return [];
  if (!b) return [a];
  const cells: Cell[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) cells.push({ x, y });
  return cells;
}

const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();
const yes = (v: string | undefined): boolean => ['si', 'yes', 'true', 'x'].includes(normalize(v ?? ''));

/** Reads a template's text; throws RoomTemplateError when it does not even parse (the checks come with validateRoomTemplate). */
export function parseRoomTemplate(text: string, id: string): RoomTemplate {
  const problems: string[] = [];
  const blank = text.search(/\n\s*\n/);
  const grid = (blank >= 0 ? text.slice(0, blank) : text).split('\n').map((r) => r.replace(/\r$/, ''));
  const tables = readTables(blank >= 0 ? text.slice(blank) : '');
  const rows = (key: string) => tables.get(key) ?? [];
  const sala = rows('sala')[0] ?? {};
  const type = normalize(sala.tipo ?? '') as RoomType;
  if (!TYPES.includes(type)) problems.push(`## Sala: tipo "${sala.tipo ?? ''}" desconocido (${TYPES.join(', ')})`);
  const rawDifficulty = normalize(sala.dificultad ?? '');
  const difficulty = rawDifficulty === '' || rawDifficulty === '—' || rawDifficulty === '-' ? null : (rawDifficulty as RoomDifficulty);
  if (difficulty !== null && !DIFFICULTIES.includes(difficulty)) problems.push(`## Sala: dificultad "${sala.dificultad ?? ''}" desconocida (easy, medium, hard)`);
  const ambient = normalize(sala.ambiente ?? '') as Ambient;
  if (!AMBIENTS.includes(ambient)) problems.push(`## Sala: ambiente "${sala.ambiente ?? ''}" desconocido (${AMBIENTS.join(', ')})`);
  const spots = (key: string, what: string): Cell[] => rows(key).flatMap((r) => cellsOfText(r.casilla ?? '', problems, `${what} ${r.id ?? ''}`).slice(0, 1));
  const props: AsciiProp[] = rows('atrezo').map((r) => {
    const flip = normalize(r.volteo ?? '');
    return { id: r.id ?? '', key: r.objeto ?? '', cells: areaOf(r.casillas ?? '', problems, `atrezo ${r.id ?? ''}`), collides: yes(r.colision), flipX: flip.includes('h'), flipY: flip.includes('v') };
  });
  let player: Cell | null = null;
  grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch !== 'P') return;
      if (player) problems.push(`hay más de una P (jugador) en el plano`);
      player = { x, y };
    }),
  );
  if (problems.length > 0) throw new RoomTemplateError(id, problems);
  const { cellsX, cellsY } = cellsOf(type);
  return {
    id,
    type,
    difficulty,
    ambient,
    cellsX,
    cellsY,
    width: Math.max(0, ...grid.map((r) => r.length)),
    height: grid.length,
    grid,
    enemies: spots('enemigos', 'enemigo'),
    merchants: spots('magos', 'mago'),
    chests: spots('cofre', 'cofre'),
    bossSpots: spots('bosses', 'boss'),
    hands: spots('mano', 'mano'),
    player,
    props,
    mirrored: false,
  };
}

/** The template flipped left to right (§3.1): the door holes stay where they are. */
export function mirrorTemplate(t: RoomTemplate): RoomTemplate {
  const flip = (c: Cell): Cell => ({ x: t.width - 1 - c.x, y: c.y });
  return {
    ...t,
    grid: t.grid.map((row) => [...row].reverse().join('')),
    enemies: t.enemies.map(flip),
    merchants: t.merchants.map(flip),
    chests: t.chests.map(flip),
    bossSpots: t.bossSpots.map(flip),
    hands: t.hands.map(flip),
    player: t.player ? flip(t.player) : null,
    props: t.props.map((p) => ({ ...p, cells: p.cells.map(flip), flipX: !p.flipX })),
    mirrored: !t.mirrored,
  };
}

const same = (a: Cell, b: Cell): boolean => a.x === b.x && a.y === b.y;

/**
 * The checks of spec 09 §3.2: the size and the walls with their holes, the
 * four holes joined by a passage two tiles wide, enemies four tiles or more
 * from every hole, nothing on a hole nor on the tile before it, a wizard
 * spot in every enemy room, a chest where a prize is given, and the arena
 * with a boss spot whose square is free and a floor its 2×2 body reaches
 * entirely. Empty when the template is right.
 */
export function validateRoomTemplate(t: RoomTemplate): string[] {
  const problems: string[] = [];
  const { width, height } = templateSize(t.cellsX, t.cellsY);
  if (t.width !== width || t.height !== height) {
    problems.push(`mide ${t.width}×${t.height} y una sala de tipo ${t.type} mide ${width}×${height} (paredes incluidas)`);
    return problems;
  }
  const at = (x: number, y: number): string => (x >= 0 && y >= 0 && x < t.width && y < t.height ? (t.grid[y]?.[x] ?? '_') : '_');
  const holes = doorHoles(t.cellsX, t.cellsY);
  const holeTiles = holes.flatMap((h) => h.tiles);
  const isHole = (x: number, y: number): boolean => holeTiles.some((c) => c.x === x && c.y === y);
  // The ring: walls, and the holes open.
  for (let y = 0; y < t.height; y++) {
    for (let x = 0; x < t.width; x++) {
      const border = x === 0 || y === 0 || x === t.width - 1 || y === t.height - 1;
      const ch = at(x, y);
      if (border) {
        if (isHole(x, y) && ch !== 'o') problems.push(`el hueco de puerta de ${x},${y} tiene "${ch}" y no "o"`);
        if (!isHole(x, y) && ch !== '#') problems.push(`la pared de ${x},${y} tiene "${ch}" y no "#"`);
      } else if (!INSIDE.includes(ch)) {
        problems.push(`"${ch}" en ${x},${y}: dentro solo hay suelo (${FLOORS}), paredes (#) y la P del inicio`);
      }
    }
  }
  if (t.player && t.type !== 'start') problems.push('solo la sala de inicio lleva la P del jugador');
  if (!t.player && t.type === 'start') problems.push('la sala de inicio necesita la P del jugador');
  // Furniture on floor, off the holes and the tiles before them; collision props are the obstacles.
  const solid = new Set<string>();
  const fronts = holes.flatMap((h) => h.tiles.map((c) => inward(h, c)));
  const keyOf = (c: Cell): string => `${c.x},${c.y}`;
  const taken = new Map<string, string>();
  for (const prop of t.props) {
    if (!/^prop_[a-z0-9_]+$/.test(prop.key)) problems.push(`atrezo ${prop.id}: el objeto "${prop.key}" debe llamarse prop_<nombre>`);
    for (const c of prop.cells) {
      if (!FLOORS.includes(at(c.x, c.y))) problems.push(`atrezo ${prop.id}: la casilla ${keyOf(c)} no es suelo`);
      if (fronts.some((f) => same(f, c))) problems.push(`atrezo ${prop.id}: la casilla ${keyOf(c)} está delante de un hueco de puerta`);
      if (taken.has(keyOf(c))) problems.push(`atrezo ${prop.id}: la casilla ${keyOf(c)} ya es de ${taken.get(keyOf(c))}`);
      taken.set(keyOf(c), prop.id);
      if (prop.collides) solid.add(keyOf(c));
    }
  }
  const free = (x: number, y: number): boolean => (FLOORS.includes(at(x, y)) || at(x, y) === 'P' || at(x, y) === 'o') && !solid.has(`${x},${y}`);
  // A body two tiles wide walks between 2×2 free blocks (top-left corners), one tile at a time.
  const block = (x: number, y: number): boolean => free(x, y) && free(x + 1, y) && free(x, y + 1) && free(x + 1, y + 1);
  const reached = new Set<string>();
  const start = holes[0] as DoorHole;
  const entry = inward(start, start.tiles[0] as Cell);
  const queue: Cell[] = [];
  const push = (c: Cell): void => {
    if (!block(c.x, c.y) || reached.has(keyOf(c))) return;
    reached.add(keyOf(c));
    queue.push(c);
  };
  push(entry);
  while (queue.length > 0) {
    const c = queue.shift() as Cell;
    push({ x: c.x + 1, y: c.y });
    push({ x: c.x - 1, y: c.y });
    push({ x: c.x, y: c.y + 1 });
    push({ x: c.x, y: c.y - 1 });
  }
  const covered = (x: number, y: number): boolean => reached.has(`${x},${y}`) || reached.has(`${x - 1},${y}`) || reached.has(`${x},${y - 1}`) || reached.has(`${x - 1},${y - 1}`);
  for (const h of holes) {
    const [a] = h.tiles as [Cell];
    const f = inward(h, a);
    if (!covered(f.x, f.y)) problems.push(`el hueco ${h.side.toUpperCase()} de la celda ${h.cell.x},${h.cell.y} no se une a los demás por un paso de 2 casillas`);
  }
  // Spots on free floor, each kind where its room needs it.
  const onFloor = (c: Cell, who: string, clearOfProps = true): void => {
    if (!FLOORS.includes(at(c.x, c.y))) problems.push(`${who} en ${keyOf(c)}: no es suelo`);
    else if (clearOfProps && solid.has(keyOf(c))) problems.push(`${who} en ${keyOf(c)}: bajo atrezo con colisión`);
  };
  const clear = DUNGEON.room.spawnClearTiles;
  for (const e of t.enemies) {
    onFloor(e, 'enemigo');
    for (const h of holeTiles) if (Math.hypot(h.x - e.x, h.y - e.y) < clear) problems.push(`enemigo en ${keyOf(e)}: a menos de ${clear} casillas del hueco ${keyOf(h)}`);
  }
  for (const m of t.merchants) onFloor(m, 'mago');
  for (const c of t.chests) onFloor(c, 'cofre');
  for (const h of t.hands) onFloor(h, 'mano');
  const enemyRoom = t.type === 'combat' || t.type === 'elite' || t.type === 'challenge';
  if (enemyRoom && t.enemies.length < 2) problems.push('una sala con enemigos necesita al menos 2 puntos de aparición');
  if (enemyRoom && t.merchants.length === 0) problems.push('una sala con enemigos necesita un punto de mago');
  if (!enemyRoom && t.enemies.length > 0) problems.push('solo las salas de combate, élite y reto tienen enemigos');
  if ((t.type === 'treasure' || t.type === 'challenge' || t.type === 'boss') && t.chests.length === 0) problems.push(`una sala de tipo ${t.type} necesita su punto de cofre`);
  if (t.type === 'hand' && t.hands.length === 0) problems.push('la sala de la mano necesita su punto de mano');
  if (t.type === 'boss') {
    if (t.bossSpots.length === 0) problems.push('la arena necesita un punto de boss');
    for (const s of t.bossSpots) {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!FLOORS.includes(at(s.x + dx, s.y + dy))) problems.push(`boss en ${keyOf(s)}: la casilla ${s.x + dx},${s.y + dy} de su cuadrado 3×3 no es suelo`);
    }
    // Its 2×2 body reaches the whole floor.
    for (let y = 1; y < t.height - 1; y++) for (let x = 1; x < t.width - 1; x++) if (free(x, y) && at(x, y) !== 'o' && !covered(x, y)) problems.push(`el boss no llega a la casilla ${x},${y}`);
  }
  if (t.type !== 'boss' && t.bossSpots.length > 0) problems.push('solo la arena tiene puntos de boss');
  return problems;
}
