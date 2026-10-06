import type { TiledMap, TiledSourceMap, TiledTileset } from '../tiled';
import type { Tsj } from '../tsj';

/**
 * Embeds every external tileset. `readTsj` receives the `source` as written
 * in the map; `imagePath` turns the tileset's image into the path to store.
 */
export function embedTilesets(
  map: TiledSourceMap,
  readTsj: (source: string) => Tsj,
  imagePath: (source: string, image: string) => string,
): TiledMap {
  const tilesets = map.tilesets.map((t): TiledTileset => {
    const source = t.source;
    // Only references carry a source; an embedded tileset is kept as it is.
    if (!source) return t as TiledTileset;
    const tsj = readTsj(source);
    const { type: _type, version: _version, tiledversion: _tiledversion, ...data } = tsj;
    return { firstgid: t.firstgid, ...data, image: imagePath(source, tsj.image) };
  });
  return { ...map, tilesets };
}
