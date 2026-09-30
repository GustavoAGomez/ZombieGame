import { PLAYER } from '../../config/balance';
import { BLOCK_PLAYER, moveCircle } from '../map/CollisionGrid';
import type { SimContext } from './SimContext';
import { isDashing } from './SpecialSystem';

/** Moves each player from its command's analog vector, sliding along walls. */
export function updateMovement(ctx: SimContext, dt: number): void {
  const { state, grid, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i];
    const cmd = commands[i];
    if (!player || !cmd || isDashing(player)) continue;

    let mx = cmd.moveX;
    let my = cmd.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    player.moving = len > 0;
    if (!player.moving) continue;

    moveCircle(grid, player, mx * PLAYER.speed * dt, my * PLAYER.speed * dt, PLAYER.hitboxRadius, BLOCK_PLAYER);
    player.facing = Math.atan2(my, mx);
  }
}
