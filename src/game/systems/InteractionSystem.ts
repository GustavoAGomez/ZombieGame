import { rules } from '../rules';
import { BARRICADES } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import { repairableWindow, updateRepair } from './BarricadeSystem';
import { nearestClosedDoor, tryBuyDoor } from './DoorSystem';
import { dungeonOffer, tapDungeon } from './DungeonSystem';
import { isPlayerAlive } from './HealthSystem';
import { handOffer, tapHand } from './HandSystem';
import { itemInReach, pickUpItem } from './ItemSystem';
import { isPortalBuyable, nearestClosedPortal, tryBuyPortal } from './PortalSystem';
import { nearestMerchant } from './ShopSystem';
import { caseInReach, tapCase, updateSwapConfirm } from './WeaponCaseSystem';
import type { SimContext } from './SimContext';

/**
 * The contextual action chip (spec 01 §2.4): per player, pick the nearest
 * thing to interact with — a merchant's shop to open or close (tap), a
 * weapon case to buy from (tap, spec 04 §3), a window to repair (taps), a
 * closed door or a closed portal to buy (tap) and, last of all, a special
 * item on the floor to pick up (tap, spec 05 §3) — publish it in the state
 * for the HUD, and act on the command. Merchant
 * spots keep more than 3 tiles from windows, doors and portals, so a
 * merchant in range never hides one of them.
 */
export function updateInteractions(ctx: SimContext, dt: number): void {
  const { state, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const cmd = commands[i];
    if (!p) continue;
    if (p.repairRound !== state.wave.round) {
      p.repairRound = state.wave.round;
      p.repairPoints = 0;
    }
    if (!isPlayerAlive(p)) {
      clearContext(p);
      continue;
    }

    const merchant = nearestMerchant(state, p);
    if (merchant >= 0) {
      p.contextAction = 'merchant';
      p.contextTarget = merchant;
      updateRepair(ctx, p, undefined, -1, dt);
      updateSwapConfirm(p, -1, dt);
      if (cmd?.actionPressed) p.shopMerchant = p.shopMerchant === merchant ? -1 : merchant;
      continue;
    }

    // Weapon cases also keep 3 tiles from windows, doors and merchant spots (validate-map).
    const weaponCase = caseInReach(ctx.map, state, p);
    updateSwapConfirm(p, weaponCase, dt);
    if (weaponCase >= 0) {
      p.contextAction = 'weaponCase';
      p.contextTarget = weaponCase;
      updateRepair(ctx, p, undefined, -1, dt);
      if (cmd?.actionPressed) tapCase(ctx, p, weaponCase);
      continue;
    }

    // The dungeon (spec 09 §4.1, §6): a chest, a keyed door, the challenge's warning or the way down.
    if (rules(ctx.state).dungeon) {
      const offer = dungeonOffer(ctx.map, state, p);
      if (offer) {
        p.contextAction = 'dungeon';
        p.contextTarget = offer.target;
        updateRepair(ctx, p, undefined, -1, dt);
        if (cmd?.actionPressed) tapDungeon(ctx, p, offer);
        continue;
      }
    }

    const window = repairableWindow(ctx, p);
    // The dungeon's doors shut and open by themselves (spec 09 §4): nothing to buy.
    const buying = rules(ctx.state).payDoors;
    const { door, distSq: doorDistSq } = buying ? nearestClosedDoor(ctx, p) : { door: -1, distSq: Infinity };
    const { portal, distSq: portalDistSq } = buying ? nearestClosedPortal(ctx, p) : { portal: -1, distSq: Infinity };
    const usePortal = portal >= 0 && (door < 0 || portalDistSq < doorDistSq);
    const buyDistSq = usePortal ? portalDistSq : doorDistSq;
    const buy = usePortal || door >= 0;
    const useBuy = buy && (window < 0 || buyDistSq < windowDistSq(ctx, p, window));

    if (useBuy && usePortal) {
      p.contextAction = 'portal';
      p.contextTarget = portal;
      updateRepair(ctx, p, undefined, -1, dt);
      if (cmd?.actionPressed && isPortalBuyable(ctx.map, ctx.state, portal)) tryBuyPortal(ctx, p, portal);
      // A second entrance not yet buyable.
      else if (cmd?.actionPressed) ctx.events.emit('action:denied', { playerId: p.id });
    } else if (useBuy) {
      p.contextAction = 'door';
      p.contextTarget = door;
      updateRepair(ctx, p, undefined, -1, dt);
      if (cmd?.actionPressed) tryBuyDoor(ctx, p, door);
    } else if (window >= 0) {
      p.contextAction = 'repair';
      p.contextTarget = window;
      updateRepair(ctx, p, cmd, window, dt);
    } else {
      // Then the Demon's Hand (spec 06 §3.3) and, last of all, a special item on the floor (spec 05 §3);
      // hand and item spots keep clear of everything above and of each other.
      const hand = handOffer(ctx.map, state, p);
      const item = hand ? -1 : itemInReach(state, p);
      clearContext(p);
      updateRepair(ctx, p, undefined, -1, dt);
      if (hand) {
        p.contextAction = 'hand';
        p.contextTarget = state.hand.spot;
        if (cmd?.actionPressed) tapHand(ctx, p);
      } else if (item >= 0) {
        p.contextAction = 'pickup';
        p.contextTarget = item;
        if (cmd?.actionPressed) pickUpItem(ctx, p, item);
      }
    }
  }
}

function clearContext(p: PlayerState): void {
  p.contextAction = 'none';
  p.contextTarget = -1;
  p.repairing = false;
}

function windowDistSq(ctx: SimContext, p: PlayerState, index: number): number {
  const w = ctx.map.windows[index];
  if (!w) return BARRICADES.repairRange * BARRICADES.repairRange;
  return (w.center.x - p.x) ** 2 + (w.center.y - p.y) ** 2;
}
