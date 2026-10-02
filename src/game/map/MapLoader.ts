import { BARRICADES } from '../../config/balance';
import { BASIC_WEAPON_IDS, WEAPON_IDS, type WeaponId } from '../../config/weapons';
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

/**
 * What stands on a blocking tile, for bullets and line of sight (the bodies
 * still stop at whole tiles). WALL_SHAPE_FULL is anything flat drawn on its
 * tile (furniture, doors, walls without a 3/4 kit); WALL_SHAPE_THIN + mask
 * a thin wall of the kit autotile with that neighbour mask (docs/ASSETS.md
 * §7.2: tiles 0–15 carry a `mask` property); WALL_SHAPE_SOLID a kit's thick
 * wall, and WALL_SHAPE_SOLID_NORTH_OPEN one with nothing north.
 */
export const WALL_SHAPE_FULL = 0;
export const WALL_SHAPE_THIN = 1;
export const WALL_SHAPE_SOLID_NORTH_OPEN = 17;
export const WALL_SHAPE_SOLID = 18;
/** Kit layout (scripts/lib/wall-autotile.ts): tiles 16–19 are thick walls, +2 when the north is open. */
const KIT_SOLID_BASE = 16;
const KIT_SOLID_COUNT = 4;
const KIT_SOLID_NORTH_OPEN = 2;

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
  /** Wall shape per local tile id (WALL_SHAPE_*). */
  shapes: Uint8Array;
}

/** A tile object of the `decals` layer: drawn from its bottom-left corner, maybe mirrored. */
export interface MapDecal {
  gid: number;
  x: number;
  y: number;
  flipX: boolean;
  flipY: boolean;
}

