import { BARRICADES } from '../../config/balance';
import {
  LAYER_NAMES,
  type TiledLayer,
  type TiledMap,
  type TiledObject,
  type TiledProperty,
  type TiledTileLayer,
  type TiledTileset,
} from './tiled';

/**
 * Pure map parser: reads a Tiled .tmj and builds the static data the
 * simulation needs (zones, windows, doors, spawns). No Phaser here so a
 * future server can load the same map.
 */

export interface Vec2 {
  x: number;
  y: number;
}

export interface MapTileset {
  name: string;
  image: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  imageWidth: number;
  imageHeight: number;
  /** Local tile ids (0-based) whose `collides` property is true. */
  collides: ReadonlySet<number>;
}

export interface MapZone {
  id: string;
  name: string;
  startsUnlocked: boolean;
  /** Rectangle in world px. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A wall runs horizontally (top/bottom wall) or vertically (left/right). */
export type WallAxis = 'horizontal' | 'vertical';

export interface MapWindow {
  id: string;
  zone: string;
  planks: number;
  tileX: number;
  tileY: number;
  /** Centre of the window tile, world px. */
  center: Vec2;
  /** Unit vector pointing out of the building. */
  outward: Vec2;
  /** Where zombies stand to tear planks, just outside the window. */
  exterior: Vec2;
  /** Where zombies land after climbing, the tile right in front inside. */
  interior: Vec2;
  axis: WallAxis;
}

export interface MapDoor {
  id: string;
  cost: number;
  fromZone: string;
  toZone: string;
  /** Rectangle in world px. */
  x: number;
  y: number;
  width: number;
  height: number;
  center: Vec2;
  tiles: Vec2[];
  axis: WallAxis;
}

export interface MapZombieSpawn {
  x: number;
  y: number;
  window: string;
}

export interface MapData {
  /** Size in tiles. */
  width: number;
  height: number;
  tileSize: number;
  /** Size in world px. */
  widthPx: number;
  heightPx: number;
  tileset: MapTileset;
  /** Local tile id per cell (row-major), -1 when empty. */
  floor: Int16Array;
  walls: Int16Array;
  decor: Int16Array;
  zones: MapZone[];
  windows: MapWindow[];
  doors: MapDoor[];
  zombieSpawns: MapZombieSpawn[];
  playerSpawn: Vec2;
  /** Zone index per cell (row-major), -1 outside every zone. */
  cellZone: Int16Array;
}

export class MapParseError extends Error {
  override name = 'MapParseError';
}

function fail(message: string): never {
  throw new MapParseError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function objectType(obj: TiledObject): string {
  return obj.type || obj.class || '';
}

function prop(obj: TiledObject, name: string): TiledProperty['value'] | undefined {
  return obj.properties?.find((p) => p.name === name)?.value;
}

function stringProp(obj: TiledObject, name: string, required = true): string {
  const value = prop(obj, name);
  if (typeof value === 'string' && value.length > 0) return value;
  if (!required) return '';
  return fail(`Object ${obj.id} (${objectType(obj)}) needs string property "${name}"`);
}

function numberProp(obj: TiledObject, name: string, fallback?: number): number {
  const value = prop(obj, name);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (fallback !== undefined) return fallback;
  return fail(`Object ${obj.id} (${objectType(obj)}) needs numeric property "${name}"`);
}

function boolProp(obj: TiledObject, name: string, fallback: boolean): boolean {
  const value = prop(obj, name);
  return typeof value === 'boolean' ? value : fallback;
}

function findLayer(map: TiledMap, name: string): TiledLayer | undefined {
  return map.layers.find((layer) => layer.name === name);
}

function tileLayer(map: TiledMap, name: string, required: boolean): TiledTileLayer | undefined {
  const layer = findLayer(map, name);
  if (!layer) return required ? fail(`Missing tile layer "${name}"`) : undefined;
  if (layer.type !== 'tilelayer') fail(`Layer "${name}" must be a tile layer`);
  if (!Array.isArray(layer.data) || layer.data.length !== map.width * map.height) {
    fail(`Layer "${name}" must be an uncompressed CSV/array layer of ${map.width}×${map.height}`);
  }
  return layer;
}

function parseTileset(map: TiledMap): TiledTileset {
  const tileset = map.tilesets[0];
  if (!tileset) return fail('The map needs one embedded tileset');
  if (map.tilesets.length > 1) fail('Only one tileset per map is supported');
  if (tileset.source) fail(`Tileset "${tileset.source}" must be embedded in the .tmj`);
  return tileset;
}

function toLocalIds(layer: TiledTileLayer | undefined, size: number, firstGid: number): Int16Array {
  const out = new Int16Array(size).fill(-1);
  if (!layer) return out;
  for (let i = 0; i < size; i++) {
    // Strip Tiled's flip flags from the top three bits.
    const gid = (layer.data[i] ?? 0) & 0x1fffffff;
    out[i] = gid === 0 ? -1 : gid - firstGid;
  }
  return out;
}

function axisOf(outward: Vec2): WallAxis {
  return outward.y !== 0 ? 'horizontal' : 'vertical';
}

export function parseMap(json: unknown): MapData {
  if (!isRecord(json) || json.type !== 'map') fail('Not a Tiled map (.tmj)');
  const map = json as unknown as TiledMap;
  if (map.orientation !== 'orthogonal') fail('Only orthogonal maps are supported');
  if (map.infinite) fail('Infinite maps are not supported');
  if (map.tilewidth !== map.tileheight) fail('Tiles must be square');

  const { width, height } = map;
  const tileSize = map.tilewidth;
  const size = width * height;
  const rawTileset = parseTileset(map);

  const collides = new Set<number>();
  for (const tile of rawTileset.tiles ?? []) {
    if (tile.properties?.some((p) => p.name === 'collides' && p.value === true)) collides.add(tile.id);
  }

  const tileset: MapTileset = {
    name: rawTileset.name,
    image: rawTileset.image,
    tileWidth: rawTileset.tilewidth,
    tileHeight: rawTileset.tileheight,
    columns: rawTileset.columns,
    tileCount: rawTileset.tilecount,
    imageWidth: rawTileset.imagewidth,
    imageHeight: rawTileset.imageheight,
    collides,
  };

  const floor = toLocalIds(tileLayer(map, LAYER_NAMES.floor, true), size, rawTileset.firstgid);
  const walls = toLocalIds(tileLayer(map, LAYER_NAMES.walls, true), size, rawTileset.firstgid);
  const decor = toLocalIds(tileLayer(map, LAYER_NAMES.decor, false), size, rawTileset.firstgid);

  const objectsLayer = findLayer(map, LAYER_NAMES.objects);
  if (!objectsLayer || objectsLayer.type !== 'objectgroup') fail('Missing object layer "objects"');
  const objects = objectsLayer.objects;

  const zones: MapZone[] = [];
  const rawWindows: TiledObject[] = [];
  const rawDoors: TiledObject[] = [];
  const zombieSpawns: MapZombieSpawn[] = [];
  let playerSpawn: Vec2 | undefined;

  for (const obj of objects) {
    switch (objectType(obj)) {
      case 'zone':
        zones.push({
          id: stringProp(obj, 'id'),
          name: stringProp(obj, 'name', false) || obj.name,
          startsUnlocked: boolProp(obj, 'startsUnlocked', false),
          x: obj.x,
          y: obj.y,
          width: obj.width,
          height: obj.height,
        });
        break;
      case 'player_spawn':
        playerSpawn = { x: obj.x, y: obj.y };
        break;
      case 'window':
        rawWindows.push(obj);
        break;
      case 'zombie_spawn':
        zombieSpawns.push({ x: obj.x, y: obj.y, window: stringProp(obj, 'window') });
        break;
      case 'door':
        rawDoors.push(obj);
        break;
      default:
        // Unknown objects are ignored so designers can annotate maps freely.
        break;
    }
  }

  if (!playerSpawn) fail('Missing player_spawn object');
  if (zones.length === 0) fail('The map needs at least one zone');
  if (!zones.some((z) => z.startsUnlocked)) fail('At least one zone must have startsUnlocked = true');

  const zoneIds = new Set(zones.map((z) => z.id));
  const cellZone = new Int16Array(size).fill(-1);
  zones.forEach((zone, index) => {
    const x0 = Math.floor(zone.x / tileSize);
    const y0 = Math.floor(zone.y / tileSize);
    const x1 = Math.ceil((zone.x + zone.width) / tileSize);
    const y1 = Math.ceil((zone.y + zone.height) / tileSize);
    for (let ty = Math.max(0, y0); ty < Math.min(height, y1); ty++) {
      for (let tx = Math.max(0, x0); tx < Math.min(width, x1); tx++) cellZone[ty * width + tx] = index;
    }
  });

  const isFloor = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < width && ty < height && (floor[ty * width + tx] ?? -1) >= 0;

  const windows: MapWindow[] = rawWindows.map((obj) => {
    const id = stringProp(obj, 'id');
    const zone = stringProp(obj, 'zone');
    if (!zoneIds.has(zone)) fail(`Window ${id} references unknown zone "${zone}"`);
    const tileX = Math.floor((obj.x + obj.width / 2) / tileSize);
    const tileY = Math.floor((obj.y + obj.height / 2) / tileSize);
    const center = { x: (tileX + 0.5) * tileSize, y: (tileY + 0.5) * tileSize };

    // Outward is away from the interior floor next to the window.
    let outward: Vec2 | undefined;
    if (isFloor(tileX, tileY + 1) && !isFloor(tileX, tileY - 1)) outward = { x: 0, y: -1 };
    else if (isFloor(tileX, tileY - 1) && !isFloor(tileX, tileY + 1)) outward = { x: 0, y: 1 };
    else if (isFloor(tileX + 1, tileY) && !isFloor(tileX - 1, tileY)) outward = { x: -1, y: 0 };
    else if (isFloor(tileX - 1, tileY) && !isFloor(tileX + 1, tileY)) outward = { x: 1, y: 0 };
    if (!outward) {
      // Fall back to the direction of its zombie spawn.
      const spawn = zombieSpawns.find((s) => s.window === id);
      if (!spawn) return fail(`Window ${id} has no interior floor next to it and no zombie_spawn`);
      const dx = spawn.x - center.x;
      const dy = spawn.y - center.y;
      outward = Math.abs(dx) > Math.abs(dy) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    }

    return {
      id,
      zone,
      planks: numberProp(obj, 'planks', BARRICADES.planksPerWindow),
      tileX,
      tileY,
      center,
      outward,
      exterior: { x: center.x + outward.x * tileSize * 0.75, y: center.y + outward.y * tileSize * 0.75 },
      interior: { x: center.x - outward.x * tileSize, y: center.y - outward.y * tileSize },
      axis: axisOf(outward),
    };
  });

  const windowIds = new Set(windows.map((w) => w.id));
  if (windowIds.size !== windows.length) fail('Window ids must be unique');
  for (const spawn of zombieSpawns) {
    if (!windowIds.has(spawn.window)) fail(`zombie_spawn references unknown window "${spawn.window}"`);
  }

  const doors: MapDoor[] = rawDoors.map((obj) => {
    const id = stringProp(obj, 'id');
    const fromZone = stringProp(obj, 'fromZone');
    const toZone = stringProp(obj, 'toZone');
    if (!zoneIds.has(fromZone)) fail(`Door ${id} references unknown zone "${fromZone}"`);
    if (!zoneIds.has(toZone)) fail(`Door ${id} references unknown zone "${toZone}"`);
    const tiles: Vec2[] = [];
    const x0 = Math.round(obj.x / tileSize);
    const y0 = Math.round(obj.y / tileSize);
    const x1 = Math.max(x0 + 1, Math.round((obj.x + obj.width) / tileSize));
    const y1 = Math.max(y0 + 1, Math.round((obj.y + obj.height) / tileSize));
    for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) tiles.push({ x: tx, y: ty });
    const first = tiles[0] ?? { x: x0, y: y0 };
    let axis: WallAxis;
    if (x1 - x0 !== y1 - y0) axis = x1 - x0 > y1 - y0 ? 'horizontal' : 'vertical';
    else axis = isFloor(first.x, first.y - 1) || isFloor(first.x, first.y + 1) ? 'horizontal' : 'vertical';
    return {
      id,
      cost: numberProp(obj, 'cost'),
      fromZone,
      toZone,
      x: x0 * tileSize,
      y: y0 * tileSize,
      width: (x1 - x0) * tileSize,
      height: (y1 - y0) * tileSize,
      center: { x: ((x0 + x1) / 2) * tileSize, y: ((y0 + y1) / 2) * tileSize },
      tiles,
      axis,
    };
  });

  if (new Set(doors.map((d) => d.id)).size !== doors.length) fail('Door ids must be unique');

  return {
    width,
    height,
    tileSize,
    widthPx: width * tileSize,
    heightPx: height * tileSize,
    tileset,
    floor,
    walls,
    decor,
    zones,
    windows,
    doors,
    zombieSpawns,
    playerSpawn,
    cellZone,
  };
}
