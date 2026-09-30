import { DASH, PLAYER } from '../../config/balance';
import { BLOCK_PLAYER, moveCircle } from '../map/CollisionGrid';
import type { SimContext } from './SimContext';

/**
 * Special: dash (spec 01 §4.3). 72 px in 0.18 s along the movement input,
 * or the facing when standing still. Invulnerable meanwhile; walls still
 * stop it. Runs before movement, which is skipped while dashing.
 */
export function updateSpecial(ctx: SimContext, dt: number): void {
  const { state, grid, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const cmd = commands[i];
    if (!p || !cmd || p.hp <= 0) continue;

    if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - dt);

    if (cmd.special && p.dashCooldown <= 0 && p.dashTimer <= 0) {
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
    }

    if (p.dashTimer > 0) {
      const t = Math.min(dt, p.dashTimer);
      const dist = (DASH.distance / DASH.duration) * t;
      moveCircle(grid, p, p.dashDirX * dist, p.dashDirY * dist, PLAYER.hitboxRadius, BLOCK_PLAYER);
      p.dashTimer -= t;
      p.moving = true;
      p.moveFactor = 1;
      p.facing = Math.atan2(p.dashDirY, p.dashDirX);
    }
  }
}

export function isDashing(p: { dashTimer: number }): boolean {
  return p.dashTimer > 0;
}
