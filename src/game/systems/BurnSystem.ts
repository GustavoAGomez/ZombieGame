import { WEAPON_SPECIALS } from '../../config/weapons';
import type { ZombieState } from '../../core/GameState';
import { damageZombie, isZombieAlive } from './Combat';
import type { SimContext } from './SimContext';

/** Float slack so a tick that lands exactly on the end of the fire still counts. */
const EPS = 1e-6;

/**
 * Fire on zombies (spec 04 §1), reusable by any weapon. A burning zombie
 * takes `perTick` damage every fireTickInterval until its fire runs out.
 * Hits while it burns do not stack fires: each one restarts the duration and
 * the fire keeps the highest damage per tick it was given. Fire ticks give
 * no hit points; a zombie that dies burning gives the kill to `owner`.
 */
export const BURN = WEAPON_SPECIALS.fire;

/** Ticks in one full fire: 10 with 1.5 s at a tick every 0.15 s. */
export const BURN_TICKS = Math.round(BURN.fireDuration / BURN.fireTickInterval);

/** Damage per tick for a hit of `hitDamage`: fireDamageFactor of it in total, over the whole fire. */
export function burnPerTick(hitDamage: number): number {
  return (hitDamage * BURN.fireDamageFactor) / BURN_TICKS;
}

export function isBurning(z: ZombieState): boolean {
  return z.burn.timer > 0;
}

/** Sets `z` on fire from a hit of `hitDamage` (the final damage, after falloff and boosts). */
export function igniteZombie(z: ZombieState, hitDamage: number, owner: number): void {
  if (!isZombieAlive(z)) return;
  const b = z.burn;
  const perTick = burnPerTick(hitDamage);
  // A fresh fire starts its tick clock; a burning zombie keeps its rhythm.
  if (b.timer <= 0) {
    b.tickTimer = BURN.fireTickInterval;
    b.perTick = perTick;
  } else {
    b.perTick = Math.max(b.perTick, perTick);
  }
  b.timer = BURN.fireDuration;
  b.owner = owner;
}

export function updateBurns(ctx: SimContext, dt: number): void {
  const { zombies } = ctx.state;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || z.burn.timer <= 0) continue;
    const b = z.burn;
    if (!isZombieAlive(z)) {
      b.timer = 0;
      continue;
    }
    b.timer -= dt;
    b.tickTimer -= dt;
    while (b.tickTimer <= EPS && b.timer >= -EPS) {
      b.tickTimer += BURN.fireTickInterval;
      // No blood and no hit points: only the kill counts.
      if (damageZombie(ctx, z, b.perTick, b.owner, undefined, false)) break;
    }
    if (b.timer <= EPS || !isZombieAlive(z)) {
      b.timer = 0;
      b.perTick = 0;
    }
  }
}
