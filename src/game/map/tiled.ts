/** The subset of the Tiled JSON (.tmj) format this game reads and writes. */

export interface TiledProperty {
  name: string;
  type: 'string' | 'int' | 'float' | 'bool' | 'color' | 'file' | 'object' | 'class';
  value: string | number | boolean;
}

export interface TiledObject {
  id: number;
  name: string;
  /** Tiled ≤ 1.8 writes `type`; 1.9+ may write `class`. Both are accepted. */
  type?: string;
  class?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  visible: boolean;
  point?: boolean;
  /** Tile objects (e.g. decals) reference a tile by global id; (x, y) is their bottom-left. */
  gid?: number;
  properties?: TiledProperty[];
}

export interface TiledTileLayer {
  id: number;
  name: string;
  type: 'tilelayer';
  width: number;
  height: number;
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  data: number[];
}

export interface TiledObjectLayer {
  id: number;
  name: string;
  type: 'objectgroup';
  draworder: 'topdown' | 'index';
  x: number;
  y: number;
  opacity: number;
  visible: boolean;
  objects: TiledObject[];
}

export type TiledLayer = TiledTileLayer | TiledObjectLayer;

export interface TiledTileDef {
  id: number;
  properties?: TiledProperty[];
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  margin: number;
  spacing: number;
  tiles?: TiledTileDef[];
  /** External tilesets reference a .tsj instead of embedding the data. */
  source?: string;
  objectalignment?: string;
}

export interface TiledMap {
  type: 'map';
  version: string;
  tiledversion: string;
  orientation: 'orthogonal';
  renderorder: 'right-down';
  infinite: boolean;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  nextlayerid: number;
  nextobjectid: number;
  layers: TiledLayer[];
  tilesets: TiledTileset[];
}

/** Object kinds in the `objects` layer (docs/ASSETS.md §5). */
export const OBJECT_TYPES = ['zone', 'player_spawn', 'window', 'zombie_spawn', 'door'] as const;
export type ObjectType = (typeof OBJECT_TYPES)[number];

export const LAYER_NAMES = { floor: 'floor', walls: 'walls', decor: 'decor', decals: 'decals', objects: 'objects' } as const;
