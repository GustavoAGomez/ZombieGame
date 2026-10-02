import { PLAYER } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import { BLOCK_PLAYER, moveCircle } from '../map/CollisionGrid';
import type { SimContext } from './SimContext';

export function isPlayerAlive(p: PlayerState): boolean {
  return p.hp > 0;
}

/**
 * Applies a hit to a player (spec 01 §4.1). Health does not come back by
 * itself: only health pickups heal (PickupSystem). No effect while dashing,
 * 6 px knockback away from the attacker (walls still apply), and an event
 * for the HUD's red border and, later, the haptic feedback.
 * Returns true if damage was dealt.
 */
export function damagePlayer(ctx: SimContext, p: PlayerState, amount: number, fromX: number, fromY: number): boolean {
  if (!isPlayerAlive(p) || p.dashTimer > 0 || p.godMode) return false;
  p.hp = Math.max(0, p.hp - amount);

  const dx = p.x - fromX;
  const dy = p.y - fromY;
  const len = Math.hypot(dx, dy);
  if (len > 0) moveCircle(ctx.grid, p, (dx / len) * PLAYER.hitKnockback, (dy / len) * PLAYER.hitKnockback, PLAYER.hitboxRadius, BLOCK_PLAYER);

  ctx.events.emit('player:damaged', { playerId: p.id, hp: p.hp, maxHp: p.maxHp, x: p.x, y: p.y, fromX, fromY });
  if (p.hp === 0) {
    p.firing = false;
    p.shotPending = false;
    p.aimManual = false;
    p.moving = false;
    p.moveFactor = 0;
    ctx.events.emit('player:died', { playerId: p.id });
  }
  return true;
}
