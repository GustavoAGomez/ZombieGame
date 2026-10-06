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
import type { TiledMap, TiledProperty, TiledSourceMap } from '../src/game/map/tiled';
import { embedTilesets } from '../src/game/map/ascii/embed';

export { embedTilesets };
import { COMPILED_HASH, TILESET_ORDER, compileAsciiMap, contentHash, parseAsciiMap, type TilesetName } from './lib/ascii-map';
import type { Tsj } from '../src/game/map/tsj';
import { validateMap } from './lib/validate-map';

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
    registerInManifest(root, name, propSizes(embedded));
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

/** The game's path of a tileset's image, from public/assets/. */
export const TILESET_DATA_FILE = 'tiles/tilesets.json';

/**
 * Writes public/assets/tiles/tilesets.json: every tileset as the compiler
 * needs it, with its image's path inside public/assets/, and registers it in
 * the manifest. The dungeon compiles its floors at runtime from it (spec 09 §3.3).
 */
export function writeTilesetData(root: string): void {
  const tilesets = readTilesets(resolve(root, 'art-src/tiled/tilesets'));
  const data = Object.fromEntries(Object.entries(tilesets).map(([name, tsj]) => [name, { ...tsj, image: `tiles/${basename(tsj.image)}` }]));
  const out = resolve(root, 'public/assets', TILESET_DATA_FILE);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(data)}\n`);
  const path = resolve(root, 'public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { tilesetData?: string };
  if (manifest.tilesetData !== TILESET_DATA_FILE) {
    manifest.tilesetData = TILESET_DATA_FILE;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
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

/** Footprint size in px of each prop key the map uses (the first one found). */
function propSizes(map: TiledMap): Map<string, { width: number; height: number }> {
  const sizes = new Map<string, { width: number; height: number }>();
  const layer = map.layers.find((l) => l.name === 'props');
  if (layer?.type !== 'objectgroup') return sizes;
  for (const o of layer.objects) {
    const key = o.properties?.find((q) => q.name === 'key')?.value;
    if (typeof key === 'string' && !sizes.has(key)) sizes.set(key, { width: o.width, height: o.height });
  }
  return sizes;
}

/**
 * Registers the map, and every prop it uses that the manifest lacks, as a
 * placeholder the size of its footprint (CLAUDE.md rule 5). The art goes to
 * docs/ASSETS-TODO.md.
 */
function registerInManifest(root: string, name: string, props: Map<string, { width: number; height: number }>): void {
  const path = resolve(root, 'public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as {
    maps: Record<string, string>;
    objects: Record<string, { file: string; frameWidth: number; frameHeight: number; frames: number; placeholder?: boolean }>;
  };
  let changed = false;
  if (manifest.maps[name] !== `maps/${name}.tmj`) {
    manifest.maps[name] = `maps/${name}.tmj`;
    changed = true;
  }
  for (const [key, size] of props) {
    const current = manifest.objects[key];
    // Real art keeps its own size; a placeholder follows the footprint.
    if (current && (!current.placeholder || (current.frameWidth === size.width && current.frameHeight === size.height))) continue;
    manifest.objects[key] = { file: `sprites/props/${key}.png`, frameWidth: size.width, frameHeight: size.height, frames: 1, placeholder: true };
    changed = true;
  }
  if (changed) writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
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
  try {
    writeTilesetData(root);
  } catch (err) {
    console.error(`✖ tilesets.json: ${(err as Error).message}`);
    process.exitCode = 1;
  }
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
