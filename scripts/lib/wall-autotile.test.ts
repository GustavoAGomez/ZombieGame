import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from './png';
import type { Frame } from './sheet';
import { ARM_BASE, E, FACE_BASE, FACE_SOLID, KIT_TEMPLATE, N, S, SOLID_BASE, SOLID_NORTH_OPEN, SOLID_SOUTH_OPEN, W, hasFace, kitPieces, maskLabel, solidCells, wallAutotile, wallMask, wallParts } from './wall-autotile';

const kit = (name: string): Frame => {
  const png = decodePng(readFileSync(resolve(import.meta.dirname, `../../art-src/pixellab/${name}/${name}.png`)));
  return { width: png.width, height: png.height, pixels: png.pixels };
};
const opaque = (f: Frame, x: number, y: number) => (f.pixels[(y * f.width + x) * 4 + 3] ?? 0) > 0;
/** Which of the given columns are opaque on row y, as a string of # and . */
const row = (f: Frame, y: number, xs: number[]) => xs.map((x) => (opaque(f, x, y) ? '#' : '.')).join('');

describe('kit pieces', () => {
  for (const name of ['kit_interior', 'kit_exterior', 'kit_basement', 'kit_fence']) {
    it(`finds the 20 pieces of the template in ${name}, by connected components`, () => {
      const pieces = kitPieces(kit(name), name);
      expect(pieces.map((p) => `${p.piece.width}x${p.piece.height}`)).toEqual(KIT_TEMPLATE.map((t) => `${t.width}x${t.height}`));
    });
  }
});

describe('wall autotile', () => {
  const tiles = wallAutotile(wallParts(kitPieces(kit('kit_basement'), 'kit_basement')));
  // Sample columns: west of the strip, the strip, east of it.
  const xs = [4, 15, 27];

  it('has 16 thin cases, 4 solid ones, 15 arm overlays and 17 face overlays, all of 32×32', () => {
    expect(tiles).toHaveLength(52);
    for (const t of tiles) expect([t.width, t.height]).toEqual([32, 32]);
  });

  it('draws a horizontal run as band + front face, with the floor north of it showing', () => {
    const t = tiles[E | W]!;
    expect(row(t, 3, xs)).toBe('...');
    expect(row(t, 10, xs)).toBe('###');
    expect(row(t, 30, xs)).toBe('###');
  });

  it('draws a vertical run as a strip of top edge only', () => {
    const t = tiles[N | S]!;
    for (const y of [0, 10, 20, 31]) expect(row(t, y, xs)).toBe('.#.');
  });

  it('closes the north end with a cap and shows the face only at the south end', () => {
    expect(row(tiles[S]!, 3, xs)).toBe('...');
    expect(row(tiles[S]!, 9, xs)).toBe('.#.');
    expect(row(tiles[N]!, 0, xs)).toBe('.#.');
    expect(row(tiles[N]!, 30, xs)).toBe('.#.');
  });

  it('shows the face under the horizontal arms and keeps the strip going south at corners and T junctions', () => {
    // North-west corner of a room (walls east and south): no face under the strip, face east of it.
    expect(row(tiles[E | S]!, 10, xs)).toBe('.##');
    expect(row(tiles[E | S]!, 25, xs)).toBe('.##');
    expect(row(tiles[E | S]!, 3, xs)).toBe('...');
    // T junction pointing south and the cross: band across, faces on both sides of the strip.
    for (const mask of [E | S | W, N | E | S | W]) expect(row(tiles[mask]!, 25, xs)).toBe('###');
    expect(row(tiles[N | E | S | W]!, 3, xs)).toBe('.#.');
  });

  it('is a pillar with nothing around', () => {
    expect(row(tiles[0]!, 3, xs)).toBe('...');
    expect(row(tiles[0]!, 20, xs)).toBe('.#.');
  });

  it('fills a thick wall: wide top edge, face only where the south is open', () => {
    const closed = tiles[SOLID_BASE]!;
    for (const y of [0, 15, 31]) expect(row(closed, y, xs)).toBe('###');
    const front = tiles[SOLID_BASE + SOLID_NORTH_OPEN + SOLID_SOUTH_OPEN]!;
    expect(row(front, 3, xs)).toBe('...');
    expect(row(front, 25, xs)).toBe('###');
  });

  it('has face overlays with only the face: under the band, without the strip that goes on south', () => {
    // T junction pointing south: faces west and east of the strip, nothing above the band or on the strip.
    const t = tiles[FACE_BASE + (E | S | W)]!;
    expect(row(t, 10, xs)).toBe('...');
    expect(row(t, 25, xs)).toBe('#.#');
    expect(row(tiles[FACE_BASE + (E | W)]!, 25, xs)).toBe('###');
    expect(row(tiles[FACE_SOLID]!, 25, xs)).toBe('###');
    expect(row(tiles[FACE_SOLID]!, 10, xs)).toBe('...');
    expect(hasFace(N | S)).toBe(false);
    expect(hasFace(N)).toBe(true);
  });

  it('has arm overlays with only those arms', () => {
    const north = tiles[ARM_BASE + N - 1]!;
    expect(row(north, 3, xs)).toBe('.#.');
    expect(row(north, 10, xs)).toBe('...');
    const east = tiles[ARM_BASE + E - 1]!;
    expect(row(east, 25, xs)).toBe('..#');
  });

  it('finds the cells of thick walls: inside a 2×2 square of walls', () => {
    const plan = ['###.', '##..', '#...'];
    const isWall = (x: number, y: number) => plan[y]?.[x] === '#';
    expect([...solidCells(4, 3, isWall)].join('')).toBe('110011000000');
  });

  it('reads the mask from the neighbours', () => {
    const plan = ['.#.', '###', '.#.'];
    const isWall = (x: number, y: number) => plan[y]?.[x] === '#';
    expect(wallMask(isWall, 1, 1)).toBe(N | E | S | W);
    expect(wallMask(isWall, 1, 0)).toBe(S);
    expect(maskLabel(N | S)).toBe('N-S-');
  });
});
