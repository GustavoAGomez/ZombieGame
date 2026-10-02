import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from './png';
import { binarizeAlpha, buildSheet, centerIn, croppedPixels, opaqueBounds, quantize, scaleAbout, type Frame } from './sheet';

function solid(width: number, height: number, rgba: [number, number, number, number]): Frame {
  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) pixels.set(rgba, i * 4);
  return { width, height, pixels };
}

function dot(width: number, height: number, x: number, y: number): Frame {
  const f = solid(width, height, [0, 0, 0, 0]);
  f.pixels.set([255, 0, 0, 255], (y * width + x) * 4);
  return f;
}

describe('buildSheet', () => {
  it('lays out rows per direction and columns per frame', () => {
    const sheet = buildSheet([[dot(4, 4, 0, 0), dot(4, 4, 1, 1)], [dot(4, 4, 2, 2), dot(4, 4, 3, 3)]], 4, 4);
    expect([sheet.width, sheet.height]).toEqual([8, 8]);
    const alphaAt = (x: number, y: number) => sheet.pixels[(y * 8 + x) * 4 + 3];
    expect(alphaAt(0, 0)).toBe(255);
    expect(alphaAt(5, 1)).toBe(255);
    expect(alphaAt(2, 6)).toBe(255);
    expect(alphaAt(7, 7)).toBe(255);
  });

  it('centres canvases of another size (evenly padded exports)', () => {
    // A 56×56 PixelLab frame is the 48×48 one with 4 px of padding on each side.
    const big = dot(56, 56, 28, 49);
    const sheet = buildSheet([[big]], 48, 48);
    expect(opaqueBounds(sheet)).toEqual({ minX: 24, minY: 45, maxX: 24, maxY: 45 });
    // Smaller canvases are padded evenly as well.
    const small = dot(40, 40, 20, 34);
    expect(opaqueBounds(buildSheet([[small]], 48, 48))).toEqual({ minX: 24, minY: 38, maxX: 24, maxY: 38 });
  });

  it('counts character pixels that centring would crop', () => {
    expect(croppedPixels(dot(56, 56, 28, 28), 48, 48)).toBe(0);
    expect(croppedPixels(dot(56, 56, 1, 28), 48, 48)).toBe(1);
  });
});

describe('binarizeAlpha and quantize', () => {
  it('forces alpha to 0 or 255 and clears transparent colour', () => {
    const f = solid(2, 1, [10, 20, 30, 100]);
    f.pixels[7] = 200;
    expect(binarizeAlpha(f)).toBe(2);
    expect(Array.from(f.pixels)).toEqual([0, 0, 0, 0, 10, 20, 30, 255]);
  });

  it('snaps colours to the nearest palette entry', () => {
    const f = solid(1, 1, [250, 10, 5, 255]);
    expect(quantize(f, [0xff0000, 0x00ff00])).toBe(1);
    expect(Array.from(f.pixels)).toEqual([255, 0, 0, 255]);
  });
});

describe('encodePng', () => {
  it('round-trips through the decoder', () => {
    const f = solid(3, 2, [1, 2, 3, 255]);
    f.pixels.set([0, 0, 0, 0], 4);
    const png = decodePng(encodePng(f.width, f.height, f.pixels));
    expect([png.width, png.height, png.colorType]).toEqual([3, 2, 6]);
    expect(Array.from(png.pixels)).toEqual(Array.from(f.pixels));
  });
});

describe('centerIn and scaleAbout', () => {
  /** A w×h frame with an opaque rectangle (x0, y0, rw, rh): grey fill and a 1 px black outline. */
  function boxFrame(w: number, h: number, x0: number, y0: number, rw: number, rh: number): Frame {
    const pixels = new Uint8Array(w * h * 4);
    for (let y = y0; y < y0 + rh; y++) {
      for (let x = x0; x < x0 + rw; x++) {
        const edge = x === x0 || y === y0 || x === x0 + rw - 1 || y === y0 + rh - 1;
        pixels.set(edge ? [0, 0, 0, 255] : [150, 150, 150, 255], (y * w + x) * 4);
      }
    }
    return { width: w, height: h, pixels };
  }

  it('centres a smaller frame on the canvas like buildSheet', () => {
    const out = centerIn(boxFrame(4, 4, 0, 0, 4, 4), 8, 8);
    expect(opaqueBounds(out)).toEqual({ minX: 2, minY: 2, maxX: 5, maxY: 5 });
  });

  it('shrinks around the pivot, keeping where it stands and its outline', () => {
    // 30×30 box standing on y = 40 (its feet), centred on x = 30.
    const src = boxFrame(60, 60, 15, 10, 30, 30);
    const out = scaleAbout(src, 2 / 3, 30, 40);
    const b = opaqueBounds(out);
    expect(b).not.toBeNull();
    if (!b) return;
    expect(b.maxX - b.minX + 1).toBe(20);
    expect(b.maxY - b.minY + 1).toBe(20);
    // Still standing on the pivot line, centred on it.
    expect(b.maxY).toBe(39);
    expect((b.minX + b.maxX + 1) / 2).toBe(30);
    // The outline survives all round.
    const at = (x: number, y: number): number => out.pixels[(y * out.width + x) * 4] ?? -1;
    expect(at(b.minX, 30)).toBe(0);
    expect(at(b.maxX, 30)).toBe(0);
    expect(at(30, b.minY)).toBe(0);
    expect(at(30, b.maxY)).toBe(0);
    expect(at(30, 30)).toBe(150);
  });
});
