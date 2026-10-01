/**
 * ASCII map sources (skill level-design): maps/src/<map>.txt holds the plan,
 * one character per tile, followed by Markdown tables with the ids and
 * properties of the zones, doors, barricades, portals, open spawns, merchant
 * spots and the player. compileAsciiMap turns it into a Tiled map (.tmj) with external
 * tilesets, ready for `map:build` to embed and validate.
 *
 * Legend (skill §6):
 *   #  interior wall      H  exterior wall      F  fence
 *   .  wood floor         k  kitchen linoleum   b  bathroom   c  concrete
 *   g  grass              p  patio              d  dirt       a  asphalt   s  sidewalk
 *   w  pool water         e  pool deck          r  roof       _  void
 *   W  barricade          D  paid door          o  open gap   <  portal
 *   P  player spawn       Z  open zombie spawn
 */
import { createHash } from 'node:crypto';
import { BARRICADES } from '../../src/config/balance';
import type { PortalKind } from '../../src/game/map/MapLoader';
import type { TiledObject, TiledProperty, TiledSourceMap, TiledTileLayer } from '../../src/game/map/tiled';
import { DECALS, SHADOW, floorVariants, placeDecals, shadowTile } from './decorate';
import { PLAIN_TERRAIN, terrainTile, terrainVertices } from './terrain';
import type { Tsj } from './tiled-tileset';
import { ARM_BASE, E, FACE_BASE, FACE_SOLID, N, S, SOLID_BASE, SOLID_NORTH_OPEN, SOLID_SOUTH_OPEN, W as WEST, hasFace, solidCells, wallMask } from './wall-autotile';

const TILE = 32;

export const LEGEND = '#HF.kbcgpdsawer_WDo<PZ';
const WALLS = '#HF';
/** Cells that close a zone: walls, fences, paid doors, barricades and void. */
const ZONE_BARRIERS = '#HFDW_';
const MARKERS = 'WDo<PZ';
const INDOOR = '.kbcr';

/** Tilesets in GID order, as written in the .tmj. */
export const TILESET_ORDER = [
  'tileset_street',
  'tileset_pool',
  'tileset_garden',
  'floors_interior',
  'kit_interior',
  'kit_exterior',
  'kit_basement',
  'kit_fence',
  'decals_asphalt',
  'decals_grass',
  'map_special',
  'decals_interior',
  'map_shadows',
  'floor_halves',
] as const;
export type TilesetName = (typeof TILESET_ORDER)[number];
export type Kit = 'kit_interior' | 'kit_exterior' | 'kit_basement' | 'kit_fence';

/** Rows of floors_interior (4 variants each) per indoor character. */
const FLOOR_ROW: Record<string, number> = { '.': 0, k: 1, b: 2, c: 3, r: 3 };
/**
 * Variants of each floors_interior row (docs/ASSETS.md §7.4): the clean one
 * covers about 70 % of the floor and the stained ones are sprinkled, never
 * two equal together. The scratched ones (dark and reddish wood, the other
 * bathroom tiling) repeat their mark on every tile and are not used.
 */
export const FLOOR_VARIANTS: Readonly<Record<string, { clean: number; stained: readonly number[] }>> = {
  '.': { clean: 1, stained: [2] },
  k: { clean: 2, stained: [0, 1, 3] },
  b: { clean: 0, stained: [2, 3] },
  c: { clean: 2, stained: [0, 1, 3] },
  r: { clean: 2, stained: [0, 1, 3] },
};
const SPECIAL = { void: 0, ground: 1, dirt: 2 } as const;
/** floors_interior holds each tile 4 times: as it is and flipped horizontally, vertically and both. */
const FLOOR_FLIPS = 4;

export interface Cell {
  x: number;
  y: number;
}

export interface AsciiZone {
  id: string;
  name: string;
  startsUnlocked: boolean;
  interior: boolean;
  openSpawns: boolean;
  seed: Cell;
  /** Wall kit for the zone's walls instead of interior / exterior. */
  wallKit?: Kit;
}

export interface AsciiDoor {
  id: string;
  cells: Cell[];
  from: string;
  to: string;
  cost: number;
}

export interface AsciiWindow {
  id: string;
  cell: Cell;
  zone: string;
  kind: 'window' | 'fence';
}

export interface AsciiPortal {
  id: string;
  cells: Cell[];
  zone: string;
  pair: string;
  cost: number;
  secondary: boolean;
  kind: PortalKind;
}

export interface AsciiOpenSpawn {
  id: string;
  cell: Cell;
  zone: string;
}

/** Where a merchant can stand (table "Magos", spec 03 §1). Only in the table: the cell keeps its floor. */
export interface AsciiMerchantSpot {
  id: string;
  cell: Cell;
  zone: string;
}

/** A piece of furniture or clutter (table "Atrezo"): a manifest object over whole tiles. */
export interface AsciiProp {
  id: string;
  key: string;
  cells: Cell[];
  collides: boolean;
  flipX: boolean;
  flipY: boolean;
}

export interface AsciiMap {
  grid: string[];
  width: number;
  height: number;
  zones: AsciiZone[];
  doors: AsciiDoor[];
  windows: AsciiWindow[];
  portals: AsciiPortal[];
  openSpawns: AsciiOpenSpawn[];
  merchantSpots: AsciiMerchantSpot[];
  props: AsciiProp[];
  player: Cell;
}

