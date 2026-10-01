/**
 * npm run map:mansion — generates art-src/tiled/mansion.tmj ONCE from the
 * tables of docs/specs/02-mapa-mansion.md §2. After that the map is edited by
 * hand in Tiled, so an existing file is never overwritten unless --force is
 * passed. Tilesets stay external (.tsj); `npm run map:build` embeds them.
 *
 * Coordinates are in tiles. Zone rectangles are interiors (walls excluded).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BARRICADES } from '../src/config/balance';
import type { PortalKind, WindowKind } from '../src/game/map/MapLoader';
import type { TiledObject, TiledProperty, TiledSourceMap, TiledTileLayer } from '../src/game/map/tiled';
import type { Tsj } from './lib/tiled-tileset';

export const MANSION_WIDTH = 100;
export const MANSION_HEIGHT = 54;
const TILE = 32;

/** Tilesets in GID order, as written in the .tmj. */
export const MANSION_TILESETS = [
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
type TilesetName = (typeof MANSION_TILESETS)[number];
type Kit = 'kit_interior' | 'kit_exterior' | 'kit_basement' | 'kit_fence';

/** Rows of floors_interior (4 variants each). */
const FLOOR_ROWS = { madera: 0, linoleo: 1, bano: 2, hormigon: 3 } as const;
type Material = keyof typeof FLOOR_ROWS;

/** map_special tiles. */
const SPECIAL = { void: 0, ground: 1 } as const;

/** Kit pieces (template order, docs/specs/02-mapa-mansion.md §1.1). */
const PIECE = { wallH: 1, wallHigh: 12, wallV: 17, pillar: 6 } as const;

/** Wang terrains in measured order (terrain 0 = plain tile at (0,3)). */
const STREET = { asphalt: 0, sidewalk: 1 } as const;
const POOL = { water: 0, deck: 1 } as const;
const GARDEN = { patio: 0, lawn: 1 } as const;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ZoneDef extends Rect {
  id: string;
  name: string;
  startsUnlocked?: boolean;
  interior: boolean;
  openSpawns?: boolean;
  floor: Material | 'garden' | 'street';
  /** Column of floors_interior: one variant per room (the four variants do not blend with each other). */
  variant?: number;
}

export const ZONES: readonly ZoneDef[] = [
  { id: 'recibidor', name: 'Recibidor', x: 21, y: 29, w: 14, h: 11, startsUnlocked: true, interior: true, floor: 'madera', variant: 0 },
  { id: 'salon', name: 'Salón', x: 4, y: 29, w: 16, h: 11, interior: true, floor: 'madera', variant: 3 },
  { id: 'comedor', name: 'Comedor', x: 36, y: 29, w: 14, h: 11, interior: true, floor: 'madera', variant: 1 },
  { id: 'biblioteca', name: 'Biblioteca', x: 4, y: 16, w: 22, h: 12, interior: true, floor: 'madera', variant: 2 },
  { id: 'cocina', name: 'Cocina', x: 27, y: 16, w: 23, h: 12, interior: true, floor: 'linoleo', variant: 1 },
  { id: 'garaje', name: 'Garaje', x: 51, y: 16, w: 12, h: 24, interior: true, floor: 'hormigon', variant: 1 },
  { id: 'jardin', name: 'Jardín trasero', x: 4, y: 3, w: 59, h: 12, interior: false, floor: 'garden' },
  { id: 'calle', name: 'Calle delantera', x: 0, y: 41, w: 72, h: 12, interior: false, openSpawns: true, floor: 'street' },
  { id: 'sotano', name: 'Sótano', x: 77, y: 26, w: 19, h: 13, interior: true, floor: 'hormigon', variant: 3 },
  { id: 'azotea', name: 'Azotea', x: 77, y: 3, w: 19, h: 15, interior: false, openSpawns: true, floor: 'hormigon', variant: 0 },
];

interface WallDef {
  kit: Kit;
  rect: Rect;
  /** Only the border of the rectangle (a room shell), not the whole area. */
  outline?: boolean;
}

/** Wall segments, 1 tile thick. Earlier segments win where two overlap. */
const WALLS: readonly WallDef[] = [
  { kit: 'kit_exterior', rect: { x: 3, y: 15, w: 61, h: 26 }, outline: true }, // house shell
  { kit: 'kit_exterior', rect: { x: 50, y: 16, w: 1, h: 24 } }, // garage side
  { kit: 'kit_fence', rect: { x: 3, y: 2, w: 61, h: 14 }, outline: true }, // garden fence
  { kit: 'kit_basement', rect: { x: 76, y: 25, w: 21, h: 15 }, outline: true },
  { kit: 'kit_basement', rect: { x: 86, y: 29, w: 1, h: 7 } }, // basement partition
  { kit: 'kit_interior', rect: { x: 4, y: 28, w: 46, h: 1 } },
  { kit: 'kit_interior', rect: { x: 20, y: 29, w: 1, h: 11 } },
  { kit: 'kit_interior', rect: { x: 35, y: 29, w: 1, h: 11 } },
  { kit: 'kit_interior', rect: { x: 26, y: 16, w: 1, h: 12 } },
];

/** Obstacles to run circles around (spec 02 §2.2), drawn with wall pieces until they have art. */
const OBSTACLES: readonly WallDef[] = [
  { kit: 'kit_interior', rect: { x: 8, y: 32, w: 2, h: 2 } }, // salón pillars
  { kit: 'kit_interior', rect: { x: 14, y: 35, w: 2, h: 2 } },
  { kit: 'kit_interior', rect: { x: 8, y: 20, w: 6, h: 1 } }, // library shelves
  { kit: 'kit_interior', rect: { x: 16, y: 24, w: 6, h: 1 } },
  { kit: 'kit_exterior', rect: { x: 55, y: 26, w: 4, h: 6 } }, // car in the garage
  { kit: 'kit_basement', rect: { x: 81, y: 7, w: 2, h: 2 } }, // roof chimneys
  { kit: 'kit_basement', rect: { x: 89, y: 12, w: 2, h: 2 } },
];

/** Ring of void around the roof. */
const ROOF_VOID: Rect = { x: 76, y: 2, w: 21, h: 17 };

/** Pool deck and the vertices that are water (tiles with ≥ 2 water corners ≈ 24–39 × 7–10). */
const POOL_DECK: Rect = { x: 22, y: 6, w: 20, h: 6 };
const POOL_WATER_VERTICES: Rect = { x: 25, y: 8, w: 15, h: 3 };
/** Sidewalks on rows 41–42 and 51–52: asphalt vertices from 44 to 50 (curbs on rows 43 and 50). */
const STREET_ASPHALT_VERTICES = { from: 44, to: 50 } as const;
/** Patio terrace along the house (rows 13–14); lawn elsewhere. */
const GARDEN_PATIO_FROM_VERTEX = 13;

interface WindowDef {
  id: string;
  zone: string;
  x: number;
  y: number;
  out: [number, number];
  kind?: WindowKind;
}

export const WINDOWS: readonly WindowDef[] = [
  { id: 'W1', zone: 'recibidor', x: 23, y: 40, out: [0, 1] },
  { id: 'W2', zone: 'recibidor', x: 32, y: 40, out: [0, 1] },
  { id: 'W3', zone: 'salon', x: 3, y: 32, out: [-1, 0] },
  { id: 'W4', zone: 'salon', x: 3, y: 36, out: [-1, 0] },
  { id: 'W5', zone: 'salon', x: 12, y: 40, out: [0, 1] },
  { id: 'W6', zone: 'comedor', x: 40, y: 40, out: [0, 1] },
  { id: 'W7', zone: 'comedor', x: 46, y: 40, out: [0, 1] },
  { id: 'W8', zone: 'biblioteca', x: 3, y: 21, out: [-1, 0] },
  { id: 'W9', zone: 'biblioteca', x: 20, y: 15, out: [0, -1] },
  { id: 'W10', zone: 'cocina', x: 31, y: 15, out: [0, -1] },
  { id: 'W11', zone: 'cocina', x: 45, y: 15, out: [0, -1] },
  { id: 'W12', zone: 'garaje', x: 63, y: 22, out: [1, 0] },
  { id: 'W13', zone: 'garaje', x: 63, y: 33, out: [1, 0] },
  { id: 'F1', zone: 'jardin', x: 15, y: 2, out: [0, -1], kind: 'fence' },
  { id: 'F2', zone: 'jardin', x: 50, y: 2, out: [0, -1], kind: 'fence' },
  { id: 'F3', zone: 'jardin', x: 3, y: 8, out: [-1, 0], kind: 'fence' },
  { id: 'S1', zone: 'sotano', x: 81, y: 25, out: [0, -1] },
  { id: 'S2', zone: 'sotano', x: 96, y: 32, out: [1, 0] },
];

interface DoorDef {
  id: string;
  from: string;
  to: string;
  rect: Rect;
  cost: number;
}

export const DOORS: readonly DoorDef[] = [
  { id: 'D1', from: 'recibidor', to: 'salon', rect: { x: 20, y: 33, w: 1, h: 2 }, cost: 750 },
  { id: 'D2', from: 'recibidor', to: 'comedor', rect: { x: 35, y: 33, w: 1, h: 2 }, cost: 750 },
  { id: 'D3', from: 'salon', to: 'biblioteca', rect: { x: 10, y: 28, w: 2, h: 1 }, cost: 1000 },
  { id: 'D4', from: 'comedor', to: 'cocina', rect: { x: 42, y: 28, w: 2, h: 1 }, cost: 1000 },
  { id: 'D5', from: 'biblioteca', to: 'cocina', rect: { x: 26, y: 21, w: 1, h: 2 }, cost: 1250 },
  { id: 'D6', from: 'cocina', to: 'garaje', rect: { x: 50, y: 20, w: 1, h: 2 }, cost: 1250 },
  { id: 'D7', from: 'garaje', to: 'calle', rect: { x: 55, y: 40, w: 2, h: 1 }, cost: 1250 },
  { id: 'D8', from: 'recibidor', to: 'calle', rect: { x: 27, y: 40, w: 2, h: 1 }, cost: 1500 },
  { id: 'D9', from: 'cocina', to: 'jardin', rect: { x: 38, y: 15, w: 2, h: 1 }, cost: 1500 },
  { id: 'D10', from: 'biblioteca', to: 'jardin', rect: { x: 12, y: 15, w: 2, h: 1 }, cost: 1500 },
];

interface PortalDef {
  id: string;
  kind: PortalKind;
  cost: number;
  secondary: boolean;
  ends: [{ zone: string; rect: Rect }, { zone: string; rect: Rect }];
}

export const PORTALS: readonly PortalDef[] = [
  {
    id: 'P1',
    kind: 'stairs',
    cost: 1750,
    secondary: false,
    ends: [
      { zone: 'cocina', rect: { x: 47, y: 17, w: 2, h: 1 } },
      { zone: 'sotano', rect: { x: 78, y: 38, w: 2, h: 1 } },
    ],
  },
  {
    id: 'P2',
    kind: 'ladder',
    cost: 2000,
    secondary: false,
    ends: [
      { zone: 'jardin', rect: { x: 60, y: 4, w: 2, h: 1 } },
      { zone: 'azotea', rect: { x: 78, y: 17, w: 2, h: 1 } },
    ],
  },
  {
    id: 'P3',
    kind: 'hatch',
    cost: 1000,
    secondary: true,
    ends: [
      { zone: 'jardin', rect: { x: 6, y: 12, w: 2, h: 1 } },
      { zone: 'sotano', rect: { x: 93, y: 27, w: 2, h: 1 } },
    ],
  },
  {
    id: 'P4',
    kind: 'ladder',
    cost: 1250,
    secondary: true,
    ends: [
      { zone: 'calle', rect: { x: 8, y: 41, w: 2, h: 1 } },
      { zone: 'azotea', rect: { x: 93, y: 17, w: 2, h: 1 } },
    ],
  },
];

export const OPEN_SPAWNS: readonly [number, number][] = [
  [1, 46],
  [70, 46],
  [78, 4],
  [94, 4],
  [95, 10],
];

export const PLAYER_SPAWN: [number, number] = [28, 31];

/** Decals scattered on the asphalt and the lawn (tile objects of 48×48). */
const DECALS = [
  { tileset: 'decals_asphalt', count: 14, area: { x: 0, y: 44, w: 72, h: 6 } },
  { tileset: 'decals_grass', count: 18, area: { x: 4, y: 3, w: 59, h: 9 } },
] as const;

const SPAWN_DISTANCE_TILES = 2;

/** Deterministic per-cell hash, so regenerating gives the same variants. */
function hash(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const inRect = (r: Rect, x: number, y: number): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

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

export function buildMansionMap(tilesets: Readonly<Record<TilesetName, Tsj>>): TiledSourceMap {
  const W = MANSION_WIDTH;
  const H = MANSION_HEIGHT;
  const firstGid = {} as Record<TilesetName, number>;
  let gid = 1;
  for (const name of MANSION_TILESETS) {
    firstGid[name] = gid;
    gid += tilesets[name].tilecount;
  }
  const idx = (x: number, y: number): number => y * W + x;
  const floor = new Array<number>(W * H).fill(0);
  const walls = new Array<number>(W * H).fill(0);
  const decor = new Array<number>(W * H).fill(0);
  const ground = firstGid.map_special + SPECIAL.ground;

  // --- Floors ---------------------------------------------------------------
  const paintWang = (name: TilesetName, area: Rect, terrain: (vx: number, vy: number) => number): void => {
    const lookup = wangLookup(tilesets[name]);
    for (let y = area.y; y < area.y + area.h; y++) {
      for (let x = area.x; x < area.x + area.w; x++) {
        const key = `${terrain(x, y)}${terrain(x + 1, y)}${terrain(x, y + 1)}${terrain(x + 1, y + 1)}`;
        const ids = lookup.get(key);
        if (!ids?.length) throw new Error(`${name}: no hay tile con esquinas ${key}`);
        floor[idx(x, y)] = firstGid[name] + (ids[hash(x, y) % ids.length] ?? 0);
      }
    }
  };
  const materialGid = (material: Material, variant = 0): number => firstGid.floors_interior + FLOOR_ROWS[material] * 4 + variant;

  for (const zone of ZONES) {
    if (zone.floor === 'street') {
      const { from, to } = STREET_ASPHALT_VERTICES;
      paintWang('tileset_street', zone, (_vx, vy) => (vy >= from && vy <= to ? STREET.asphalt : STREET.sidewalk));
    } else if (zone.floor === 'garden') {
      paintWang('tileset_garden', zone, (_vx, vy) => (vy >= GARDEN_PATIO_FROM_VERTEX ? GARDEN.patio : GARDEN.lawn));
    } else {
      for (let y = zone.y; y < zone.y + zone.h; y++) {
        for (let x = zone.x; x < zone.x + zone.w; x++) floor[idx(x, y)] = materialGid(zone.floor, zone.variant);
      }
    }
  }
  const water = POOL_WATER_VERTICES;
  paintWang('tileset_pool', POOL_DECK, (vx, vy) =>
    vx >= water.x && vx <= water.x + water.w - 1 && vy >= water.y && vy <= water.y + water.h - 1 ? POOL.water : POOL.deck,
  );
  for (let y = ROOF_VOID.y; y < ROOF_VOID.y + ROOF_VOID.h; y++) {
    for (let x = ROOF_VOID.x; x < ROOF_VOID.x + ROOF_VOID.w; x++) {
      const edge = x === ROOF_VOID.x || y === ROOF_VOID.y || x === ROOF_VOID.x + ROOF_VOID.w - 1 || y === ROOF_VOID.y + ROOF_VOID.h - 1;
      if (edge) floor[idx(x, y)] = firstGid.map_special + SPECIAL.void;
    }
  }

  // --- Walls ----------------------------------------------------------------
  // Kit per wall cell first; pieces are chosen once every neighbour is known.
  const kitAt = new Array<Kit | null>(W * H).fill(null);
  const setWall = (kit: Kit, x: number, y: number): void => {
    if (x >= 0 && y >= 0 && x < W && y < H && !kitAt[idx(x, y)]) kitAt[idx(x, y)] = kit;
  };
  for (const { kit, rect, outline } of [...WALLS, ...OBSTACLES]) {
    for (let y = rect.y; y < rect.y + rect.h; y++) {
      for (let x = rect.x; x < rect.x + rect.w; x++) {
        const edge = x === rect.x || y === rect.y || x === rect.x + rect.w - 1 || y === rect.y + rect.h - 1;
        if (!outline || edge) setWall(kit, x, y);
      }
    }
  }
  // Openings: windows and doors are gaps in the wall, drawn by their own sprites.
  const opening = new Array<boolean>(W * H).fill(false);
  for (const w of WINDOWS) {
    kitAt[idx(w.x, w.y)] = null;
    opening[idx(w.x, w.y)] = true;
    floor[idx(w.x, w.y)] = ground;
  }
  for (const d of DOORS) {
    const from = ZONES.find((z) => z.id === d.from);
    for (let y = d.rect.y; y < d.rect.y + d.rect.h; y++) {
      for (let x = d.rect.x; x < d.rect.x + d.rect.w; x++) {
        kitAt[idx(x, y)] = null;
        opening[idx(x, y)] = true;
        const material = from && from.floor !== 'garden' && from.floor !== 'street' ? from.floor : 'hormigon';
        floor[idx(x, y)] = materialGid(material, from?.variant);
      }
    }
  }
  const wallish = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < W && y < H && (kitAt[idx(x, y)] !== null || opening[idx(x, y)] === true);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const kit = kitAt[idx(x, y)];
      if (!kit) continue;
      const horizontal = wallish(x - 1, y) || wallish(x + 1, y);
      const vertical = wallish(x, y - 1) || wallish(x, y + 1);
      let piece: number;
      // A wall face under a vertical bar is taller, so the bar meets it without a gap.
      if (horizontal) piece = wallish(x, y - 1) ? PIECE.wallHigh : PIECE.wallH;
      else if (vertical) piece = PIECE.wallV;
      else piece = PIECE.pillar;
      walls[idx(x, y)] = firstGid[kit] + piece;
      // Dark ground under walls: the whole blocked cell reads as wall, not just the thin bar.
      floor[idx(x, y)] = ground;
    }
  }

  // --- Objects --------------------------------------------------------------
  let nextId = 1;
  const objects: TiledObject[] = [];
  const add = (obj: Omit<TiledObject, 'id' | 'rotation' | 'visible'>): void => {
    objects.push({ id: nextId++, rotation: 0, visible: true, ...obj });
  };
  const rectObj = (r: Rect) => ({ x: r.x * TILE, y: r.y * TILE, width: r.w * TILE, height: r.h * TILE });
  const pointObj = (x: number, y: number) => ({ point: true, x: (x + 0.5) * TILE, y: (y + 0.5) * TILE, width: 0, height: 0 });

  for (const z of ZONES) {
    add({
      name: z.id,
      type: 'zone',
      ...rectObj(z),
      properties: [
        p('id', 'string', z.id),
        p('name', 'string', z.name),
        p('startsUnlocked', 'bool', z.startsUnlocked === true),
        p('interior', 'bool', z.interior),
        p('openSpawns', 'bool', z.openSpawns === true),
      ],
    });
  }
  add({ name: 'player', type: 'player_spawn', ...pointObj(...PLAYER_SPAWN) });
  for (const w of WINDOWS) {
    add({
      name: w.id,
      type: 'window',
      ...rectObj({ x: w.x, y: w.y, w: 1, h: 1 }),
      properties: [
        p('id', 'string', w.id),
        p('zone', 'string', w.zone),
        p('planks', 'int', BARRICADES.planksPerWindow),
        p('kind', 'string', w.kind ?? 'window'),
      ],
    });
    add({
      name: `spawn_${w.id}`,
      type: 'zombie_spawn',
      ...pointObj(w.x + w.out[0] * SPAWN_DISTANCE_TILES, w.y + w.out[1] * SPAWN_DISTANCE_TILES),
      properties: [p('window', 'string', w.id)],
    });
  }
  OPEN_SPAWNS.forEach(([x, y], i) => add({ name: `O${i + 1}`, type: 'zombie_spawn', ...pointObj(x, y) }));
  for (const d of DOORS) {
    add({
      name: d.id,
      type: 'door',
      ...rectObj(d.rect),
      properties: [p('id', 'string', d.id), p('cost', 'int', d.cost), p('fromZone', 'string', d.from), p('toZone', 'string', d.to)],
    });
  }
  for (const portal of PORTALS) {
    portal.ends.forEach((end, i) => {
      const [id, pair] = i === 0 ? [`${portal.id}a`, `${portal.id}b`] : [`${portal.id}b`, `${portal.id}a`];
      add({
        name: id,
        type: 'portal',
        ...rectObj(end.rect),
        properties: [
          p('id', 'string', id),
          p('pair', 'string', pair),
          p('cost', 'int', portal.cost),
          p('zone', 'string', end.zone),
          p('secondary', 'bool', portal.secondary),
          p('kind', 'string', portal.kind),
        ],
      });
    });
  }

  const decals: TiledObject[] = [];
  const random = mulberry32(0x6d616e73);
  for (const set of DECALS) {
    const size = tilesets[set.tileset].tilewidth;
    for (let i = 0; i < set.count; i++) {
      const x = Math.round((set.area.x + random() * set.area.w) * TILE - size / 2);
      const bottom = Math.round((set.area.y + random() * set.area.h) * TILE + size / 2);
      const onDeck = inRect(POOL_DECK, Math.floor((x + size / 2) / TILE), Math.floor((bottom - size / 2) / TILE));
      if (onDeck) continue;
      decals.push({
        id: nextId++,
        name: '',
        gid: firstGid[set.tileset] + Math.floor(random() * tilesets[set.tileset].tilecount),
        x,
        y: bottom,
        width: size,
        height: size,
        rotation: 0,
        visible: true,
      });
    }
  }

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

  return {
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
      tileLayer(3, 'decor', decor),
      { id: 4, name: 'decals', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: decals },
      { id: 5, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
    ],
    tilesets: MANSION_TILESETS.map((name) => ({ firstgid: firstGid[name], source: `tilesets/${name}.tsj` })),
  };
}

export function readMansionTilesets(tilesetsDir: string): Record<TilesetName, Tsj> {
  const out = {} as Record<TilesetName, Tsj>;
  for (const name of MANSION_TILESETS) {
    const path = resolve(tilesetsDir, `${name}.tsj`);
    if (!existsSync(path)) throw new Error(`Falta ${path}: ejecuta npm run tiles:import`);
    out[name] = JSON.parse(readFileSync(path, 'utf8')) as Tsj;
  }
  return out;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const out = resolve(root, 'art-src/tiled/mansion.tmj');
  const force = process.argv.includes('--force');
  if (existsSync(out) && !force) {
    console.error(
      `✖ ${out} ya existe y puede tener retoques hechos en Tiled.\n` +
        '  No se sobrescribe. Si quieres regenerarlo desde la spec y perder los retoques: npm run map:mansion -- --force',
    );
    process.exitCode = 1;
    return;
  }
  try {
    const map = buildMansionMap(readMansionTilesets(resolve(root, 'art-src/tiled/tilesets')));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(map, null, 1)}\n`);
    console.info(`${force ? '⚠ Regenerado (retoques perdidos)' : 'Generado'}: ${out}\nSiguiente paso: npm run map:build`);
  } catch (err) {
    console.error(`✖ ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
