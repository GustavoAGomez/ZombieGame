import type { ItemId } from './items';
import type { MerchantId } from './merchants';

/**
 * Activations (spec 05 §6): places on the map that take certain special
 * items and do something once they have them all. One entry each, by data:
 * the map names the place (an `activation_site` with this `site` id), the
 * entry says what it takes, in which order, and what it does.
 */
export type ActivationId = 'summon_red_merchant';

/** What happens when an activation is complete. */
export type ActivationEffect = { kind: 'summon_merchant'; merchant: MerchantId };

export interface ActivationDef {
  id: ActivationId;
  /** Id of the map's `activation_site` where the items are used. */
  site: string;
  /** Items it takes, each once. */
  requires: readonly ItemId[];
  /** `any`: in any order; `fixed`: in the order of `requires`. */
  order: 'any' | 'fixed';
  effect: ActivationEffect;
}

export const ACTIVATIONS: readonly ActivationDef[] = [
  {
    // Spec 05 §6: the heart and the wand thrown into the garden pool bring out the red merchant.
    id: 'summon_red_merchant',
    site: 'pool',
    requires: ['living_heart', 'worn_wand'],
    order: 'any',
    effect: { kind: 'summon_merchant', merchant: 'red' },
  },
];
