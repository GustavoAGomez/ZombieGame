import { MERCHANT } from '../../config/balance';
import { merchantDef, type MerchantItem, type MerchantItemId } from '../../config/merchants';
import type { GameState, MerchantState, PlayerState } from '../../core/GameState';
import type { ShopItemStatus, ShopReason } from '../../core/shop';
import { storeBoost } from './BoostSystem';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { WEAPONS } from '../../config/weapons';
import { isFullyLoaded, levelUp, levelUpReason, magazineSize, maxReserve, specialReason } from './weaponStats';

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

/** Sold once per weapon the player carries (a row each in the panel). */
export function isPerWeapon(item: MerchantItemId): boolean {
  return EFFECTS[item]?.perWeapon === true;
}

/**
 * Item `itemIndex` of merchant `merchantIndex`'s catalogue, for player
 * `playerIndex` (and weapon slot `slot` for items sold per weapon).
 */
export function shopItemStatus(state: GameState, merchantIndex: number, playerIndex: number, itemIndex: number, slot = -1): ShopItemStatus {
  const m = state.merchants[merchantIndex];
  const p = state.players[playerIndex];
  const def = m ? merchantDef(m.id) : undefined;
  const item = def?.items[itemIndex];
  if (!m || !p || !def || !item) return { kind: 'hidden' };
  const effect = EFFECTS[item.id];
  if (!effect || (effect.perWeapon && !p.weapons[slot])) return { kind: 'hidden' };
  if (def.maxPurchasesPerVisit !== undefined && (m.visitPurchases[playerIndex] ?? 0) >= def.maxPurchasesPerVisit) return { kind: 'limit' };
  const reason = effect.unavailable(p, slot);
  if (reason) return { kind: 'unavailable', reason };
  if (p.money < item.price) return { kind: 'short', missing: item.price - p.money };
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
    if (cmd && cmd.shopBuy >= 0) buyItem(ctx, i, p.shopMerchant, cmd.shopBuy, cmd.shopSlot);
  }
}

/** Buys item `itemIndex` (for weapon slot `slot` if sold per weapon) from merchant `merchantIndex` for player `playerIndex`. True when bought. */
export function buyItem(ctx: SimContext, playerIndex: number, merchantIndex: number, itemIndex: number, slot = -1): boolean {
  const { state } = ctx;
  if (shopItemStatus(state, merchantIndex, playerIndex, itemIndex, slot).kind !== 'buy') return false;
  const p = state.players[playerIndex];
  const m = state.merchants[merchantIndex];
  const item: MerchantItem | undefined = m && merchantDef(m.id).items[itemIndex];
  if (!p || !m || !item) return false;
  p.money -= item.price;
  m.visitPurchases[playerIndex] = (m.visitPurchases[playerIndex] ?? 0) + 1;
  EFFECTS[item.id]?.apply(p, m, slot);
  ctx.events.emit('money:spent', { playerId: p.id, amount: item.price });
  ctx.events.emit('merchant:purchase', { playerId: p.id, merchant: m.id, item: item.id });
  return true;
}

interface ItemEffect {
  /** One row per weapon the player carries; `slot` says which (−1 for the other items). */
  perWeapon?: boolean;
  /** Why it would do nothing for this player, or null when it is worth buying. */
  unavailable(p: PlayerState, slot: number): ShopReason | null;
  apply(p: PlayerState, merchant: MerchantState, slot: number): void;
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
  // Red merchant: the next level of the weapon in hand, from its own list (spec 04 §1).
  weapon_level: {
    unavailable: (p) => {
      const weapon = p.weapons[p.activeSlot];
      return weapon ? levelUpReason(WEAPONS[weapon.id], weapon.level) : 'notUpgradable';
    },
    apply: (p) => {
      const weapon = p.weapons[p.activeSlot];
      if (weapon) levelUp(weapon);
    },
  },
  // Gold merchant: the special of the weapon chosen in the panel, if it has one (spec 04 §1).
  weapon_special: {
    perWeapon: true,
    unavailable: (p, slot) => {
      const weapon = p.weapons[slot];
      return weapon ? specialReason(WEAPONS[weapon.id], weapon.special) : 'noSpecial';
    },
    apply: (p, _m, slot) => {
      const weapon = p.weapons[slot];
      if (weapon) weapon.special = true;
    },
  },
};
