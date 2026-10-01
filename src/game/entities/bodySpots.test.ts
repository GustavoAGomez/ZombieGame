import { describe, expect, it } from 'vitest';
import { bodySpots } from './bodySpots';

/** A w × h alpha frame with an opaque rectangle. */
function frame(w: number, h: number, x0: number, y0: number, x1: number, y1: number): Uint8Array {
  const a = new Uint8Array(w * h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * w + x] = 255;
  return a;
}

describe('bodySpots', () => {
  it('keeps the pixels that are body in almost every frame, away from the edge, as offsets from the anchor', () => {
    // A 6×8 body that sways one pixel left and right: only its core stays.
    const frames = [frame(10, 10, 2, 1, 8, 9), frame(10, 10, 1, 1, 7, 9), frame(10, 10, 3, 1, 9, 9)];
    const spots = bodySpots(frames, 10, 10, 5, 9);
    const xs = new Set(spots.map((s) => s.x + 5));
    const ys = new Set(spots.map((s) => s.y + 9));
    expect(Math.min(...xs)).toBe(4);
    expect(Math.max(...xs)).toBe(5);
    expect(Math.min(...ys)).toBe(2);
    expect(Math.max(...ys)).toBe(7);
    expect(spots).toContainEqual({ x: -1, y: -2 });
  });

  it('ignores a pose seen in few frames, and returns nothing without frames', () => {
    const frames = Array.from({ length: 9 }, () => frame(8, 8, 2, 2, 6, 6));
    frames.push(frame(8, 8, 0, 0, 1, 1));
    expect(bodySpots(frames, 8, 8, 0, 0)).toHaveLength(4);
    expect(bodySpots([], 8, 8, 0, 0)).toEqual([]);
  });
});
