/** Render order of world layers. Actors are additionally y-sorted. */
export const DEPTH = {
  floor: 0,
  /** The decor tile layer: floor details, such as the floor right of a vertical wall. */
  floorDetail: 0.25,
  shadows: 0.5,
  decor: 1,
  /** Rugs, rubble and other props without collision. */
  floorProps: 1.5,
  walls: 2,
  mapObjects: 3,
  decals: 4,
  pickups: 5,
  actors: 10,
  /** Darkness over zones not unlocked yet: above actors and props, under bullets. */
  fog: 29,
  /** Zombies at a window of the dark outside (tearing, climbing): over the darkness so the player sees them. */
  actorsOverFog: 29.1,
  /** The Demon's Hand's column of embers (spec 06 §3.2): seen over the darkness of a locked room. */
  handEmbers: 29.5,
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

/** Depth for an actor over the darkness, still y-sorted and under the bullets (maps up to 8000 px tall). */
export function overFogDepth(y: number): number {
  return DEPTH.actorsOverFog + y * 0.0001;
}
