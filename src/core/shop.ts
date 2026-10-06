/**
 * Why an item cannot be bought even with money enough (spec 03 §3, spec 04 §1):
 * full ammo, no more levels in the weapon's list (or no list at all), the
 * special already bought (or none defined for that weapon), a weapon that
 * has not worn out at all (nothing to repair), the life already full (the
 * dungeon wizard's medkit, spec 09 §7.1).
 */
export type ShopReason = 'ammoFull' | 'maxLevel' | 'notUpgradable' | 'hasSpecial' | 'noSpecial' | 'likeNew' | 'hpFull';

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
