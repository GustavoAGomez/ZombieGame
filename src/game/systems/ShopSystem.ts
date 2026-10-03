import { MERCHANT } from '../../config/balance';
import { merchantDef, type MerchantItem, type MerchantItemId } from '../../config/merchants';
import type { UpgradeKind } from '../../config/weapons';
import type { GameState, MerchantState, PlayerState } from '../../core/GameState';
import type { ShopItemStatus, ShopReason } from '../../core/shop';
import { storeBoost } from './BoostSystem';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { WEAPONS } from '../../config/weapons';
import { isFullyLoaded, magazineSize, maxReserve, specialReason, upgradeReason, upgradeWeapon } from './weaponStats';

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

/** The kind of upgrade a red merchant's item sells, or null for the other items. */
export function upgradeKindOf(item: MerchantItemId): UpgradeKind | null {
  return EFFECTS[item]?.upgrade ?? null;
}

/** What `item` costs player `p` now: its fixed price, or the price of the level it would buy for the weapon in hand. */
export function itemPrice(p: PlayerState, item: MerchantItem): number {
  if (typeof item.price === 'number') return item.price;
  const kind = upgradeKindOf(item.id);
  const level = kind ? (p.weapons[p.activeSlot]?.levels[kind] ?? 0) : 0;
  return item.price[Math.min(level, item.price.length - 1)] ?? 0;
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
  if (!effect || (effect.perWeapon && !p.weapons[slot]) || effect.shows?.(p, slot) === false) return { kind: 'hidden' };
  if (def.maxPurchasesPerVisit !== undefined && (m.visitPurchases[playerIndex] ?? 0) >= def.maxPurchasesPerVisit) return { kind: 'limit' };
  const reason = effect.unavailable(p, slot);
  if (reason) return { kind: 'unavailable', reason };
  const price = itemPrice(p, item);
  if (p.money < price) return { kind: 'short', missing: price - p.money };
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
  // Before the effect: an upgrade's price is the level it buys.
  const price = itemPrice(p, item);
  p.money -= price;
  m.visitPurchases[playerIndex] = (m.visitPurchases[playerIndex] ?? 0) + 1;
  EFFECTS[item.id]?.apply(p, m, slot);
  ctx.events.emit('money:spent', { playerId: p.id, amount: price });
  ctx.events.emit('merchant:purchase', { playerId: p.id, merchant: m.id, item: item.id });
  return true;
}

interface ItemEffect {
  /** The red merchant's upgrades: which kind it sells a level of, for the weapon in hand. */
  upgrade?: UpgradeKind;
  /** One row per weapon the player carries; `slot` says which (−1 for the other items). */
  perWeapon?: boolean;
  /** Whether it is on sale for this player (and weapon) at all; missing: always. */
  shows?(p: PlayerState, slot: number): boolean;
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
  // Blue merchant: a weapon that wears out (the katana) back to all its uses, broken or not; only for such a weapon.
  repair: {
    perWeapon: true,
    shows: (p, slot) => {
      const weapon = p.weapons[slot];
      return weapon !== undefined && WEAPONS[weapon.id].durability !== undefined;
    },
    unavailable: (p, slot) => {
      const weapon = p.weapons[slot];
      return weapon && weapon.uses >= (WEAPONS[weapon.id].durability ?? 0) ? 'likeNew' : null;
    },
    apply: (p, _m, slot) => {
      const weapon = p.weapons[slot];
      if (weapon) weapon.uses = WEAPONS[weapon.id].durability ?? weapon.uses;
    },
  },
  // Red merchant: one more level of a kind of upgrade, for the weapon in hand (spec 04 §1).
  upgrade_ammo: upgradeEffect('ammo'),
  upgrade_fire_rate: upgradeEffect('fire_rate'),
  upgrade_damage: upgradeEffect('damage'),
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

/** The red merchant's item for one kind of upgrade: the next level of it, while the weapon in hand takes more. */
function upgradeEffect(kind: UpgradeKind): ItemEffect {
  return {
    upgrade: kind,
    unavailable: (p) => {
      const weapon = p.weapons[p.activeSlot];
      return weapon ? upgradeReason(WEAPONS[weapon.id], kind, weapon.levels[kind]) : 'notUpgradable';
    },
    apply: (p) => {
      const weapon = p.weapons[p.activeSlot];
      if (weapon) upgradeWeapon(weapon, kind);
    },
  };
}
