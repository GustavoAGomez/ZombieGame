import { describe, expect, it } from 'vitest';
import { parseMap } from '../../src/game/map/MapLoader';
import { embeddedMansion } from './mansion-fixture';
import { blank, opaqueBounds, type Frame } from './sheet';
import { PLANKS, barricadeFrames, brokenGap, brokenHole, plank, type PlankSlot } from './window-art';

/** The barricades' art (petición del usuario): the window's hole in its wall and the planks over it. */

const opaque = (f: Frame): number => {
  let n = 0;
  for (let i = 3; i < f.pixels.length; i += 4) if ((f.pixels[i] ?? 0) > 0) n++;
  return n;
};

/** A test hole: a block of one colour. */
function block(width: number, height: number): Frame {
  const f = blank(width, height);
  for (let i = 0; i < width * height; i++) f.pixels.set([20, 20, 30, 255], i * 4);
  return f;
}

const wood = (): Frame => {
  const f = blank(32, 32);
  for (let i = 0; i < 32 * 32; i++) f.pixels.set([150, 110, 70, 255], i * 4);
  return f;
};

describe('window art', () => {
  it('breaks a horizontal wall open across almost its whole face, straight, under its top edge (petición del usuario)', () => {
    const hole = brokenHole();
    const b = opaqueBounds(hole);
    // Its outline and splinters included: columns 1..30, from right under the top edge (row 13) to row 29.
    expect(b && b.minX >= 1 && b.maxX <= 30 && b.minY >= 13 && b.maxY <= 29).toBe(true);
    // More hole than wall: most of the face (32 × 18 px) is gone.
    expect(opaque(hole)).toBeGreaterThan(32 * 18 * 0.6);
    // Dark inside: its middle.
    const i = (22 * 32 + 16) * 4;
    expect((hole.pixels[i] ?? 255) + (hole.pixels[i + 1] ?? 255) + (hole.pixels[i + 2] ?? 255)).toBeLessThan(120);
  });

  it('breaks a vertical wall open within its 12 px strip', () => {
    const b = opaqueBounds(brokenGap());
    expect(b && b.minX >= 10 && b.maxX <= 21 && b.minY >= 4 && b.maxY <= 27).toBe(true);
  });

  it('breaks its edges in steps of 2 px or more and leaves no pixel alone in its colour (petición del usuario: no stray pixels)', () => {
    const rgbAt = (f: Frame, x: number, y: number): string => {
      const i = (y * f.width + x) * 4;
      return (f.pixels[i + 3] ?? 0) === 0 ? '' : `${f.pixels[i]},${f.pixels[i + 1]},${f.pixels[i + 2]}`;
    };
    /** Each run of the same first row inside the outline along the hole's top edge (columns 2..29) or the gap's ends (from the top and from the bottom, columns 10..21). */
    const runs = (edge: number[]): number[] => {
      const out: number[] = [];
      edge.forEach((v, i) => (i > 0 && v === edge[i - 1] ? (out[out.length - 1] = (out[out.length - 1] ?? 0) + 1) : out.push(1)));
      return out;
    };
    const firstRow = (f: Frame, x: number, fromBottom: boolean): number => {
      for (let k = 0; k < f.height; k++) {
        const y = fromBottom ? f.height - 1 - k : k;
        const c = rgbAt(f, x, y);
        if (c && c !== '26,22,18') return y;
      }
      return -1;
    };
    const hole = brokenHole();
    const gap = brokenGap();
    const cols = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    for (const edge of [
      cols(2, 29).map((x) => firstRow(hole, x, false)),
      cols(10, 21).map((x) => firstRow(gap, x, false)),
      cols(10, 21).map((x) => firstRow(gap, x, true)),
    ])
      expect(Math.min(...runs(edge))).toBeGreaterThanOrEqual(2);
    // Every splinter, shard and outline pixel has a neighbour of its own colour, or one of the other two colours of its cluster (a shard's light pixel).
    for (const f of [hole, gap]) {
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          const c = rgbAt(f, x, y);
          if (!c) continue;
          const near = [rgbAt(f, x - 1, y), rgbAt(f, x + 1, y), rgbAt(f, x, y - 1), rgbAt(f, x, y + 1)];
          const glass = (k: string): boolean => k === '159,182,204' || k === '216,230,240';
          expect(near.includes(c) || (glass(c) && near.some(glass)), `${x},${y}`).toBe(true);
        }
      }
    }
  });

  it('cuts a plank of wood with a dark outline and a nail near each end', () => {
    const p = plank(wood(), 0, 0, 24);
    expect([p.width, p.height]).toEqual([24, 4]);
    expect(p.pixels[0]).toBe(0x2a);
    expect(p.pixels[(1 * 24 + 5) * 4]).toBe(150);
    expect(p.pixels[(1 * 24 + 2) * 4]).toBe(0xcf);
    expect(p.pixels[(1 * 24 + 21) * 4]).toBe(0xcf);
  });

  it('frame N shows N planks over the hole; a fence gap shows nothing but its planks', () => {
    const slots: PlankSlot[] = [0, 1, 2, 3, 4].map((i) => ({ x: 2, y: 4 + i * 5, length: 28, step: 0 }));
    const hole = block(20, 18);
    const window = barricadeFrames(hole, 6, 14, slots, wood(), [0]);
    expect(window).toHaveLength(PLANKS + 1);
    expect(opaqueBounds(window[0]!)).toEqual({ minX: 6, minY: 14, maxX: 25, maxY: 31 });
    for (let n = 1; n <= PLANKS; n++) expect(opaque(window[n]!)).toBeGreaterThan(opaque(window[n - 1]!));
    const fence = barricadeFrames(null, 0, 0, slots, wood(), [0]);
    expect(opaque(fence[0]!)).toBe(0);
    expect(opaque(fence[1]!)).toBe(28 * 4);
  });
});

describe('a window is a hole in its wall (map)', () => {
  it('every window cell carries its wall tile; a fence gap stays open ground', () => {
    const map = parseMap(embeddedMansion());
    for (const w of map.windows) {
      const wall = map.walls[w.tileY * map.width + w.tileX] ?? 0;
      if (w.kind === 'fence') expect(wall, w.id).toBe(0);
      else expect(wall, w.id).toBeGreaterThan(0);
    }
  });
});
