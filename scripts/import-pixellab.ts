/**
 * npm run assets:import — imports raw PixelLab exports from
 * art-src/pixellab/<asset>/ (docs/ASSETS.md §6):
 *   1. reads metadata.json (format documented in scripts/lib/pixellab.ts),
 *   2. builds one sheet per animation: a row per direction in the fixed
 *      order, frames cut to the declared canvas and aligned by the anchor,
 *   3. forces binary alpha and quantises to art-src/palette.hex if present,
 *   4. writes public/assets/sprites/<asset>/<animation>.png and updates the
 *      manifest entry (frames, directions, placeholder flags).
 * Usage: npm run assets:import [-- <asset> …]   (all assets by default)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { decodePng, encodePng, parsePaletteHex } from './lib/png';
import { directionRows, parsePixelLabMetadata, type ExportAnimation } from './lib/pixellab';
import { binarizeAlpha, buildSheet, opaqueBounds, quantize, type Frame } from './lib/sheet';

/** Defaults for animations the manifest does not declare yet. */
const ANIMATION_DEFAULTS: Record<string, { fps: number; loop: boolean }> = {
  idle: { fps: 6, loop: true },
  walk: { fps: 10, loop: true },
  shoot: { fps: 12, loop: false },
  attack: { fps: 10, loop: false },
  dash: { fps: 20, loop: false },
  death: { fps: 8, loop: false },
  climb: { fps: 6, loop: false },
};

type Json = Record<string, unknown>;

