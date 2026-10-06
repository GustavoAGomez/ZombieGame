import { DUNGEON } from '../../config/dungeon';
import { BULLETS, PLAYER, ZOMBIES } from '../../config/balance';
import type { ZombieState } from '../../core/GameState';
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

export interface Hurtbox {
  readonly width: number;
  readonly height: number;
}

/** The box bullets hit, standing on the feet: smaller once the zombie crawls without legs. */
export function hurtboxOf(z: Pick<ZombieState, 'hp'> & Partial<Pick<ZombieState, 'kind'>>): Hurtbox {
  // The brute is bigger and never crawls (spec 09 §5.2).
  if (z.kind === 'brute') return BRUTE_HURTBOX;
  return z.hp > 0 && z.hp <= ZOMBIES.crawlAtHp ? ZOMBIES.crawlHurtbox : ZOMBIES.hurtbox;
}

const BRUTE_HURTBOX: Hurtbox = { width: Math.round(ZOMBIES.hurtbox.width * DUNGEON.kinds.brute.scale), height: Math.round(ZOMBIES.hurtbox.height * DUNGEON.kinds.brute.scale) };

/** Centre of a zombie's drawn body (its hurtbox stands on its feet). */
export function bodyCentre(zx: number, zy: number, out: Vec2, box: Hurtbox = ZOMBIES.hurtbox): Vec2 {
  out.x = zx;
  out.y = zy - box.height / 2;
  return out;
}

/**
 * Where along a drawn path, from (x, y) along (dirX, dirY) for `length`, it
 * first touches the drawn body of the zombie standing at (zx, zy): its
 * hurtbox from the feet up, widened by the bullet radius. Infinity when it
 * misses.
 */
export function bodyEntry(
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  length: number,
  zx: number,
  zy: number,
  box: Hurtbox = ZOMBIES.hurtbox,
): number {
  const halfW = box.width / 2 + BULLETS.radius;
  const top = zy - box.height - BULLETS.radius;
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