export class AsciiMapError extends Error {
  override name = 'AsciiMapError';
  constructor(readonly problems: string[]) {
    super(`El plano tiene ${problems.length} error(es):\n  - ${problems.join('\n  - ')}`);
  }
}

// ----------------------------------------------------------------------------- parsing

const normalize = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase();

type Row = Record<string, string>;

/** Markdown tables under `## …` headings, keyed by a word of the heading. */
function readTables(text: string): Map<string, Row[]> {
  const tables = new Map<string, Row[]>();
  let section = '';
  let header: string[] | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      section = normalize(line.slice(3));
      header = null;
      continue;
    }
    if (!line.startsWith('|') || !section) continue;
    const cells = line
      .slice(1, line.endsWith('|') ? -1 : undefined)
      .split('|')
      .map((c) => c.trim());
    if (cells.every((c) => /^:?-+:?$/.test(c))) continue;
    if (!header) {
      header = cells.map(normalize);
      continue;
    }
    const row: Row = {};
    header.forEach((h, i) => (row[h] = cells[i] ?? ''));
    const key = ['zonas', 'puertas', 'barricadas', 'portales', 'spawns', 'magos', 'jugador', 'atrezo'].find((k) => section.startsWith(k)) ?? section;
    tables.set(key, [...(tables.get(key) ?? []), row]);
  }
  return tables;
}

function parseCells(text: string, problems: string[], what: string): Cell[] {
  const cells: Cell[] = [];
  for (const token of text.split(/\s+/).filter(Boolean)) {
    const m = /^(\d+),(\d+)$/.exec(token);
    if (m) cells.push({ x: Number(m[1]), y: Number(m[2]) });
    else problems.push(`${what}: casilla "${token}" no válida (formato x,y)`);
  }
  return cells;
}


/** "x0,y0 x1,y1" is a rectangle (corners included); a single "x,y" is one tile. */
function parseArea(text: string, problems: string[], what: string): Cell[] {
  const corners = parseCells(text, problems, what);
  const [a, b] = corners;
  if (!a) return [];
  if (!b) return [a];
  const cells: Cell[] = [];
  for (let y = Math.min(a.y, b.y); y <= Math.max(a.y, b.y); y++) {
    for (let x = Math.min(a.x, b.x); x <= Math.max(a.x, b.x); x++) cells.push({ x, y });
  }
  return cells;
}

const yes = (v: string | undefined): boolean => ['si', 'yes', 'true', 'x'].includes(normalize(v ?? ''));

const PORTAL_KIND: Record<string, PortalKind> = { escalera: 'stairs', 'escalera de mano': 'ladder', trampilla: 'hatch' };
const WALL_KIT: Record<string, Kit> = { sotano: 'kit_basement', interior: 'kit_interior', exterior: 'kit_exterior', valla: 'kit_fence' };

export function parseAsciiMap(text: string): AsciiMap {
  const problems: string[] = [];
  const blank = text.search(/\n\s*\n/);
  const grid = (blank >= 0 ? text.slice(0, blank) : text).split('\n').map((r) => r.replace(/\r$/, ''));
  const height = grid.length;
  const width = Math.max(0, ...grid.map((r) => r.length));
  grid.forEach((row, y) => {
    if (row.length !== width) problems.push(`la fila ${y} mide ${row.length} y no ${width}`);
    [...row].forEach((ch, x) => {
      if (!LEGEND.includes(ch)) problems.push(`carácter "${ch}" fuera de la leyenda en ${x},${y}`);
    });
  });
  const tables = readTables(blank >= 0 ? text.slice(blank) : '');
  const rows = (key: string): Row[] => tables.get(key) ?? [];

  const zones: AsciiZone[] = rows('zonas').map((r) => {
    const seed = parseCells(r.semilla ?? '', problems, `zona ${r.id}`)[0] ?? { x: -1, y: -1 };
    const kit = WALL_KIT[normalize(r.paredes ?? '')];
    return {
      id: r.id ?? '',
      name: r.nombre ?? r.id ?? '',
      startsUnlocked: yes(r.inicial),
      interior: yes(r.interior),
      openSpawns: yes(r['spawns abiertos']),
      seed,
      ...(kit ? { wallKit: kit } : {}),
    };
  });
  const doors: AsciiDoor[] = rows('puertas').map((r) => ({
    id: r.id ?? '',
    cells: parseCells(r.casillas ?? '', problems, `puerta ${r.id}`),
    from: r.de ?? '',
    to: r.a ?? '',
    cost: Number(r.coste),
  }));
  const windows: AsciiWindow[] = rows('barricadas').map((r) => ({
    id: r.id ?? '',
    cell: parseCells(r.casilla ?? '', problems, `barricada ${r.id}`)[0] ?? { x: -1, y: -1 },
    zone: r.zona ?? '',
    kind: normalize(r.tipo ?? '') === 'valla' ? 'fence' : 'window',
  }));
  const portals: AsciiPortal[] = rows('portales').map((r) => {
    const kind = PORTAL_KIND[normalize(r.tipo ?? '')];
    if (!kind) problems.push(`portal ${r.id}: tipo "${r.tipo}" desconocido (escalera, escalera de mano, trampilla)`);
    return {
      id: r.id ?? '',
      cells: parseCells(r.casillas ?? '', problems, `portal ${r.id}`),
      zone: r.zona ?? '',
      pair: r.par ?? '',
      cost: Number(r.coste),
      secondary: yes(r.secundario),
      kind: kind ?? 'stairs',
    };
  });
  const openSpawns: AsciiOpenSpawn[] = rows('spawns').map((r) => ({
    id: r.id ?? '',
    cell: parseCells(r.casilla ?? '', problems, `spawn ${r.id}`)[0] ?? { x: -1, y: -1 },
    zone: r.zona ?? '',
  }));
  const merchantSpots: AsciiMerchantSpot[] = rows('magos').map((r) => ({
    id: r.id ?? '',
    cell: parseCells(r.casilla ?? '', problems, `mago ${r.id}`)[0] ?? { x: -1, y: -1 },
    zone: r.zona ?? '',
  }));
  const player = parseCells(rows('jugador')[0]?.casilla ?? '', problems, 'jugador')[0] ?? { x: -1, y: -1 };
  const props: AsciiProp[] = rows('atrezo').map((r) => {
    const flip = normalize(r.volteo ?? '');
    return {
      id: r.id ?? '',
      key: r.objeto ?? '',
      cells: parseArea(r.casillas ?? '', problems, `atrezo ${r.id}`),
      collides: yes(r.colision),
      flipX: flip.includes('h'),
      flipY: flip.includes('v'),
    };
  });

  const map: AsciiMap = { grid, width, height, zones, doors, windows, portals, openSpawns, merchantSpots, props, player };
  checkMarkers(map, problems);
  checkProps(map, problems);
  checkMerchantSpots(map, problems);
  if (problems.length > 0) throw new AsciiMapError(problems);
  return map;
}

