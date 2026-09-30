import { describe, expect, it } from 'vitest';
import { angleFromDir8, dir8FromAngle, wrapAngle } from './math';

describe('dir8FromAngle', () => {
  it('follows the sheet row order (south, south-east, east, …)', () => {
    const q = Math.PI / 4;
    expect(dir8FromAngle(2 * q)).toBe(0); // south
    expect(dir8FromAngle(q)).toBe(1); // south-east
    expect(dir8FromAngle(0)).toBe(2); // east
    expect(dir8FromAngle(-q)).toBe(3); // north-east
    expect(dir8FromAngle(-2 * q)).toBe(4); // north
    expect(dir8FromAngle(-3 * q)).toBe(5); // north-west
    expect(dir8FromAngle(Math.PI)).toBe(6); // west
    expect(dir8FromAngle(-Math.PI)).toBe(6); // west
    expect(dir8FromAngle(3 * q)).toBe(7); // south-west
  });

  it('rounds to the nearest sector', () => {
    expect(dir8FromAngle(0.3)).toBe(2);
    expect(dir8FromAngle(0.5)).toBe(1);
  });

  it('round-trips with angleFromDir8', () => {
    for (let d = 0; d < 8; d++) expect(dir8FromAngle(angleFromDir8(d))).toBe(d);
  });
});

describe('wrapAngle', () => {
  it('wraps into (-π, π]', () => {
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
    expect(wrapAngle(-3 * Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});
