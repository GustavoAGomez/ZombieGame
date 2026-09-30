/** Pure helpers to assemble and clean sprite sheets for the asset contract. */

export interface Frame {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  pixels: Uint8Array;
}

export interface Anchor {
  x: number;
  y: number;
}

/**
 * Builds a sheet with one row per direction and one column per frame.
 * Each source frame is placed so that its anchor lands on the frame's
 * anchor (sources larger than the frame are cropped, smaller ones padded).
 */
export function buildSheet(rows: Frame[][], frameWidth: number, frameHeight: number, anchor: Anchor): Frame {
  const columns = Math.max(0, ...rows.map((r) => r.length));
  const width = frameWidth * columns;
  const height = frameHeight * rows.length;
  const pixels = new Uint8Array(width * height * 4);
  const destAx = Math.round(frameWidth * anchor.x);
  const destAy = Math.round(frameHeight * anchor.y);

  rows.forEach((row, r) => {
    row.forEach((src, c) => {
      const offX = destAx - Math.round(src.width * anchor.x);
      const offY = destAy - Math.round(src.height * anchor.y);
      for (let y = 0; y < src.height; y++) {
        const fy = y + offY;
        if (fy < 0 || fy >= frameHeight) continue;
        for (let x = 0; x < src.width; x++) {
          const fx = x + offX;
          if (fx < 0 || fx >= frameWidth) continue;
          const s = (y * src.width + x) * 4;
          const d = ((r * frameHeight + fy) * width + c * frameWidth + fx) * 4;
          pixels[d] = src.pixels[s] ?? 0;
          pixels[d + 1] = src.pixels[s + 1] ?? 0;
          pixels[d + 2] = src.pixels[s + 2] ?? 0;
          pixels[d + 3] = src.pixels[s + 3] ?? 0;
        }
      }
    });
  });
  return { width, height, pixels };
}

/** Pixel art has no partial transparency: alpha becomes 0 or 255. Returns how many pixels changed. */
export function binarizeAlpha(frame: Frame, threshold = 128): number {
  let changed = 0;
  const { pixels } = frame;
  for (let i = 3; i < pixels.length; i += 4) {
    const a = pixels[i] ?? 0;
    const b = a >= threshold ? 255 : 0;
    if (a !== b) changed++;
    pixels[i] = b;
    if (b === 0) {
      pixels[i - 3] = 0;
      pixels[i - 2] = 0;
      pixels[i - 1] = 0;
    }
  }
  return changed;
}

/**
 * Snaps every opaque pixel to the nearest palette colour (RGB distance).
 * Returns the number of distinct source colours that were not in the palette.
 */
export function quantize(frame: Frame, palette: readonly number[]): number {
  const cache = new Map<number, number>();
  const outside = new Set<number>();
  const set = new Set(palette);
  const { pixels } = frame;
  for (let i = 0; i < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) === 0) continue;
    const rgb = ((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0);
    let target = cache.get(rgb);
    if (target === undefined) {
      if (!set.has(rgb)) outside.add(rgb);
      target = nearest(rgb, palette);
      cache.set(rgb, target);
    }
    pixels[i] = (target >> 16) & 0xff;
    pixels[i + 1] = (target >> 8) & 0xff;
    pixels[i + 2] = target & 0xff;
  }
  return outside.size;
}

function nearest(rgb: number, palette: readonly number[]): number {
  let best = palette[0] ?? rgb;
  let bestDist = Infinity;
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  for (const p of palette) {
    const dr = ((p >> 16) & 0xff) - r;
    const dg = ((p >> 8) & 0xff) - g;
    const db = (p & 0xff) - b;
    const d = dr * dr * 2 + dg * dg * 4 + db * db * 3; // rough perceptual weights
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

/** Bounding box of opaque pixels, or null for an empty frame. */
export function opaqueBounds(frame: Frame): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if ((frame.pixels[(y * frame.width + x) * 4 + 3] ?? 0) === 0) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  return maxX < 0 ? null : { minX, minY, maxX, maxY };
}