/** Furniture or clutter (`props` layer): a manifest object over whole tiles. */
export interface MapProp {
  id: string;
  /** Manifest object key (prop_*). */
  key: string;
  /** Footprint in world px. */
  x: number;
  y: number;
  width: number;
  height: number;
  tiles: Vec2[];
  /** Blocks players, zombies and bullets; otherwise it lies on the floor (rugs, rubble). */
  collides: boolean;
  flipX: boolean;
  flipY: boolean;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapZone {
  id: string;
  name: string;
  startsUnlocked: boolean;
  /** Indoor room: needs at least two barricades (map validator). */
  interior: boolean;
  /** Zombies may also appear at open spawns inside this zone (street, roof). */
  openSpawns: boolean;
  /**
   * Price to unlock it: the same through any of its doors or main stairs
   * (0 for the zones the match starts with). Once unlocked, every door and
   * portal between it and another unlocked zone opens by itself.
   */
  cost: number;
  /** Bounding box in world px. */
  x: number;
  y: number;
  width: number;
  height: number;
  /**
   * The zone's area in world px. Several zone objects with the same id add
   * up to one zone, so a zone can be an L or any other shape.
   */
  rects: Rect[];
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
  /** Zone the spawn point lies in, -1 outside every zone. Once it is unlocked, players walk there: the spawn is off. */
  zoneIndex: number;
}

/**
 * A zombie_spawn without a window: an entrance from beyond the map's edge,
 * or from the void round an island (spec 02 §3.4, docs/DECISIONS.md). The
 * zombie appears at (x, y), where the camera never reaches, and walks
 * straight in to `entry`, the centre of the first tile of its zone.
 */
export interface MapOpenSpawn {
  x: number;
  y: number;
  zoneIndex: number;
  entry: Vec2;
}

/** How far an open spawn may lie from the first tile of its zone, in tiles (straight, over void or off the map). */
export const OPEN_SPAWN_MAX_STEPS = 3;

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

/** Which way a weapon case's front looks: never north, its front must face the camera (spec 04 §3). */
export type CaseFacing = 'south' | 'east' | 'west';

/** A weapon case (spec 04 §3): fixed furniture of 1 tile that sells a basic weapon, bought from its front. */
export interface MapWeaponCase {
  id: string;
  tileX: number;
  tileY: number;
  /** Centre of its tile in world px. */
  x: number;
  y: number;
  facing: CaseFacing;
  weapon: WeaponId;
  /** Price in money ($). */
  cost: number;
  zone: string;
  zoneIndex: number;
}

/** Where a merchant can stand (spec 03 §1): against a wall, clear of passages. */
export interface MapMerchantSpot {
  /** Point in world px: the merchant's feet. */
  x: number;
  y: number;
  zone: string;
  zoneIndex: number;
}

/** Where a special item can lie (spec 05 §2): the centre of a floor tile, in a zone. */
export interface MapItemSpot {
  /** Point in world px. */
  x: number;
  y: number;
  zone: string;
  zoneIndex: number;
}

/** A place where special items are used (spec 05 §6): a rectangle in world px, named for activations.ts. */
export interface MapActivationSite {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zone: string;
  zoneIndex: number;
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
  /** Wall shape (WALL_SHAPE_*) per global tile id. */
  gidShapes: Uint8Array;
  /** Global tile id per cell (row-major), 0 when empty. */
  floor: Int32Array;
  /** Soft shadows at the foot of walls and furniture (drawn over the floor). */
  shadows: Int32Array;
  walls: Int32Array;
  /** Front faces in the kit of the side they look onto, drawn over `walls` (0 where the face is the wall's own). */
  wallFaces: Int32Array;
  /** Arms of a junction in the kit of the wall they reach, drawn over the faces (0 where walls of one kit meet). */
  wallJoins: Int32Array;
  decor: Int32Array;
  decals: MapDecal[];
  props: MapProp[];
  zones: MapZone[];
  windows: MapWindow[];
  doors: MapDoor[];
  zombieSpawns: MapZombieSpawn[];
  openSpawns: MapOpenSpawn[];
  portals: MapPortal[];
  merchantSpots: MapMerchantSpot[];
  /** Indices into merchantSpots per zone (parallel to zones). */
  zoneMerchantSpots: number[][];
  weaponCases: MapWeaponCase[];
  itemSpots: MapItemSpot[];
  activationSites: MapActivationSite[];
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

const CASE_FACINGS: readonly CaseFacing[] = ['south', 'east', 'west'];

/** `weapon_case` objects (rectangles of 1 tile): weapon, cost, facing and zone, checked against the catalogue. */
function parseWeaponCases(raw: readonly TiledObject[], zones: readonly MapZone[], tileSize: number, width: number, height: number): MapWeaponCase[] {
  return raw.map((obj) => {
    const who = `weapon_case ${obj.id}`;
    const weapon = stringProp(obj, 'weapon');
    if (!(WEAPON_IDS as readonly string[]).includes(weapon)) fail(`${who} sells unknown weapon "${weapon}"`);
    if (!(BASIC_WEAPON_IDS as readonly string[]).includes(weapon)) fail(`${who} sells "${weapon}": cases only sell basic weapons (spec 06 §1)`);
    const facing = stringProp(obj, 'facing');
    if (!(CASE_FACINGS as readonly string[]).includes(facing)) fail(`${who} faces "${facing}": it must be south, east or west (never north)`);
    const cost = numberProp(obj, 'cost');
    if (cost <= 0) fail(`${who} needs a positive cost`);
    const zone = stringProp(obj, 'zone');
    const zoneIndex = zones.findIndex((z) => z.id === zone);
    if (zoneIndex < 0) fail(`${who} references unknown zone "${zone}"`);
    // The tile under the rectangle's centre (points work too).
    const tileX = Math.floor((obj.x + obj.width / 2) / tileSize);
    const tileY = Math.floor((obj.y + obj.height / 2) / tileSize);
    if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) fail(`${who} is outside the map`);
    return {
      id: obj.name || String(obj.id),
      tileX,
      tileY,
      x: (tileX + 0.5) * tileSize,
      y: (tileY + 0.5) * tileSize,
      facing: facing as CaseFacing,
      weapon: weapon as WeaponId,
      cost,
      zone,
      zoneIndex,
    };
  });
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
const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;

function parseTilesets(map: TiledMap): MapTileset[] {
  if (map.tilesets.length === 0) fail('The map needs at least one embedded tileset');
  const tilesets = map.tilesets.map((t: TiledTileset): MapTileset => {
    if (t.source) fail(`Tileset "${t.source}" is external: run npm run map:build to embed it in the .tmj`);
    const flags = new Uint8Array(Math.max(0, t.tilecount));
    const shapes = new Uint8Array(flags.length);
    let isKit = false;
    for (const tile of t.tiles ?? []) {
      if (tile.id < 0 || tile.id >= flags.length) continue;
      for (const p of tile.properties ?? []) {
        if (p.name === 'mask' && typeof p.value === 'number') {
          shapes[tile.id] = WALL_SHAPE_THIN + (p.value & 15);
          isKit = true;
        }
        if (p.value !== true) continue;
        if (p.name === 'collides') flags[tile.id]! |= TILE_COLLIDES;
        else if (p.name === 'water') flags[tile.id]! |= TILE_WATER;
        else if (p.name === 'void') flags[tile.id]! |= TILE_VOID;
      }
    }
    // A kit's thick walls open to the north start at the band, like their art.
    if (isKit) {
      for (let i = 0; i < KIT_SOLID_COUNT; i++) {
        shapes[KIT_SOLID_BASE + i] = i & KIT_SOLID_NORTH_OPEN ? WALL_SHAPE_SOLID_NORTH_OPEN : WALL_SHAPE_SOLID;
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
      shapes,
    };
  });
  return tilesets.sort((a, b) => a.firstGid - b.firstGid);
}

function buildGidTable(tilesets: readonly MapTileset[], pick: (t: MapTileset) => Uint8Array): Uint8Array {
  const maxGid = tilesets.reduce((m, t) => Math.max(m, t.firstGid + t.tileCount), 1);
  const table = new Uint8Array(maxGid);
  for (const t of tilesets) table.set(pick(t), t.firstGid);
  return table;
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
    .map((o) => {
      const raw = o.gid ?? 0;
      return { gid: raw & GID_MASK, x: o.x, y: o.y, flipX: (raw & FLIP_H) !== 0, flipY: (raw & FLIP_V) !== 0 };
    });
}

function parseProps(map: TiledMap, tileSize: number): MapProp[] {
  const layer = findLayer(map, LAYER_NAMES.props);
  if (!layer || layer.type !== 'objectgroup') return [];
  return layer.objects.map((obj) => {
    const { x0, y0, x1, y1, tiles } = rectTiles(obj, tileSize);
    return {
      id: obj.name,
      key: stringProp(obj, 'key'),
      x: x0 * tileSize,
      y: y0 * tileSize,
      width: (x1 - x0) * tileSize,
      height: (y1 - y0) * tileSize,
      tiles,
      collides: boolProp(obj, 'collides', false),
      flipX: boolProp(obj, 'flipX', false),
      flipY: boolProp(obj, 'flipY', false),
    };
  });
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
  const gidFlags = buildGidTable(tilesets, (t) => t.flags);
  const gidShapes = buildGidTable(tilesets, (t) => t.shapes);
  const floor = toGids(tileLayer(map, LAYER_NAMES.floor, true), size);
  const walls = toGids(tileLayer(map, LAYER_NAMES.walls, true), size);
  const decor = toGids(tileLayer(map, LAYER_NAMES.decor, false), size);
  const wallFaces = toGids(tileLayer(map, LAYER_NAMES.wallFaces, false), size);
  const wallJoins = toGids(tileLayer(map, LAYER_NAMES.wallJoins, false), size);
  const shadows = toGids(tileLayer(map, LAYER_NAMES.shadows, false), size);
  const decals = parseDecals(map);
  const props = parseProps(map, tileSize);

  const objectsLayer = findLayer(map, LAYER_NAMES.objects);
  if (!objectsLayer || objectsLayer.type !== 'objectgroup') fail('Missing object layer "objects"');
  const objects = objectsLayer.objects;

  const zones: MapZone[] = [];
  const rawWindows: TiledObject[] = [];
  const rawDoors: TiledObject[] = [];
  const zombieSpawns: MapZombieSpawn[] = [];
  const rawOpenSpawns: TiledObject[] = [];
  const rawPortals: TiledObject[] = [];
  const rawMerchantSpots: TiledObject[] = [];
  const rawWeaponCases: TiledObject[] = [];
  const rawItemSpots: TiledObject[] = [];
  const rawActivationSites: TiledObject[] = [];
  let playerSpawn: Vec2 | undefined;

  for (const obj of objects) {
    switch (objectType(obj)) {
      case 'zone':
        addZoneRect(zones, obj);
        break;
      case 'player_spawn':
        playerSpawn = { x: obj.x, y: obj.y };
        break;
      case 'window':
        rawWindows.push(obj);
        break;
      case 'zombie_spawn': {
        const window = stringProp(obj, 'window', false);
        if (window) zombieSpawns.push({ x: obj.x, y: obj.y, window, windowIndex: -1, zoneIndex: -1 });
        else rawOpenSpawns.push(obj);
        break;
      }
      case 'door':
        rawDoors.push(obj);
        break;
      case 'portal':
        rawPortals.push(obj);
        break;
      case 'merchant_spot':
        rawMerchantSpots.push(obj);
        break;
      case 'weapon_case':
        rawWeaponCases.push(obj);
        break;
      case 'item_spot':
        rawItemSpots.push(obj);
        break;
      case 'activation_site':
        rawActivationSites.push(obj);
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
    for (const r of zone.rects) {
      const x0 = Math.floor(r.x / tileSize);
      const y0 = Math.floor(r.y / tileSize);
      const x1 = Math.ceil((r.x + r.width) / tileSize);
      const y1 = Math.ceil((r.y + r.height) / tileSize);
      for (let ty = Math.max(0, y0); ty < Math.min(height, y1); ty++) {
        for (let tx = Math.max(0, x0); tx < Math.min(width, x1); tx++) cellZone[ty * width + tx] = index;
      }
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
  for (const s of zombieSpawns) s.zoneIndex = zoneAt(s.x, s.y);
  /** Nothing there: off the map, or a void floor without walls (levels.ts shows the same). */
  const isVoid = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= width || ty >= height) return true;
    const gid = floor[ty * width + tx] ?? 0;
    return (gid === 0 || ((gidFlags[gid] ?? 0) & TILE_VOID) !== 0) && (walls[ty * width + tx] ?? 0) === 0;
  };
  const openSpawns: MapOpenSpawn[] = rawOpenSpawns.map((obj) => {
    const zoneIndex = zones.findIndex((z) => z.id === stringProp(obj, 'zone'));
    if (!zones[zoneIndex]?.openSpawns) fail(`Open zombie_spawn ${obj.id} must name a zone with openSpawns = true`);
    const tx = Math.floor(obj.x / tileSize);
    const ty = Math.floor(obj.y / tileSize);
    if (!isVoid(tx, ty)) fail(`Open zombie_spawn ${obj.id} must lie off the map or on the void`);
    // The first tile of its zone straight ahead, with only void (or the outside of the map) between.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      for (let step = 1; step <= OPEN_SPAWN_MAX_STEPS; step++) {
        const x = tx + dx * step;
        const y = ty + dy * step;
        if (x >= 0 && y >= 0 && x < width && y < height && cellZone[y * width + x] === zoneIndex && !isVoid(x, y)) {
          return { x: obj.x, y: obj.y, zoneIndex, entry: { x: (x + 0.5) * tileSize, y: (y + 0.5) * tileSize } };
        }
        if (!isVoid(x, y)) break;
      }
    }
    return fail(`Open zombie_spawn ${obj.id} needs a tile of its zone within ${OPEN_SPAWN_MAX_STEPS} tiles in a straight line`);
  });

  const merchantSpots: MapMerchantSpot[] = rawMerchantSpots.map((obj) => {
    const zone = stringProp(obj, 'zone');
    const zoneIndex = zones.findIndex((z) => z.id === zone);
    if (zoneIndex < 0) fail(`merchant_spot ${obj.id} references unknown zone "${zone}"`);
    return { x: obj.x, y: obj.y, zone, zoneIndex };
  });
  const zoneMerchantSpots = zones.map((_, zi) => merchantSpots.flatMap((s, i) => (s.zoneIndex === zi ? [i] : [])));
  const weaponCases = parseWeaponCases(rawWeaponCases, zones, tileSize, width, height);
  const itemSpots: MapItemSpot[] = rawItemSpots.map((obj) => {
    const zone = stringProp(obj, 'zone');
    const zoneIndex = zones.findIndex((z) => z.id === zone);
    if (zoneIndex < 0) fail(`item_spot ${obj.id} references unknown zone "${zone}"`);
    return { x: obj.x, y: obj.y, zone, zoneIndex };
  });
  const activationSites: MapActivationSite[] = rawActivationSites.map((obj) => {
    const id = stringProp(obj, 'id');
    const zone = stringProp(obj, 'zone');
    const zoneIndex = zones.findIndex((z) => z.id === zone);
    if (zoneIndex < 0) fail(`activation_site ${id} references unknown zone "${zone}"`);
    return { id, x: obj.x, y: obj.y, width: obj.width ?? 0, height: obj.height ?? 0, zone, zoneIndex };
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
    gidShapes,
    floor,
    shadows,
    walls,
    wallFaces,
    wallJoins,
    decor,
    decals,
    props,
    zones,
    windows,
    doors,
    zombieSpawns,
    openSpawns,
    portals,
    merchantSpots,
    zoneMerchantSpots,
    weaponCases,
    itemSpots,
    activationSites,
    portalLinks: portals.reduce((n, p) => Math.max(n, p.link + 1), 0),
    cellPortal,
    playerSpawn,
    cellZone,
  };
}

/**
 * Adds a zone object. Objects sharing an id merge into one zone: their
 * rectangles add up and a flag set on any of them applies to the zone.
 */
function addZoneRect(zones: MapZone[], obj: TiledObject): void {
  const id = stringProp(obj, 'id');
  const rect = { x: obj.x, y: obj.y, width: obj.width, height: obj.height };
  const zone = zones.find((z) => z.id === id);
  if (!zone) {
    zones.push({
      id,
      name: stringProp(obj, 'name', false) || obj.name,
      startsUnlocked: boolProp(obj, 'startsUnlocked', false),
      interior: boolProp(obj, 'interior', false),
      openSpawns: boolProp(obj, 'openSpawns', false),
      cost: numberProp(obj, 'cost', 0),
      ...rect,
      rects: [rect],
    });
    return;
  }
  zone.rects.push(rect);
  zone.cost = Math.max(zone.cost, numberProp(obj, 'cost', 0));
  zone.startsUnlocked ||= boolProp(obj, 'startsUnlocked', false);
  zone.interior ||= boolProp(obj, 'interior', false);
  zone.openSpawns ||= boolProp(obj, 'openSpawns', false);
  const x1 = Math.max(zone.x + zone.width, rect.x + rect.width);
  const y1 = Math.max(zone.y + zone.height, rect.y + rect.height);
  zone.x = Math.min(zone.x, rect.x);
  zone.y = Math.min(zone.y, rect.y);
  zone.width = x1 - zone.x;
  zone.height = y1 - zone.y;
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
