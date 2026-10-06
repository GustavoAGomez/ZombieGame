/**
 * The wall autotile's cases (docs/ASSETS.md §7): the tile indices of the
 * kits that tiles:import composes, and the neighbour masks the compiler
 * reads to pick them. Pure: the game compiles the dungeon's floors with it.
 */
export const TILE = 32;
export const STRIP = { x: 10, width: 12 } as const;
export const BAND = { y: 7, height: 7 } as const;
export const FACE = { y: BAND.y + BAND.height, height: TILE - BAND.y - BAND.height } as const;

/** First of the 4 solid tiles: + SOLID_NORTH_OPEN when no wall is north, + SOLID_SOUTH_OPEN when none is south. */
export const SOLID_BASE = 16;
export const SOLID_NORTH_OPEN = 2;
export const SOLID_SOUTH_OPEN = 1;

/** First of the 15 arm tiles: ARM_BASE + mask of arms - 1, only those arms (overlays at junctions between kits). */
export const ARM_BASE = SOLID_BASE + 4;

/** First of the 17 face tiles: FACE_BASE + mask (thin walls), FACE_SOLID (thick wall open to the south). */
export const FACE_BASE = ARM_BASE + 15;
export const FACE_SOLID = FACE_BASE + 16;

/** Bits of the neighbour mask. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

/** Whether a thin wall with this mask shows a front face (under a horizontal arm, or at the south end). */
export function hasFace(mask: number): boolean {
  return (mask & (E | W)) !== 0 || (mask & S) === 0;
}

/** Cells of a plan that belong to a thick wall: inside some 2×2 square of walls. */
export function solidCells(width: number, height: number, isWall: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y + 1 < height; y++) {
    for (let x = 0; x + 1 < width; x++) {
      if (isWall(x, y) && isWall(x + 1, y) && isWall(x, y + 1) && isWall(x + 1, y + 1)) {
        out[y * width + x] = out[y * width + x + 1] = out[(y + 1) * width + x] = out[(y + 1) * width + x + 1] = 1;
      }
    }
  }
  return out;
}

/** "N E S W" with a dash for each missing neighbour, e.g. "N-S-". */
export function maskLabel(mask: number): string {
  return `${mask & N ? 'N' : '-'}${mask & E ? 'E' : '-'}${mask & S ? 'S' : '-'}${mask & W ? 'O' : '-'}`;
}

/** Mask of a wall cell from a predicate that says which cells are walls. */
export function wallMask(isWall: (x: number, y: number) => boolean, x: number, y: number): number {
  return (isWall(x, y - 1) ? N : 0) | (isWall(x + 1, y) ? E : 0) | (isWall(x, y + 1) ? S : 0) | (isWall(x - 1, y) ? W : 0);
}
