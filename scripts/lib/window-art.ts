/**
 * The barricades' art (petición del usuario): a window's hole, from PixelLab,
 * fitted into its wall, and the planks the zombies tear off and the players
 * nail back, cut out of the interior wood floor (art the game already has).
 * Pure: frames in, frames out (scripts/compose-windows.ts does the files).
 */
import { blank, opaqueBounds, type Frame } from './sheet';

/** A barricade sheet's frames: frame N shows N planks (0..PLANKS). */
export const PLANKS = 5;
/** The order the planks go on (slot indices): the middle first, then above and below. */
export const PLANK_ORDER = [2, 0, 4, 1, 3] as const;

/** Where a plank goes on the 32×32 frame: its left end, its top row, its length, and a 1 px step down (or up) halfway along. */
export interface PlankSlot {
  x: number;
  y: number;
  length: number;
  step: -1 | 0 | 1;
}

/** Plank colours: the dark outline (the placeholder's nails) and the nail heads. */
const OUTLINE: readonly [number, number, number] = [0x2a, 0x20, 0x1a];
const NAIL: readonly [number, number, number] = [0xcf, 0xc6, 0xb2];

const px = (f: Frame, x: number, y: number): number => (y * f.width + x) * 4;

function setRgb(f: Frame, x: number, y: number, [r, g, b]: readonly [number, number, number]): void {
  if (x < 0 || y < 0 || x >= f.width || y >= f.height) return;
  f.pixels.set([r, g, b, 255], px(f, x, y));
}

/** Copies the opaque pixels of `src` onto `dst` with its top-left at (dx, dy). */
export function stamp(dst: Frame, src: Frame, dx: number, dy: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const s = px(src, x, y);
      if ((src.pixels[s + 3] ?? 0) === 0) continue;
      const tx = dx + x;
      const ty = dy + y;
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      dst.pixels.set(src.pixels.subarray(s, s + 4), px(dst, tx, ty));
    }
  }
}

/**
 * `f` cropped to its drawing and squeezed to `rows` rows by dropping rows
 * from its middle (a window's glass, much alike row to row), so its lintel
 * and its sill stay whole: pixel art is never scaled.
 */
export function squeezeRows(f: Frame, rows: number): Frame {
  const b = opaqueBounds(f);
  if (!b) return blank(0, 0);
  const all: number[] = [];
  for (let y = b.minY; y <= b.maxY; y++) all.push(y);
  const drop = Math.max(0, all.length - rows);
  const keepTop = Math.floor((all.length - drop) * 0.4);
  const kept = drop > 0 ? [...all.slice(0, keepTop), ...all.slice(keepTop + drop)] : all;
  const width = b.maxX - b.minX + 1;
  const out = blank(width, kept.length);
  kept.forEach((sy, y) => {
    for (let x = 0; x < width; x++) {
      const s = px(f, b.minX + x, sy);
      out.pixels.set(f.pixels.subarray(s, s + 4), px(out, x, y));
    }
  });
  return out;
}

/**
 * `f` cropped to its drawing and turned a quarter (its right side up), then
 * cut to its middle `width` columns: a window seen from the front becomes the
 * gap of a vertical wall seen from above (its frame's sides as the sill
 * across the wall). Turning is allowed: the piece shows no front face.
 */
export function turnAndCut(f: Frame, width: number): Frame {
  const b = opaqueBounds(f);
  if (!b) return blank(0, 0);
  const turnedW = b.maxY - b.minY + 1;
  const turnedH = b.maxX - b.minX + 1;
  const cut = Math.max(0, Math.floor((turnedW - width) / 2));
  const w = Math.min(width, turnedW);
  const out = blank(w, turnedH);
  for (let y = 0; y < turnedH; y++) {
    for (let x = 0; x < w; x++) {
      const s = px(f, b.minX + y, b.maxY - (x + cut));
      out.pixels.set(f.pixels.subarray(s, s + 4), px(out, x, y));
    }
  }
  return out;
}

/**
 * A plank `length` px long, 4 high: two rows of wood (rows `band` and
 * `band + 1` of `wood`, from column `woodX` on, wrapping) inside a dark
 * outline, with a nail near each end.
 */
export function plank(wood: Frame, band: number, woodX: number, length: number): Frame {
  const out = blank(length, 4);
  for (let x = 0; x < length; x++) {
    setRgb(out, x, 0, OUTLINE);
    setRgb(out, x, 3, OUTLINE);
    for (let r = 0; r < 2; r++) {
      const s = px(wood, (woodX + x) % wood.width, (band + r) % wood.height);
      out.pixels.set([wood.pixels[s] ?? 0, wood.pixels[s + 1] ?? 0, wood.pixels[s + 2] ?? 0, 255], px(out, x, 1 + r));
    }
  }
  setRgb(out, 0, 1, OUTLINE);
  setRgb(out, 0, 2, OUTLINE);
  setRgb(out, length - 1, 1, OUTLINE);
  setRgb(out, length - 1, 2, OUTLINE);
  setRgb(out, 2, 1, NAIL);
  setRgb(out, length - 3, 1, NAIL);
  return out;
}

/** Stamps plank `p` at slot `s`: its right half `s.step` px lower (a board nailed a little askew). */
export function nail(dst: Frame, p: Frame, s: PlankSlot): void {
  const half = Math.floor(p.width / 2);
  for (let y = 0; y < p.height; y++) {
    for (let x = 0; x < p.width; x++) {
      const i = px(p, x, y);
      if ((p.pixels[i + 3] ?? 0) === 0) continue;
      const tx = s.x + x;
      const ty = s.y + y + (x >= half ? s.step : 0);
      if (tx < 0 || ty < 0 || tx >= dst.width || ty >= dst.height) continue;
      dst.pixels.set(p.pixels.subarray(i, i + 4), px(dst, tx, ty));
    }
  }
}

/**
 * A barricade's frames, 32×32 each: frame N is `hole` (none for a fence's
 * gap) at (holeX, holeY) with the first N planks of PLANK_ORDER over it,
 * each cut from its own band of `wood`.
 */
export function barricadeFrames(
  hole: Frame | null,
  holeX: number,
  holeY: number,
  slots: readonly PlankSlot[],
  wood: Frame,
  bands: readonly number[],
): Frame[] {
  const planks = slots.map((s, i) => plank(wood, bands[i % bands.length] ?? 0, i * 7, s.length));
  return Array.from({ length: PLANKS + 1 }, (_, n) => {
    const f = blank(32, 32);
    if (hole) stamp(f, hole, holeX, holeY);
    for (let k = 0; k < n; k++) {
      const slot = PLANK_ORDER[k] ?? k;
      const s = slots[slot];
      const p = planks[slot];
      if (s && p) nail(f, p, s);
    }
    return f;
  });
}
