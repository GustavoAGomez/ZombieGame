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
