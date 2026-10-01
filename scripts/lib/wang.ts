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
  /** Average colour of the plain tiles of terrain 0 and of terrain 1, as '#rrggbb'. */
  colors: [string, string];
  /** Ids of the plain tiles (four equal corners) of terrain 0 and of terrain 1. */
  plain: [number[], number[]];
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
const average = (colors: RGB[]): RGB => {
  const n = Math.max(1, colors.length);
  return [colors.reduce((s, c) => s + c[0], 0) / n, colors.reduce((s, c) => s + c[1], 0) / n, colors.reduce((s, c) => s + c[2], 0) / n];
};

function isEmptyCell(img: Frame, x0: number, y0: number, size: number): boolean {
  for (let y = y0; y < y0 + size; y++) {
    for (let x = x0; x < x0 + size; x++) if ((img.pixels[(y * img.width + x) * 4 + 3] ?? 0) > 0) return false;
  }
  return true;
}

/**
 * Finds the terrain at the 4 corners of every non-empty tile without
 * assuming any order of the tiles:
 *   1. the two plain terrains are the two tiles whose average colours are
 *      farthest apart (a transition tile is a mix of both, so it lies
 *      between them);
 *   2. a small patch is sampled at each corner of every tile and compared
 *      with those two colours;
 *   3. the comparison is refined by 2-means over all the corner patches,
 *      starting from the plain colours: transition details that reach the
 *      corner (the dirt along the street's kerb) join the terrain they
 *      belong to instead of whichever plain colour happens to be nearer.
 * Which terrain is "0" is arbitrary here: orderTerrains names them.
 */
export function measureWangSheet(img: Frame, tileSize = 32): WangMeasurement {
  const cols = Math.floor(img.width / tileSize);
  const rows = Math.floor(img.height / tileSize);
  const patch = Math.max(3, Math.floor(tileSize / 6));
  const inset = 1;
  const far = tileSize - inset - patch;
  const samples: { tile: WangTile; colors: RGB[] }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const x0 = col * tileSize;
      const y0 = row * tileSize;
      if (isEmptyCell(img, x0, y0, tileSize)) continue;
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
  const tileColor = (tile: WangTile): RGB => meanColor(img, tile.col * tileSize + 2, tile.row * tileSize + 2, tileSize - 4, tileSize - 4);
  const tileColors = samples.map((s) => tileColor(s.tile));
  let a: RGB = tileColors[0] ?? [0, 0, 0];
  let b: RGB = a;
  for (const p of tileColors) for (const q of tileColors) if (dist2(p, q) > dist2(a, b)) [a, b] = [p, q];
  const classify = (): void => {
    for (const s of samples) s.colors.forEach((c, k) => (s.tile.corners[k] = dist2(c, a) <= dist2(c, b) ? 0 : 1));
  };
  for (let iteration = 0; iteration < 6; iteration++) {
    classify();
    const groups: [RGB[], RGB[]] = [[], []];
    for (const s of samples) s.colors.forEach((c, k) => groups[s.tile.corners[k] as 0 | 1].push(c));
    if (groups[0].length) a = average(groups[0]);
    if (groups[1].length) b = average(groups[1]);
  }
  classify();
  const plainOf = (t: number): WangTile[] => samples.map((s) => s.tile).filter((tile) => tile.corners.every((c) => c === t));
  const plainColor = (t: number): RGB => average(plainOf(t).map(tileColor));
  const seen = new Set(samples.map((s) => s.tile.corners.join('')));
  const missing = Array.from({ length: 16 }, (_, i) => i.toString(2).padStart(4, '0')).filter((code) => !seen.has(code));
  return {
    tiles: samples.map((s) => s.tile),
    colors: [hex(plainColor(0)), hex(plainColor(1))],
    plain: [plainOf(0).map((t) => t.id), plainOf(1).map((t) => t.id)],
    missing,
  };
}

/** How a terrain is told from the other by its plain colour. */
export type TerrainRule = 'darker' | 'lessSaturated';

const rgbOf = (color: string): RGB => [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16)) as RGB;
const luma = ([r, g, b]: RGB): number => 0.3 * r + 0.59 * g + 0.11 * b;
const saturation = (c: RGB): number => Math.max(...c) - Math.min(...c);

/**
 * Renumbers the terrains so that terrain 0 is the one the rule picks
 * (the darker: asphalt, water; the less saturated: the grey patio).
 */
export function orderTerrains(m: WangMeasurement, first: TerrainRule): WangMeasurement {
  const [c0, c1] = m.colors.map(rgbOf) as [RGB, RGB];
  const firstIsZero = first === 'darker' ? luma(c0) <= luma(c1) : saturation(c0) <= saturation(c1);
  if (firstIsZero) return m;
  return {
    tiles: m.tiles.map((t) => ({ ...t, corners: t.corners.map((c) => 1 - c) as Corners })),
    colors: [m.colors[1], m.colors[0]],
    plain: [m.plain[1], m.plain[0]],
    missing: m.missing.map((code) => [...code].map((c) => (c === '0' ? '1' : '0')).join('')),
  };
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
