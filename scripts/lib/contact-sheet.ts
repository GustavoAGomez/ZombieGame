/**
 * Contact sheets for reviewing art: frames laid out in a grid on a
 * checkerboard, each with a caption in a tiny 3×5 pixel font. Used by
 * `tiles:import` to leave sheets in maps/preview/tiles/ that a person (or
 * Claude) opens and checks by eye.
 */
import { blank, type Frame } from './sheet';

/** 3×5 glyphs, one string of 15 bits per character (rows top to bottom). */
const GLYPHS: Record<string, string> = {
  '0': '111101101101111',
  '1': '010110010010111',
  '2': '111001111100111',
  '3': '111001111001111',
  '4': '101101111001001',
  '5': '111100111001111',
  '6': '111100111101111',
  '7': '111001001001001',
  '8': '111101111101111',
  '9': '111101111001111',
  A: '010101111101101',
  B: '110101110101110',
  C: '011100100100011',
  D: '110101101101110',
  E: '111100110100111',
  F: '111100110100100',
  G: '011100101101011',
  H: '101101111101101',
  I: '111010010010111',
  J: '001001001101010',
  K: '101101110101101',
  L: '100100100100111',
  M: '101111111101101',
  N: '110101101101101',
  O: '010101101101010',
  P: '110101110100100',
  Q: '010101101110011',
  R: '110101110101101',
  S: '011100010001110',
  T: '111010010010010',
  U: '101101101101111',
  V: '101101101101010',
  W: '101101111111101',
  X: '101101010101101',
  Y: '101101010010010',
  Z: '111001010100111',
  '.': '000000000000010',
  ',': '000000000010100',
  ':': '000010000010000',
  '-': '000000111000000',
  '+': '000010111010000',
  '=': '000111000111000',
  '/': '001001010100100',
  '(': '010100100100010',
  ')': '010001001001010',
  '#': '101111101111101',
  '?': '111001010000010',
  '_': '000000000000111',
  '>': '100010001010100',
  '<': '001010100010001',
  ' ': '000000000000000',
};

export type Rgb = readonly [number, number, number];

export function fillRect(f: Frame, x0: number, y0: number, w: number, h: number, rgb: Rgb, alpha = 255): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  w = Math.round(w);
  h = Math.round(h);
  for (let y = Math.max(0, y0); y < Math.min(f.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(f.width, x0 + w); x++) f.pixels.set([rgb[0], rgb[1], rgb[2], alpha], (y * f.width + x) * 4);
  }
}

/** Width in px of a caption at `scale`. */
export function textWidth(text: string, scale = 1): number {
  return text.length * 4 * scale - scale;
}

/** Draws `text` (upper-cased; unknown characters show as "?") with its top-left at x, y. */
export function drawText(f: Frame, text: string, x: number, y: number, rgb: Rgb, scale = 1): void {
  x = Math.round(x);
  y = Math.round(y);
  [...text.toUpperCase()].forEach((ch, i) => {
    const glyph = GLYPHS[ch] ?? GLYPHS['?'] ?? '';
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 3; col++) {
        if (glyph[row * 3 + col] === '1') fillRect(f, x + (i * 4 + col) * scale, y + row * scale, scale, scale, rgb);
      }
    }
  });
}

/** Copies `src` scaled by an integer factor, blending its alpha over what is already there. */
export function blitScaled(dst: Frame, src: Frame, x0: number, y0: number, scale: number): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  for (let y = 0; y < src.height * scale; y++) {
    for (let x = 0; x < src.width * scale; x++) {
      const dx = x0 + x;
      const dy = y0 + y;
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
      const s = (Math.floor(y / scale) * src.width + Math.floor(x / scale)) * 4;
      const a = (src.pixels[s + 3] ?? 0) / 255;
      if (a === 0) continue;
      const d = (dy * dst.width + dx) * 4;
      for (let c = 0; c < 3; c++) dst.pixels[d + c] = Math.round((src.pixels[s + c] ?? 0) * a + (dst.pixels[d + c] ?? 0) * (1 - a));
      dst.pixels[d + 3] = 255;
    }
  }
}

function checkerboard(f: Frame, x0: number, y0: number, w: number, h: number, cell: number): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const light = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      const v = light ? 72 : 58;
      fillRect(f, x0 + x, y0 + y, 1, 1, [v, v, v + 6]);
    }
  }
}

export interface SheetEntry {
  frame: Frame;
  /** Up to three caption lines under the frame. */
  caption: string[];
  /** Optional grid (px of the source frame) drawn over it, e.g. 32 for tiles. */
  grid?: number;
}

/**
 * Lays the entries out in `columns` columns. Every cell is as big as the
 * largest frame (scaled) plus room for the captions.
 */
export function contactSheet(entries: readonly SheetEntry[], options: { columns: number; scale: number; title?: string }): Frame {
  const { columns, scale } = options;
  const textScale = 2;
  const lineHeight = 7 * textScale;
  const maxW = Math.max(1, ...entries.map((e) => e.frame.width)) * scale;
  const maxH = Math.max(1, ...entries.map((e) => e.frame.height)) * scale;
  const captionLines = Math.max(1, ...entries.map((e) => e.caption.length));
  const captionW = Math.max(0, ...entries.flatMap((e) => e.caption.map((c) => textWidth(c, textScale))));
  const cellW = Math.max(maxW, captionW) + 16;
  const cellH = maxH + captionLines * lineHeight + 20;
  const titleH = options.title ? 7 * 3 + 12 : 0;
  const rows = Math.ceil(entries.length / columns);
  const out = blank(columns * cellW, titleH + rows * cellH);
  fillRect(out, 0, 0, out.width, out.height, [24, 22, 26]);
  if (options.title) drawText(out, options.title, 8, 8, [240, 200, 120], 3);
  entries.forEach((e, i) => {
    const cx = (i % columns) * cellW + 8;
    const cy = titleH + Math.floor(i / columns) * cellH + 8;
    const w = e.frame.width * scale;
    const h = e.frame.height * scale;
    checkerboard(out, cx, cy, w, h, 4 * scale);
    blitScaled(out, e.frame, cx, cy, scale);
    if (e.grid) {
      for (let gx = e.grid; gx < e.frame.width; gx += e.grid) fillRect(out, cx + gx * scale, cy, 1, h, [255, 80, 200], 160);
      for (let gy = e.grid; gy < e.frame.height; gy += e.grid) fillRect(out, cx, cy + gy * scale, w, 1, [255, 80, 200], 160);
    }
    e.caption.forEach((line, l) => drawText(out, line, cx, cy + h + 4 + l * lineHeight, l === 0 ? [255, 255, 255] : [170, 200, 230], textScale));
  });
  return out;
}
