/**
 * Deterministic PRNG (mulberry32). Its state lives inside GameState so a
 * future server can reproduce the same simulation.
 */
export interface RngState {
  rng: number;
}

/** Returns a float in [0, 1) and advances the state. */
export function random(state: RngState): number {
  state.rng = (state.rng + 0x6d2b79f5) | 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Float in [min, max). */
export function randomRange(state: RngState, min: number, max: number): number {
  return min + (max - min) * random(state);
}
