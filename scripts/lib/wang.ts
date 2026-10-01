/**
 * Corner Wang tilesets (PixelLab "Wang" export): measures which terrain sits
 * at each corner of every tile, so nothing about the layout is assumed.
 */
import type { Frame } from './sheet';

/** Corner terrains in the order NW, NE, SW, SE; 0 or 1. */
export type Corners = [number, number, number, number];

export interface WangTile {
  id: number;
  col: number;
  row: number;
  corners: Corners;
}

export interface WangMeasurement {
  tiles: WangTile[];
  /** Average colour of terrain 0 and terrain 1, as '#rrggbb'. */
  colors: [string, string];
  /** Corner codes ("NWNESWSE") missing from the sheet; empty when complete. */
  missing: string[];
}

type RGB = [number, number, number];

function meanColor(img: Frame, x0: number, y0: number, w: number, h: number): RGB {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * img.width + x) * 4;
      r += img.pixels[i] ?? 0;
      g += img.pixels[i + 1] ?? 0;
      b += img.pixels[i + 2] ?? 0;
    }
  }
  const n = w * h;
  return [r / n, g / n, b / n];
}

const dist2 = (p: RGB, q: RGB): number => (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2;
const hex = (c: RGB): string => `#${c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

function isEmptyCell(img: Frame, x0: number, y0: number, size: number): boolean {
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) if ((img.pixels[(y * img.width + x) * 4 + 3] ?? 0) > 0) return false;
  }
  return true;
}

/**
 * Classifies the 4 corner patches of every non-empty tile into two
 * terrains (2-means seeded with the given reference tiles, by default
 * the plain tiles at (0,3) and (1,3) of PixelLab's layout).
 */
export function measureWangSheet(
  img: Frame,
  tileSize = 32,
  seeds: { terrain0: [number, number]; terrain1: [number, number] } = { terrain0: [0, 3], terrain1: [1, 3] },
): WangMeasurement {
  const cols = Math.floor(img.width / tileSize);
  const rows = Math.floor(img.height / tileSize);
  const patch = Math.max(3, Math.floor(tileSize / 6));
  const inset = 1;
  const samples: { tile: WangTile; colors: RGB[] }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * tileSize;
      const y0 = row * tileSize;
      if (isEmptyCell(img, x0, y0, tileSize)) continue;
      const far = tileSize - inset - patch;
      samples.push({
        tile: { id: row * cols + col, col, row, corners: [0, 0, 0, 0] },
        colors: [
          meanColor(img, x0 + inset, y0 + inset, patch, patch),
          meanColor(img, x0 + far, y0 + inset, patch, patch),
          meanColor(img, x0 + inset, y0 + far, patch, patch),
          meanColor(img, x0 + far, y0 + far, patch, patch),
        ],
      });
    }
  }
  const ref = (c: number, r: number): RGB => meanColor(img, c * tileSize + 2, r * tileSize + 2, tileSize - 4, tileSize - 4);
  let a = ref(...seeds.terrain0);
  let b = ref(...seeds.terrain1);
  for (let iteration = 0; iteration < 4; iteration++) {
    const sums: [RGB, RGB] = [[0, 0, 0], [0, 0, 0]];
    const counts = [0, 0];
    for (const s of samples) {
      s.colors.forEach((c, k) => {
        const t = dist2(c, a) <= dist2(c, b) ? 0 : 1;
        s.tile.corners[k] = t;
        sums[t][0] += c[0];
        sums[t][1] += c[1];
        sums[t][2] += c[2];
        counts[t]!++;
      });
    }
    if (counts[0]) a = [sums[0][0] / counts[0], sums[0][1] / counts[0], sums[0][2] / counts[0]];
    if (counts[1]) b = [sums[1][0] / counts[1], sums[1][1] / counts[1], sums[1][2] / counts[1]];
  }
  const seen = new Set(samples.map((s) => s.tile.corners.join('')));
  const missing = Array.from({ length: 16 }, (_, i) => i.toString(2).padStart(4, '0')).filter((code) => !seen.has(code));
  return { tiles: samples.map((s) => s.tile), colors: [hex(a), hex(b)], missing };
}

/**
 * Tiled corner wangid: [top, top-right, right, bottom-right, bottom,
 * bottom-left, left, top-left]; corners use the odd slots, colour 0 means
 * unset, so terrain t becomes colour t + 1.
 */
export function cornerWangId([nw, ne, sw, se]: Corners): number[] {
  return [0, ne + 1, 0, se + 1, 0, sw + 1, 0, nw + 1];
}

/** How many corners of a tile are of `terrain`. */
export function cornersOf(corners: Corners, terrain: number): number {
  return corners.filter((c) => c === terrain).length;
}
