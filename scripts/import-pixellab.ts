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
import type { Directions } from '../src/game/assets/manifest';
import { decodePng, encodePng, parsePaletteHex } from './lib/png';
import { directionRows, parsePixelLabMetadata, selectAnimations, type ExportAnimation, type TakeOverrides } from './lib/pixellab';
import { binarizeAlpha, buildSheet, centerIn, croppedPixels, opaqueBounds, quantize, scaleAbout, type Frame } from './lib/sheet';

/** Defaults for animations the manifest does not declare yet. */
const ANIMATION_DEFAULTS: Record<string, { fps: number; loop: boolean }> = {
  idle: { fps: 6, loop: true },
  walk: { fps: 12, loop: true },
  shoot: { fps: 12, loop: true },
  shoot_walk: { fps: 12, loop: true },
  attack: { fps: 10, loop: false },
  dash: { fps: 20, loop: false },
  death: { fps: 8, loop: false },
  climb: { fps: 6, loop: false },
  crawl: { fps: 8, loop: true },
  crawl_attack: { fps: 15, loop: false },
  open_coat: { fps: 14, loop: false },
};

type Json = Record<string, unknown>;

export interface ImportedAnimation {
  name: string;
  frames: number;
  directions: Directions;
  file: string;
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Updates the raw manifest JSON for one imported animation. The character
 * stops being a placeholder; its other animations without art are marked
 * `"placeholder": true` individually so they keep being generated.
 * The character's `directions` is 8 if any animation has 8 rows; an
 * animation with a different count declares its own (a 4-way climb).
 */
export function applyImport(manifest: Json, asset: string, imported: ImportedAnimation, hasFile: (file: string) => boolean): void {
  const characters = isRecord(manifest.characters) ? manifest.characters : (manifest.characters = {});
  const character = isRecord(characters[asset])
    ? characters[asset]
    : (characters[asset] = { frameWidth: 48, frameHeight: 48, anchor: { x: 0.5, y: 0.8 }, hitbox: { radius: 6 }, animations: {} });
  const animations = isRecord(character.animations) ? character.animations : (character.animations = {});
  const wasPlaceholder = character.placeholder === true;
  const characterDirections = character.directions === 4 || character.directions === 1 ? character.directions : 8;

  const existing = animations[imported.name];
  const previous: Json = isRecord(existing) ? existing : {};
  const defaults = ANIMATION_DEFAULTS[imported.name] ?? { fps: 8, loop: true };
  animations[imported.name] = {
    file: imported.file,
    frames: imported.frames,
    fps: typeof previous.fps === 'number' ? previous.fps : defaults.fps,
    loop: typeof previous.loop === 'boolean' ? previous.loop : defaults.loop,
    directions: imported.directions,
  };
  character.placeholder = false;

  for (const [name, anim] of Object.entries(animations)) {
    if (name === imported.name || !isRecord(anim)) continue;
    const real = hasFile(typeof anim.file === 'string' ? anim.file : '');
    if (real) delete anim.placeholder;
    else anim.placeholder = true;
    // Art imported before keeps the rows it was built with; a placeholder follows the character.
    if (real && !wasPlaceholder && anim.directions === undefined) anim.directions = characterDirections;
    if (!real) delete anim.directions;
  }

  const all = Object.values(animations).filter(isRecord);
  character.directions = Math.max(imported.directions, ...all.map((a) => (typeof a.directions === 'number' ? a.directions : 0)));
  for (const anim of all) if (anim.directions === character.directions) delete anim.directions;
}

/**
 * Copies an imported character's art to other characters that share it
 * (import.json `"alsoFor"`): same sheets, frame size, anchor and rows; each
 * keeps its own fps and loop if it declared them (a runner walks faster).
 */
export function shareArt(manifest: Json, from: string, to: string): void {
  const characters = isRecord(manifest.characters) ? manifest.characters : {};
  const source = characters[from];
  if (!isRecord(source) || !isRecord(source.animations)) return;
  const target = isRecord(characters[to]) ? characters[to] : (characters[to] = {});
  const targetAnims = isRecord(target.animations) ? target.animations : {};
  const animations: Json = {};
  for (const [name, anim] of Object.entries(source.animations)) {
    if (!isRecord(anim)) continue;
    const own = isRecord(targetAnims[name]) ? targetAnims[name] : {};
    animations[name] = {
      ...anim,
      ...(typeof own.fps === 'number' ? { fps: own.fps } : {}),
      ...(typeof own.loop === 'boolean' ? { loop: own.loop } : {}),
    };
  }
  for (const key of ['frameWidth', 'frameHeight', 'anchor', 'directions', 'placeholder'] as const) {
    if (source[key] !== undefined) target[key] = structuredClone(source[key]);
  }
  if (target.hitbox === undefined && source.hitbox !== undefined) target.hitbox = structuredClone(source.hitbox);
  target.animations = animations;
}

/** Stretches (or shrinks) a frame list to `count` frames, keeping its timing even. */
export function resampleFrames<T>(frames: readonly T[], count: number): T[] {
  if (frames.length === count || frames.length === 0) return [...frames];
  return Array.from({ length: count }, (_, i) => frames[Math.min(frames.length - 1, Math.floor((i * frames.length) / count))] as T);
}

function cutFrame(sheet: Frame, col: number, row: number, w: number, h: number): Frame {
  const pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const start = ((row * h + y) * sheet.width + col * w) * 4;
    pixels.set(sheet.pixels.subarray(start, start + w * 4), y * w * 4);
  }
  return { width: w, height: h, pixels };
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
  frameCount?: number,
  scale?: number,
): ImportedAnimation {
  const frameWidth = typeof character.frameWidth === 'number' ? character.frameWidth : anim.width || 48;
  const frameHeight = typeof character.frameHeight === 'number' ? character.frameHeight : anim.height || 48;
  const anchorRaw = isRecord(character.anchor) ? character.anchor : {};
  const anchorY = typeof anchorRaw.y === 'number' ? anchorRaw.y : 0.8;

  for (const note of anim.notes ?? []) log(`  · ${anim.sourceName}: ${note}`);
  const { directions, rows: sourceRows, filled } = directionRows(anim.frames, character.directions === 1);
  if (filled.length > 0) log(`  · ${anim.sourceName}: direcciones que faltan con la más cercana (${filled.join(', ')})`);
  // A sheet needs the same frame count in every row: stretch the shorter directions (or
  // squeeze all to the count chosen in import.json, better for a loop where most rows are shorter).
  const frames = frameCount ?? Math.max(...sourceRows.map((r) => r.length));
  if (frames === 0) throw new Error(`${anim.sourceName}: sin frames`);
  const counts = new Set(sourceRows.map((r) => r.length));
  if (counts.size > 1 || !counts.has(frames)) {
    log(`  · ${anim.sourceName}: direcciones con ${[...counts].join(' y ')} frames; se remuestrean a ${frames}${frameCount ? ' (import.json)' : ''}`);
  }
  const rows = sourceRows.map((r) => resampleFrames(r, frames));

  let decoded = rows.map((row) => row.map((rel) => readFrame(join(sourceDir, rel))));
  const odd = decoded.flat().filter((f) => f.width !== frameWidth || f.height !== frameHeight);
  if (odd.length > 0) {
    const sizes = [...new Set(odd.map((f) => `${f.width}×${f.height}`))].join(', ');
    log(`  · ${anim.sourceName}: ${odd.length} frames de ${sizes}, centrados en ${frameWidth}×${frameHeight}`);
    const lost = odd.reduce((n, f) => n + croppedPixels(f, frameWidth, frameHeight), 0);
    if (lost > 0) log(`  ⚠ ${anim.sourceName}: se recortan ${lost} píxeles del personaje al centrarlo`);
  }

  if (scale !== undefined && scale !== 1) {
    // Drawn at another size than the rest of the character (PixelLab drew the crawl 1.5× bigger):
    // scaled around the feet, so it keeps standing where the character stands.
    const anchorX = (isRecord(character.anchor) && typeof character.anchor.x === 'number' ? character.anchor.x : 0.5) * frameWidth;
    const cx = Math.round(anchorX);
    const cy = Math.round(anchorY * frameHeight);
    decoded = decoded.map((row) => row.map((f) => scaleAbout(centerIn(f, frameWidth, frameHeight), scale, cx, cy)));
    log(`  · ${anim.sourceName}: escalado ×${scale} alrededor de los pies (import.json)`);
  }

  const sheet = buildSheet(decoded, frameWidth, frameHeight);

  // Report where the feet land so the manifest anchor can be checked against the art.
  const bottoms: number[] = [];
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < frames; c++) {
      const cell = cutFrame(sheet, c, r, frameWidth, frameHeight);
      bottoms.push(opaqueBounds(cell)?.maxY ?? 0);
    }
  }
  bottoms.sort((a, b) => a - b);
  const feet = bottoms[Math.floor(bottoms.length / 2)] ?? 0;
  log(`  · ${anim.sourceName}: pies en y≈${feet} de ${frameHeight} (ancla del manifiesto y=${Math.round(anchorY * frameHeight)})`);

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