/** Every marker in the plan has exactly one table entry, and the other way round. */
function checkMarkers(map: AsciiMap, problems: string[]): void {
  const listed = new Map<string, string>();
  const claim = (c: Cell, ch: string, who: string): void => {
    const key = `${c.x},${c.y}`;
    const actual = map.grid[c.y]?.[c.x];
    if (actual !== ch) problems.push(`${who}: en ${key} el plano tiene "${actual ?? '(fuera)'}" y no "${ch}"`);
    if (listed.has(key)) problems.push(`${who}: la casilla ${key} ya es de ${listed.get(key)}`);
    listed.set(key, who);
  };
  for (const d of map.doors) d.cells.forEach((c) => claim(c, 'D', `puerta ${d.id}`));
  for (const w of map.windows) claim(w.cell, 'W', `barricada ${w.id}`);
  for (const p of map.portals) p.cells.forEach((c) => claim(c, '<', `portal ${p.id}`));
  for (const s of map.openSpawns) claim(s.cell, 'Z', `spawn ${s.id}`);
  claim(map.player, 'P', 'jugador');
  map.grid.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if ('DW<ZP'.includes(ch) && !listed.has(`${x},${y}`)) problems.push(`"${ch}" en ${x},${y} no está en ninguna tabla`);
    }),
  );
}

/**
 * Props stand on floor, never on walls, gameplay markers, water or void, and
 * never on each other. A key always has the same footprint: it names one
 * sprite (a 3-tile hedge and a 4-tile hedge are different art).
 */
function checkProps(map: AsciiMap, problems: string[]): void {
  const taken = new Map<string, string>();
  const sizes = new Map<string, string>();
  for (const prop of map.props) {
    const xs = prop.cells.map((c) => c.x);
    const ys = prop.cells.map((c) => c.y);
    const size = `${Math.max(...xs) - Math.min(...xs) + 1}×${Math.max(...ys) - Math.min(...ys) + 1}`;
    const known = sizes.get(prop.key);
    if (known && known !== size) problems.push(`atrezo ${prop.id}: ${prop.key} mide ${size} y en otro sitio ${known}; usa otra clave para cada tamaño`);
    sizes.set(prop.key, known ?? size);
    if (!/^prop_[a-z0-9_]+$/.test(prop.key)) problems.push(`atrezo ${prop.id}: el objeto "${prop.key}" debe llamarse prop_<nombre> (snake_case)`);
    if (prop.cells.length === 0) problems.push(`atrezo ${prop.id}: sin casillas`);
    for (const c of prop.cells) {
      const ch = map.grid[c.y]?.[c.x] ?? '_';
      if ('#HFWD<PZ_w'.includes(ch)) problems.push(`atrezo ${prop.id}: la casilla ${c.x},${c.y} es "${ch}"; el atrezo va sobre suelo`);
      const key = `${c.x},${c.y}`;
      if (taken.has(key)) problems.push(`atrezo ${prop.id}: la casilla ${key} ya es de ${taken.get(key)}`);
      taken.set(key, prop.id);
    }
  }
}

/**
 * Merchant spots stand on plain floor: not on walls, markers, water or void,
 * and not under furniture with collision. The design rules (against a wall,
 * clear of passages) are checked on the built map (validate-map.ts).
 */
function checkMerchantSpots(map: AsciiMap, problems: string[]): void {
  const solid = new Set(map.props.filter((p) => p.collides).flatMap((p) => p.cells.map((c) => `${c.x},${c.y}`)));
  const ids = new Set<string>();
  for (const spot of map.merchantSpots) {
    const who = `mago ${spot.id}`;
    if (ids.has(spot.id)) problems.push(`${who}: id repetido`);
    ids.add(spot.id);
    const ch = map.grid[spot.cell.y]?.[spot.cell.x] ?? '_';
    if ('#HFWDo<PZ_w'.includes(ch)) problems.push(`${who}: la casilla ${spot.cell.x},${spot.cell.y} es "${ch}"; el mago va sobre suelo`);
    if (solid.has(`${spot.cell.x},${spot.cell.y}`)) problems.push(`${who}: la casilla ${spot.cell.x},${spot.cell.y} está bajo atrezo con colisión`);
  }
}

