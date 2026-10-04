/** Pure helpers to assemble and clean sprite sheets for the asset contract. */

export interface Frame {
  width: number;
  height: number;
  /** RGBA, 4 bytes per pixel. */
  pixels: Uint8Array;
}

/**
 * Builds a sheet with one row per direction and one column per frame.
 * A source canvas of another size (PixelLab sometimes renders a direction
 * at 56×56 instead of 48×48) is assumed to be padded evenly around the
 * character, so it is centred: 56×56 loses 4 px on each side. The anchor
 * therefore keeps its pixel position relative to the canvas centre.
 */
export function buildSheet(rows: Frame[][], frameWidth: number, frameHeight: number): Frame {
  const columns = Math.max(0, ...rows.map((r) => r.length));
  const width = frameWidth * columns;
  const height = frameHeight * rows.length;
  const pixels = new Uint8Array(width * height * 4);

  rows.forEach((row, r) => {
    row.forEach((src, c) => {
      const offX = Math.floor((frameWidth - src.width) / 2);
      const offY = Math.floor((frameHeight - src.height) / 2);
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

/** Opaque pixels that fall outside the frame when `src` is centred in it (would be cropped). */
export function croppedPixels(src: Frame, frameWidth: number, frameHeight: number): number {
  const offX = Math.floor((frameWidth - src.width) / 2);
  const offY = Math.floor((frameHeight - src.height) / 2);
  let lost = 0;
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      if ((src.pixels[(y * src.width + x) * 4 + 3] ?? 0) === 0) continue;
      const fx = x + offX;
      const fy = y + offY;
      if (fx < 0 || fy < 0 || fx >= frameWidth || fy >= frameHeight) lost++;
    }
  }
  return lost;
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

/** Copies a w×h rectangle of `img`. */
export function cut(img: Frame, x0: number, y0: number, w: number, h: number): Frame {
  const pixels = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = y0 + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < w; x++) {
      const sx = x0 + x;
      if (sx < 0 || sx >= img.width) continue;
      const s = (sy * img.width + sx) * 4;
      pixels.set(img.pixels.subarray(s, s + 4), (y * w + x) * 4);
    }
  }
  return { width: w, height: h, pixels };
}

/** Pastes `src` into `dst` at (x, y), copying only opaque pixels. */
export function paste(dst: Frame, src: Frame, x0: number, y0: number): void {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const dx = x0 + x;
      const dy = y0 + y;
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
      const s = (y * src.width + x) * 4;
      if ((src.pixels[s + 3] ?? 0) === 0) continue;
      dst.pixels.set(src.pixels.subarray(s, s + 4), (dy * dst.width + dx) * 4);
    }
  }
}

export function blank(width: number, height: number): Frame {
  return { width, height, pixels: new Uint8Array(width * height * 4) };
}

/**
 * Pixel-art downscale: each output pixel takes the most frequent colour of
 * the source block it covers, so no new colours appear.
 */
