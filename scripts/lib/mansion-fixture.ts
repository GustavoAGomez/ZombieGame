/** Test helper: the mansion compiled from its ASCII plan, with the tilesets embedded as map:build writes it. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TiledMap } from '../../src/game/map/tiled';
import { embedTilesets, readTilesets } from '../build-map';
import { compileAsciiMap, parseAsciiMap } from './ascii-map';
import type { Tsj } from './tiled-tileset';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tiledDir = resolve(root, 'art-src/tiled');

export function mansionPlanText(): string {
  return readFileSync(resolve(root, 'maps/src/mansion.txt'), 'utf8');
}

export function embeddedMansion(): TiledMap {
  const source = compileAsciiMap(parseAsciiMap(mansionPlanText()), readTilesets(resolve(tiledDir, 'tilesets')), 'maps/src/mansion.txt');
  return embedTilesets(
    source,
    (src) => JSON.parse(readFileSync(resolve(tiledDir, src), 'utf8')) as Tsj,
    (_src, image) => image,
  );
}
