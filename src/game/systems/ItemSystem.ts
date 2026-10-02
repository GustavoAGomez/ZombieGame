import { ITEMS } from '../../config/balance';
import type { GameState, PlayerState } from '../../core/GameState';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';

/**
 * Special items (spec 05): picking them up from the floor with the action
 * button, and using them with a tap on their inventory slot. Where they lie
 * is drawn when the match starts (itemSpawns.ts); InteractionSystem offers
 * the pickup when nothing else is at hand.
 */

/**
 * The inventory taps of this tick (InputCommand.useItem): the item is used
 * where it can be, and otherwise stays in the inventory with "AQUÍ NO SE
 * USA" (spec 05 §5). Items can be used at any moment of the match.
 */
export function updateItems(ctx: SimContext): void {
  const { state, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const slot = commands[i]?.useItem ?? -1;
    if (!p || slot < 0 || !p.items[slot] || !isPlayerAlive(p)) continue;
    ctx.events.emit('item:cantUse', { playerId: p.id, slot });
  }
}

/** Room for one more item in the player's inventory. */
export function hasItemRoom(p: PlayerState): boolean {
  return p.items.length < ITEMS.maxSlots;
}

/** Index of the nearest item on the floor within ITEMS.pickupRange of the player's feet, or -1. */
export function itemInReach(state: GameState, p: PlayerState): number {
  let best = -1;
  let bestSq = ITEMS.pickupRange * ITEMS.pickupRange;
  state.groundItems.forEach((g, i) => {
    if (!g.active) return;
    const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
    if (d <= bestSq) {
      bestSq = d;
      best = i;
    }
  });
  return best;
}

/**
 * Picks up floor item `index` into the player's inventory (last slot) when
 * there is room and it is not carried already (items are unique). Returns
 * whether it was picked up.
 */
export function pickUpItem(ctx: SimContext, p: PlayerState, index: number): boolean {
  const g = ctx.state.groundItems[index];
  if (!g?.active || !hasItemRoom(p) || p.items.includes(g.item)) return false;
  g.active = false;
  p.items.push(g.item);
  ctx.events.emit('item:picked', { playerId: p.id, item: g.item });
  return true;
}