export interface ImportedAnimation {
  name: string;
  frames: number;
  directions: 4 | 8;
  file: string;
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Updates the raw manifest JSON for one imported animation. The character
 * stops being a placeholder; its other animations without art are marked
 * `"placeholder": true` individually so they keep being generated.
 */
export function applyImport(manifest: Json, asset: string, imported: ImportedAnimation, hasFile: (file: string) => boolean): void {
  const characters = isRecord(manifest.characters) ? manifest.characters : (manifest.characters = {});
  const character = isRecord(characters[asset])
    ? characters[asset]
    : (characters[asset] = { frameWidth: 48, frameHeight: 48, anchor: { x: 0.5, y: 0.8 }, hitbox: { radius: 6 }, animations: {} });
  const animations = isRecord(character.animations) ? character.animations : (character.animations = {});

  const existing = animations[imported.name];
  const previous: Json = isRecord(existing) ? existing : {};
  const defaults = ANIMATION_DEFAULTS[imported.name] ?? { fps: 8, loop: true };
  animations[imported.name] = {
    file: imported.file,
    frames: imported.frames,
    fps: typeof previous.fps === 'number' ? previous.fps : defaults.fps,
    loop: typeof previous.loop === 'boolean' ? previous.loop : defaults.loop,
  };
  character.directions = imported.directions;
  character.placeholder = false;

  for (const [name, anim] of Object.entries(animations)) {
    if (name === imported.name || !isRecord(anim)) continue;
    if (hasFile(typeof anim.file === 'string' ? anim.file : '')) delete anim.placeholder;
    else anim.placeholder = true;
  }
}

function readFrame(path: string): Frame {
  const png = decodePng(readFileSync(path));
  return { width: png.width, height: png.height, pixels: png.pixels };
}

function importAnimation(
  root: string,
  asset: string,
  sourceDir: string,
  anim: ExportAnimation,
  character: Json,
  palette: number[] | null,
  log: (line: string) => void,
): ImportedAnimation {
  const frameWidth = typeof character.frameWidth === 'number' ? character.frameWidth : anim.width || 48;
  const frameHeight = typeof character.frameHeight === 'number' ? character.frameHeight : anim.height || 48;
  const anchorRaw = isRecord(character.anchor) ? character.anchor : {};
  const anchor = {
    x: typeof anchorRaw.x === 'number' ? anchorRaw.x : 0.5,
    y: typeof anchorRaw.y === 'number' ? anchorRaw.y : 0.8,
  };

  const { directions, rows } = directionRows(anim.frames);
  const counts = new Set(rows.map((r) => r.length));
  if (counts.size > 1) throw new Error(`${anim.sourceName}: las direcciones tienen distinto número de frames (${[...counts].join(', ')})`);
  const frames = rows[0]?.length ?? 0;
  if (frames === 0) throw new Error(`${anim.sourceName}: sin frames`);

  const decoded = rows.map((row) => row.map((rel) => readFrame(join(sourceDir, rel))));
  const sizes = new Set(decoded.flat().map((f) => `${f.width}×${f.height}`));
  if (!sizes.has(`${frameWidth}×${frameHeight}`) || sizes.size > 1) {
    log(`  · ${anim.sourceName}: lienzo ${[...sizes].join(', ')} → ${frameWidth}×${frameHeight} alineado por el ancla`);
  }

  // Report where the feet land so the manifest anchor can be checked against the art.
  const bottoms = decoded.flat().map((f) => opaqueBounds(f)?.maxY ?? 0).sort((a, b) => a - b);
  const feet = bottoms[Math.floor(bottoms.length / 2)] ?? 0;
  log(`  · ${anim.sourceName}: pies en y≈${feet} de ${frameHeight} (ancla del manifiesto y=${Math.round(anchor.y * frameHeight)})`);

  const sheet = buildSheet(decoded, frameWidth, frameHeight, anchor);
  const softened = binarizeAlpha(sheet);
  if (softened > 0) log(`  · ${anim.sourceName}: ${softened} píxeles semitransparentes pasados a alfa 0/255`);
  if (palette) {
    const outside = quantize(sheet, palette);
    if (outside > 0) log(`  ⚠ ${anim.sourceName}: ${outside} colores fuera de la paleta, ajustados al más cercano`);
  } else {
    log(`  ⚠ ${anim.sourceName}: sin art-src/palette.hex, no se cuantiza`);
  }

  const file = `sprites/${asset}/${anim.name}.png`;
  const out = resolve(root, 'public/assets', file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(sheet.width, sheet.height, sheet.pixels));
  log(`  ✓ ${anim.sourceName} → ${file} (${frames} frames × ${directions} direcciones, ${sheet.width}×${sheet.height})`);
  return { name: anim.name, frames, directions, file };
}

/**
 * Export folders of an asset: the asset folder itself and each direct
 * subfolder that has a metadata.json (one PixelLab zip per subfolder, so
 * separate exports never overwrite each other). Sorted for a stable order.
 */
export function findExports(assetDir: string): string[] {
  const found: string[] = [];
  if (existsSync(join(assetDir, 'metadata.json'))) found.push(assetDir);
  for (const name of readdirSync(assetDir).sort()) {
    const sub = join(assetDir, name);
    if (!name.startsWith('.') && statSync(sub).isDirectory() && existsSync(join(sub, 'metadata.json'))) found.push(sub);
  }
  return found;
}

export function importAssets(root: string, only: readonly string[], log: (line: string) => void): number {
  const source = resolve(root, 'art-src/pixellab');
  const assets = existsSync(source)
    ? readdirSync(source).filter((name) => !name.startsWith('.') && statSync(join(source, name)).isDirectory())
    : [];
  const selected = only.length > 0 ? assets.filter((a) => only.includes(a)) : assets;
  if (selected.length === 0) {
    log('No hay exports en art-src/pixellab/<asset>/. Nada que importar.');
    return 0;
  }

  const palettePath = resolve(root, 'art-src/palette.hex');
  const palette = existsSync(palettePath) ? [...parsePaletteHex(readFileSync(palettePath, 'utf8'))] : null;
  const manifestPath = resolve(root, 'public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Json;
  const characters = isRecord(manifest.characters) ? manifest.characters : {};
  const hasFile = (file: string): boolean => file.length > 0 && existsSync(resolve(root, 'public/assets', file));

  let imported = 0;
  for (const asset of selected) {
    const dir = join(source, asset);
    log(`\n${asset}`);
    const exports = findExports(dir);
    if (exports.length === 0) {
      log('  ✖ falta metadata.json (formato de export no soportado, ver docs/ASSETS.md §6)');
      continue;
    }
    const character = isRecord(characters[asset]) ? characters[asset] : {};
    const seen = new Map<string, string>();
    for (const exportDir of exports) {
      const parsed = parsePixelLabMetadata(JSON.parse(readFileSync(join(exportDir, 'metadata.json'), 'utf8')));
      for (const w of parsed.warnings) log(`  ⚠ ${w}`);
      for (const anim of parsed.animations) {
        const previous = seen.get(anim.name);
        if (previous) log(`  ⚠ "${anim.name}" aparece en ${previous} y en ${exportDir}; se usa el último`);
        seen.set(anim.name, exportDir);
        const result = importAnimation(root, asset, exportDir, anim, character, palette, log);
        applyImport(manifest, asset, result, hasFile);
        imported++;
      }
    }
  }

  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log(`\nManifiesto actualizado (${imported} animaciones). Ejecuta npm run assets:check.`);
  return imported;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    importAssets(root, process.argv.slice(2), (line) => console.info(line));
  } catch (err) {
    console.error(`✖ ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
