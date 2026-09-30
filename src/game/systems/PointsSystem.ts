import type { PlayerState } from '../../core/GameState';
import type { SimContext } from './SimContext';

export type PointsReason = 'repair' | 'hit' | 'kill';

/**
 * Points (spec 01 §4.7): start with 500; +10 per hit, +50 per kill, +10 per
 * repaired plank. Every gain is announced for a floating "+N": in the HUD,
 * or from a spot in the world when `x`/`y` are given (repaired window).
 */
export function awardPoints(
  ctx: SimContext,
  playerId: number,
  amount: number,
  reason: PointsReason,
  x?: number,
  y?: number,
): void {
  if (amount <= 0) return;
  const p = playerById(ctx, playerId);
  if (!p) return;
  p.points += amount;
  ctx.events.emit('points:gained', x !== undefined && y !== undefined ? { playerId, amount, reason, x, y } : { playerId, amount, reason });
}

/** Spends points if the player can afford them. Returns false (and spends nothing) otherwise. */
export function spendPoints(p: PlayerState, amount: number): boolean {
  if (p.points < amount) return false;
  p.points -= amount;
  return true;
}

export function playerById(ctx: SimContext, playerId: number): PlayerState | undefined {
  const { players } = ctx.state;
  for (let i = 0; i < players.length; i++) if (players[i]?.id === playerId) return players[i];
  return undefined;
}
