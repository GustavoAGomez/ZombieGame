/** Render order of world layers. Actors are additionally y-sorted. */
export const DEPTH = {
  floor: 0,
  shadows: 0.5,
  decor: 1,
  /** Rugs, rubble and other props without collision. */
  floorProps: 1.5,
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
