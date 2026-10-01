export interface Spot {
  x: number;
  y: number;
}

/**
 * Places of a character's body that are body in (almost) every frame: the
 * pixels opaque in at least `share` of the frames whose four neighbours are
 * too, so a small mark drawn there stays on the body whatever the pose or
 * the direction. `frames` holds one alpha array (w × h) per frame; spots are
 * returned as offsets from the anchor (ax, ay), in frame pixels.
 */
export function bodySpots(frames: readonly ArrayLike<number>[], w: number, h: number, ax: number, ay: number, share = 0.85): Spot[] {
  if (frames.length === 0) return [];
  const counts = new Uint16Array(w * h);
  for (const alpha of frames) {
    for (let i = 0; i < counts.length; i++) if ((alpha[i] ?? 0) > 0) counts[i] = (counts[i] ?? 0) + 1;
  }
  const need = Math.ceil(frames.length * share);
  const solid = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < w && y < h && (counts[y * w + x] ?? 0) >= need;
  const spots: Spot[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (solid(x, y) && solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1)) spots.push({ x: x - ax, y: y - ay });
    }
  }
  return spots;
}