interface ImportOptions {
  takes: TakeOverrides;
  /** Frames per row of an animation, instead of its longest direction. */
  frames: Record<string, number>;
  /** Scale of an animation drawn at another size than the rest of the character. */
  scale: Record<string, number>;
  /** Other characters that use this art (zombie kinds sharing one zombie). */
  alsoFor: string[];
}

/**
 * Optional art-src/pixellab/<asset>/import.json with artist choices:
 * { "takes": { "<animation>": { "<direction>": "<take folder>" } },
 *   "frames": { "<animation>": <frames per row> }, "scale": { "<animation>": <factor> },
 *   "alsoFor": ["<asset>", …] }
 */
function readOptions(assetDir: string, log: (line: string) => void): ImportOptions {
  const path = join(assetDir, 'import.json');
  if (!existsSync(path)) return { takes: {}, frames: {}, scale: {}, alsoFor: [] };
  const json: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const takes = isRecord(json) && isRecord(json.takes) ? json.takes : {};
  const out: TakeOverrides = {};
  for (const [anim, dirs] of Object.entries(takes)) {
    if (!isRecord(dirs)) continue;
    out[anim] = Object.fromEntries(Object.entries(dirs).filter((e): e is [string, string] => typeof e[1] === 'string'));
  }
  const framesRaw = isRecord(json) && isRecord(json.frames) ? json.frames : {};
  const frames = Object.fromEntries(
    Object.entries(framesRaw).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isInteger(e[1]) && e[1] > 0),
  );
  const scaleRaw = isRecord(json) && isRecord(json.scale) ? json.scale : {};
  const scale = Object.fromEntries(
    Object.entries(scaleRaw).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] > 0 && e[1] <= 4),
  );
  const alsoFor = isRecord(json) && Array.isArray(json.alsoFor) ? json.alsoFor.filter((a): a is string => typeof a === 'string') : [];
  log(`  · import.json: elecciones de tomas para ${Object.keys(out).join(', ') || 'nada'}${alsoFor.length ? `; arte compartido con ${alsoFor.join(', ')}` : ''}`);
  return { takes: out, frames, scale, alsoFor };
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
    const options = readOptions(dir, log);
    const seen = new Map<string, string>();
    for (const exportDir of exports) {
      const parsed = parsePixelLabMetadata(JSON.parse(readFileSync(join(exportDir, 'metadata.json'), 'utf8')), options.takes);
      for (const w of parsed.warnings) log(`  ⚠ ${w}`);
      const { selected, skipped } = selectAnimations(parsed.animations, character.directions === 1);
      for (const line of skipped) log(`  ⚠ ${line}`);
      for (const anim of selected) {
        const previous = seen.get(anim.name);
        if (previous) log(`  ⚠ "${anim.name}" aparece en ${previous} y en ${exportDir}; se usa el último`);
        seen.set(anim.name, exportDir);
        const result = importAnimation(root, asset, exportDir, anim, character, palette, log, options.frames[anim.name], options.scale[anim.name]);
        applyImport(manifest, asset, result, hasFile);
        imported++;
      }
    }
    for (const other of options.alsoFor) {
      shareArt(manifest, asset, other);
      log(`  ✓ ${other} usa el arte de ${asset}`);
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
