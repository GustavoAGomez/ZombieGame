import { PLAYER, ZOMBIES } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
import type { PlayerState, ZombieState } from '../../core/GameState';
import { BLOCK_PLAYER, moveCircle, resolveCircle } from '../map/CollisionGrid';
import type { SimContext } from './SimContext';
import { speedFactor } from './BoostSystem';
import { isDashing } from './SpecialSystem';

/** Moves each player from its command's analog vector, sliding along walls. */
export function updateMovement(ctx: SimContext, dt: number): void {
  const { state, grid, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const player = state.players[i];
    const cmd = commands[i];
    if (!player || !cmd || player.hp <= 0 || isDashing(player)) continue;

    let mx = cmd.moveX;
    let my = cmd.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }
    player.moving = len > 0;
    player.moveFactor = Math.min(1, len);
    if (!player.moving) continue;
    player.moveX = mx / Math.min(1, len);
    player.moveY = my / Math.min(1, len);

    // Shooting slows the run down to a walk (the shoot_walk animation); a melee weapon does not (spec 06 §2.2).
    const slot = player.weapons[player.activeSlot];
    const slowed = cmd.fire && !(slot && WEAPONS[slot.id].attack === 'melee');
    const speed = PLAYER.speed * (slowed ? PLAYER.shootingSpeedFactor : 1) * speedFactor(player);
    moveCircle(grid, player, mx * speed * dt, my * speed * dt, PLAYER.hitboxRadius, BLOCK_PLAYER);
    blockByZombies(ctx, player);
    // During a knife slash the player keeps facing the slash.
    if (player.meleeTimer <= 0) player.facing = Math.atan2(my, mx);
  }
}

/** Zombies are solid: the player cannot walk into them (only dash through). */
function blockByZombies(ctx: SimContext, p: PlayerState): void {
  const minDist = PLAYER.hitboxRadius + ZOMBIES.hitboxRadius;
  let pushed = false;
  const { zombies } = ctx.state;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !solid(z)) continue;
    const dx = p.x - z.x;
    const dy = p.y - z.y;
    const distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist || distSq < 1e-9) continue;
    const dist = Math.sqrt(distSq);
    p.x += (dx / dist) * (minDist - dist);
    p.y += (dy / dist) * (minDist - dist);
    pushed = true;
  }
  if (pushed) resolveCircle(ctx.grid, p, PLAYER.hitboxRadius, BLOCK_PLAYER);
}

function solid(z: ZombieState): boolean {
  return z.active && z.hp > 0 && z.ai !== 'dead' && z.ai !== 'climbing';
}
