/**
 * Special items (spec 05 §1): picked up around the map, kept in an
 * inventory on the HUD, and used with a tap at certain places (activations,
 * activations.ts). One entry each, by data, so new items only need a row
 * here and their names in STRINGS.items. The rules shared by all of them are
 * ITEMS in balance.ts.
 */
export type ItemId = 'living_heart' | 'worn_wand';

/** Catalogue order (the inventory and the spawns go through it). */
export const ITEM_IDS: readonly ItemId[] = ['living_heart', 'worn_wand'];

/**
 * When and where an item lies on the map waiting to be picked up (it stays
 * there until someone does): drawn once as the match starts among the
 * map's item spots (never in the starting zone, when `excludeStartZone`:
 * it has to be found), or dropped where the first boss of the match dies
 * (spec 07 §7).
 */
export type ItemSpawnRule = { when: 'match_start'; excludeStartZone: boolean } | { when: 'first_boss_kill' };

export interface ItemDef {
  id: ItemId;
  /** '#rrggbb': the placeholder icon. */
  color: string;
  /** Lighter detail of the placeholder (the wand's tip). */
  accent?: string;
  /**
   * Its animated sprite (`item_<id>` in the manifest: the same on the map, in
   * flight and in its HUD slot) plays at this many frames per second.
   */
  fps: number;
  /** On the map it floats over its spot, bobbing (the wand); otherwise it lies on the floor. */
  floats?: boolean;
  /** How it comes onto the map; without it the item is never on the ground. */
  spawn?: ItemSpawnRule;
}

export const ITEMS_CATALOGUE: Readonly<Record<ItemId, ItemDef>> = {
  // A real human heart, beating: Matarife drops it the first time a boss dies (spec 07 §7).
  living_heart: { id: 'living_heart', color: '#c93a2b', fps: 10, spawn: { when: 'first_boss_kill' } },
  // Floating, with lightning crackling at its tip: magic that works by itself.
  worn_wand: { id: 'worn_wand', color: '#8a6a3f', accent: '#efe6d2', fps: 12, floats: true, spawn: { when: 'match_start', excludeStartZone: true } },
};

/** Carried by every player from the start: none (the heart comes from the first boss, spec 07 §7). */
export const STARTING_ITEMS: readonly ItemId[] = [];

export function itemDef(id: ItemId): ItemDef {
  return ITEMS_CATALOGUE[id];
}
