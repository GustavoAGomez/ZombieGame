/** Render order of world layers. Actors are additionally y-sorted. */
export const DEPTH = {
  floor: 0,
  /** The decor tile layer: floor details, such as the floor right of a vertical wall. */
  floorDetail: 0.25,
  shadows: 0.5,
  decor: 1,
  /** Rugs, rubble and other props without collision. */
  floorProps: 1.5,
  /** A boss's marks on the floor (its ring, its shadow): under the walls, which cover them. */
  floorMarks: 1.75,
  walls: 2,
  mapObjects: 3,
  decals: 4,
  pickups: 5,
  /**
   * Darkness over zones not unlocked yet: over the map, its props and what
   * lies on the floor, under the actors, so a tall one standing by a locked
   * room (the boss) is never cut off where its head pokes over it
   * (petición del usuario). Whatever stands inside the dark hides itself.
   */
  fog: 9,
  actors: 10,
  bullets: 30,
  aimLine: 31,
  /** Arrows at the screen edge towards merchants out of view. */
  indicators: 32,
  debug: 100,
} as const;

/** Depth for an actor standing at world y (feet). */
export function actorDepth(y: number): number {
  return DEPTH.actors + y * 0.001;
}
