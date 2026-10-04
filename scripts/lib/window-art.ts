/**
 * The barricades' art (petición del usuario): the hole a window leaves in its
 * wall, drawn here, straight and filling almost the whole face, and the
 * planks the zombies tear off and the players nail back, cut out of the
 * interior wood floor (art the game already has). Pure: frames in, frames
 * out (scripts/compose-windows.ts does the files).
 */
import { blank, type Frame } from './sheet';

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

type Rgb = readonly [number, number, number];
const rgb = (hex: string): Rgb => [Number.parseInt(hex.slice(1, 3), 16), Number.parseInt(hex.slice(3, 5), 16), Number.parseInt(hex.slice(5, 7), 16)];

/** The hole's colours: its darkness (deeper at the top), the wall's thickness, the broken boards and the glass left in it. */
const HOLE = {
  darkTop: rgb('#0c0d13'),
  dark: rgb('#14151d'),
  darkLow: rgb('#1d1f29'),
  jamb: rgb('#2e2a27'),
  jambLit: rgb('#4a443d'),
  sill: rgb('#8d7b62'),
  sillDark: rgb('#5e5142'),
  sillLight: rgb('#b19c7c'),
  splinter: rgb('#c4ae8a'),
  glass: rgb('#9fb6cc'),
  glassLight: rgb('#d8e6f0'),
  outline: rgb('#1a1612'),
} as const;

/** A fixed pseudo-random sequence, so the broken edge is the same on every build. */
function noise(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/**
 * The hole a window leaves in a horizontal wall once its planks are gone
 * (petición del usuario: aligned with the wall, and more hole than wall):
 * the face broken open across almost its whole width (columns 2..29) and
 * height (rows 15..29 of the cell, under the wall's top edge), with a
 * jagged top edge and sides, a dark outline, splinters of the broken boards
 * and shards of glass in its corners. Inside, the dark, deeper at the top;
 * the wall's thickness shows on its left side (in shadow), as a lit sliver
 * on its right and as a sill at its bottom (light from the top left).
 */
export function brokenHole(): Frame {
  const rnd = noise(11);
  const f = blank(32, 32);
  const x0 = 2;
  const x1 = 29;
  const y0 = 15;
  const y1 = 29;
  const top: number[] = [];
  for (let x = x0; x <= x1; x++) top.push(y0 + (rnd() < 0.35 ? 1 : 0) + (rnd() < 0.12 ? 1 : 0));
  const left: number[] = [];
  const right: number[] = [];
  for (let y = y0; y <= y1; y++) {
    left.push(x0 + (rnd() < 0.3 ? 1 : 0));
    right.push(x1 - (rnd() < 0.3 ? 1 : 0));
  }
  for (let y = y0; y <= y1; y++) {
    const l = left[y - y0] ?? x0;
    const r = right[y - y0] ?? x1;
    for (let x = l; x <= r; x++) {
      if (y < (top[x - x0] ?? y0)) continue;
      const depth = (y - y0) / (y1 - y0);
      let c: Rgb = depth < 0.3 ? HOLE.darkTop : depth < 0.75 ? HOLE.dark : HOLE.darkLow;
      if (x <= l + 1) c = HOLE.jamb;
      if (x === r) c = HOLE.jambLit;
      if (y >= y1 - 2) c = y === y1 ? HOLE.sillDark : y === y1 - 2 ? HOLE.sillLight : HOLE.sill;
      setRgb(f, x, y, c);
    }
  }
  for (let x = x0; x <= x1; x++) setRgb(f, x, (top[x - x0] ?? y0) - 1, HOLE.outline);
  for (let y = y0; y <= y1 - 2; y++) {
    setRgb(f, (left[y - y0] ?? x0) - 1, y, HOLE.outline);
    setRgb(f, (right[y - y0] ?? x1) + 1, y, HOLE.outline);
  }
  for (const [x, y] of [
    [5, 16],
    [6, 16],
    [13, 15],
    [21, 16],
    [22, 16],
    [26, 15],
    [4, 21],
    [27, 19],
  ] as const)
    setRgb(f, x, y, HOLE.splinter);
  for (const [x, y, c] of [
    [4, 17, HOLE.glass],
    [5, 18, HOLE.glass],
    [4, 18, HOLE.glassLight],
    [26, 17, HOLE.glass],
    [27, 17, HOLE.glassLight],
    [25, 18, HOLE.glass],
  ] as const)
    setRgb(f, x, y, c);
  return f;
}

/**
 * The same hole in a vertical wall, seen from above: its 12 px strip
 * (columns 10..21) broken off along rows 5..26, with ragged ends and
 * splinters; down in the gap the wall's thickness (its left side in shadow,
 * a lit sliver on its right) and the sill along the middle, lower down.
 */
export function brokenGap(): Frame {
  const rnd = noise(23);
  const f = blank(32, 32);
  const x0 = 10;
  const x1 = 21;
  const y0 = 5;
  const y1 = 26;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if ((y < y0 + 2 || y > y1 - 2) && rnd() < 0.4) continue;
      let c: Rgb = HOLE.dark;
      if (x <= x0 + 1) c = HOLE.jamb;
      if (x === x1) c = HOLE.jambLit;
      if (x >= 14 && x <= 17) c = x === 14 ? HOLE.sillDark : x === 17 ? HOLE.sillLight : HOLE.sill;
      setRgb(f, x, y, c);
    }
  }
  for (let x = x0; x <= x1; x++) {
    setRgb(f, x, y0 - 1, HOLE.outline);
    setRgb(f, x, y1 + 1, HOLE.outline);
  }
  for (const [x, y] of [
    [11, 5],
    [19, 6],
    [12, 26],
    [20, 25],
  ] as const)
    setRgb(f, x, y, HOLE.splinter);
  return f;
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
