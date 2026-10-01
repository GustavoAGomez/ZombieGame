/** Why an item cannot be bought even with points enough (spec 03 §3). */
export type ShopReason = 'ammoFull' | 'maxLevel' | 'hasSpecial';

/**
 * What the COMPRAR button of a shop item shows for a player:
 *   buy         it can be bought now
 *   short       not enough points (`missing` is how many)
 *   unavailable it would do nothing (`reason`)
 *   limit       the merchant's purchases for this visit are used up
 *   hidden      not sold yet (its effect arrives in a later phase)
 */
export type ShopItemStatus =
  | { kind: 'buy' }
  | { kind: 'short'; missing: number }
  | { kind: 'unavailable'; reason: ShopReason }
  | { kind: 'limit' }
  | { kind: 'hidden' };
