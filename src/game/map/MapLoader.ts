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

/** Per-tile flags from the tileset properties, indexed by global tile id. */
export const TILE_COLLIDES = 1;
export const TILE_WATER = 2;
export const TILE_VOID = 4;

export interface MapTileset {
  name: string;
  /** Global id of this tileset's tile 0. */
  firstGid: number;
  image: string;
  tileWidth: number;
  tileHeight: number;
  columns: number;
  tileCount: number;
  imageWidth: number;
  imageHeight: number;
  /** Flags (TILE_*) of each local tile id. */
  flags: Uint8Array;
}

/** A tile object of the `decals` layer: drawn from its bottom-left corner. */
export interface MapDecal {
  gid: number;
  x: number;
  y: number;
}

export interface MapZone {
  id: string;
  name: string;
  startsUnlocked: boolean;
  /** Indoor room: needs at least two barricades (map validator). */
  interior: boolean;
  /** Zombies may also appear at open spawns inside this zone (street, roof). */
  openSpawns: boolean;
  /** Rectangle in world px. */
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A wall runs horizontally (top/bottom wall) or vertically (left/right). */
export type WallAxis = 'horizontal' | 'vertical';

/** A barricade in a house wall or a gap in the garden fence: same mechanics, different art. */
export type WindowKind = 'window' | 'fence';

export interface MapWindow {
  id: string;
  kind: WindowKind;
  zone: string;
  /** Index into MapData.zones. */
  zoneIndex: number;
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
  /** Indices into MapData.zones. */
  fromZoneIndex: number;
  toZoneIndex: number;
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
  /** Index into MapData.windows. */
  windowIndex: number;
}

/** A zombie_spawn without a window: zombies appear right there (spec 02 §3.4). */
export interface MapOpenSpawn {
  x: number;
  y: number;
  zoneIndex: number;
}

/** Stairs and ladders show "ABRIR ESCALERA"; the hatch shows "ABRIR TRAMPILLA". */
export type PortalKind = 'stairs' | 'ladder' | 'hatch';
export const PORTAL_KINDS: readonly PortalKind[] = ['stairs', 'ladder', 'hatch'];

/** One end of a portal: stepping in takes you to the other end (spec 02 §3.6). */
export interface MapPortal {
  id: string;
  pairId: string;
  /** Index of the other end in MapData.portals. */
  other: number;
  /** Shared by both ends: index into GameState.portalsOpen. */
  link: number;
  cost: number;
  zone: string;
  zoneIndex: number;
  /** Second entrance to an island: only buyable once the island is unlocked. */
  secondary: boolean;
  kind: PortalKind;
  /** Rectangle in world px. */
  x: number;
  y: number;
  width: number;
  height: number;
  center: Vec2;
  tiles: Vec2[];
  /** Where travellers appear: the centre of the other end. */
  arrival: Vec2;
}

export interface MapData {
  /** Size in tiles. */
  width: number;
  height: number;
  tileSize: number;
  /** Size in world px. */
  widthPx: number;
  heightPx: number;
  tilesets: MapTileset[];
  /** Flags (TILE_*) per global tile id. */
  gidFlags: Uint8Array;
  /** Global tile id per cell (row-major), 0 when empty. */
  floor: Int32Array;
  walls: Int32Array;
  decor: Int32Array;
  decals: MapDecal[];
  zones: MapZone[];
  windows: MapWindow[];
  doors: MapDoor[];
  zombieSpawns: MapZombieSpawn[];
  openSpawns: MapOpenSpawn[];
  portals: MapPortal[];
  /** Number of portal pairs (length of GameState.portalsOpen). */
  portalLinks: number;
  /** Portal end per cell (row-major), -1 where there is none. */
  cellPortal: Int16Array;
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

const GID_MASK = 0x1fffffff; // strips Tiled's flip flags

function parseTilesets(map: TiledMap): MapTileset[] {
  if (map.tilesets.length === 0) fail('The map needs at least one embedded tileset');
  const tilesets = map.tilesets.map((t: TiledTileset): MapTileset => {
    if (t.source) fail(`Tileset "${t.source}" is external: run npm run map:build to embed it in the .tmj`);
    const flags = new Uint8Array(Math.max(0, t.tilecount));
    for (const tile of t.tiles ?? []) {
      if (tile.id < 0 || tile.id >= flags.length) continue;
      for (const p of tile.properties ?? []) {
        if (p.value !== true) continue;
        if (p.name === 'collides') flags[tile.id]! |= TILE_COLLIDES;
        else if (p.name === 'water') flags[tile.id]! |= TILE_WATER;
        else if (p.name === 'void') flags[tile.id]! |= TILE_VOID;
      }
    }
    return {
      name: t.name,
      firstGid: t.firstgid,
      image: t.image,
      tileWidth: t.tilewidth,
      tileHeight: t.tileheight,
      columns: t.columns,
      tileCount: t.tilecount,
      imageWidth: t.imagewidth,
      imageHeight: t.imageheight,
      flags,
    };
  });
  return tilesets.sort((a, b) => a.firstGid - b.firstGid);
}

function buildGidFlags(tilesets: readonly MapTileset[]): Uint8Array {
  const maxGid = tilesets.reduce((m, t) => Math.max(m, t.firstGid + t.tileCount), 1);
  const flags = new Uint8Array(maxGid);
  for (const t of tilesets) flags.set(t.flags, t.firstGid);
  return flags;
}

/** The tileset a global id belongs to (tilesets sorted by firstGid). */
export function tilesetForGid(tilesets: readonly MapTileset[], gid: number): MapTileset | undefined {
  let found: MapTileset | undefined;
  for (const t of tilesets) if (gid >= t.firstGid) found = t;
  return found && gid < found.firstGid + found.tileCount ? found : undefined;
}

function toGids(layer: TiledTileLayer | undefined, size: number): Int32Array {
  const out = new Int32Array(size);
  if (!layer) return out;
  for (let i = 0; i < size; i++) out[i] = (layer.data[i] ?? 0) & GID_MASK;
  return out;
}

function parseDecals(map: TiledMap): MapDecal[] {
  const layer = findLayer(map, LAYER_NAMES.decals);
  if (!layer || layer.type !== 'objectgroup') return [];
  return layer.objects
    .filter((o) => typeof o.gid === 'number' && o.gid > 0)
    .map((o) => ({ gid: (o.gid ?? 0) & GID_MASK, x: o.x, y: o.y }));
}

function axisOf(outward: Vec2): WallAxis {
  return outward.y !== 0 ? 'horizontal' : 'vertical';
}

interface TileRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  tiles: Vec2[];
}

/** Tiles covered by a rectangle object (at least one). */
function rectTiles(obj: TiledObject, tileSize: number): TileRect {
  const x0 = Math.round(obj.x / tileSize);
  const y0 = Math.round(obj.y / tileSize);
  const x1 = Math.max(x0 + 1, Math.round((obj.x + obj.width) / tileSize));
  const y1 = Math.max(y0 + 1, Math.round((obj.y + obj.height) / tileSize));
  const tiles: Vec2[] = [];
  for (let ty = y0; ty < y1; ty++) for (let tx = x0; tx < x1; tx++) tiles.push({ x: tx, y: ty });
  return { x0, y0, x1, y1, tiles };
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
  const tilesets = parseTilesets(map);
  const gidFlags = buildGidFlags(tilesets);
  const floor = toGids(tileLayer(map, LAYER_NAMES.floor, true), size);
  const walls = toGids(tileLayer(map, LAYER_NAMES.walls, true), size);
  const decor = toGids(tileLayer(map, LAYER_NAMES.decor, false), size);
  const decals = parseDecals(map);

  const objectsLayer = findLayer(map, LAYER_NAMES.objects);
  if (!objectsLayer || objectsLayer.type !== 'objectgroup') fail('Missing object layer "objects"');
  const objects = objectsLayer.objects;

  const zones: MapZone[] = [];
  const rawWindows: TiledObject[] = [];
  const rawDoors: TiledObject[] = [];
  const zombieSpawns: MapZombieSpawn[] = [];
  const rawOpenSpawns: TiledObject[] = [];
  const rawPortals: TiledObject[] = [];
  let playerSpawn: Vec2 | undefined;

  for (const obj of objects) {
    switch (objectType(obj)) {
      case 'zone':
        zones.push({
          id: stringProp(obj, 'id'),
          name: stringProp(obj, 'name', false) || obj.name,
          startsUnlocked: boolProp(obj, 'startsUnlocked', false),
          interior: boolProp(obj, 'interior', false),
          openSpawns: boolProp(obj, 'openSpawns', false),
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
      case 'zombie_spawn': {
        const window = stringProp(obj, 'window', false);
        if (window) zombieSpawns.push({ x: obj.x, y: obj.y, window, windowIndex: -1 });
        else rawOpenSpawns.push(obj);
        break;
      }
      case 'door':
        rawDoors.push(obj);
        break;
      case 'portal':
        rawPortals.push(obj);
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
    tx >= 0 && ty >= 0 && tx < width && ty < height && (floor[ty * width + tx] ?? 0) !== 0;

  const windows: MapWindow[] = rawWindows.map((obj) => {
    const id = stringProp(obj, 'id');
    const zone = stringProp(obj, 'zone');
    if (!zoneIds.has(zone)) fail(`Window ${id} references unknown zone "${zone}"`);
    const kind = stringProp(obj, 'kind', false) || 'window';
    if (kind !== 'window' && kind !== 'fence') fail(`Window ${id} has unknown kind "${kind}" (window | fence)`);
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
      kind,
      zone,
      zoneIndex: zones.findIndex((z) => z.id === zone),
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
    spawn.windowIndex = windows.findIndex((w) => w.id === spawn.window);
    if (spawn.windowIndex < 0) fail(`zombie_spawn references unknown window "${spawn.window}"`);
  }

  const doors: MapDoor[] = rawDoors.map((obj) => {
    const id = stringProp(obj, 'id');
    const fromZone = stringProp(obj, 'fromZone');
    const toZone = stringProp(obj, 'toZone');
    if (!zoneIds.has(fromZone)) fail(`Door ${id} references unknown zone "${fromZone}"`);
    if (!zoneIds.has(toZone)) fail(`Door ${id} references unknown zone "${toZone}"`);
    const { x0, y0, x1, y1, tiles } = rectTiles(obj, tileSize);
    const first = tiles[0] ?? { x: x0, y: y0 };
    let axis: WallAxis;
    if (x1 - x0 !== y1 - y0) axis = x1 - x0 > y1 - y0 ? 'horizontal' : 'vertical';
    else axis = isFloor(first.x, first.y - 1) || isFloor(first.x, first.y + 1) ? 'horizontal' : 'vertical';
    return {
      id,
      cost: numberProp(obj, 'cost'),
      fromZone,
      toZone,
      fromZoneIndex: zones.findIndex((z) => z.id === fromZone),
      toZoneIndex: zones.findIndex((z) => z.id === toZone),
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

  const zoneAt = (x: number, y: number): number => {
    const tx = Math.floor(x / tileSize);
    const ty = Math.floor(y / tileSize);
    return tx >= 0 && ty >= 0 && tx < width && ty < height ? (cellZone[ty * width + tx] ?? -1) : -1;
  };
  const openSpawns: MapOpenSpawn[] = rawOpenSpawns.map((obj) => {
    const zoneIndex = zoneAt(obj.x, obj.y);
    const zone = zones[zoneIndex];
    if (!zone?.openSpawns) fail(`Open zombie_spawn ${obj.id} must lie in a zone with openSpawns = true`);
    return { x: obj.x, y: obj.y, zoneIndex };
  });

  const portals = parsePortals(rawPortals, zones, tileSize);
  const cellPortal = new Int16Array(size).fill(-1);
  portals.forEach((portal, i) => {
    for (const t of portal.tiles) {
      if (t.x >= 0 && t.y >= 0 && t.x < width && t.y < height) cellPortal[t.y * width + t.x] = i;
    }
  });

  return {
    width,
    height,
    tileSize,
    widthPx: width * tileSize,
    heightPx: height * tileSize,
    tilesets,
    gidFlags,
    floor,
    walls,
    decor,
    decals,
    zones,
    windows,
    doors,
    zombieSpawns,
    openSpawns,
    portals,
    portalLinks: portals.reduce((n, p) => Math.max(n, p.link + 1), 0),
    cellPortal,
    playerSpawn,
    cellZone,
  };
}

function parsePortals(raw: readonly TiledObject[], zones: readonly MapZone[], tileSize: number): MapPortal[] {
  const portals: MapPortal[] = raw.map((obj) => {
    const id = stringProp(obj, 'id');
    const zone = stringProp(obj, 'zone');
    const zoneIndex = zones.findIndex((z) => z.id === zone);
    if (zoneIndex < 0) fail(`Portal ${id} references unknown zone "${zone}"`);
    const kind = stringProp(obj, 'kind', false) || 'stairs';
    if (!PORTAL_KINDS.includes(kind as PortalKind)) fail(`Portal ${id} has unknown kind "${kind}" (${PORTAL_KINDS.join(' | ')})`);
    const { x0, y0, x1, y1, tiles } = rectTiles(obj, tileSize);
    const center = { x: ((x0 + x1) / 2) * tileSize, y: ((y0 + y1) / 2) * tileSize };
    return {
      id,
      pairId: stringProp(obj, 'pair'),
      other: -1,
      link: -1,
      cost: numberProp(obj, 'cost'),
      zone,
      zoneIndex,
      secondary: boolProp(obj, 'secondary', false),
      kind: kind as PortalKind,
      x: x0 * tileSize,
      y: y0 * tileSize,
      width: (x1 - x0) * tileSize,
      height: (y1 - y0) * tileSize,
      center,
      tiles,
      arrival: center,
    };
  });
  if (new Set(portals.map((p) => p.id)).size !== portals.length) fail('Portal ids must be unique');
  let links = 0;
  portals.forEach((portal, i) => {
    const other = portals.findIndex((p) => p.id === portal.pairId);
    if (other < 0 || other === i) fail(`Portal ${portal.id} references unknown pair "${portal.pairId}"`);
    const back = portals[other];
    if (back?.pairId !== portal.id) fail(`Portals ${portal.id} and ${portal.pairId} must reference each other`);
    portal.other = other;
    portal.arrival = back.center;
    if (portal.link < 0) {
      portal.link = links;
      back.link = links++;
    }
  });
  return portals;
}
