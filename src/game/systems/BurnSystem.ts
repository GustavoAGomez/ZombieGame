import { ZOMBIES } from '../../config/balance';
import { WEAPON_SPECIALS, WEAPONS } from '../../config/weapons';
import type { BossState, BurnState, ZombieState } from '../../core/GameState';
import { BLOCK_BULLET, segmentClearShaped } from '../map/CollisionGrid';
import { damageBoss, distanceToBoss, isBossHittable, nearestOnBoss } from './BossCombat';
import { damageZombie, isZombieAlive } from './Combat';
import type { SimContext } from './SimContext';

/** Float slack so a tick that lands exactly on the end of the fire still counts. */
const EPS = 1e-6;

/**
 * Fire on zombies (spec 04 §1, spec 06 §2.3), reusable by any weapon: the
 * one that lights it says how much it burns in total and for how long. A
 * burning zombie takes its share every fireTickInterval until its fire runs
 * out. Hits while it burns do not stack fires: each one restarts the
 * duration (the longer one wins) and the fire keeps the highest damage per
 * tick it was given. Fire ticks give no hit points; a zombie that dies
 * burning gives the kill to `owner`.
 *
 * Hellfire (the flamethrower's special): a zombie that dies burning from it
 * bursts (Combat queues the burst, this system sets it off the same tick),
 * hitting and lighting every zombie around, which can burst in turn.
 */
export const BURN = WEAPON_SPECIALS.fire;
const HELLFIRE = WEAPON_SPECIALS.hellfire;

/** Damage ticks in a fire of `duration` s (10 for the shotgun's 1.5 s at a tick every 0.15 s). */
export function burnTicks(duration: number): number {
  return Math.max(1, Math.round(duration / BURN.fireTickInterval));
}

export function isBurning(z: ZombieState): boolean {
  return z.burn.timer > 0;
}

/**
 * Sets `z` on fire: `total` damage over `duration` seconds, the kill for
 * `owner`; `hellfire` when lit by a flamethrower with its special. The
 * shotgun's pellets burn fireDamageFactor of their hit for fireDuration.
 */
export function igniteZombie(z: ZombieState, total: number, duration: number, owner: number, hellfire = false): void {
  if (isZombieAlive(z)) igniteBurn(z.burn, total, duration, owner, hellfire);
}

/** Sets a boss on fire, like a zombie (spec 07 §2: the burn hurts it too). */
export function igniteBoss(b: BossState, total: number, duration: number, owner: number, hellfire = false): void {
  if (isBossHittable(b)) igniteBurn(b.burn, total, duration, owner, hellfire);
}

function igniteBurn(b: BurnState, total: number, duration: number, owner: number, hellfire: boolean): void {
  const perTick = total / burnTicks(duration);
  // A fresh fire starts its tick clock; a burning body keeps its rhythm.
  if (b.timer <= 0) {
    b.tickTimer = BURN.fireTickInterval;
    b.perTick = perTick;
    b.hellfire = false;
  } else {
    b.perTick = Math.max(b.perTick, perTick);
  }
  b.timer = Math.max(b.timer, duration);
  b.owner = owner;
  b.hellfire ||= hellfire;
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
      if (damageZombie(ctx, z, b.perTick, b.owner, undefined, 0)) break;
    }
    if (b.timer <= EPS || !isZombieAlive(z)) {
      b.timer = 0;
      b.perTick = 0;
    }
  }
  for (const boss of ctx.state.bosses) burnBoss(ctx, boss, dt);
  setOffBlasts(ctx);
}

/** A burning boss takes its fire's ticks like a zombie (no hit points, no blood); it never bursts. */
function burnBoss(ctx: SimContext, boss: BossState, dt: number): void {
  const b = boss.burn;
  if (b.timer <= 0) return;
  if (!isBossHittable(boss)) {
    b.timer = 0;
    return;
  }
  b.timer -= dt;
  b.tickTimer -= dt;
  while (b.tickTimer <= EPS && b.timer >= -EPS) {
    b.tickTimer += BURN.fireTickInterval;
    if (damageBoss(ctx, boss, b.perTick, b.owner, undefined, 0)) break;
  }
  if (b.timer <= EPS || !isBossHittable(boss)) {
    b.timer = 0;
    b.perTick = 0;
  }
}

const scratchPoint = { x: 0, y: 0 };

/**
 * Sets off the hellfire bursts queued this tick: every living zombie whose
 * hitbox edge is within HELLFIRE.radius, with no wall in between, takes
 * HELLFIRE.damage (no hit points, the kill for its owner) and catches the
 * flamethrower's fire with hellfire. Those it kills while they burn queue
 * their own bursts, set off in the same pass: a chain ends because each
 * zombie dies only once.
 */
export function setOffBlasts(ctx: SimContext): void {
  const { blasts, zombies } = ctx.state;
  const fire = WEAPONS.flamethrower.burn ?? { damage: 0, duration: 0 };
  for (let pass = 0; pass < blasts.length; pass++) {
    let any = false;
    for (const blast of blasts) {
      if (!blast.active) continue;
      any = true;
      const { x, y, owner } = blast;
      ctx.events.emit('fire:blast', { x, y });
      for (const z of zombies) {
        if (!isZombieAlive(z)) continue;
        if (Math.hypot(z.x - x, z.y - y) - ZOMBIES.hitboxRadius > HELLFIRE.radius) continue;
        if (!segmentClearShaped(ctx.grid, x, y, z.x, z.y, BLOCK_BULLET)) continue;
        // Lit first, so a zombie the burst kills dies burning and bursts too.
        igniteZombie(z, fire.damage, fire.duration, owner, true);
        damageZombie(ctx, z, HELLFIRE.damage, owner, undefined, 0);
      }
      // A boss in the burst burns too, from the edge of its footprint.
      for (const boss of ctx.state.bosses) {
        if (!isBossHittable(boss) || distanceToBoss(boss, ctx.map.tileSize, x, y) > HELLFIRE.radius) continue;
        const at = nearestOnBoss(boss, ctx.map.tileSize, x, y, scratchPoint);
        if (!segmentClearShaped(ctx.grid, x, y, at.x, at.y, BLOCK_BULLET)) continue;
        igniteBoss(boss, fire.damage, fire.duration, owner, true);
        damageBoss(ctx, boss, HELLFIRE.damage, owner, undefined, 0);
      }
      // Freed only now: the bursts this one causes take other slots, never this one mid-way.
      blast.active = false;
    }
    if (!any) return;
  }
}