export function downscaleByMode(src: Frame, width: number, height: number): Frame {
  const out = blank(width, height);
  const fx = src.width / width;
  const fy = src.height / height;
  const counts = new Map<number, number>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      counts.clear();
      for (let sy = Math.floor(y * fy); sy < Math.ceil((y + 1) * fy); sy++) {
        for (let sx = Math.floor(x * fx); sx < Math.ceil((x + 1) * fx); sx++) {
          const i = (sy * src.width + sx) * 4;
          const key = (src.pixels[i + 3] ?? 0) === 0 ? -1 : ((src.pixels[i] ?? 0) << 16) | ((src.pixels[i + 1] ?? 0) << 8) | (src.pixels[i + 2] ?? 0);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      let best = -1;
      let bestCount = -1;
      for (const [key, count] of counts) {
        // Prefer opaque colours on ties so edges do not erode.
        if (count > bestCount || (count === bestCount && best === -1)) {
          best = key;
          bestCount = count;
        }
      }
      if (best >= 0) out.pixels.set([(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff, 255], (y * width + x) * 4);
    }
  }
  return out;
}

/** Fills transparent pixels with the nearest opaque one in the same row, then column. Returns how many were filled. */
export function fillTransparent(frame: Frame): number {
  const { width, height, pixels } = frame;
  let filled = 0;
  const copyFrom = (to: number, from: number): void => {
    pixels.set(pixels.subarray(from * 4, from * 4 + 3), to * 4);
    pixels[to * 4 + 3] = 255;
    filled++;
  };
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if ((pixels[i * 4 + 3] ?? 0) !== 0) continue;
        let source = -1;
        for (let d = 1; d < Math.max(width, height) && source < 0; d++) {
          const candidates = pass === 0 ? [[x - d, y], [x + d, y]] : [[x, y - d], [x, y + d]];
          for (const [cx, cy] of candidates) {
            if (cx === undefined || cy === undefined || cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
            const j = cy * width + cx;
            if ((pixels[j * 4 + 3] ?? 0) !== 0) {
              source = j;
              break;
            }
          }
        }
        if (source >= 0) copyFrom(i, source);
      }
    }
  }
  return filled;
}

/** `src` mirrored left to right. */
export function flipHorizontal(src: Frame): Frame {
  const out = blank(src.width, src.height);
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const s = (y * src.width + x) * 4;
      out.pixels.set(src.pixels.subarray(s, s + 4), (y * src.width + (src.width - 1 - x)) * 4);
    }
  }
  return out;
}

/** `src` centred on a `width`×`height` canvas, as buildSheet places each frame. */
export function centerIn(src: Frame, width: number, height: number): Frame {
  const out = blank(width, height);
  const offX = Math.floor((width - src.width) / 2);
  const offY = Math.floor((height - src.height) / 2);
  for (let y = 0; y < src.height; y++) {
    const fy = y + offY;
    if (fy < 0 || fy >= height) continue;
    for (let x = 0; x < src.width; x++) {
      const fx = x + offX;
      if (fx < 0 || fx >= width) continue;
      const s = (y * src.width + x) * 4;
      out.pixels.set(src.pixels.subarray(s, s + 4), (fy * width + fx) * 4);
    }
  }
  return out;
}

/**
 * Pixel art scaled by `factor` around the point (cx, cy), on a canvas of the
 * same size. Each output pixel takes the most common colour of a 3×3 grid of
 * samples over the area it covers in the source; on a tie an opaque colour
 * beats transparency and a darker one beats a lighter one, so the 1 px
 * outline survives a reduction instead of breaking up.
 */
export function scaleAbout(src: Frame, factor: number, cx: number, cy: number): Frame {
  const out = blank(src.width, src.height);
  const counts = new Map<number, number>();
  const luma = (key: number): number => ((key >> 16) & 0xff) * 3 + ((key >> 8) & 0xff) * 6 + (key & 0xff);
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      counts.clear();
      for (let j = 0; j < 3; j++) {
        for (let i = 0; i < 3; i++) {
          const sx = Math.floor(cx + (x + (i + 0.5) / 3 - cx) / factor);
          const sy = Math.floor(cy + (y + (j + 0.5) / 3 - cy) / factor);
          let key = -1;
          if (sx >= 0 && sy >= 0 && sx < src.width && sy < src.height) {
            const s = (sy * src.width + sx) * 4;
            if ((src.pixels[s + 3] ?? 0) > 0) key = ((src.pixels[s] ?? 0) << 16) | ((src.pixels[s + 1] ?? 0) << 8) | (src.pixels[s + 2] ?? 0);
          }
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      let best = -1;
      let bestCount = -1;
      for (const [key, count] of counts) {
        const wins =
          count > bestCount || (count === bestCount && (best === -1 || (key !== -1 && luma(key) < luma(best))));
        if (wins) {
          best = key;
          bestCount = count;
        }
      }
      if (best >= 0) out.pixels.set([(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff, 255], (y * out.width + x) * 4);
    }
  }
  return out;
}
