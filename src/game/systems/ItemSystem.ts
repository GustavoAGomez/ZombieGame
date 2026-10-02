import { ACTIVATIONS, type ActivationDef } from '../../config/activations';
import { ITEMS, PLAYER, SIM } from '../../config/balance';
import type { ItemId } from '../../config/items';
import type { ActivationState, GameState, PlayerState } from '../../core/GameState';
import type { MapActivationSite, MapData } from '../map/MapLoader';
import { isPlayerAlive } from './HealthSystem';
import { summonMerchant } from './MerchantSystem';
import type { SimContext } from './SimContext';

/**
 * Special items (spec 05): picking them up from the floor with the action
 * button, and using them with a tap on their inventory slot. Where they lie
 * is drawn when the match starts (itemSpawns.ts); InteractionSystem offers
 * the pickup when nothing else is at hand.
 */

/**
 * The inventory taps of this tick (InputCommand.useItem): an item is thrown
 * at the activation that takes it here, and otherwise stays in the
 * inventory with "AQUÍ NO SE USA" (spec 05 §5). Items can be used at any
 * moment of the match. Then, the activations whose last item has landed
 * do their thing.
 */
export function updateItems(ctx: SimContext): void {
  const { state, commands, map } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const slot = commands[i]?.useItem ?? -1;
    const item = slot >= 0 ? p?.items[slot] : undefined;
    if (!p || !item || !isPlayerAlive(p)) continue;
    const activation = activationFor(map, ACTIVATIONS, state.activations, p, item);
    if (activation < 0) ctx.events.emit('item:cantUse', { playerId: p.id, slot });
    else throwItem(ctx, p, slot, activation);
  }
  completeActivations(ctx);
}

/**
 * Index of the activation (of `defs`, with their `states`) that takes
 * `item` from where player `p` stands, or -1: one not complete yet, that
 * takes the item and has not received it, in its turn when the order is
 * fixed, whose place is within ITEMS.useRange of the player's hitbox.
 */
export function activationFor(map: MapData, defs: readonly ActivationDef[], states: readonly ActivationState[], p: PlayerState, item: ItemId): number {
  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const st = states[i];
    if (!def || !st || st.done || !def.requires.includes(item) || st.received.includes(item)) continue;
    if (def.order === 'fixed' && def.requires[st.received.length] !== item) continue;
    const site = siteOf(map, def);
    if (site && distanceToSite(site, p.x, p.y) - PLAYER.hitboxRadius < ITEMS.useRange) return i;
  }
  return -1;
}

function siteOf(map: MapData, def: ActivationDef): MapActivationSite | undefined {
  return map.activationSites.find((s) => s.id === def.site);
}

/** Distance (px) from a point to a site's rectangle; 0 inside it. */
function distanceToSite(site: MapActivationSite, x: number, y: number): number {
  const dx = Math.max(site.x - x, 0, x - (site.x + site.width));
  const dy = Math.max(site.y - y, 0, y - (site.y + site.height));
  return Math.hypot(dx, dy);
}

/**
 * Throws inventory slot `slot` of player `p` at activation `index`: the item
 * leaves the inventory (the others close up) and lands in the place's
 * nearest point ITEMS.throwTime later. The place remembers it from now on.
 */
function throwItem(ctx: SimContext, p: PlayerState, slot: number, index: number): void {
  const { state, map } = ctx;
  const def = ACTIVATIONS[index];
  const st = state.activations[index];
  const item = p.items[slot];
  const site = def && siteOf(map, def);
  if (!def || !st || !item || !site) return;
  p.items.splice(slot, 1);
  st.received.push(item);
  st.landsAt.push(state.tick + Math.round(ITEMS.throwTime * SIM.hz));
  st.thrownBy.push(p.id);
  // Into the place's nearest point: inside its rectangle, as close to the player as it gets.
  const toX = Math.min(Math.max(p.x, site.x + 4), site.x + site.width - 4);
  const toY = Math.min(Math.max(p.y, site.y + 4), site.y + site.height - 4);
  ctx.events.emit('item:thrown', { playerId: p.id, item, activation: def.id, fromX: p.x, fromY: p.y, toX, toY, time: state.time });
}

/** Activations with every item received and the last one landed: done, and their effect happens. */
function completeActivations(ctx: SimContext): void {
  const { state, map } = ctx;
  ACTIVATIONS.forEach((def, i) => {
    const st = state.activations[i];
    if (!st || st.done || st.received.length < def.requires.length) return;
    if (state.tick < Math.max(...st.landsAt)) return;
    st.done = true;
    st.doneTick = state.tick;
    const site = siteOf(map, def);
    if (def.effect.kind === 'summon_merchant' && site) {
      const merchant = state.merchants.findIndex((m) => m.id === def.effect.merchant);
      summonMerchant(ctx, merchant, { x: site.x + site.width / 2, y: site.y + site.height / 2 }, site.zoneIndex);
    }
    // The completion is the last thrower's (their vibration).
    ctx.events.emit('activation:completed', { playerId: st.thrownBy[st.thrownBy.length - 1] ?? 0, activation: def.id, effect: def.effect });
  });
}

/** Room for one more item in the player's inventory. */
export function hasItemRoom(p: PlayerState): boolean {
  return p.items.length < ITEMS.maxSlots;
}

/** Index of the nearest item on the floor within ITEMS.pickupRange of the player's feet, or -1. */
export function itemInReach(state: GameState, p: PlayerState): number {
  let best = -1;
  let bestSq = ITEMS.pickupRange * ITEMS.pickupRange;
  state.groundItems.forEach((g, i) => {
    if (!g.active) return;
    const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
    if (d <= bestSq) {
      bestSq = d;
      best = i;
    }
  });
  return best;
}

/**
 * Picks up floor item `index` into the player's inventory (last slot) when
 * there is room and it is not carried already (items are unique). Returns
 * whether it was picked up.
 */
export function pickUpItem(ctx: SimContext, p: PlayerState, index: number): boolean {
  const g = ctx.state.groundItems[index];
  if (!g?.active || !hasItemRoom(p) || p.items.includes(g.item)) return false;
  g.active = false;
  p.items.push(g.item);
  ctx.events.emit('item:picked', { playerId: p.id, item: g.item });
  return true;
}
