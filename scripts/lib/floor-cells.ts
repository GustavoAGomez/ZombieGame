/**
 * Floor tiles from PixelLab's floors_interior export. The sheet is not a
 * regular grid: 4×4 cells of about 48 px with gaps of 1 to 6 px, the last
 * column and row narrower (cropped), and some cells keep a dark outline on
 * one or two sides. Tiling those outlines drew a grid over the floors.
 *
 * Each cell is found as a connected blob, its dark outline lines are
 * trimmed, and the largest centred square of what is left is scaled to
 * 32×32. A full cell (≈48 px) keeps the 48 → 32 scale of the export; a
 * cell cut short (the last column, 37 px, and the last row, 34 px) is
 * scaled less, so its texture looks a little bigger. Completing those cells
 * by mirroring was tried and left symmetric shapes that repeated on every
 * tile, a worse pattern than the slight change of scale.
 */
import { detectPieces } from './kit';
import { cut, downscaleByMode, fillTransparent, type Frame } from './sheet';

/** Nominal cell size of the export and size of a game tile. */
export const FLOOR_CELL = 48;
export const FLOOR_TILE = 32;
/** A border line counts as outline when at least this share of its pixels is very dark. */
const OUTLINE_SHARE = 0.6;
const VERY_DARK = 100;

function isDark(f: Frame, x: number, y: number): boolean {
  const i = (y * f.width + x) * 4;
  return (f.pixels[i + 3] ?? 0) === 0 || (f.pixels[i] ?? 0) + (f.pixels[i + 1] ?? 0) + (f.pixels[i + 2] ?? 0) < VERY_DARK;
}

/** Bounds of the cell without the dark outline lines along its edges. */
export function trimOutline(f: Frame): { x: number; y: number; width: number; height: number } {
  let x0 = 0;
  let y0 = 0;
  let x1 = f.width - 1;
  let y1 = f.height - 1;
  const columnDark = (x: number): boolean => {
    let n = 0;
    for (let y = y0; y <= y1; y++) if (isDark(f, x, y)) n++;
    return n >= (y1 - y0 + 1) * OUTLINE_SHARE;
  };
  const rowDark = (y: number): boolean => {
    let n = 0;
    for (let x = x0; x <= x1; x++) if (isDark(f, x, y)) n++;
    return n >= (x1 - x0 + 1) * OUTLINE_SHARE;
  };
  let changed = true;
  while (changed && x1 - x0 > 8 && y1 - y0 > 8) {
    changed = false;
    if (columnDark(x0)) [x0, changed] = [x0 + 1, true];
    if (columnDark(x1)) [x1, changed] = [x1 - 1, true];
    if (rowDark(y0)) [y0, changed] = [y0 + 1, true];
    if (rowDark(y1)) [y1, changed] = [y1 - 1, true];
  }
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

export interface FloorCell {
  /** Where the cell is in the export and what was kept of it. */
  source: { x: number; y: number; width: number; height: number };
  kept: { x: number; y: number; width: number; height: number };
  tile: Frame;
}

/** The 16 floor cells in reading order, as 32×32 tiles. */
export function floorCells(img: Frame): FloorCell[] {
  const pieces = detectPieces(img, FLOOR_CELL, FLOOR_CELL * 4);
  if (pieces.length !== 16) throw new Error(`floors_interior: ${pieces.length} celdas detectadas, se esperaban 16`);
  return pieces.map((p) => {
    const cell = cut(img, p.x, p.y, p.width, p.height);
    const k = trimOutline(cell);
    const side = Math.min(k.width, k.height, FLOOR_CELL);
    const x = k.x + Math.floor((k.width - side) / 2);
    const y = k.y + Math.floor((k.height - side) / 2);
    const kept = cut(cell, x, y, side, side);
    fillTransparent(kept);
    return {
      source: { x: p.x, y: p.y, width: p.width, height: p.height },
      kept: { x: p.x + x, y: p.y + y, width: side, height: side },
      tile: downscaleByMode(kept, FLOOR_TILE, FLOOR_TILE),
    };
  });
}
