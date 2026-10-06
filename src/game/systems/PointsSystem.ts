import { playerStats } from '../dungeon/stats';
import type { PlayerState } from '../../core/GameState';
import type { SimContext } from './SimContext';

export type PointsReason = 'repair' | 'hit' | 'kill' | 'room' | 'chest';

/**
 * Points and money (spec 01 §4.7): +10 per hit, +50 per kill, +10 per
 * repaired plank, the same to the points (score) and to the money (starts
 * at 500 $). Every gain is announced for a floating "+N$": in the HUD, or
 * from a spot in the world when `x`/`y` are given (repaired window).
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
  // Codicia (spec 09 §7.2) pays more money, not more score.
  p.money += Math.round(amount * playerStats(ctx.state.run).money);
  p.score += amount;
  ctx.events.emit('points:gained', x !== undefined && y !== undefined ? { playerId, amount, reason, x, y } : { playerId, amount, reason });
}

/** Spends money if the player can afford it. Returns false (and spends nothing) otherwise. */
export function spendMoney(p: PlayerState, amount: number): boolean {
  if (p.money < amount) return false;
  p.money -= amount;
  return true;
}

export function playerById(ctx: SimContext, playerId: number): PlayerState | undefined {
  const { players } = ctx.state;
  for (let i = 0; i < players.length; i++) if (players[i]?.id === playerId) return players[i];
  return undefined;
}
