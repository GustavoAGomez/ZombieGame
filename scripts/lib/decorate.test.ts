import { describe, expect, it } from 'vitest';
import { DECOR_DENSITY, SHADOW, decorDensity, floorVariants, placeDecals, shadowTile, valueNoise, type DecorInput } from './decorate';

describe('floorVariants', () => {
  const W = 40;
  const H = 40;
  const v = floorVariants(W, H, () => true, () => ({ main: 0, rares: [2] }));

  it('uses the main variant about 70 % of the time', () => {
    const main = [...v].filter((x) => x === 0).length / v.length;
    expect(main).toBeGreaterThan(0.6);
    expect(main).toBeLessThan(0.9);
  });

  it('never puts the same rare variant on two neighbouring tiles', () => {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (v[y * W + x] !== 2) continue;
        if (x > 0) expect(v[y * W + x - 1]).not.toBe(2);
        if (y > 0) expect(v[(y - 1) * W + x]).not.toBe(2);
      }
    }
  });

  it('leaves non-floor cells alone and keeps a single variant without rares', () => {
    const plain = floorVariants(4, 4, (x) => x < 2, () => ({ main: 3, rares: [] }));
    expect([...plain]).toEqual([3, 3, -1, -1, 3, 3, -1, -1, 3, 3, -1, -1, 3, 3, -1, -1]);
  });
});

describe('shadowTile', () => {
  it('picks the band from the neighbours that cast shadow (light from the top left)', () => {
    expect(shadowTile(true, false, false)).toBe(SHADOW.top);
    expect(shadowTile(false, true, false)).toBe(SHADOW.left);
    expect(shadowTile(true, true, true)).toBe(SHADOW.both);
    expect(shadowTile(false, false, true)).toBe(SHADOW.corner);
    expect(shadowTile(false, false, false)).toBe(-1);
  });
});

describe('valueNoise', () => {
  it('stays in [0, 1) and changes smoothly', () => {
    for (let i = 0; i < 200; i++) {
      const n = valueNoise(i * 0.37, i * 0.91, 5, 3);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
    expect(Math.abs(valueNoise(10, 10, 5, 1) - valueNoise(10.1, 10, 5, 1))).toBeLessThan(0.1);
  });
});

describe('placeDecals', () => {
  /** A 20×12 room of wood with walls around and one barricade in the bottom wall. */
  const W = 20;
  const H = 12;
  const wall = (x: number, y: number): boolean => x <= 0 || y <= 0 || x >= W - 1 || y >= H - 1;
  const input: DecorInput = {
    width: W,
    height: H,
    tileSize: 32,
    ground: (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '_' : wall(x, y) ? 'wall' : '.'),
    zoneAt: (x, y) => (wall(x, y) || x < 0 || y < 0 || x >= W || y >= H ? -1 : 0),
    zoneCount: 1,
    blocked: (x, y) => wall(x, y),
    windows: [{ cell: { x: 10, y: H - 1 }, inward: { x: 0, y: -1 }, outdoor: false }],
    passages: [],
    propCells: new Set(),
    seed: 42,
  };

  it('is deterministic', () => {
    expect(placeDecals(input)).toEqual(placeDecals(input));
  });

  it('reaches the target density without going past the maximum', () => {
    const density = decorDensity(placeDecals(input), input)[0] ?? 0;
    expect(density).toBeGreaterThanOrEqual(DECOR_DENSITY.min);
    expect(density).toBeLessThanOrEqual(DECOR_DENSITY.max);
  });

  it('leaves debris at the barricade and a trail into the room', () => {
    const decals = placeDecals(input);
    const nearWindow = decals.filter((d) => Math.abs(d.cx - 10.5 * 32) < 48 && d.cy > (H - 3) * 32);
    expect(nearWindow.length).toBeGreaterThanOrEqual(3);
    const trail = decals.filter((d) => d.tileset === 'decals_interior' && [0, 1, 2, 3, 4, 14].includes(d.local) && Math.abs(d.cx - 10.5 * 32) < 40);
    expect(Math.min(...trail.map((d) => d.cy))).toBeLessThan((H - 3) * 32);
  });

  it('counts props as covered floor', () => {
    const propCells = new Set<number>();
    for (let y = 1; y < 6; y++) for (let x = 1; x < 10; x++) propCells.add(y * W + x);
    const withProps = { ...input, propCells };
    expect(placeDecals(withProps).length).toBeLessThan(placeDecals(input).length);
  });
});
