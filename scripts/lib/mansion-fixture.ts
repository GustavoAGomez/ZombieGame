/** Test helper: the generated mansion with its tilesets embedded, as map:build would write it. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TiledMap } from '../../src/game/map/tiled';
import { embedTilesets } from '../build-map';
import { buildMansionMap, readMansionTilesets } from '../gen-mansion-map';
import type { Tsj } from './tiled-tileset';

const tiledDir = resolve(dirname(fileURLToPath(import.meta.url)), '../../art-src/tiled');

export function embeddedMansion(): TiledMap {
  const source = buildMansionMap(readMansionTilesets(resolve(tiledDir, 'tilesets')));
  return embedTilesets(
    source,
    (src) => JSON.parse(readFileSync(resolve(tiledDir, src), 'utf8')) as Tsj,
    (_src, image) => image,
  );
}
