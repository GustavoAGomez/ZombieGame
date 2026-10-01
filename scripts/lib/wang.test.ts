import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodePng } from './png';
import { cornerWangId, cornersOf, measureWangSheet, orderTerrains, type TerrainRule } from './wang';

const sheet = (group: string) => {
  const png = decodePng(readFileSync(resolve(import.meta.dirname, `../../art-src/pixellab/${group}/${group}.png`)));
  return { width: png.width, height: png.height, pixels: png.pixels };
};

/** Layout measured by hand from the PNGs (spec 02 §1.1): "NWNE/SWSE" per (col,row). */
const EXPECTED: Record<string, string> = {
  '0,0': '1110', '1,0': '1100', '2,0': '1101', '3,0': '0001', '4,0': '0010',
  '0,1': '1010', '1,1': '0000', '2,1': '0101', '3,1': '0100', '4,1': '1000',
  '0,2': '1011', '1,2': '0011', '2,2': '0111', '3,2': '0110', '4,2': '1001',
  '0,3': '0000', '1,3': '1111',
};

describe('measureWangSheet', () => {
  const rules: Record<string, TerrainRule> = { tileset_street: 'darker', tileset_pool: 'darker', tileset_garden: 'lessSaturated' };
  for (const group of ['tileset_street', 'tileset_pool', 'tileset_garden']) {
    it(`finds the 16 corner combinations of ${group} without assuming the layout`, () => {
      const m = orderTerrains(measureWangSheet(sheet(group)), rules[group]!);
      expect(m.missing).toEqual([]);
      expect(m.tiles).toHaveLength(17);
      const got = Object.fromEntries(m.tiles.map((t) => [`${t.col},${t.row}`, t.corners.join('')]));
      expect(got).toEqual(EXPECTED);
    });
  }

  it('does not depend on where the tiles are: shuffled sheets give the same corners per tile', () => {
    const img = sheet('tileset_pool');
    // Swap the cells (0,3) and (1,1): the plain water tiles change place.
    const swap = (ax: number, ay: number, bx: number, by: number) => {
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const i = ((ay * 32 + y) * img.width + ax * 32 + x) * 4;
          const j = ((by * 32 + y) * img.width + bx * 32 + x) * 4;
          for (let c = 0; c < 4; c++) [img.pixels[i + c], img.pixels[j + c]] = [img.pixels[j + c]!, img.pixels[i + c]!];
        }
      }
    };
    swap(0, 3, 1, 3);
    const m = orderTerrains(measureWangSheet(img), 'darker');
    const got = Object.fromEntries(m.tiles.map((t) => [`${t.col},${t.row}`, t.corners.join('')]));
    expect(got['0,3']).toBe('1111');
    expect(got['1,3']).toBe('0000');
    expect([...m.plain[0]].sort((x, y) => x - y)).toEqual([6, 16]);
  });

  it('reports missing combinations', () => {
    const img = sheet('tileset_street');
    // Blank out the diagonal tiles (3,2) and (4,2).
    for (let y = 64; y < 96; y++) for (let x = 96; x < 160; x++) img.pixels[(y * img.width + x) * 4 + 3] = 0;
    expect(measureWangSheet(img).missing.sort()).toEqual(['0110', '1001']);
  });
});

describe('cornerWangId', () => {
  it('puts NE, SE, SW, NW in the odd slots as colours 1/2', () => {
    expect(cornerWangId([1, 1, 1, 0])).toEqual([0, 2, 0, 1, 0, 2, 0, 2]);
    expect(cornerWangId([0, 0, 0, 0])).toEqual([0, 1, 0, 1, 0, 1, 0, 1]);
  });

  it('counts corners of a terrain', () => {
    expect(cornersOf([0, 0, 1, 0], 0)).toBe(3);
  });
});
