/**
 * Minimal PNG reader for the asset scripts (no dependencies). Supports
 * 8-bit greyscale, RGB, indexed, grey+alpha and RGBA, non-interlaced —
 * what Aseprite and PixelLab export.
 */
import { inflateSync } from 'node:zlib';

export interface PngInfo {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlaced: boolean;
  hasTransparency: boolean;
}

export interface DecodedPng extends PngInfo {
  /** RGBA, 4 bytes per pixel, row-major. */
  pixels: Uint8Array;
}

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

interface Chunk {
  type: string;
  data: Buffer;
}

function readChunks(buf: Buffer): Chunk[] {
  for (let i = 0; i < SIGNATURE.length; i++) {
    if (buf[i] !== SIGNATURE[i]) throw new Error('Not a PNG file');
  }
  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    chunks.push({ type, data: buf.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

export function readPngInfo(buf: Buffer): PngInfo {
  const chunks = readChunks(buf);
  const ihdr = chunks[0];
  if (!ihdr || ihdr.type !== 'IHDR') throw new Error('PNG without IHDR');
  const colorType = ihdr.data.readUInt8(9);
  return {
    width: ihdr.data.readUInt32BE(0),
    height: ihdr.data.readUInt32BE(4),
    bitDepth: ihdr.data.readUInt8(8),
    colorType,
    interlaced: ihdr.data.readUInt8(12) === 1,
    hasTransparency: colorType === 4 || colorType === 6 || chunks.some((c) => c.type === 'tRNS'),
  };
}

const CHANNELS: Record<number, number> = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export function decodePng(buf: Buffer): DecodedPng {
  const info = readPngInfo(buf);
  if (info.bitDepth !== 8) throw new Error(`Only 8-bit PNGs are supported (got ${info.bitDepth}-bit)`);
  if (info.interlaced) throw new Error('Interlaced PNGs are not supported');
  const channels = CHANNELS[info.colorType];
  if (!channels) throw new Error(`Unsupported PNG color type ${info.colorType}`);

  const chunks = readChunks(buf);
  const raw = inflateSync(Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const palette = chunks.find((c) => c.type === 'PLTE')?.data;
  const trns = chunks.find((c) => c.type === 'tRNS')?.data;

  const { width, height } = info;
  const stride = width * channels;
  const unfiltered = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0;
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = unfiltered.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? (out[x - channels] ?? 0) : 0;
      const b = prev[x] ?? 0;
      const c = x >= channels ? (prev[x - channels] ?? 0) : 0;
      const v = line[x] ?? 0;
      let r: number;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error(`Bad PNG filter ${filter}`);
      }
      out[x] = r & 0xff;
    }
    prev = out;
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    const v0 = unfiltered[s] ?? 0;
    switch (info.colorType) {
      case 0:
        pixels.set([v0, v0, v0, 255], d);
        break;
      case 2:
        pixels.set([v0, unfiltered[s + 1] ?? 0, unfiltered[s + 2] ?? 0, 255], d);
        break;
      case 3: {
        const p = v0 * 3;
        pixels.set([palette?.[p] ?? 0, palette?.[p + 1] ?? 0, palette?.[p + 2] ?? 0, trns?.[v0] ?? 255], d);
        break;
      }
      case 4:
        pixels.set([v0, v0, v0, unfiltered[s + 1] ?? 0], d);
        break;
      default:
        pixels.set([v0, unfiltered[s + 1] ?? 0, unfiltered[s + 2] ?? 0, unfiltered[s + 3] ?? 0], d);
    }
  }
  return { ...info, pixels };
}

/** Parses art-src/palette.hex (one hex colour per line, '#' optional). */
export function parsePaletteHex(text: string): Set<number> {
  const colors = new Set<number>();
  for (const line of text.split(/\r?\n/)) {
    const hex = line.trim().replace(/^#/, '');
    if (/^[0-9a-f]{6}$/i.test(hex)) colors.add(Number.parseInt(hex, 16));
  }
  return colors;
}

/** Distinct opaque colours that are not in the palette. */
export function colorsOutsidePalette(png: DecodedPng, palette: ReadonlySet<number>): number[] {
  const outside = new Set<number>();
  const { pixels } = png;
  for (let i = 0; i < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) === 0) continue;
    const rgb = ((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0);
    if (!palette.has(rgb)) outside.add(rgb);
  }
  return [...outside];
}
