import { COLORS } from './theme';

/**
 * Merchants (spec 03): wizards in trench coats who move around the house
 * every round and sell ammo and upgrades. One entry each, with its catalogue
 * and prices; the rules shared by all of them are MERCHANT in balance.ts.
 */
export type MerchantId = 'blue' | 'red' | 'gold';

/** What merchants sell (spec 03 §4 and §6; the effects arrive in phases M2–M4). */
export type MerchantItemId = 'max_ammo' | 'round_boost' | 'weapon_level' | 'weapon_special';

export interface MerchantItem {
  id: MerchantItemId;
  price: number;
}

export interface MerchantDef {
  id: MerchantId;
  /** '#rrggbb': placeholder body, smoke, off-screen arrow and HUD notice. */
  color: string;
  /** A disabled merchant never appears in a normal match. */
  enabled: boolean;
  /** At the start of this round it first appears, in the player's starting zone. */
  firstRound: number;
  items: readonly MerchantItem[];
  /** Purchases allowed between two teleports; unlimited when missing. */
  maxPurchasesPerVisit?: number;
}

export const MERCHANTS: readonly MerchantDef[] = [
  {
    id: 'blue',
    color: COLORS.merchantBlue,
    enabled: true,
    firstRound: 2,
    items: [
      { id: 'max_ammo', price: 750 },
      { id: 'round_boost', price: 1000 },
    ],
  },
  // Red and gold are defined but off: they will get their own rule to appear.
  {
    id: 'red',
    color: COLORS.red,
    enabled: false,
    firstRound: 2,
    items: [{ id: 'weapon_level', price: 3000 }],
    maxPurchasesPerVisit: 1,
  },
  {
    id: 'gold',
    color: COLORS.amber,
    enabled: false,
    firstRound: 2,
    items: [{ id: 'weapon_special', price: 10000 }],
  },
];

export function merchantDef(id: MerchantId): MerchantDef {
  const def = MERCHANTS.find((m) => m.id === id);
  if (!def) throw new Error(`Unknown merchant "${id}"`);
  return def;
}
