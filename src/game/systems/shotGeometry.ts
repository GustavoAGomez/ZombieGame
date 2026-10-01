import { BULLETS, PLAYER, ZOMBIES } from '../../config/balance';
import { angleFromDir8, dir8FromAngle } from '../../core/math';

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Where the gun's muzzle is drawn for each of the 8 directions (DIRECTIONS_8
 * order), relative to the character's feet. It comes from the character art
 * (manifest `muzzle` points) and is plain data, so a server can load the same
 * table. Bullets are drawn from there and hit what they visibly touch.
 */
export type MuzzleTable = readonly Vec2[];

/** Without art: a point in front of the feet, at the bullets' flight height. */
export function defaultMuzzles(): MuzzleTable {
  return Array.from({ length: 8 }, (_, dir) => {
    const a = angleFromDir8(dir);
    return { x: Math.cos(a) * PLAYER.muzzleDistance, y: Math.sin(a) * PLAYER.muzzleDistance - BULLETS.flightHeight };
  });
}

/** The drawn muzzle for an aim angle. */
export function muzzleFor(muzzles: MuzzleTable, angle: number): Vec2 {
  return muzzles[dir8FromAngle(angle)] ?? { x: 0, y: -BULLETS.flightHeight };
}

/** Centre of a zombie's drawn body (ZOMBIES.hurtbox stands on its feet). */
export function bodyCentre(zx: number, zy: number, out: Vec2): Vec2 {
  out.x = zx;
  out.y = zy - ZOMBIES.hurtbox.height / 2;
  return out;
}

/**
 * Where along a drawn path, from (x, y) along (dirX, dirY) for `length`, it
 * first touches the drawn body of the zombie standing at (zx, zy): a box of
 * ZOMBIES.hurtbox from the feet up, widened by the bullet radius. Infinity
 * when it misses.
 */
export function bodyEntry(x: number, y: number, dirX: number, dirY: number, length: number, zx: number, zy: number): number {
  const halfW = ZOMBIES.hurtbox.width / 2 + BULLETS.radius;
  const top = zy - ZOMBIES.hurtbox.height - BULLETS.radius;
  const bottom = zy + BULLETS.radius;
  let tEnter = 0;
  let tExit = length;
  for (const [origin, dir, min, max] of [
    [x, dirX, zx - halfW, zx + halfW],
    [y, dirY, top, bottom],
  ] as const) {
    if (Math.abs(dir) < 1e-9) {
      if (origin < min || origin > max) return Infinity;
      continue;
    }
    let t0 = (min - origin) / dir;
    let t1 = (max - origin) / dir;
    if (t0 > t1) [t0, t1] = [t1, t0];
    tEnter = Math.max(tEnter, t0);
    tExit = Math.min(tExit, t1);
    if (tEnter > tExit) return Infinity;
  }
  return tEnter;
}
