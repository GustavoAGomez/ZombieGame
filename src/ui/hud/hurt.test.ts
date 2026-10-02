import { describe, expect, it } from 'vitest';
import { edgeWeight, fillNoiseFrame, hurtIntensity } from './hurt';

describe('hurtIntensity', () => {
  it('is 0 with full health, 1 with none, and grows faster at the end', () => {
    expect(hurtIntensity(100, 100)).toBe(0);
    expect(hurtIntensity(0, 100)).toBe(1);
    const light = hurtIntensity(90, 100);
    const half = hurtIntensity(50, 100);
    const low = hurtIntensity(20, 100);
    expect(light).toBeGreaterThan(0);
    expect(light).toBeLessThan(0.1);
    expect(half).toBeLessThan(0.5);
    expect(low).toBeGreaterThan(half);
    // The last 30 hp add more than the first 30.
    expect(hurtIntensity(0, 100) - hurtIntensity(30, 100)).toBeGreaterThan(hurtIntensity(70, 100));
  });

  it('stays within 0 and 1 with odd values', () => {
    expect(hurtIntensity(150, 100)).toBe(0);
    expect(hurtIntensity(-5, 100)).toBe(1);
    expect(hurtIntensity(10, 0)).toBe(0);
  });
});

describe('edgeWeight', () => {
  it('is 1 on an edge, 0 deeper than the band, and strongest in the corners', () => {
    expect(edgeWeight(0, 200, 64)).toBe(1);
    expect(edgeWeight(200, 0, 64)).toBe(1);
    expect(edgeWeight(64, 64, 64)).toBe(0);
    expect(edgeWeight(200, 200, 64)).toBe(0);
    const side = edgeWeight(20, 200, 64);
    expect(side).toBeGreaterThan(0);
    expect(side).toBeLessThan(1);
    expect(edgeWeight(20, 20, 64)).toBeGreaterThan(side);
  });
});

describe('fillNoiseFrame', () => {
  it('draws reddish speckles on the edges and leaves the middle transparent', () => {
    const w = 60;
    const h = 40;
    const data = new Uint8ClampedArray(w * h * 4);
    let seed = 1;
    const random = (): number => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    fillNoiseFrame(data, w, h, 3, 30, random);
    const alpha = (x: number, y: number): number => data[(y * w + x) * 4 + 3] ?? -1;
    // The middle is 60 px away from every edge, deeper than the band.
    expect(alpha(30, 20)).toBe(0);
    let edgeAlpha = 0;
    for (let x = 0; x < w; x++) edgeAlpha += alpha(x, 0);
    expect(edgeAlpha).toBeGreaterThan(0);
    for (let x = 0; x < w; x++) {
      const i = x * 4;
      // Red always dominates.
      expect(data[i] ?? 0).toBeGreaterThanOrEqual(data[i + 1] ?? 0);
      expect(data[i] ?? 0).toBeGreaterThanOrEqual(data[i + 2] ?? 0);
    }
  });
});
