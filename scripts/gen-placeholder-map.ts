/**
 * Generates public/assets/maps/room01.tmj: the placeholder test map from
 * spec 01 §3, in the Tiled format of docs/ASSETS.md §5. A real map drawn in
 * Tiled can replace the file directly.
 *
 * Layout (tile coordinates, interiors):
 *   inicio   14×9 at (4,4)   unlocked, windows W1 (top), W2 (left), W3 (right)
 *   pasillo  16×5 at (4,14)  below inicio, W4 (bottom), W5 (right), door D1 (750)
 *   almacen   8×8 at (21,17) right of pasillo, W6 (right), door D2 (1000)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TiledMap, TiledObject, TiledProperty } from '../src/game/map/tiled';

const TILE = 32;
const WIDTH = 33;
const HEIGHT = 28;

/** Local tile ids in the placeholder `interior` tileset. */
export const PLACEHOLDER_TILES = { floor: 0, wall: 1 } as const;
const FIRST_GID = 1;
const GID_FLOOR = FIRST_GID + PLACEHOLDER_TILES.floor;
const GID_WALL = FIRST_GID + PLACEHOLDER_TILES.wall;

interface Room {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  startsUnlocked: boolean;
}

interface WindowDef {
  id: string;
  zone: string;
  tx: number;
  ty: number;
  /** Unit vector pointing outside, used to place the spawn 2 tiles away. */
  out: [number, number];
}

interface DoorDef {
  id: string;
  cost: number;
  fromZone: string;
  toZone: string;
  tiles: [number, number][];
}

const ROOMS: Room[] = [
  { id: 'inicio', name: 'Inicio', x: 4, y: 4, w: 14, h: 9, startsUnlocked: true },
  { id: 'pasillo', name: 'Pasillo', x: 4, y: 14, w: 16, h: 5, startsUnlocked: false },
  { id: 'almacen', name: 'Almacén', x: 21, y: 17, w: 8, h: 8, startsUnlocked: false },
];

const WINDOWS: WindowDef[] = [
  { id: 'W1', zone: 'inicio', tx: 10, ty: 3, out: [0, -1] },
  { id: 'W2', zone: 'inicio', tx: 3, ty: 8, out: [-1, 0] },
  { id: 'W3', zone: 'inicio', tx: 18, ty: 8, out: [1, 0] },
  { id: 'W4', zone: 'pasillo', tx: 9, ty: 19, out: [0, 1] },
  { id: 'W5', zone: 'pasillo', tx: 20, ty: 14, out: [1, 0] },
  { id: 'W6', zone: 'almacen', tx: 29, ty: 21, out: [1, 0] },
];

const DOORS: DoorDef[] = [
  { id: 'D1', cost: 750, fromZone: 'inicio', toZone: 'pasillo', tiles: [[10, 13], [11, 13]] },
  { id: 'D2', cost: 1000, fromZone: 'pasillo', toZone: 'almacen', tiles: [[20, 17], [20, 18]] },
];

const WINDOW_PLANKS = 5;
const SPAWN_DISTANCE_TILES = 2;

function p(name: string, type: TiledProperty['type'], value: TiledProperty['value']): TiledProperty {
  return { name, type, value };
}

