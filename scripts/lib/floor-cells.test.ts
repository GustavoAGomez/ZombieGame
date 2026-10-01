import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { floorCells } from './floor-cells';
import { decodePng } from './png';

describe('floor cells', () => {
  const png = decodePng(readFileSync(resolve(import.meta.dirname, '../../art-src/pixellab/floors_interior/floors_interior.png')));
  const cells = floorCells({ width: png.width, height: png.height, pixels: png.pixels });

  it('finds the 16 cells of the irregular export', () => {
    expect(cells).toHaveLength(16);
    expect(cells[3]!.source.width).toBeLessThan(40); // the last column comes cut short
  });

  it('leaves no dark outline on any edge of the tiles (it drew a grid over the floors)', () => {
    for (const [i, c] of cells.entries()) {
      const t = c.tile;
      const darkShare = (xs: number[], ys: number[]) => {
        let dark = 0;
        for (const y of ys) for (const x of xs) {
          const p = (y * t.width + x) * 4;
          if ((t.pixels[p] ?? 0) + (t.pixels[p + 1] ?? 0) + (t.pixels[p + 2] ?? 0) < 100) dark++;
        }
        return dark / (xs.length * ys.length);
      };
      const all = Array.from({ length: 32 }, (_, k) => k);
      for (const edge of [darkShare([0], all), darkShare([31], all), darkShare(all, [0]), darkShare(all, [31])]) {
        expect(edge, `tile ${i}`).toBeLessThan(0.5);
      }
    }
  });

  it('makes opaque 32×32 tiles', () => {
    for (const c of cells) {
      expect([c.tile.width, c.tile.height]).toEqual([32, 32]);
      expect(c.tile.pixels.some((v, k) => k % 4 === 3 && v === 0)).toBe(false);
    }
  });
});
