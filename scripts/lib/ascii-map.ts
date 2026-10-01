/**
 * ASCII map sources (skill level-design): maps/src/<map>.txt holds the plan,
 * one character per tile, followed by Markdown tables with the ids and
 * properties of the zones, doors, barricades, portals, open spawns and the
 * player. compileAsciiMap turns it into a Tiled map (.tmj) with external
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
import type { Tsj } from './tiled-tileset';

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
] as const;
export type TilesetName = (typeof TILESET_ORDER)[number];
export type Kit = 'kit_interior' | 'kit_exterior' | 'kit_basement' | 'kit_fence';

/** Rows of floors_interior (4 variants each) per indoor character. */
const FLOOR_ROW: Record<string, number> = { '.': 0, k: 1, b: 2, c: 3, r: 3 };
const SPECIAL = { void: 0, ground: 1, dirt: 2 } as const;
/** Kit pieces (template order, docs/specs/02-mapa-mansion.md §1.1). */
const PIECE = { wallH: 1, wallHigh: 12, wallV: 17, pillar: 6 } as const;

/**
 * Corner Wang sets: a vertex takes the inner terrain (index 0) when at least
 * `threshold` of the 4 tiles around it are inner. With 2 the outer tiles next
 * to the inner area become the transition (kerbs on the sidewalk side); with
 * 4 the transition falls on the inner tiles, so the pool's water stays
 * inside the `w` cells.
 */
const WANG: readonly { tileset: TilesetName; chars: string; inner: string; threshold: number }[] = [
  { tileset: 'tileset_street', chars: 'as', inner: 'a', threshold: 2 },
  { tileset: 'tileset_garden', chars: 'gp', inner: 'p', threshold: 2 },
  { tileset: 'tileset_pool', chars: 'we', inner: 'w', threshold: 4 },
];

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
  /** Column of floors_interior used by the zone's indoor floors. */
  floorVariant: number;
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

export interface AsciiMap {
  grid: string[];
  width: number;
  height: number;
  zones: AsciiZone[];
  doors: AsciiDoor[];
  windows: AsciiWindow[];
  portals: AsciiPortal[];
  openSpawns: AsciiOpenSpawn[];
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
    const key = ['zonas', 'puertas', 'barricadas', 'portales', 'spawns', 'jugador'].find((k) => section.startsWith(k)) ?? section;
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
      floorVariant: Number.parseInt(r.suelo ?? '0', 10) || 0,
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
  const player = parseCells(rows('jugador')[0]?.casilla ?? '', problems, 'jugador')[0] ?? { x: -1, y: -1 };

  const map: AsciiMap = { grid, width, height, zones, doors, windows, portals, openSpawns, player };
  checkMarkers(map, problems);
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

  // --- floor layer
  const floor = new Array<number>(W * H).fill(0);
  const wangSet = (ch: string) => WANG.find((s) => s.chars.includes(ch));
  const lookups = new Map(WANG.map((s) => [s.tileset, wangLookup(tilesets[s.tileset])]));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const ch = g(x, y);
      const i = y * W + x;
      const set = wangSet(ch);
      if (set) {
        const vertex = (vx: number, vy: number): number => {
          let inner = 0;
          for (const [tx, ty] of [
            [vx - 1, vy - 1],
            [vx, vy - 1],
            [vx - 1, vy],
            [vx, vy],
          ] as const) {
            if (set.inner.includes(g(tx, ty))) inner++;
          }
          return inner >= set.threshold ? 0 : 1;
        };
        const key = `${vertex(x, y)}${vertex(x + 1, y)}${vertex(x, y + 1)}${vertex(x + 1, y + 1)}`;
        const ids = lookups.get(set.tileset)?.get(key);
        if (!ids?.length) problems.push(`${set.tileset}: no hay tile con esquinas ${key} (${x},${y})`);
        else floor[i] = firstGid[set.tileset] + (ids[hash(x, y) % ids.length] ?? 0);
      } else if (ch in FLOOR_ROW) {
        const zone = map.zones[groundZone[i] ?? -1];
        floor[i] = firstGid.floors_interior + (FLOOR_ROW[ch] ?? 0) * 4 + (zone?.floorVariant ?? 0);
      } else if (ch === 'd') floor[i] = firstGid.map_special + SPECIAL.dirt;
      else if (ch === 'wall') floor[i] = firstGid.map_special + SPECIAL.ground;
      else if (ch === '_') floor[i] = firstGid.map_special + SPECIAL.void;
    }
  }

  // --- walls layer: the piece depends on the neighbours (doors and windows continue the wall)
  const walls = new Array<number>(W * H).fill(0);
  const wallish = (x: number, y: number): boolean => '#HFDW'.includes(at(x, y));
  const kitOf = (x: number, y: number): Kit => {
    const ch = at(x, y);
    if (ch === 'F') return 'kit_fence';
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const kit = map.zones[cellZone[(y + dy) * W + (x + dx)] ?? -1]?.wallKit;
        if (kit && x + dx >= 0 && x + dx < W && y + dy >= 0 && y + dy < H) return kit;
      }
    }
    return ch === 'H' ? 'kit_exterior' : 'kit_interior';
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!WALLS.includes(at(x, y))) continue;
      const horizontal = wallish(x - 1, y) || wallish(x + 1, y);
      const vertical = wallish(x, y - 1) || wallish(x, y + 1);
      let piece: number;
      if (horizontal) piece = wallish(x, y - 1) ? PIECE.wallHigh : PIECE.wallH;
      else if (vertical) piece = PIECE.wallV;
      else piece = PIECE.pillar;
      walls[y * W + x] = firstGid[kitOf(x, y)] + piece;
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
    nextlayerid: 6,
    nextobjectid: nextId,
    layers: [
      tileLayer(1, 'floor', floor),
      tileLayer(2, 'walls', walls),
      tileLayer(3, 'decor', new Array<number>(W * H).fill(0)),
      { id: 4, name: 'decals', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: [] },
      { id: 5, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
    ],
    tilesets: TILESET_ORDER.map((name) => ({ firstgid: firstGid[name], source: `tilesets/${name}.tsj` })),
  };
  result.properties = [p('compiledFrom', 'string', sourceName), p(COMPILED_HASH, 'string', contentHash(result))];
  return result;
}
