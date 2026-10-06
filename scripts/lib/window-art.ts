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

/**
 * A broken edge's profile: how far it bites in at each step along it, given
 * as runs of [depth, length]. Runs of 2 px or more keep the edge in clean
 * steps instead of a comb of single pixels (petición del usuario: no stray
 * pixels).
 */
function profile(runs: readonly (readonly [number, number])[]): number[] {
  return runs.flatMap(([depth, length]) => Array.from({ length }, () => depth));
}

/**
 * Outlines `mask` (its cells marked true) inside the box (bx0..bx1, by0..by1):
 * every cell of the box out of the mask that touches it side by side and
 * where `edge(x, y)` (the mask cell it touches) allows it.
 */
function outline(f: Frame, mask: boolean[][], box: readonly [number, number, number, number], edge: (x: number, y: number) => boolean): void {
  const [bx0, by0, bx1, by1] = box;
  const on = (x: number, y: number): boolean => mask[y]?.[x] === true;
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      if (on(x, y)) continue;
      const touches = (
        [
          [x - 1, y],
          [x + 1, y],
          [x, y - 1],
          [x, y + 1],
        ] as const
      ).some(([nx, ny]) => on(nx, ny) && edge(nx, ny));
      if (touches) setRgb(f, x, y, HOLE.outline);
    }
  }
}

/**
 * The hole a window leaves in a horizontal wall once its planks are gone
 * (petición del usuario: aligned with the wall, and more hole than wall):
 * the face broken open across almost its whole width (columns 2..29) and
 * height (rows 15..29 of the cell, under the wall's top edge), its top edge
 * and sides broken in steps of 2 px or more, with a dark outline, a few
 * splinters of the broken boards and shards of glass in its top corners.
 * Inside, the dark, deeper at the top; the wall's thickness shows on its
 * left side (in shadow), as a lit sliver on its right and as a straight
 * sill at its bottom (light from the top left).
 */
export function brokenHole(): Frame {
  const f = blank(32, 32);
  const x0 = 2;
  const x1 = 29;
  const y0 = 15;
  const y1 = 29;
  const sill = y1 - 2;
  /** How far the top edge bites down at each column (x0..x1) and the sides in at each row above the sill (y0..sill - 1). */
  const top = profile([
    [0, 4],
    [1, 3],
    [0, 2],
    [2, 3],
    [1, 2],
    [0, 5],
    [1, 3],
    [2, 2],
    [1, 2],
    [0, 2],
  ]);
  const left = profile([
    [0, 3],
    [1, 4],
    [0, 5],
  ]);
  const right = profile([
    [0, 2],
    [1, 5],
    [0, 3],
    [1, 2],
  ]);
  const mask: boolean[][] = Array.from({ length: 32 }, () => Array<boolean>(32).fill(false));
  for (let y = y0; y <= y1; y++) {
    const l = y >= sill ? x0 : x0 + (left[y - y0] ?? 0);
    const r = y >= sill ? x1 : x1 - (right[y - y0] ?? 0);
    for (let x = l; x <= r; x++) {
      if (y < y0 + (top[x - x0] ?? 0)) continue;
      const row = mask[y];
      if (row) row[x] = true;
      const depth = (y - y0) / (y1 - y0);
      let c: Rgb = depth < 0.3 ? HOLE.darkTop : depth < 0.75 ? HOLE.dark : HOLE.darkLow;
      if (x <= l + 1) c = HOLE.jamb;
      if (x === r) c = HOLE.jambLit;
      if (y >= sill) c = y === y1 ? HOLE.sillDark : y === sill ? HOLE.sillLight : HOLE.sill;
      setRgb(f, x, y, c);
    }
  }
  // The outline round the break, but not along the sill (it sits flush with the wall).
  outline(f, mask, [x0 - 1, y0 - 1, x1 + 1, y1], (_x, y) => y < sill);
  // Broken board ends sticking into the dark, 2 px each, under the top edge.
  for (const [x, y] of [
    [11, 17],
    [12, 17],
    [17, 15],
    [18, 15],
    [21, 16],
    [22, 16],
  ] as const)
    setRgb(f, x, y, HOLE.splinter);
  // Shards of glass left in the top corners, 3 px each.
  for (const [x, y, c] of [
    [4, 15, HOLE.glassLight],
    [5, 15, HOLE.glass],
    [4, 16, HOLE.glass],
    [27, 16, HOLE.glassLight],
    [26, 16, HOLE.glass],
    [27, 17, HOLE.glass],
  ] as const)
    setRgb(f, x, y, c);
  return f;
}

/**
 * The same hole in a vertical wall, seen from above: its 12 px strip
 * (columns 10..21) broken off along rows 5..26, its two ends broken in
 * steps of 2 px or more with a dark outline and a splinter each; down in the
 * gap the wall's thickness (its left side in shadow, a lit sliver on its
 * right) and the sill along the middle, lower down.
 */
export function brokenGap(): Frame {
  const f = blank(32, 32);
  const x0 = 10;
  const x1 = 21;
  const y0 = 5;
  const y1 = 26;
  /** How far each end bites into the gap at each column (x0..x1). */
  const top = profile([
    [1, 2],
    [0, 3],
    [2, 2],
    [0, 2],
    [1, 3],
  ]);
  const bottom = profile([
    [0, 3],
    [1, 2],
    [0, 2],
    [2, 3],
    [0, 2],
  ]);
  const mask: boolean[][] = Array.from({ length: 32 }, () => Array<boolean>(32).fill(false));
  for (let x = x0; x <= x1; x++) {
    for (let y = y0 + (top[x - x0] ?? 0); y <= y1 - (bottom[x - x0] ?? 0); y++) {
      const row = mask[y];
      if (row) row[x] = true;
      let c: Rgb = HOLE.dark;
      if (x <= x0 + 1) c = HOLE.jamb;
      if (x === x1) c = HOLE.jambLit;
      if (x >= 14 && x <= 17) c = x === 14 ? HOLE.sillDark : x === 17 ? HOLE.sillLight : HOLE.sill;
      setRgb(f, x, y, c);
    }
  }
  // The outline across both broken ends, within the wall's strip (its sides are the wall's own edges).
  outline(f, mask, [x0, y0 - 1, x1, y1 + 1], () => true);
  for (const [x, y] of [
    [12, 5],
    [13, 5],
    [11, 26],
    [12, 26],
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
