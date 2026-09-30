/** Small allocation-free math helpers shared by systems and views. */

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Wraps an angle to (-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a <= -Math.PI) a += Math.PI * 2;
  else if (a > Math.PI) a -= Math.PI * 2;
  return a;
}

/**
 * Quantises an angle (0 = east, π/2 = south, y grows downwards) to the
 * 8-way sheet row order of docs/ASSETS.md: 0 south, 1 south-east, 2 east,
 * 3 north-east, 4 north, 5 north-west, 6 west, 7 south-west.
 */
export function dir8FromAngle(angle: number): number {
  const sector = Math.round(angle / (Math.PI / 4));
  return (((2 - sector) % 8) + 8) % 8;
}

/** Inverse of dir8FromAngle: the centre angle of a sheet row. */
export function angleFromDir8(dir8: number): number {
  return wrapAngle((2 - dir8) * (Math.PI / 4));
}