// ----------------------------------------------------------------------------- zones

export interface Regions {
  /** Region index per cell (row-major), -1 on barriers. */
  region: Int32Array;
  /** Zone index per region, -1 for regions without a seed (fenced-off land). */
  regionZone: number[];
  /** Zone index per cell, -1 outside every zone. */
  cellZone: Int32Array;
}

/** Flood fill between walls, fences, paid doors, barricades and void; seeds name the regions. */
export function computeRegions(map: AsciiMap): Regions {
  const { width, height, grid } = map;
  const region = new Int32Array(width * height).fill(-1);
  const regionZone: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < region.length; start++) {
    const ch = grid[Math.floor(start / width)]?.[start % width] ?? '_';
    if (ZONE_BARRIERS.includes(ch) || region[start] !== -1) continue;
    const id = regionZone.length;
    regionZone.push(-1);
    region[start] = id;
    stack.push(start);
    while (stack.length > 0) {
      const cell = stack.pop() ?? 0;
      const x = cell % width;
      const y = (cell - x) / width;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const n = ny * width + nx;
        if (region[n] !== -1 || ZONE_BARRIERS.includes(grid[ny]?.[nx] ?? '_')) continue;
        region[n] = id;
        stack.push(n);
      }
    }
  }
  const problems: string[] = [];
  map.zones.forEach((zone, i) => {
    const r = region[zone.seed.y * width + zone.seed.x] ?? -1;
    if (zone.seed.x < 0 || zone.seed.y < 0 || zone.seed.x >= width || zone.seed.y >= height || r < 0) {
      problems.push(`la semilla de la zona ${zone.id} (${zone.seed.x},${zone.seed.y}) no cae en suelo`);
      return;
    }
    const taken = regionZone[r] ?? -1;
    if (taken >= 0) problems.push(`las zonas ${map.zones[taken]?.id} y ${zone.id} son la misma región: falta una pared o una puerta`);
    else regionZone[r] = i;
  });
  if (problems.length > 0) throw new AsciiMapError(problems);
  const cellZone = new Int32Array(region.length).fill(-1);
  region.forEach((r, i) => (cellZone[i] = r >= 0 ? (regionZone[r] ?? -1) : -1));
  return { region, regionZone, cellZone };
}

/** Covers the cells of zone `zone` with rectangles, greedily (rows first, then down). */
export function zoneRects(map: AsciiMap, cellZone: Int32Array, zone: number): { x: number; y: number; w: number; h: number }[] {
  const { width, height } = map;
  const used = new Uint8Array(width * height);
  const free = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < width && y < height && cellZone[y * width + x] === zone && used[y * width + x] === 0;
  const rects: { x: number; y: number; w: number; h: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!free(x, y)) continue;
      let x1 = x;
      while (free(x1 + 1, y)) x1++;
      let y1 = y;
      for (;;) {
        let ok = true;
        for (let xx = x; xx <= x1 && ok; xx++) ok = free(xx, y1 + 1);
        if (!ok) break;
        y1++;
      }
      for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[yy * width + xx] = 1;
      rects.push({ x, y, w: x1 - x + 1, h: y1 - y + 1 });
    }
  }
  return rects;
}

// ----------------------------------------------------------------------------- compile

function bitCount(n: number): number {
  let c = 0;
  for (let v = n; v; v &= v - 1) c++;
  return c;
}

function hash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

function p(name: string, type: TiledProperty['type'], value: TiledProperty['value']): TiledProperty {
  return { name, type, value };
}

/** Corner key "NW NE SW SE" → local tile ids of a corner wangset. */
function wangLookup(tsj: Tsj): Map<string, number[]> {
  const set = tsj.wangsets?.[0];
  if (!set) throw new Error(`${tsj.name}: no tiene wangset (ejecuta npm run tiles:import)`);
  const lookup = new Map<string, number[]>();
  for (const { tileid, wangid } of set.wangtiles) {
    const corner = (i: number): number => (wangid[i] ?? 1) - 1;
    const key = `${corner(7)}${corner(1)}${corner(5)}${corner(3)}`;
    lookup.set(key, [...(lookup.get(key) ?? []), tileid]);
  }
  return lookup;
}

/**
 * Hash of what a designer can change in Tiled (tiles, objects, properties),
 * ignoring formatting, ids and the hash property itself. It tells an
 * untouched compile from a map retouched by hand.
 */
