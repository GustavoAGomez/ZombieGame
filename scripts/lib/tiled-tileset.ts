/** Writer for Tiled JSON tilesets (.tsj), the format edited in Tiled. */
import type { TiledProperty } from '../../src/game/map/tiled';

export interface TsjTile {
  id: number;
  properties?: TiledProperty[];
}

export interface TsjWangSet {
  name: string;
  type: 'corner';
  tile: number;
  colors: { name: string; color: string; probability: number; tile: number }[];
  wangtiles: { tileid: number; wangid: number[] }[];
}

export interface Tsj {
  type: 'tileset';
  version: string;
  tiledversion: string;
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
  /** Tiles taller than the map grid are drawn from their bottom-left corner. */
  objectalignment?: 'bottomleft';
  tiles?: TsjTile[];
  wangsets?: TsjWangSet[];
}

export function tileset(
  name: string,
  image: string,
  imageWidth: number,
  imageHeight: number,
  tileWidth: number,
  tileHeight: number,
): Tsj {
  const columns = Math.floor(imageWidth / tileWidth);
  return {
    type: 'tileset',
    version: '1.10',
    tiledversion: '1.11.0',
    name,
    tilewidth: tileWidth,
    tileheight: tileHeight,
    tilecount: columns * Math.floor(imageHeight / tileHeight),
    columns,
    image,
    imagewidth: imageWidth,
    imageheight: imageHeight,
    margin: 0,
    spacing: 0,
  };
}

export function prop(name: string, value: string | number | boolean): TiledProperty {
  const type = typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? (Number.isInteger(value) ? 'int' : 'float') : 'string';
  return { name, type, value };
}
