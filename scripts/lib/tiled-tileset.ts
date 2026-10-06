/** Writer for Tiled JSON tilesets (.tsj); the types live with the game (src/game/map/tsj.ts). */
import type { TiledProperty } from '../../src/game/map/tiled';
import type { Tsj } from '../../src/game/map/tsj';

export type { Tsj, TsjTile, TsjWangSet } from '../../src/game/map/tsj';

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
