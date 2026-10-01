import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectPieces } from './kit';
import { decodePng } from './png';

const kit = (group: string) => {
  const png = decodePng(readFileSync(resolve(import.meta.dirname, `../../art-src/pixellab/${group}/${group}.png`)));
  return { width: png.width, height: png.height, pixels: png.pixels };
};

/** Piece sizes of the shared template, in reading order (spec 02 §1.1). */
const SIZES = [
  '32x19', '32x25', '12x37', '12x25',
  '12x31', '22x25', '12x25', '32x25',
  '32x25', '12x25', '12x37', '32x28',
  '32x37', '32x28', '32x37', '32x19',
  '12x25', '12x37', '32x25', '32x25',
];

describe('detectPieces', () => {
  for (const group of ['kit_interior', 'kit_exterior', 'kit_basement', 'kit_fence']) {
    it(`finds the 20 template pieces of ${group} by bounding box, in reading order`, () => {
      const pieces = detectPieces(kit(group));
      expect(pieces.map((p) => `${p.width}x${p.height}`)).toEqual(SIZES);
    });
  }

  it('keeps each piece at its place inside the column (flush left or centred)', () => {
    const pieces = detectPieces(kit('kit_interior'));
    expect(pieces[2]?.columnOffset).toBe(0); // tall bar, flush left
    expect(pieces[4]?.columnOffset).toBe(10); // bar centred in its 32 px column
  });
});
