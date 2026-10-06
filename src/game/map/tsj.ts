/** Tiled JSON tilesets (.tsj), the format edited in Tiled: what the compiler and the game read of them. */
import type { TiledProperty } from './tiled';

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
