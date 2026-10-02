import { HURT_VIGNETTE } from '../../config/balance';

/**
 * How strong the red frame is: 0 with full health, 1 with none. The curve
 * keeps the first hits barely visible and makes the last ones obvious.
 */
export function hurtIntensity(hp: number, maxHp: number): number {
  if (maxHp <= 0) return 0;
  const lost = Math.min(1, Math.max(0, 1 - hp / maxHp));
  return lost ** HURT_VIGNETTE.curve;
}

/**
 * Weight of the noise at a point `edgeX` and `edgeY` px away from the
 * nearest side and top/bottom edges: 1 on the edge, 0 deeper than `band`.
 * Both sides are blended (screen) so the corners are strongest with no seam.
 */
export function edgeWeight(edgeX: number, edgeY: number, band: number): number {
  const wx = falloff(edgeX / band);
  const wy = falloff(edgeY / band);
  return 1 - (1 - wx) * (1 - wy);
}

function falloff(t: number): number {
  if (t >= 1) return 0;
  if (t <= 0) return 1;
  const s = 1 - t;
  return s * s;
}

/**
 * Fills an RGBA frame of no-signal TV noise, `w`×`h` noise pixels of
 * `pixel` CSS px each: random speckles from deep red to pale pink, in
 * horizontal streaks like a lost signal, and transparent away from the edges.
 */
export function fillNoiseFrame(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  pixel: number,
  band: number,
  random: () => number = Math.random,
): void {
  for (let y = 0; y < h; y++) {
    const edgeY = Math.min(y, h - 1 - y) * pixel;
    // The whole row is a bit lighter or darker: the streaks of a TV with no signal.
    const streak = (random() - 0.5) * 0.5;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const weight = edgeWeight(Math.min(x, w - 1 - x) * pixel, edgeY, band);
      if (weight <= 0) {
        data[i + 3] = 0;
        continue;
      }
      const v = Math.min(1, Math.max(0, random() + streak));
      const glow = v * v * v;
      data[i] = 110 + 145 * v;
      data[i + 1] = 20 * v + 170 * glow;
      data[i + 2] = 18 * v + 160 * glow;
      data[i + 3] = 255 * v * weight;
    }
  }
}