export function buildRoom01Map(): TiledMap {
  const floor = new Array<number>(WIDTH * HEIGHT).fill(0);
  const walls = new Array<number>(WIDTH * HEIGHT).fill(0);
  const decor = new Array<number>(WIDTH * HEIGHT).fill(0);
  const idx = (x: number, y: number): number => y * WIDTH + x;

  for (const room of ROOMS) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      for (let x = room.x - 1; x <= room.x + room.w; x++) {
        const inside = x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h;
        if (inside) floor[idx(x, y)] = GID_FLOOR;
        else if (floor[idx(x, y)] === 0) walls[idx(x, y)] = GID_WALL;
      }
    }
  }

  // Windows are gaps in the wall; the window sprite draws the barricade.
  for (const w of WINDOWS) walls[idx(w.tx, w.ty)] = 0;
  // Doors are floor under a door sprite; collision comes from the door state.
  for (const d of DOORS) {
    for (const [x, y] of d.tiles) {
      walls[idx(x, y)] = 0;
      floor[idx(x, y)] = GID_FLOOR;
    }
  }

  let nextId = 1;
  const objects: TiledObject[] = [];
  const add = (obj: Omit<TiledObject, 'id' | 'rotation' | 'visible'>): void => {
    objects.push({ id: nextId++, rotation: 0, visible: true, ...obj });
  };

  for (const room of ROOMS) {
    add({
      name: room.id,
      type: 'zone',
      x: room.x * TILE,
      y: room.y * TILE,
      width: room.w * TILE,
      height: room.h * TILE,
      properties: [p('id', 'string', room.id), p('name', 'string', room.name), p('startsUnlocked', 'bool', room.startsUnlocked)],
    });
  }

  const start = ROOMS[0];
  if (!start) throw new Error('No rooms defined');
  add({
    name: 'player',
    type: 'player_spawn',
    point: true,
    x: (start.x + start.w / 2) * TILE,
    y: (start.y + start.h / 2) * TILE,
    width: 0,
    height: 0,
  });

  for (const w of WINDOWS) {
    add({
      name: w.id,
      type: 'window',
      x: w.tx * TILE,
      y: w.ty * TILE,
      width: TILE,
      height: TILE,
      properties: [p('id', 'string', w.id), p('zone', 'string', w.zone), p('planks', 'int', WINDOW_PLANKS)],
    });
    add({
      name: `spawn_${w.id}`,
      type: 'zombie_spawn',
      point: true,
      x: (w.tx + 0.5 + w.out[0] * SPAWN_DISTANCE_TILES) * TILE,
      y: (w.ty + 0.5 + w.out[1] * SPAWN_DISTANCE_TILES) * TILE,
      width: 0,
      height: 0,
      properties: [p('window', 'string', w.id)],
    });
  }

  for (const d of DOORS) {
    const xs = d.tiles.map(([x]) => x);
    const ys = d.tiles.map(([, y]) => y);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    add({
      name: d.id,
      type: 'door',
      x: x0 * TILE,
      y: y0 * TILE,
      width: (Math.max(...xs) - x0 + 1) * TILE,
      height: (Math.max(...ys) - y0 + 1) * TILE,
      properties: [
        p('id', 'string', d.id),
        p('cost', 'int', d.cost),
        p('fromZone', 'string', d.fromZone),
        p('toZone', 'string', d.toZone),
      ],
    });
  }

  const tileLayer = (id: number, name: string, data: number[]) =>
    ({ id, name, type: 'tilelayer', width: WIDTH, height: HEIGHT, x: 0, y: 0, opacity: 1, visible: true, data }) as const;

  const tileCount = Object.keys(PLACEHOLDER_TILES).length;
  return {
    type: 'map',
    version: '1.10',
    tiledversion: '1.11.0',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: WIDTH,
    height: HEIGHT,
    tilewidth: TILE,
    tileheight: TILE,
    nextlayerid: 5,
    nextobjectid: nextId,
    layers: [
      tileLayer(1, 'floor', floor),
      tileLayer(2, 'walls', walls),
      tileLayer(3, 'decor', decor),
      { id: 4, name: 'objects', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
    ],
    tilesets: [
      {
        firstgid: FIRST_GID,
        name: 'interior',
        tilewidth: TILE,
        tileheight: TILE,
        tilecount: tileCount,
        columns: tileCount,
        image: '../tiles/interior.png',
        imagewidth: tileCount * TILE,
        imageheight: TILE,
        margin: 0,
        spacing: 0,
        tiles: [{ id: PLACEHOLDER_TILES.wall, properties: [p('collides', 'bool', true)] }],
      },
    ],
  };
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const out = resolve(root, 'public/assets/maps/room01.tmj');
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(buildRoom01Map(), null, 1)}\n`);
  console.info(`Mapa generado: ${out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
