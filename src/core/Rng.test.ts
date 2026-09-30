import { describe, expect, it } from 'vitest';
import { random, randomRange } from './Rng';

describe('Rng', () => {
  it('is deterministic for the same seed', () => {
    const a = { rng: 42 };
    const b = { rng: 42 };
    for (let i = 0; i < 10; i++) expect(random(a)).toBe(random(b));
  });

  it('stays within [0, 1) and within ranges', () => {
    const s = { rng: 7 };
    for (let i = 0; i < 1000; i++) {
      const v = random(s);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      const r = randomRange(s, -3, 5);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThan(5);
    }
  });
});
