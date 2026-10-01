import { BARRICADES } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import { repairableWindow, updateRepair } from './BarricadeSystem';
import { nearestClosedDoor, tryBuyDoor } from './DoorSystem';
import { isPlayerAlive } from './HealthSystem';
import { isPortalBuyable, nearestClosedPortal, tryBuyPortal } from './PortalSystem';
import type { SimContext } from './SimContext';

/**
 * The contextual action chip (spec 01 §2.4): per player, pick the nearest
 * thing to interact with — a window to repair (taps), a closed door or a
 * closed portal to buy (tap) — publish it in the state for the HUD, and act
 * on the command.
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
      clearContext(p);
      updateRepair(ctx, p, undefined, -1, dt);
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