export function contentHash(map: TiledSourceMap): string {
  const layers = map.layers.map((l) =>
    l.type === 'tilelayer'
      ? { name: l.name, data: l.data }
      : {
          name: l.name,
          objects: l.objects.map((o) => ({
            type: o.type || o.class || '',
            name: o.name,
            x: o.x,
            y: o.y,
            w: o.width,
            h: o.height,
            gid: o.gid ?? 0,
            props: [...(o.properties ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((q) => [q.name, q.value]),
          })),
        },
  );
  return createHash('sha1').update(JSON.stringify({ w: map.width, h: map.height, layers })).digest('hex').slice(0, 16);
}

export const COMPILED_HASH = 'compiledHash';

export function compileAsciiMap(map: AsciiMap, tilesets: Readonly<Record<TilesetName, Tsj>>, sourceName: string): TiledSourceMap {
  const { width: W, height: H, grid } = map;
  const at = (x: number, y: number): string => (x >= 0 && y >= 0 && x < W && y < H ? (grid[y]?.[x] ?? '_') : '_');
  const firstGid = {} as Record<TilesetName, number>;
  let next = 1;
  for (const name of TILESET_ORDER) {
    firstGid[name] = next;
    next += tilesets[name].tilecount;
  }
  const { cellZone } = computeRegions(map);
  const zoneIndex = new Map(map.zones.map((z, i) => [z.id, i]));
  const problems: string[] = [];
  const windowKind = new Map(map.windows.map((w) => [`${w.cell.x},${w.cell.y}`, w.kind]));

  // What lies under each cell: markers, fences and fence gaps take the floor around them.
  const ground: string[][] = grid.map((row) => [...row]);
  const pickAround = (x: number, y: number): { ch: string; zone: number } => {
    const around = [
      [x, y - 1],
      [x - 1, y],
      [x + 1, y],
      [x, y + 1],
    ] as const;
    let best: { ch: string; zone: number } | undefined;
    for (const indoorFirst of [true, false]) {
      for (const [nx, ny] of around) {
        const ch = at(nx, ny);
        if (WALLS.includes(ch) || MARKERS.includes(ch) || ch === '_') continue;
        if (indoorFirst !== INDOOR.includes(ch)) continue;
        best ??= { ch, zone: cellZone[ny * W + nx] ?? -1 };
      }
      if (best) return best;
    }
    return { ch: 'wall', zone: -1 };
  };
  const groundZone = new Int32Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = at(x, y);
      groundZone[y * W + x] = cellZone[y * W + x] ?? -1;
      const outdoorGap = ch === 'W' && windowKind.get(`${x},${y}`) === 'fence';
      if (ch === '#' || ch === 'H' || (ch === 'W' && !outdoorGap)) ground[y]![x] = 'wall';
      else if (ch === 'F' || outdoorGap || MARKERS.includes(ch)) {
        // Fences stand on the lawn when there is any next to them.
        const lawnNext = (ch === 'F' || outdoorGap) && [at(x, y - 1), at(x - 1, y), at(x + 1, y), at(x, y + 1)].includes('g');
        const under = lawnNext ? { ch: 'g', zone: -1 } : pickAround(x, y);
        ground[y]![x] = under.ch === 'wall' ? 'g' : under.ch;
        if (groundZone[y * W + x] === -1) groundZone[y * W + x] = under.zone;
      }
    }
  }
  const g = (x: number, y: number): string => (x >= 0 && y >= 0 && x < W && y < H ? (ground[y]?.[x] ?? '_') : '_');

  // --- props: footprints, and the ones that block movement
  const propCells = new Set<number>();
  const propBlocked = new Set<number>();
  for (const prop of map.props) {
    for (const c of prop.cells) {
      propCells.add(c.y * W + c.x);
      if (prop.collides) propBlocked.add(c.y * W + c.x);
    }
  }

  // --- walls: one tile of the autotile per wall, picked by its mask of neighbours (doors and
  //     windows continue the wall; open gaps end it). A wall inside a 2×2 square of walls is thick:
  //     it takes a solid tile, open to the north and the south where no wall continues.
  const walls = new Array<number>(W * H).fill(0);
  const wallish = (x: number, y: number): boolean => '#HFDW'.includes(at(x, y));
  const isWall = (x: number, y: number): boolean => WALLS.includes(at(x, y));
  /**
   * Kits of a wall: one for its top edge, one for its front face. All the
   * walls of the house share the plaster top edge, so a facade and the
   * partitions that meet it read as one structure; the face shows the side
   * it looks onto (in 3/4 the face is the south side): siding when a facade
   * wall faces the outside, plaster when it faces a room.
   */
  const zoneKit = (x: number, y: number): Kit | undefined => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const kit = map.zones[cellZone[(y + dy) * W + (x + dx)] ?? -1]?.wallKit;
        if (kit && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) return kit;
      }
    }
    return undefined;
  };
  const topKitOf = (x: number, y: number): Kit => (at(x, y) === 'F' ? 'kit_fence' : (zoneKit(x, y) ?? 'kit_interior'));
  const faceKitOf = (x: number, y: number): Kit => {
    const top = topKitOf(x, y);
    if (top !== 'kit_interior' || at(x, y) !== 'H') return top;
    return g(x, y + 1) in FLOOR_ROW ? 'kit_interior' : 'kit_exterior';
  };
  const wallFaces = new Array<number>(W * H).fill(0);
  const kits: (Kit | undefined)[] = new Array<Kit | undefined>(W * H);
  const masks = new Int8Array(W * H).fill(-1);
  const solid = solidCells(W, H, isWall);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isWall(x, y)) continue;
      const mask = wallMask(wallish, x, y);
      masks[y * W + x] = mask;
      const tile = solid[y * W + x]
        ? SOLID_BASE + (wallish(x, y - 1) ? 0 : SOLID_NORTH_OPEN) + (wallish(x, y + 1) ? 0 : SOLID_SOUTH_OPEN)
        : mask;
      const kit = topKitOf(x, y);
      kits[y * W + x] = kit;
      walls[y * W + x] = firstGid[kit] + tile;
      const face = faceKitOf(x, y);
      const faced = solid[y * W + x] ? !wallish(x, y + 1) : hasFace(mask);
      if (faced && face !== kit) wallFaces[y * W + x] = firstGid[face] + (solid[y * W + x] ? FACE_SOLID : FACE_BASE + mask);
    }
  }
  // Junctions between walls with different top edges (a fence against the house): the lesser kit runs
  // into the junction of the wall it meets. That junction's arms towards it are drawn again in its kit
  // (wall_joins layer), so the fence reaches the house instead of changing material half way.
  const wallJoins = new Array<number>(W * H).fill(0);
  const KIT_RANK: Record<Kit, number> = { kit_fence: 0, kit_interior: 1, kit_basement: 1, kit_exterior: 2 };
  const directions = [
    [N, 0, -1],
    [E, 1, 0],
    [S, 0, 1],
    [WEST, -1, 0],
  ] as const;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const own = kits[y * W + x];
      if (!own || solid[y * W + x]) continue;
      const arms = new Map<Kit, number>();
      for (const [bit, dx, dy] of directions) {
        const other = x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H ? kits[(y + dy) * W + x + dx] : undefined;
        if (other && KIT_RANK[other] < KIT_RANK[own]) arms.set(other, (arms.get(other) ?? 0) | bit);
      }
      // Two other kits around one junction do not happen in the plans; the one with more arms wins.
      const [kit, armMask] = [...arms].sort((a, b) => bitCount(b[1]) - bitCount(a[1]))[0] ?? [];
      if (kit && armMask) wallJoins[y * W + x] = firstGid[kit] + ARM_BASE + armMask - 1;
    }
  }
  const maskAt = (x: number, y: number): number => (x >= 0 && y >= 0 && x < W && y < H ? (masks[y * W + x] ?? -1) : -1);
  const solidAt = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < W && y < H && solid[y * W + x] === 1;

  // --- outdoor terrain by vertices: one terrain per vertex, each tile by its 4 corners
  const terrain = terrainVertices(W, H, g);
  problems.push(...terrain.errors);
  const lookups = new Map((['tileset_street', 'tileset_pool', 'tileset_garden'] as const).map((name) => [name, wangLookup(tilesets[name])]));
  const wangGid = (tileset: 'tileset_street' | 'tileset_pool' | 'tileset_garden', code: string, x: number, y: number): number => {
    const ids = lookups.get(tileset)?.get(code);
    if (!ids?.length) {
      problems.push(`${tileset}: no hay tile con esquinas ${code} (${x},${y})`);
      return 0;
    }
    return firstGid[tileset] + (ids[hash(x, y) % ids.length] ?? 0);
  };

  // --- floor layer. Interior floors: the clean variant of each material and stained ones sprinkled,
  //     each tile in one of its flips at random (floors have no front face), so no mark repeats in a grid.
  const floor = new Array<number>(W * H).fill(0);
  const variants = floorVariants(
    W,
    H,
    (x, y) => g(x, y) in FLOOR_ROW,
    (x, y) => {
      const v = FLOOR_VARIANTS[g(x, y)];
      return { main: v?.clean ?? 0, rares: v?.stained ?? [] };
    },
  );
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = g(x, y);
      const i = y * W + x;
      if (PLAIN_TERRAIN[ch]) {
        const tile = terrainTile(terrain, x, y, ch);
        if (typeof tile === 'string') problems.push(tile);
        else floor[i] = wangGid(tile.tileset, tile.code, x, y);
      } else if (ch in FLOOR_ROW) {
        // One of the four baked flips of the tile (floors_interior: flip × 16 + row × 4 + variant).
        const flip = (hash(x * 3 + 11, y * 7 + 5) >>> 11) % FLOOR_FLIPS;
        floor[i] = firstGid.floors_interior + flip * 16 + (FLOOR_ROW[ch] ?? 0) * 4 + Math.max(0, variants[i] ?? 0);
      } else if (ch === 'd') floor[i] = firstGid.map_special + SPECIAL.dirt;
      else if (ch === 'wall') floor[i] = firstGid.map_special + SPECIAL.ground;
      else if (ch === '_') floor[i] = firstGid.map_special + SPECIAL.void;
    }
  }

  // --- floor around the wall art. A wall tile is transparent where the floor shows: west and east of
  //     a vertical strip, north of a horizontal band. The floor layer carries the floor of the left
  //     side and the decor layer the right half of the right side's floor (floor_halves).
  const decor = new Array<number>(W * H).fill(0);
  const tileProp = (t: { properties?: TiledProperty[] }, name: string): TiledProperty['value'] | undefined =>
    t.properties?.find((q) => q.name === name)?.value;
  const halves = new Map((tilesets.floor_halves.tiles ?? []).map((t) => [`${String(tileProp(t, 'tileset'))}:${String(tileProp(t, 'tile'))}`, t.id]));
  const plainFloor = (x: number, y: number): { tileset: TilesetName; tile: number } | undefined => {
    // Under a wall there is never water or void, which would change what the cell is.
    const ch = g(x, y) === 'w' ? 'e' : g(x, y);
    const plain = PLAIN_TERRAIN[ch];
    if (plain) return { tileset: plain.tileset, tile: lookups.get(plain.tileset)?.get(String(plain.terrain).repeat(4))?.[0] ?? 0 };
    if (ch in FLOOR_ROW) return { tileset: 'floors_interior', tile: (FLOOR_ROW[ch] ?? 0) * 4 + (FLOOR_VARIANTS[ch]?.clean ?? 0) };
    if (ch === 'd') return { tileset: 'map_special', tile: SPECIAL.dirt };
    return undefined;
  };
  /** The first of the cells that has a floor (walls have none), or dark ground. */
  const floorOf = (...cells: [number, number][]): { tileset: TilesetName; tile: number } => {
    for (const [x, y] of cells) {
      const f = plainFloor(x, y);
      if (f) return f;
    }
    return { tileset: 'map_special', tile: SPECIAL.ground };
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mask = maskAt(x, y);
      if (mask < 0) continue;
      // With an arm towards a side, only the strip north of its band shows: the floor north (or diagonal).
      // A thick wall shows at most the strip north of it.
      const wide = solidAt(x, y);
      const left = wide || mask & WEST ? floorOf([x, y - 1], [x - 1, y - 1], [x - 1, y]) : floorOf([x - 1, y], [x, y - 1]);
      const right = wide || mask & E ? floorOf([x, y - 1], [x + 1, y - 1], [x + 1, y]) : floorOf([x + 1, y], [x, y - 1]);
      floor[y * W + x] = firstGid[left.tileset] + left.tile;
      if (left.tileset === right.tileset && left.tile === right.tile) continue;
      const half = halves.get(`${right.tileset}:${right.tile}`);
      if (half === undefined) problems.push(`floor_halves: falta la mitad de ${right.tileset} ${right.tile} (ejecuta npm run tiles:import)`);
      else decor[y * W + x] = firstGid.floor_halves + half;
    }
  }

  // --- shadows: soft band at the foot of walls, fences, doors, barricades and furniture (light from
  //     the top left). A wall shades the cell below only under a horizontal face, and the floor east
  //     of its vertical strip inside its own cell; doors, barricades, furniture and thick walls fill
  //     their cell.
  const shadows = new Array<number>(W * H).fill(0);
  const fills = (x: number, y: number): boolean => 'DW'.includes(at(x, y)) || propBlocked.has(y * W + x) || solidAt(x, y);
  const castsDown = (x: number, y: number): boolean => fills(x, y) || (maskAt(x, y) >= 0 && (maskAt(x, y) & (E | WEST)) !== 0);
  const castsRight = (x: number, y: number): boolean => fills(x, y);
  const castsCorner = (x: number, y: number): boolean => fills(x, y) || (maskAt(x, y) >= 0 && (maskAt(x, y) & E) !== 0);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mask = maskAt(x, y);
      if (mask >= 0) {
        if ((mask & E) === 0 && !solidAt(x, y)) shadows[y * W + x] = firstGid.map_shadows + SHADOW.wallV;
        continue;
      }
      if (fills(x, y) || at(x, y) === '_' || at(x, y) === 'w') continue;
      const tile = shadowTile(castsDown(x, y - 1), castsRight(x - 1, y), castsCorner(x - 1, y - 1));
      if (tile >= 0) shadows[y * W + x] = firstGid.map_shadows + tile;
    }
  }

  // --- objects
  let nextId = 1;
  const objects: TiledObject[] = [];
  const add = (obj: Omit<TiledObject, 'id' | 'rotation' | 'visible'>): void => {
    objects.push({ id: nextId++, rotation: 0, visible: true, ...obj });
  };
  const cellsRect = (cells: readonly Cell[]) => {
    const xs = cells.map((c) => c.x);
    const ys = cells.map((c) => c.y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0 + 1;
    const h = Math.max(...ys) - y0 + 1;
    if (w * h !== cells.length) problems.push(`casillas no contiguas: ${cells.map((c) => `${c.x},${c.y}`).join(' ')}`);
    return { x: x0 * TILE, y: y0 * TILE, width: w * TILE, height: h * TILE };
  };
  const point = (c: Cell) => ({ point: true, x: (c.x + 0.5) * TILE, y: (c.y + 0.5) * TILE, width: 0, height: 0 });
  const knownZone = (id: string, who: string): void => {
    if (!zoneIndex.has(id)) problems.push(`${who}: la zona "${id}" no existe`);
  };

  map.zones.forEach((zone, zi) => {
    const rects = zoneRects(map, cellZone, zi);
    if (rects.length === 0) problems.push(`la zona ${zone.id} no tiene casillas`);
    for (const r of rects) {
      add({
        name: zone.id,
        type: 'zone',
        x: r.x * TILE,
        y: r.y * TILE,
        width: r.w * TILE,
        height: r.h * TILE,
        properties: [
          p('id', 'string', zone.id),
          p('name', 'string', zone.name),
          p('startsUnlocked', 'bool', zone.startsUnlocked),
          p('interior', 'bool', zone.interior),
          p('openSpawns', 'bool', zone.openSpawns),
        ],
      });
    }
  });
  add({ name: 'player', type: 'player_spawn', ...point(map.player) });

  for (const w of map.windows) {
    knownZone(w.zone, `barricada ${w.id}`);
    const zi = zoneIndex.get(w.zone) ?? -2;
    // Inside is the neighbour in the window's zone; zombies come from the opposite side.
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const;
    const inward = dirs.find(([dx, dy]) => cellZone[(w.cell.y + dy) * W + (w.cell.x + dx)] === zi && at(w.cell.x + dx, w.cell.y + dy) !== '_');
    if (!inward) problems.push(`barricada ${w.id}: no toca ninguna casilla de la zona ${w.zone}`);
    const [dx, dy] = inward ?? [0, 1];
    add({
      name: w.id,
      type: 'window',
      ...cellsRect([w.cell]),
      properties: [p('id', 'string', w.id), p('zone', 'string', w.zone), p('planks', 'int', BARRICADES.planksPerWindow), p('kind', 'string', w.kind)],
    });
    add({ name: `spawn_${w.id}`, type: 'zombie_spawn', ...point({ x: w.cell.x - dx * 2, y: w.cell.y - dy * 2 }), properties: [p('window', 'string', w.id)] });
  }
  for (const s of map.openSpawns) {
    knownZone(s.zone, `spawn ${s.id}`);
    if (cellZone[s.cell.y * W + s.cell.x] !== zoneIndex.get(s.zone)) problems.push(`spawn ${s.id}: no cae en la zona ${s.zone}`);
    add({ name: s.id, type: 'zombie_spawn', ...point(s.cell) });
  }
  for (const m of map.merchantSpots) {
    knownZone(m.zone, `mago ${m.id}`);
    if (zoneIndex.has(m.zone) && cellZone[m.cell.y * W + m.cell.x] !== zoneIndex.get(m.zone)) problems.push(`mago ${m.id}: no cae en la zona ${m.zone}`);
    add({ name: m.id, type: 'merchant_spot', ...point(m.cell), properties: [p('zone', 'string', m.zone)] });
  }
  for (const d of map.doors) {
    knownZone(d.from, `puerta ${d.id}`);
    knownZone(d.to, `puerta ${d.id}`);
    add({
      name: d.id,
      type: 'door',
      ...cellsRect(d.cells),
      properties: [p('id', 'string', d.id), p('cost', 'int', d.cost), p('fromZone', 'string', d.from), p('toZone', 'string', d.to)],
    });
  }
  for (const pt of map.portals) {
    knownZone(pt.zone, `portal ${pt.id}`);
    add({
      name: pt.id,
      type: 'portal',
      ...cellsRect(pt.cells),
      properties: [
        p('id', 'string', pt.id),
        p('pair', 'string', pt.pair),
        p('cost', 'int', pt.cost),
        p('zone', 'string', pt.zone),
        p('secondary', 'bool', pt.secondary),
        p('kind', 'string', pt.kind),
      ],
    });
  }
  if (problems.length > 0) throw new AsciiMapError(problems);

  // --- decals (clusters where people pass) and props
  const inwardOf = (c: Cell, zone: string): Cell => {
    const zi = zoneIndex.get(zone) ?? -2;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (cellZone[(c.y + dy) * W + (c.x + dx)] === zi) return { x: dx, y: dy };
    }
    return { x: 0, y: 1 };
  };
  const passages: Cell[] = [];
  grid.forEach((row, y) => [...row].forEach((ch, x) => ch === 'D' || ch === 'o' ? passages.push({ x, y }) : undefined));
  const decalsPlaced = placeDecals({
    width: W,
    height: H,
    tileSize: TILE,
    ground: g,
    zoneAt: (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? (cellZone[y * W + x] ?? -1) : -1),
    zoneCount: map.zones.length,
    blocked: (x, y) => {
      const ch = at(x, y);
      return '#HFDW_w'.includes(ch) || propBlocked.has(y * W + x) || ch === '<';
    },
    windows: map.windows.map((w) => ({ cell: w.cell, inward: inwardOf(w.cell, w.zone), outdoor: w.kind === 'fence' })),
    passages,
    propCells,
    seed: hash(W, H),
  });
  const sizeOf = (tileset: string): number => Object.values(DECALS).find((d) => d.tileset === tileset)?.size ?? TILE;
  const decalObjects: TiledObject[] = decalsPlaced.map((d) => {
    const size = sizeOf(d.tileset);
    const gid = firstGid[d.tileset as TilesetName] + d.local + (d.flipX ? 0x80000000 : 0) + (d.flipY ? 0x40000000 : 0);
    return { id: nextId++, name: '', gid, x: d.cx - size / 2, y: d.cy + size / 2, width: size, height: size, rotation: 0, visible: true };
  });
  const propObjects: TiledObject[] = map.props.map((prop) => ({
    id: nextId++,
    name: prop.id,
    type: 'prop',
    ...cellsRect(prop.cells),
    rotation: 0,
    visible: true,
    properties: [p('key', 'string', prop.key), p('collides', 'bool', prop.collides), p('flipX', 'bool', prop.flipX), p('flipY', 'bool', prop.flipY)],
  }));

  const tileLayer = (id: number, name: string, data: number[]): TiledTileLayer => ({
    id,
    name,
    type: 'tilelayer',
    width: W,
    height: H,
    x: 0,
    y: 0,
    opacity: 1,
    visible: true,
    data,
  });
  const result: TiledSourceMap & { properties?: TiledProperty[] } = {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: W,
    height: H,
    tilewidth: TILE,
    tileheight: TILE,
    nextlayerid: 10,
    nextobjectid: nextId,
    layers: [
      tileLayer(1, 'floor', floor),
      tileLayer(6, 'shadows', shadows),
      tileLayer(2, 'walls', walls),
      tileLayer(9, 'wall_faces', wallFaces),
      tileLayer(8, 'wall_joins', wallJoins),
      tileLayer(3, 'decor', decor),
      { id: 4, name: 'decals', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: decalObjects },
      { id: 7, name: 'props', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: propObjects },
      { id: 5, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
    ],
    tilesets: TILESET_ORDER.map((name) => ({ firstgid: firstGid[name], source: `tilesets/${name}.tsj` })),
  };
  result.properties = [p('compiledFrom', 'string', sourceName), p(COMPILED_HASH, 'string', contentHash(result))];
  return result;
}
