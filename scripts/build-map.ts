/**
 * npm run map:build — art-src/tiled/<map>.tmj (edited in Tiled, external
 * .tsj tilesets) → public/assets/maps/<map>.tmj with the tilesets embedded
 * and image paths rewritten, because neither Phaser's Tiled loader nor our
 * MapLoader read external tilesets. Runs the map validator and registers the
 * map in the manifest. `npm run map:build -- mansion` builds just one map.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TiledMap, TiledSourceMap, TiledTileset } from '../src/game/map/tiled';
import type { Tsj } from './lib/tiled-tileset';
import { validateMap } from './lib/validate-map';

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

export interface BuildResult {
  name: string;
  out: string;
  errors: string[];
}

export function buildMap(root: string, sourcePath: string): BuildResult {
  const name = basename(sourcePath, '.tmj');
  const out = resolve(root, 'public/assets/maps', `${name}.tmj`);
  const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as TiledSourceMap;
  const tsjPath = (src: string): string => resolve(dirname(sourcePath), src);
  const embedded = embedTilesets(
    source,
    (src) => {
      if (!existsSync(tsjPath(src))) throw new Error(`no existe el tileset ${src} (ejecuta npm run tiles:import)`);
      return JSON.parse(readFileSync(tsjPath(src), 'utf8')) as Tsj;
    },
    (src, image) => relative(dirname(out), resolve(dirname(tsjPath(src)), image)).split('\\').join('/'),
  );
  const { errors } = validateMap(embedded);
  if (errors.length === 0) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, `${JSON.stringify(embedded)}\n`);
    registerInManifest(root, name);
  }
  return { name, out, errors };
}

function registerInManifest(root: string, name: string): void {
  const path = resolve(root, 'public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { maps: Record<string, string> };
  if (manifest.maps[name] === `maps/${name}.tmj`) return;
  manifest.maps[name] = `maps/${name}.tmj`;
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const dir = resolve(root, 'art-src/tiled');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const sources = readdirSync(dir)
    .filter((f) => f.endsWith('.tmj') && (only.length === 0 || only.includes(basename(f, '.tmj'))))
    .map((f) => resolve(dir, f));
  if (sources.length === 0) {
    console.error(`✖ No hay mapas que construir en ${dir} (genera la mansión con npm run map:mansion)`);
    process.exitCode = 1;
    return;
  }
  for (const src of sources) {
    try {
      const result = buildMap(root, src);
      if (result.errors.length > 0) {
        console.error(`✖ ${result.name}: el validador encontró ${result.errors.length} errores; no se escribe el mapa del juego.`);
        for (const e of result.errors) console.error(`  - ${e}`);
        process.exitCode = 1;
      } else {
        console.info(`✓ ${result.name} → ${relative(root, result.out)} (tilesets embebidos, validador OK)`);
      }
    } catch (err) {
      console.error(`✖ ${basename(src)}: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
