import { BARRICADES } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import { repairableWindow, updateRepair } from './BarricadeSystem';
import { nearestClosedDoor, tryBuyDoor } from './DoorSystem';
import { isPlayerAlive } from './HealthSystem';
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

    const window = repairableWindow(ctx, p);
    const { door, distSq: doorDistSq } = nearestClosedDoor(ctx, p);
    const { portal, distSq: portalDistSq } = nearestClosedPortal(ctx, p);
    const usePortal = portal >= 0 && (door < 0 || portalDistSq < doorDistSq);
    const buyDistSq = usePortal ? portalDistSq : doorDistSq;
    const buy = usePortal || door >= 0;
    const useBuy = buy && (window < 0 || buyDistSq < windowDistSq(ctx, p, window));

    if (useBuy && usePortal) {
      p.contextAction = 'portal';
      p.contextTarget = portal;
      updateRepair(ctx, p, undefined, -1, dt);
      if (cmd?.actionPressed && isPortalBuyable(ctx.map, ctx.state, portal)) tryBuyPortal(ctx, p, portal);
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
      // Last of all, a special item on the floor (spec 05 §3); item spots keep clear of everything above.
      const item = itemInReach(state, p);
      clearContext(p);
      updateRepair(ctx, p, undefined, -1, dt);
      if (item >= 0) {
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
