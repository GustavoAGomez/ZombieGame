import { BARRICADES } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import type { InputCommand } from '../../core/InputCommand';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';

/**
 * Barricades (spec 01 §4.6). Zombies tear planks in ZombieSystem; here the
 * player repairs them: within 40 px of a window that is not full, holding
 * the contextual chip puts back one plank every 0.6 s for +10 points, up
 * to 500 repair points per round. Repairing keeps working past the limit,
 * just without points, and works while a zombie is tearing the same window.
 */
export function updateBarricades(ctx: SimContext, dt: number): void {
  const { state, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const cmd = commands[i];
    if (!p) continue;
    if (p.repairRound !== state.wave.round) {
      p.repairRound = state.wave.round;
      p.repairPoints = 0;
    }
    const window = isPlayerAlive(p) ? repairableWindow(ctx, p) : -1;
    p.contextAction = window >= 0 ? 'repair' : 'none';
    p.contextTarget = window;
    updateRepair(ctx, p, cmd, window, dt);
  }
}

/** Nearest window within repair range that is missing planks, or -1. */
export function repairableWindow(ctx: SimContext, p: PlayerState): number {
  const { map, state } = ctx;
  let best = -1;
  let bestDistSq = BARRICADES.repairRange * BARRICADES.repairRange;
  for (let i = 0; i < map.windows.length; i++) {
    const w = map.windows[i];
    if (!w || (state.windowPlanks[i] ?? 0) >= w.planks) continue;
    const dx = w.center.x - p.x;
    const dy = w.center.y - p.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= bestDistSq) {
      best = i;
      bestDistSq = distSq;
    }
  }
  return best;
}

/** Points the next plank would give this player (0 once the round's limit is reached). */
export function repairPointsAvailable(p: PlayerState): number {
  return Math.max(0, Math.min(BARRICADES.pointsPerPlank, BARRICADES.maxRepairPointsPerRound - p.repairPoints));
}

function updateRepair(ctx: SimContext, p: PlayerState, cmd: InputCommand | undefined, window: number, dt: number): void {
  const w = ctx.map.windows[window];
  if (!cmd?.action || !w) {
    p.repairing = false;
    p.repairTimer = 0;
    return;
  }
  p.repairing = true;
  p.facing = Math.atan2(w.center.y - p.y, w.center.x - p.x);
  p.repairTimer += dt;
  if (p.repairTimer < BARRICADES.repairInterval) return;
  p.repairTimer -= BARRICADES.repairInterval;

  const planks = ctx.state.windowPlanks;
  planks[window] = Math.min(w.planks, (planks[window] ?? 0) + 1);
  const gained = repairPointsAvailable(p);
  if (gained > 0) {
    p.points += gained;
    p.repairPoints += gained;
    ctx.events.emit('points:gained', { playerId: p.id, amount: gained, reason: 'repair' });
  }
}
