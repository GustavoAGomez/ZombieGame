import { MERCHANT } from '../../config/balance';
import { merchantDef, type MerchantItem, type MerchantItemId } from '../../config/merchants';
import type { GameState, MerchantState, PlayerState } from '../../core/GameState';
import type { ShopItemStatus, ShopReason } from '../../core/shop';
import { storeBoost } from './BoostSystem';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { isFullyLoaded, magazineSize, maxReserve } from './weaponStats';

/** The nearest active merchant within MERCHANT.interactRange of `p`, or -1. */
export function nearestMerchant(state: GameState, p: PlayerState): number {
  let best = -1;
  let bestSq = MERCHANT.interactRange * MERCHANT.interactRange;
  state.merchants.forEach((m, i) => {
    if (!m.active) return;
    const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2;
    if (d <= bestSq) {
      bestSq = d;
      best = i;
    }
  });
  return best;
}

/** Item `itemIndex` of merchant `merchantIndex`'s catalogue, for player `playerIndex`. */
export function shopItemStatus(state: GameState, merchantIndex: number, playerIndex: number, itemIndex: number): ShopItemStatus {
  const m = state.merchants[merchantIndex];
  const p = state.players[playerIndex];
  const def = m ? merchantDef(m.id) : undefined;
  const item = def?.items[itemIndex];
  if (!m || !p || !def || !item) return { kind: 'hidden' };
  const effect = EFFECTS[item.id];
  if (!effect) return { kind: 'hidden' };
  if (def.maxPurchasesPerVisit !== undefined && (m.visitPurchases[playerIndex] ?? 0) >= def.maxPurchasesPerVisit) return { kind: 'limit' };
  const reason = effect.unavailable(p);
  if (reason) return { kind: 'unavailable', reason };
  if (p.points < item.price) return { kind: 'short', missing: item.price - p.points };
  return { kind: 'buy' };
}

/**
 * Shop panels (spec 03 §3). The action button near a merchant opens its
 * shop (InteractionSystem); it closes with its X, when the player walks
 * farther than MERCHANT.closeRange, dies or the merchant goes away. Buying
 * is a command (`shopBuy`), checked here as a server would: open shop, in
 * range, points, applicable and within the visit's limit.
 */
export function updateShops(ctx: SimContext): void {
  const { state, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (!p || p.shopMerchant < 0) continue;
    const m = state.merchants[p.shopMerchant];
    const cmd = commands[i];
    if (!m?.active || !isPlayerAlive(p) || cmd?.shopClose || (m.x - p.x) ** 2 + (m.y - p.y) ** 2 > MERCHANT.closeRange ** 2) {
      p.shopMerchant = -1;
      continue;
    }
    if (cmd && cmd.shopBuy >= 0) buyItem(ctx, i, p.shopMerchant, cmd.shopBuy);
  }
}

/** Buys item `itemIndex` from merchant `merchantIndex` for player `playerIndex`. True when bought. */
export function buyItem(ctx: SimContext, playerIndex: number, merchantIndex: number, itemIndex: number): boolean {
  const { state } = ctx;
  if (shopItemStatus(state, merchantIndex, playerIndex, itemIndex).kind !== 'buy') return false;
  const p = state.players[playerIndex];
  const m = state.merchants[merchantIndex];
  const item: MerchantItem | undefined = m && merchantDef(m.id).items[itemIndex];
  if (!p || !m || !item) return false;
  p.points -= item.price;
  m.visitPurchases[playerIndex] = (m.visitPurchases[playerIndex] ?? 0) + 1;
  EFFECTS[item.id]?.apply(p, m);
  ctx.events.emit('points:spent', { playerId: p.id, amount: item.price });
  ctx.events.emit('merchant:purchase', { playerId: p.id, merchant: m.id, item: item.id });
  return true;
}

interface ItemEffect {
  /** Why it would do nothing for this player, or null when it is worth buying. */
  unavailable(p: PlayerState): ShopReason | null;
  apply(p: PlayerState, merchant: MerchantState): void;
}

/** Items with their effect in place; the rest are hidden until their phase. */
const EFFECTS: Partial<Record<MerchantItemId, ItemEffect>> = {
  max_ammo: {
    unavailable: (p) => (p.weapons.every(isFullyLoaded) ? 'ammoFull' : null),
    apply: (p) => {
      for (const slot of p.weapons) {
        slot.magazine = magazineSize(slot);
        slot.reserve = maxReserve(slot);
      }
      // Nothing left to reload.
      p.reloadTimer = 0;
    },
  },
  // The boost the merchant drew for this visit, into the player's slot (spec 03 §4–5).
  round_boost: {
    unavailable: () => null,
    apply: (p, m) => storeBoost(p, m.boost),
  },
};
