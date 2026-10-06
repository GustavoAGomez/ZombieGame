/**
 * npm run assets:import — imports raw PixelLab exports from
 * art-src/pixellab/<asset>/ (docs/ASSETS.md §6):
 *   1. reads metadata.json (format documented in scripts/lib/pixellab.ts),
 *   2. builds one sheet per animation: a row per direction in the fixed
 *      order, frames cut to the declared canvas and aligned by the anchor,
 *   3. forces binary alpha and quantises to art-src/palette.hex if present,
 *   4. writes public/assets/sprites/<asset>/<animation>.png and updates the
 *      manifest entry (frames, directions, placeholder flags).
 * Objects of the manifest come from art-src/pixellab/objects/<key>/ instead
 * (one PNG per frame and an import.json with their order, see importObject).
 * Usage: npm run assets:import [-- <asset or object key> …]   (all by default)
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DIRECTIONS_4, DIRECTIONS_8, type Directions } from '../src/game/assets/manifest';
import { decodePng, encodePng, parsePaletteHex } from './lib/png';
import {
  applySources,
  directionRows,
  MIRRORED,
  mirrorDirections,
  trimFrames,
  parsePixelLabMetadata,
  selectAnimations,
  type ExportAnimation,
  type TakeOverrides,
} from './lib/pixellab';
import { binarizeAlpha, buildSheet, centerIn, croppedPixels, flipHorizontal, opaqueBounds, quantize, scaleAbout, type Frame } from './lib/sheet';

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
    // Where things happen in the art (the slam's blow) is the artist's: a new take keeps them.
    ...(isRecord(previous.marks) ? { marks: previous.marks } : {}),
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

/** A frame of the export; a path marked MIRRORED is read mirrored left to right. */
function readFrame(dir: string, path: string): Frame {
  const mirrored = path.startsWith(MIRRORED);
  const png = decodePng(readFileSync(join(dir, mirrored ? path.slice(MIRRORED.length) : path)));
  const frame = { width: png.width, height: png.height, pixels: png.pixels };
  return mirrored ? flipHorizontal(frame) : frame;
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
  scale?: ScaleOption,
  mirror: Record<string, string> = {},
  mirrorMissing: Record<string, string> = {},
  trim?: readonly [number, number],
): ImportedAnimation {
  const frameWidth = typeof character.frameWidth === 'number' ? character.frameWidth : anim.width || 48;
  const frameHeight = typeof character.frameHeight === 'number' ? character.frameHeight : anim.height || 48;
  const anchorRaw = isRecord(character.anchor) ? character.anchor : {};
  const anchorY = typeof anchorRaw.y === 'number' ? anchorRaw.y : 0.8;

  for (const note of anim.notes ?? []) log(`  · ${anim.sourceName}: ${note}`);
  const mirrored = Object.keys(mirror).filter((d) => anim.frames.has(mirror[d] ?? ''));
  const mirroredMissing = Object.keys(mirrorMissing).filter((d) => !anim.frames.has(d) && anim.frames.has(mirrorMissing[d] ?? ''));
  const mirrorLog = [...mirrored.map((d) => `${d} ← ${mirror[d]}`), ...mirroredMissing.map((d) => `${d} ← ${mirrorMissing[d]}`)];
  if (mirrorLog.length > 0) log(`  · ${anim.sourceName}: en espejo (import.json): ${mirrorLog.join(', ')}`);
  if (trim) log(`  · ${anim.sourceName}: fotogramas ${trim[0]}–${trim[1] - 1} (import.json)`);
  const trimmed = trimFrames(anim.frames, trim);
  const withMirrors = mirrorDirections(mirrorDirections(trimmed, mirrorMissing, true), mirror);
  const { directions, rows: sourceRows, filled } = directionRows(withMirrors, character.directions === 1);
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

  let decoded = rows.map((row) => row.map((rel) => readFrame(sourceDir, rel)));
  const odd = decoded.flat().filter((f) => f.width !== frameWidth || f.height !== frameHeight);
  if (odd.length > 0) {
    const sizes = [...new Set(odd.map((f) => `${f.width}×${f.height}`))].join(', ');
    log(`  · ${anim.sourceName}: ${odd.length} frames de ${sizes}, centrados en ${frameWidth}×${frameHeight}`);
    const lost = odd.reduce((n, f) => n + croppedPixels(f, frameWidth, frameHeight), 0);
    if (lost > 0) log(`  ⚠ ${anim.sourceName}: se recortan ${lost} píxeles del personaje al centrarlo`);
  }

  if (scale !== undefined) {
    // Drawn at another size than the rest of the character (PixelLab drew the crawl 1.5× bigger):
    // scaled around the feet, so it keeps standing where the character stands.
    const anchorX = (isRecord(character.anchor) && typeof character.anchor.x === 'number' ? character.anchor.x : 0.5) * frameWidth;
    const cx = Math.round(anchorX);
    const cy = Math.round(anchorY * frameHeight);
    const names = rowDirections(directions);
    const factors = names.map((d) => rowScale(scale, d));
    decoded = decoded.map((row, r) => {
      const factor = factors[r] ?? 1;
      return factor === 1 ? row : row.map((f) => scaleAbout(centerIn(f, frameWidth, frameHeight), factor, cx, cy));
    });
    const summary = names.map((d, r) => `${d} ×${factors[r] ?? 1}`).join(', ');
    log(`  · ${anim.sourceName}: escalado alrededor de los pies (import.json): ${summary}`);
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

/**
 * Scale of an animation (import.json "scale"): one factor, or one per
 * direction with "*" for the rest. Facing the camera a crawler shows its
 * face and looks bigger than from behind, so it can take a smaller factor.
 */
export type ScaleOption = number | Record<string, number>;

/** The factor for one direction row (1 when nothing applies). */
export function rowScale(scale: ScaleOption, direction: string): number {
  if (typeof scale === 'number') return scale;
  return scale[direction] ?? scale['*'] ?? 1;
}

/** Direction names of the sheet rows, in order. */
function rowDirections(directions: Directions): readonly string[] {
  if (directions === 8) return DIRECTIONS_8;
  if (directions === 4) return DIRECTIONS_4;
  return ['south'];
}

function validFactor(value: unknown): value is number {
  return typeof value === 'number' && value > 0 && value <= 4;
}

interface ImportOptions {
  takes: TakeOverrides;
  /** Frames per row of an animation, instead of its longest direction. */
  frames: Record<string, number>;
  /** Scale of an animation drawn at another size than the rest of the character. */
  scale: Record<string, ScaleOption>;
  /** Other characters that use this art (zombie kinds sharing one zombie). */
  alsoFor: string[];
  /** Per animation, the export animations it is built from, in order of preference per direction. */
  sources: Record<string, string[]>;
  /** Directions drawn as another one mirrored. */
  mirror: Record<string, string>;
  /** The same, only for the directions an animation was not drawn in. */
  mirrorMissing: Record<string, string>;
  /** Per animation, the frames [start, end) of each direction to keep. */
  trim: Record<string, [number, number]>;
}

/**
 * Optional art-src/pixellab/<asset>/import.json with artist choices:
 * { "takes": { "<animation>": { "<direction>": "<take folder>" } },
 *   "frames": { "<animation>": <frames per row> },
 *   "scale": { "<animation>": <factor> | { "<direction>" | "*": <factor> } },
 *   "alsoFor": ["<asset>", …],
 *   "sources": { "<animation>": ["<export animation>", …] },
 *   "mirror": { "<direction>": "<direction it mirrors>" },
 *   "mirrorMissing": { "<direction>": "<direction it mirrors>" },
 *   "trim": { "<animation>": [<first frame>, <frame after the last>] } }
 */
function readOptions(assetDir: string, log: (line: string) => void): ImportOptions {
  const path = join(assetDir, 'import.json');
  if (!existsSync(path)) return { takes: {}, frames: {}, scale: {}, alsoFor: [], sources: {}, mirror: {}, mirrorMissing: {}, trim: {} };
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
  const scale: Record<string, ScaleOption> = {};
  for (const [anim, value] of Object.entries(scaleRaw)) {
    if (validFactor(value)) scale[anim] = value;
    else if (isRecord(value)) scale[anim] = Object.fromEntries(Object.entries(value).filter((e): e is [string, number] => validFactor(e[1])));
  }
  const alsoFor = isRecord(json) && Array.isArray(json.alsoFor) ? json.alsoFor.filter((a): a is string => typeof a === 'string') : [];
  const sourcesRaw = isRecord(json) && isRecord(json.sources) ? json.sources : {};
  const sources: Record<string, string[]> = {};
  for (const [anim, list] of Object.entries(sourcesRaw)) {
    if (Array.isArray(list)) sources[anim] = list.filter((s): s is string => typeof s === 'string');
  }
  const mirrorRaw = isRecord(json) && isRecord(json.mirror) ? json.mirror : {};
  const mirror = Object.fromEntries(Object.entries(mirrorRaw).filter((e): e is [string, string] => typeof e[1] === 'string'));
  const mirrorMissingRaw = isRecord(json) && isRecord(json.mirrorMissing) ? json.mirrorMissing : {};
  const mirrorMissing = Object.fromEntries(Object.entries(mirrorMissingRaw).filter((e): e is [string, string] => typeof e[1] === 'string'));
  log(`  · import.json: elecciones de tomas para ${Object.keys(out).join(', ') || 'nada'}${alsoFor.length ? `; arte compartido con ${alsoFor.join(', ')}` : ''}`);
  const trimRaw = isRecord(json) && isRecord(json.trim) ? json.trim : {};
  const trim: Record<string, [number, number]> = {};
  for (const [anim, range] of Object.entries(trimRaw)) {
    const [start, end] = Array.isArray(range) ? (range as unknown[]) : [];
    if (typeof start === 'number' && typeof end === 'number' && Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < end) trim[anim] = [start, end];
  }
  return { takes: out, frames, scale, alsoFor, sources, mirror, mirrorMissing, trim };
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

/** The folder of object exports inside art-src/pixellab/: one subfolder per object key. */
const OBJECTS_DIR = 'objects';

/**
 * Imports one object of the manifest from art-src/pixellab/objects/<key>/:
 * the PixelLab images (one PNG per frame, as downloaded) and an import.json
 * naming them in frame order, { "frames": ["fist.png", "offer.png", …] },
 * with "mirror": true to flip them left to right.
 * Frames go left to right at the declared canvas (a frame of another size
 * is centred, as for characters), with binary alpha and the palette;
 * writes the object's file and marks it as real art in the manifest.
 */
export function importObject(root: string, key: string, manifest: Json, palette: number[] | null, log: (line: string) => void): boolean {
  const dir = resolve(root, 'art-src/pixellab', OBJECTS_DIR, key);
  const objects = isRecord(manifest.objects) ? manifest.objects : {};
  const def = objects[key];
  if (!isRecord(def) || typeof def.file !== 'string' || typeof def.frameWidth !== 'number' || typeof def.frameHeight !== 'number') {
    log(`  ✖ ${key}: no está en la sección objects del manifiesto (con file, frameWidth y frameHeight)`);
    return false;
  }
  const optionsPath = join(dir, 'import.json');
  const json: unknown = existsSync(optionsPath) ? JSON.parse(readFileSync(optionsPath, 'utf8')) : null;
  const names = isRecord(json) && Array.isArray(json.frames) ? json.frames.filter((f): f is string => typeof f === 'string') : [];
  // Drawn facing the other way (a slash curving the wrong side): "mirror": true flips every frame.
  const mirror = isRecord(json) && json.mirror === true;
  if (names.length === 0) {
    log(`  ✖ ${key}: falta import.json con "frames" (los PNG en orden de fotograma)`);
    return false;
  }
  const { frameWidth, frameHeight, file } = def;
  const frames = names.map((name) => (mirror ? flipHorizontal(readFrame(dir, name)) : readFrame(dir, name)));
  if (mirror) log('  · en espejo (import.json)');
  frames.forEach((f, i) => {
    if (f.width === frameWidth && f.height === frameHeight) return;
    log(`  · ${names[i]}: ${f.width}×${f.height}, centrado en ${frameWidth}×${frameHeight}`);
    const lost = croppedPixels(f, frameWidth, frameHeight);
    if (lost > 0) log(`  ⚠ ${names[i]}: se recortan ${lost} píxeles al centrarlo`);
  });
  const sheet = buildSheet([frames], frameWidth, frameHeight);
  const softened = binarizeAlpha(sheet);
  if (softened > 0) log(`  · ${softened} píxeles semitransparentes pasados a alfa 0/255`);
  if (palette) {
    const outside = quantize(sheet, palette);
    if (outside > 0) log(`  ⚠ ${outside} colores fuera de la paleta, ajustados al más cercano`);
  } else {
    log('  ⚠ sin art-src/palette.hex, no se cuantiza');
  }
  const out = resolve(root, 'public/assets', file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, encodePng(sheet.width, sheet.height, sheet.pixels));
  def.frames = frames.length;
  def.placeholder = false;
  log(`  ✓ ${names.join(', ')} → ${file} (${frames.length} fotogramas de ${frameWidth}×${frameHeight})`);
  return true;
}

export function importAssets(root: string, only: readonly string[], log: (line: string) => void): number {
  const source = resolve(root, 'art-src/pixellab');
  const assets = existsSync(source)
    ? readdirSync(source).filter((name) => name !== OBJECTS_DIR && !name.startsWith('.') && statSync(join(source, name)).isDirectory())
    : [];
  const objectSource = join(source, OBJECTS_DIR);
  const objectKeys = existsSync(objectSource)
    ? readdirSync(objectSource).filter((name) => !name.startsWith('.') && statSync(join(objectSource, name)).isDirectory())
    : [];
  const selected = only.length > 0 ? assets.filter((a) => only.includes(a)) : assets;
  const selectedObjects = only.length > 0 ? objectKeys.filter((k) => only.includes(k)) : objectKeys;
  if (selected.length === 0 && selectedObjects.length === 0) {
    log('No hay exports en art-src/pixellab/<asset>/ ni en art-src/pixellab/objects/<clave>/. Nada que importar.');
    return 0;
  }

  const palettePath = resolve(root, 'art-src/palette.hex');
  const palette = existsSync(palettePath) ? [...parsePaletteHex(readFileSync(palettePath, 'utf8'))] : null;
  const manifestPath = resolve(root, 'public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Json;
  const characters = isRecord(manifest.characters) ? manifest.characters : {};
  const hasFile = (file: string): boolean => file.length > 0 && existsSync(resolve(root, 'public/assets', file));

  let imported = 0;
  for (const key of selectedObjects) {
    log(`\n${OBJECTS_DIR}/${key}`);
    if (importObject(root, key, manifest, palette, log)) imported++;
  }
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
      const sourced = applySources(parsed.animations, options.sources);
      for (const note of sourced.notes) log(`  · ${note}`);
      const { selected, skipped } = selectAnimations(sourced.animations, character.directions === 1);
      for (const line of skipped) log(`  ⚠ ${line}`);
      for (const anim of selected) {
        const previous = seen.get(anim.name);
        if (previous) log(`  ⚠ "${anim.name}" aparece en ${previous} y en ${exportDir}; se usa el último`);
        seen.set(anim.name, exportDir);
        const result = importAnimation(
          root,
          asset,
          exportDir,
          anim,
          character,
          palette,
          log,
          options.frames[anim.name],
          options.scale[anim.name],
          options.mirror,
          options.mirrorMissing,
          options.trim[anim.name],
        );
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
  log(`\nManifiesto actualizado (${imported} animaciones y objetos). Ejecuta npm run assets:check.`);
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
