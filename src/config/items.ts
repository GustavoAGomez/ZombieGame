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

/** When and where an item lies on the map waiting to be picked up. */
export interface ItemSpawnRule {
  /** Drawn once, when the match starts, among the map's item spots (it stays there until picked up). */
  when: 'match_start';
  /** Never in the zone the player starts in: it has to be found. */
  excludeStartZone: boolean;
}

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
  /** Lies on the map from the match start; without it the item is never on the ground. */
  spawn?: ItemSpawnRule;
}

export const ITEMS_CATALOGUE: Readonly<Record<ItemId, ItemDef>> = {
  // A real human heart, beating.
  living_heart: { id: 'living_heart', color: '#c93a2b', fps: 10 },
  // Floating, with lightning crackling at its tip: magic that works by itself.
  worn_wand: { id: 'worn_wand', color: '#8a6a3f', accent: '#efe6d2', fps: 12, floats: true, spawn: { when: 'match_start', excludeStartZone: true } },
};

/** Carried by every player from the start (provisional for the heart: it will be found some other way). */
export const STARTING_ITEMS: readonly ItemId[] = ['living_heart'];

export function itemDef(id: ItemId): ItemDef {
  return ITEMS_CATALOGUE[id];
}
