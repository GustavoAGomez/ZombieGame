/**
 * npm run windows:compose — the barricades' sheets (petición del usuario):
 * the window's hole chosen among PixelLab's candidates
 * (art-src/pixellab/windows/), fitted into its wall, and planks cut from
 * the interior wood floor (public/assets/tiles/floors_interior.png, art the
 * game already has). Frame N shows N planks (0..5):
 *   window_planks    a window in a horizontal wall: the hole in its face
 *   window_planks_v  a window in a vertical wall: the gap in its top
 *   fence_planks     a gap in a horizontal fence: planks only
 *   fence_planks_v   a gap in a vertical fence: planks only
 * Writes public/assets/sprites/objects/<key>.png, marks the manifest entries
 * as real art and leaves a review sheet in maps/preview/windows/.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contactSheet, type SheetEntry } from './lib/contact-sheet';
import { decodePng, encodePng } from './lib/png';
import { buildSheet, cut, type Frame } from './lib/sheet';
import { barricadeFrames, squeezeRows, turnAndCut, type PlankSlot } from './lib/window-art';

/** The holes the user chose: the front one (number 3) and the one for vertical walls (number 2). */
const HOLE_FRONT = 'art-src/pixellab/windows/frontal/candidates/candidate_2.png';
const HOLE_TOP = 'art-src/pixellab/windows/vertical/candidates/candidate_1.png';
/** The light wood floor tile (its boards run across) and its rows free of the seams between boards. */
const WOOD = { file: 'public/assets/tiles/floors_interior.png', x: 32, y: 0 } as const;
const WOOD_BANDS = [3, 6, 9, 17, 23] as const;

/** A horizontal wall's face fills rows 14..31 of its cell (18 px under its 7 px top edge). */
const FACE_TOP = 14;
const FACE_ROWS = 18;
/** A vertical wall is a 12 px strip seen from above, columns 10..21. */
const STRIP_X = 10;
const STRIP_W = 12;

/** Planks across a window in a horizontal wall: a little askew, overhanging its frame. */
const FRONT_SLOTS: readonly PlankSlot[] = [
  { x: 4, y: 15, length: 24, step: 1 },
  { x: 3, y: 18, length: 26, step: 0 },
  { x: 4, y: 21, length: 25, step: -1 },
  { x: 3, y: 24, length: 26, step: 0 },
  { x: 4, y: 27, length: 24, step: 1 },
];
/** Across the gap of a vertical wall: short boards over its 12 px, a little wider than it. */
const TOP_SLOTS: readonly PlankSlot[] = [
  { x: 8, y: 7, length: 16, step: 0 },
  { x: 9, y: 11, length: 15, step: 0 },
  { x: 8, y: 15, length: 16, step: 0 },
  { x: 9, y: 19, length: 15, step: 0 },
  { x: 8, y: 23, length: 16, step: 0 },
];
/** Across a fence's gap, from post to post. */
const FENCE_SLOTS: readonly PlankSlot[] = FRONT_SLOTS.map((s) => ({ ...s, x: 0, length: 32 }));
const FENCE_TOP_SLOTS: readonly PlankSlot[] = [2, 8, 14, 20, 26].map((y, i) => ({ x: 8, y, length: i % 2 === 0 ? 16 : 15, step: 0 }));

type Json = Record<string, unknown>;

function readFrame(path: string): Frame {
  const png = decodePng(readFileSync(path));
  return { width: png.width, height: png.height, pixels: png.pixels };
}

export function composeWindows(root: string, log: (line: string) => void): void {
  const at = (p: string): string => resolve(root, p);
  const floor = readFrame(at(WOOD.file));
  const wood = cut(floor, WOOD.x, WOOD.y, 32, 32);
  const front = squeezeRows(readFrame(at(HOLE_FRONT)), FACE_ROWS);
  const top = turnAndCut(readFrame(at(HOLE_TOP)), STRIP_W);
  const sheets: Record<string, Frame[]> = {
    window_planks: barricadeFrames(front, Math.round((32 - front.width) / 2), FACE_TOP, FRONT_SLOTS, wood, WOOD_BANDS),
    window_planks_v: barricadeFrames(top, STRIP_X, Math.round((32 - top.height) / 2), TOP_SLOTS, wood, WOOD_BANDS),
    fence_planks: barricadeFrames(null, 0, 0, FENCE_SLOTS, wood, WOOD_BANDS),
    fence_planks_v: barricadeFrames(null, 0, 0, FENCE_TOP_SLOTS, wood, WOOD_BANDS),
  };
  const manifestPath = at('public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Json;
  const objects = (manifest.objects ?? {}) as Record<string, Json>;
  const review: SheetEntry[] = [];
  for (const [key, frames] of Object.entries(sheets)) {
    const sheet = buildSheet([frames], 32, 32);
    const file = `sprites/objects/${key}.png`;
    mkdirSync(dirname(at(`public/assets/${file}`)), { recursive: true });
    writeFileSync(at(`public/assets/${file}`), encodePng(sheet.width, sheet.height, sheet.pixels));
    objects[key] = { ...(objects[key] ?? {}), file, frameWidth: 32, frameHeight: 32, frames: frames.length, placeholder: false };
    frames.forEach((frame, n) => review.push({ frame, caption: [`${key.replace('_planks', '').toUpperCase()} ${n}`] }));
    log(`  ✓ ${key} → ${file} (${frames.length} fotogramas de 32×32)`);
  }
  manifest.objects = objects;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const sheet = contactSheet(review, { columns: 6, scale: 3, title: 'BARRICADAS' });
  mkdirSync(at('maps/preview/windows'), { recursive: true });
  writeFileSync(at('maps/preview/windows/barricadas.png'), encodePng(sheet.width, sheet.height, sheet.pixels));
  log('  ✓ hoja de revisión → maps/preview/windows/barricadas.png');
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    composeWindows(root, (line) => console.info(line));
  } catch (err) {
    console.error(`✖ ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
