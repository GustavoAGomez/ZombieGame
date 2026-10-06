import { DASH, PLAYER, ZOMBIES } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import type { RunState } from '../../core/RunState';
import { playerStats, type PlayerStats } from '../dungeon/stats';
import { BLOCK_PLAYER, moveCircle } from '../map/CollisionGrid';
import { BURN, igniteZombie, isBurning } from './BurnSystem';
import { damageZombie, isZombieAlive } from './Combat';
import type { SimContext } from './SimContext';

/**
 * Special: dash (spec 01 §4.3). 72 px in 0.18 s along the movement input,
 * or the facing when standing still. Invulnerable meanwhile; walls still
 * stop it. Runs before movement, which is skipped while dashing. The
 * dungeon's upgrades (spec 09 §7.2) add dashes before the cooldown
 * (Segundo aire) and make it hurt and burn (Paso de sombra).
 */
export function updateSpecial(ctx: SimContext, dt: number): void {
  const { state, grid, commands } = ctx;
  const perks = playerStats(state.run);
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const cmd = commands[i];
    if (!p || !cmd || p.hp <= 0) continue;

    if (p.dashCooldown > 0) {
      p.dashCooldown = Math.max(0, p.dashCooldown - dt);
      if (p.dashCooldown === 0) p.dashUsed = 0;
    }

    // Segundo aire: more dashes before the cooldown holds.
    const ready = p.dashCooldown <= 0 || p.dashUsed < perks.dashes;
    if (cmd.special && ready && p.dashTimer <= 0) {
      const len = Math.hypot(cmd.moveX, cmd.moveY);
      if (len > 0) {
        p.dashDirX = cmd.moveX / len;
        p.dashDirY = cmd.moveY / len;
      } else {
        p.dashDirX = Math.cos(p.facing);
        p.dashDirY = Math.sin(p.facing);
      }
      p.dashTimer = DASH.duration;
      p.dashCooldown = DASH.cooldown;
      p.dashUsed++;
      if (state.run) state.run.dashHits.length = 0;
      ctx.events.emit('player:dash', { playerId: p.id, x: p.x, y: p.y });
    }

    if (p.dashTimer > 0) {
      const t = Math.min(dt, p.dashTimer);
      const dist = (DASH.distance / DASH.duration) * t;
      moveCircle(grid, p, p.dashDirX * dist, p.dashDirY * dist, PLAYER.hitboxRadius, BLOCK_PLAYER);
      p.dashTimer -= t;
      p.moving = true;
      p.moveFactor = 1;
      p.facing = Math.atan2(p.dashDirY, p.dashDirX);
      if (perks.shadowDash && state.run) shadowDash(ctx, state.run, p, perks.shadowDash);
    }
  }
  if (state.run) tickTrails(ctx, state.run, perks, dt);
}

/** Paso de sombra: the zombies the dash runs through take its damage once each, and it leaves fire where it passes. */
function shadowDash(ctx: SimContext, run: RunState, p: PlayerState, perk: NonNullable<PlayerStats['shadowDash']>): void {
  const { zombies } = ctx.state;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z) || run.dashHits.includes(i) || Math.hypot(z.x - p.x, z.y - p.y) > PLAYER.hitboxRadius + ZOMBIES.hitboxRadius) continue;
    run.dashHits.push(i);
    damageZombie(ctx, z, perk.damage, p.id, { x: z.x, y: z.y - ZOMBIES.hurtbox.height / 2, dirX: p.dashDirX, dirY: p.dashDirY }, 0);
  }
  run.trails.push({ x: p.x, y: p.y, age: 0, owner: p.id });
}

/** The dash's fire burns out in `trail` s; a zombie not burning that steps on it is set alight. */
function tickTrails(ctx: SimContext, run: RunState, perks: Readonly<PlayerStats>, dt: number): void {
  if (run.trails.length === 0) return;
  const perk = perks.shadowDash;
  for (const t of run.trails) t.age += dt;
  run.trails = perk ? run.trails.filter((t) => t.age < perk.trail) : [];
  if (!perk) return;
  for (const z of ctx.state.zombies) {
    if (!isZombieAlive(z) || isBurning(z)) continue;
    const on = run.trails.find((t) => Math.hypot(z.x - t.x, z.y - t.y) <= perk.trailRadius + ZOMBIES.hitboxRadius);
    if (on) igniteZombie(z, perk.trailBurn, BURN.fireDuration, on.owner);
  }
}

export function isDashing(p: { dashTimer: number }): boolean {
  return p.dashTimer > 0;
}
