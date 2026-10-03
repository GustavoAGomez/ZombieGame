import type { ActivationId } from './activations';
import { COLORS } from './theme';

/**
 * Merchants (spec 03): wizards in trench coats who move around the house
 * every round and sell ammo and upgrades. One entry each, with its catalogue
 * and prices; the rules shared by all of them are MERCHANT in balance.ts.
 */
export type MerchantId = 'blue' | 'red' | 'gold';

/** What merchants sell (spec 03 §4 and §6, spec 04 §1). */
export type MerchantItemId = 'max_ammo' | 'round_boost' | 'repair' | 'upgrade_ammo' | 'upgrade_fire_rate' | 'upgrade_damage' | 'weapon_special';

export interface MerchantItem {
  id: MerchantItemId;
  /** A fixed price, or one per level for items sold in levels: [level 1, level 2, …], each dearer than the one before. */
  price: number | readonly number[];
}

/** The red merchant's upgrades: the same three prices for each kind, by the level being bought. */
export const UPGRADE_PRICES = [1500, 3000, 5000] as const;

export interface MerchantDef {
  id: MerchantId;
  /** '#rrggbb': placeholder body, smoke, off-screen arrow and HUD notice. */
  color: string;
  /**
   * How it comes into the match (spec 05 §6): at the start of a round (first
   * in the player's starting zone), or when an activation brings it out.
   * Without a rule it never appears in a normal match (only from the debug
   * panel).
   */
  appears?: MerchantAppearance;
  items: readonly MerchantItem[];
  /** Purchases allowed between two teleports; unlimited when missing. */
  maxPurchasesPerVisit?: number;
}

export type MerchantAppearance = { by: 'round'; round: number } | { by: 'activation'; id: ActivationId };

export const MERCHANTS: readonly MerchantDef[] = [
  {
    id: 'blue',
    color: COLORS.merchantBlue,
    appears: { by: 'round', round: 2 },
    items: [
      { id: 'max_ammo', price: 750 },
      { id: 'round_boost', price: 1000 },
      // Back to all its uses, for a weapon that wears out (the katana): only shown while carrying one.
      { id: 'repair', price: 1500 },
    ],
  },
  // Red comes out of the garden pool when the heart and the wand are thrown in (spec 05 §6).
  {
    id: 'red',
    color: COLORS.red,
    appears: { by: 'activation', id: 'summon_red_merchant' },
    // The weapon in hand, one level of the kind the player picks (ammo, fire rate or damage).
    items: [
      { id: 'upgrade_ammo', price: UPGRADE_PRICES },
      { id: 'upgrade_fire_rate', price: UPGRADE_PRICES },
      { id: 'upgrade_damage', price: UPGRADE_PRICES },
    ],
    maxPurchasesPerVisit: 1,
  },
  {
    // No rule yet: only from the debug panel.
    id: 'gold',
    color: COLORS.amber,
    items: [{ id: 'weapon_special', price: 10000 }],
  },
];

export function merchantDef(id: MerchantId): MerchantDef {
  const def = MERCHANTS.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown merchant "${id}"`);
  return def;
}
