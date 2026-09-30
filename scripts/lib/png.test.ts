import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { colorsOutsidePalette, decodePng, parsePaletteHex, readPngInfo } from './png';

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  // CRC is not verified by the reader.
  return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

/** Builds an RGBA PNG; each row uses filter `filter` (0 none, 1 sub). */
function makePng(width: number, height: number, rgba: number[], filter = 0): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  const rows: number[] = [];
  for (let y = 0; y < height; y++) {
    rows.push(filter);
    for (let x = 0; x < width * 4; x++) {
      const v = rgba[y * width * 4 + x] ?? 0;
      const left = x >= 4 ? (rgba[y * width * 4 + x - 4] ?? 0) : 0;
      rows.push(filter === 1 ? (v - left) & 0xff : v);
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.from(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const PIXELS = [0, 0, 0, 0, 255, 0, 0, 255, 0, 255, 0, 255, 18, 52, 86, 255];

describe('png reader', () => {
  it('reads the header', () => {
    const info = readPngInfo(makePng(2, 2, PIXELS));
    expect(info).toMatchObject({ width: 2, height: 2, bitDepth: 8, colorType: 6, hasTransparency: true });
  });

  it('decodes RGBA pixels with and without filters', () => {
    for (const filter of [0, 1]) {
      const png = decodePng(makePng(2, 2, PIXELS, filter));
      expect(Array.from(png.pixels)).toEqual(PIXELS);
    }
  });

  it('finds colours outside the palette, ignoring transparent pixels', () => {
    const png = decodePng(makePng(2, 2, PIXELS));
    const palette = parsePaletteHex('#ff0000\n00ff00\n\nnot-a-colour\n');
    expect(colorsOutsidePalette(png, palette)).toEqual([0x123456]);
  });

  it('rejects non-PNG data', () => {
    expect(() => readPngInfo(Buffer.from('hello world'))).toThrow(/Not a PNG/);
  });
});
