import { describe, expect, it } from 'vitest';
import { parseMap } from '../../src/game/map/MapLoader';
import { embeddedMansion } from './mansion-fixture';
import { blank, opaqueBounds, type Frame } from './sheet';
import { PLANKS, barricadeFrames, plank, squeezeRows, turnAndCut, type PlankSlot } from './window-art';

/** The barricades' art (petición del usuario): the window's hole in its wall and the planks over it. */

const opaque = (f: Frame): number => {
  let n = 0;
  for (let i = 3; i < f.pixels.length; i += 4) if ((f.pixels[i] ?? 0) > 0) n++;
  return n;
};

/** A test drawing: rows coloured by their index (red = row), inside a transparent margin. */
function rows(width: number, height: number, margin = 2): Frame {
  const f = blank(width + margin * 2, height + margin * 2);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f.pixels.set([y, 100, x, 255], ((y + margin) * f.width + x + margin) * 4);
  }
  return f;
}

const wood = (): Frame => {
  const f = blank(32, 32);
  for (let i = 0; i < 32 * 32; i++) f.pixels.set([150, 110, 70, 255], i * 4);
  return f;
};

describe('window art', () => {
  it('squeezes a hole to the wall face without scaling: the lintel and the sill stay, the middle goes', () => {
    const out = squeezeRows(rows(21, 28), 18);
    expect([out.width, out.height]).toEqual([21, 18]);
    const red = (y: number): number => out.pixels[(y * out.width) * 4] ?? -1;
    expect(red(0)).toBe(0);
    expect(red(17)).toBe(27);
  });

  it('turns a hole a quarter and cuts it to a vertical wall strip', () => {
    const out = turnAndCut(rows(20, 21), 12);
    expect([out.width, out.height]).toEqual([12, 20]);
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
    const hole = rows(20, 18, 0);
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
