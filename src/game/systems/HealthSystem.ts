import { PLAYER } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import { BLOCK_PLAYER, moveCircle } from '../map/CollisionGrid';
import type { SimContext } from './SimContext';

export function isPlayerAlive(p: PlayerState): boolean {
  return p.hp > 0;
}

/**
 * Applies a hit to a player (spec 01 §4.1): no effect while dashing,
 * 6 px knockback away from the attacker (walls still apply), and an event
 * for the HUD's red border and, later, the haptic feedback.
 * Returns true if damage was dealt.
 */
export function damagePlayer(ctx: SimContext, p: PlayerState, amount: number, fromX: number, fromY: number): boolean {
  if (!isPlayerAlive(p) || p.dashTimer > 0 || p.godMode) return false;
  p.hp = Math.max(0, p.hp - amount);
  p.lastDamageTime = ctx.state.time;

  const dx = p.x - fromX;
  const dy = p.y - fromY;
  const len = Math.hypot(dx, dy);
  if (len > 0) moveCircle(ctx.grid, p, (dx / len) * PLAYER.hitKnockback, (dy / len) * PLAYER.hitKnockback, PLAYER.hitboxRadius, BLOCK_PLAYER);

  ctx.events.emit('player:damaged', { playerId: p.id, hp: p.hp, maxHp: p.maxHp });
  if (p.hp === 0) {
    p.firing = false;
    p.aimManual = false;
    p.moving = false;
    p.moveFactor = 0;
    ctx.events.emit('player:died', { playerId: p.id });
  }
  return true;
}

/** Regeneration: after 3 s without damage, +40 HP/s up to the maximum. */
export function updateHealth(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const p of state.players) {
    if (!isPlayerAlive(p) || p.hp >= p.maxHp) continue;
    if (state.time - p.lastDamageTime < PLAYER.regenDelay) continue;
    p.hp = Math.min(p.maxHp, p.hp + PLAYER.regenPerSecond * dt);
  }
}
