/** Render order of world layers. Actors are additionally y-sorted. */
export const DEPTH = {
  floor: 0,
  decor: 1,
  walls: 2,
  mapObjects: 3,
  decals: 4,
  pickups: 5,
  actors: 10,
  bullets: 30,
  aimLine: 31,
  debug: 100,
} as const;

/** Depth for an actor standing at world y (feet). */
export function actorDepth(y: number): number {
  return DEPTH.actors + y * 0.001;
}
