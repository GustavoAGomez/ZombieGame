/**
 * PixelLab Building kits: pieces lie on a transparent background without a
 * fixed grid, so each piece is found as a connected blob of opaque pixels.
 */
import type { Frame } from './sheet';

export interface Piece {
  /** Reading order: rows top to bottom, then left to right. */
  index: number;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Horizontal position inside its column (0 = flush left). */
  columnOffset: number;
}

/** Opaque blobs (8-connected) with their bounding boxes. */
function blobs(img: Frame): { minX: number; minY: number; maxX: number; maxY: number }[] {
  const { width, height, pixels } = img;
  const seen = new Uint8Array(width * height);
  const out: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || (pixels[start * 4 + 3] ?? 0) === 0) continue;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    stack.push(start);
    seen[start] = 1;
    while (stack.length > 0) {
      const p = stack.pop() ?? 0;
      const x = p % width;
      const y = (p - x) / width;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const q = ny * width + nx;
          if (seen[q] || (pixels[q * 4 + 3] ?? 0) === 0) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
    }
    out.push({ minX, minY, maxX, maxY });
  }
  return out;
}

/** Groups values that are within `tolerance` of the first value of their group. */
function cluster(values: number[], tolerance: number): number[] {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const starts: number[] = [];
  for (const v of sorted) if (starts.length === 0 || v - (starts[starts.length - 1] ?? 0) > tolerance) starts.push(v);
  return starts;
}

/**
 * Finds the pieces of a kit sheet. Tiny blobs (stray pixels) are ignored.
 * `tileSize` is the column width used to tell which column a piece is in.
 */
export function detectPieces(img: Frame, tileSize = 32, minPixels = 16): Piece[] {
  const found = blobs(img).filter((b) => (b.maxX - b.minX + 1) * (b.maxY - b.minY + 1) >= minPixels);
  // Rows: pieces whose vertical spans overlap belong to the same row (a short
  // piece can start lower than its neighbours, like the floor sample).
  const byTop = [...found].sort((p, q) => p.minY - q.minY);
  const rowSpans: { minY: number; maxY: number }[] = [];
  const rowIndex = new Map<(typeof found)[number], number>();
  for (const b of byTop) {
    let row = rowSpans.findIndex((r) => b.minY <= r.maxY && b.maxY >= r.minY);
    if (row < 0) {
      row = rowSpans.length;
      rowSpans.push({ minY: b.minY, maxY: b.maxY });
    } else {
      const span = rowSpans[row]!;
      span.minY = Math.min(span.minY, b.minY);
      span.maxY = Math.max(span.maxY, b.maxY);
    }
    rowIndex.set(b, row);
  }
  const rowOf = (b: (typeof found)[number]): number => rowIndex.get(b) ?? 0;
  const columnStarts = cluster(found.map((b) => b.minX), tileSize / 2);
  const columnStartOf = (x: number): number => {
    let c = columnStarts[0] ?? 0;
    for (const s of columnStarts) if (x >= s) c = s;
    return c;
  };
  return found
    .sort((p, q) => rowOf(p) - rowOf(q) || p.minX - q.minX)
    .map((b, index) => ({
      index,
      x: b.minX,
      y: b.minY,
      width: b.maxX - b.minX + 1,
      height: b.maxY - b.minY + 1,
      columnOffset: b.minX - columnStartOf(b.minX),
    }));
}
