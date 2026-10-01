/**
 * npm run map:build [map…] [--force]
 *
 *   maps/src/<map>.txt  (ASCII plan, skill level-design)
 *     → art-src/tiled/<map>.tmj  (Tiled source, external .tsj tilesets)
 *     → public/assets/maps/<map>.tmj  (tilesets embedded, validated)
 *
 * The Tiled source is rewritten from the ASCII plan only while nobody has
 * retouched it in Tiled (its content still matches the hash stored when it
 * was compiled); otherwise it is kept and a warning explains how to
 * regenerate it with --force. Embedding is needed because neither Phaser's
 * Tiled loader nor our MapLoader read external tilesets. The validator runs
 * last and the map is registered in the manifest.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { TiledMap, TiledProperty, TiledSourceMap, TiledTileset } from '../src/game/map/tiled';
import { COMPILED_HASH, TILESET_ORDER, compileAsciiMap, contentHash, parseAsciiMap, type TilesetName } from './lib/ascii-map';
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

export function readTilesets(tilesetsDir: string): Record<TilesetName, Tsj> {
  const out = {} as Record<TilesetName, Tsj>;
  for (const name of TILESET_ORDER) {
    const path = resolve(tilesetsDir, `${name}.tsj`);
    if (!existsSync(path)) throw new Error(`falta ${relative(process.cwd(), path)}: ejecuta npm run tiles:import`);
    out[name] = JSON.parse(readFileSync(path, 'utf8')) as Tsj;
  }
  return out;
}

export type CompileOutcome = 'written' | 'unchanged' | 'kept-edited';

/**
 * Compiles maps/src/<name>.txt into art-src/tiled/<name>.tmj. A Tiled source
 * whose content no longer matches its stored hash was edited by hand and is
 * kept unless `force`.
 */
export function compileSource(root: string, name: string, force: boolean): CompileOutcome {
  const src = resolve(root, 'maps/src', `${name}.txt`);
  const target = resolve(root, 'art-src/tiled', `${name}.tmj`);
  const compiled = compileAsciiMap(parseAsciiMap(readFileSync(src, 'utf8')), readTilesets(resolve(root, 'art-src/tiled/tilesets')), `maps/src/${name}.txt`);
  const text = `${JSON.stringify(compiled, null, 1)}\n`;
  if (existsSync(target) && !force) {
    const current = readFileSync(target, 'utf8');
    if (current === text) return 'unchanged';
    const existing = JSON.parse(current) as TiledSourceMap & { properties?: TiledProperty[] };
    const stored = existing.properties?.find((q) => q.name === COMPILED_HASH)?.value;
    if (stored !== contentHash(existing)) return 'kept-edited';
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
  return 'written';
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
  const asciiDir = resolve(root, 'maps/src');
  const force = process.argv.includes('--force');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const names = new Set<string>();
  for (const [folder, ext] of [
    [asciiDir, '.txt'],
    [dir, '.tmj'],
  ] as const) {
    if (!existsSync(folder)) continue;
    for (const f of readdirSync(folder)) if (f.endsWith(ext)) names.add(basename(f, ext));
  }
  const selected = [...names].filter((n) => only.length === 0 || only.includes(n)).sort();
  if (selected.length === 0) {
    console.error(`✖ No hay mapas que construir${only.length ? `: ${only.join(', ')}` : ''} (planos en maps/src/*.txt)`);
    process.exitCode = 1;
    return;
  }
  for (const name of selected) {
    const src = resolve(dir, `${name}.tmj`);
    try {
      if (existsSync(resolve(asciiDir, `${name}.txt`))) {
        const outcome = compileSource(root, name, force);
        if (outcome === 'kept-edited') {
          console.warn(
            `⚠ ${name}: art-src/tiled/${name}.tmj tiene retoques hechos en Tiled; no lo sobrescribo con maps/src/${name}.txt.\n` +
              `  Se construye con los retoques. Para regenerarlo desde el ASCII (y perderlos): npm run map:build -- ${name} --force`,
          );
        } else if (outcome === 'written') console.info(`✓ ${name}: maps/src/${name}.txt → art-src/tiled/${name}.tmj`);
      }
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
