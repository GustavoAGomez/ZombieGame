import { BARRICADES } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import type { InputCommand } from '../../core/InputCommand';
import { awardPoints } from './PointsSystem';
import type { SimContext } from './SimContext';
import { crowdsWindow } from './ZombieSystem';

/**
 * Barricades (spec 01 §4.6). Zombies tear planks in ZombieSystem; here the
 * player repairs them: within 40 px of a window that is not full, each tap on
 * the contextual chip puts back one plank for +10 points: at most one every
 * repairTapCooldown seconds, or every repairTapCooldownUnderAttack seconds
 * (longer than a zombie takes to tear one) while zombies are at it, up
 * to 500 repair points per round. Repairing keeps working past the limit,
 * just without points, and works while a zombie is tearing the same window.
 * InteractionSystem decides when a window is the chip's target.
 */

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

/** Zombies are at window `index`: tearing it or waiting their turn close by. */
export function windowUnderAttack(ctx: SimContext, index: number): boolean {
  return ctx.state.zombies.some((z) => crowdsWindow(ctx.map, z, index));
}

/** Points the next plank would give this player (0 once the round's limit is reached). */
export function repairPointsAvailable(p: PlayerState): number {
  return Math.max(0, Math.min(BARRICADES.pointsPerPlank, BARRICADES.maxRepairPointsPerRound - p.repairPoints));
}

/**
 * Tap-to-repair on `window` (-1 when there is none in range): every tap of
 * the chip puts back one plank, at most one every repairTapCooldown seconds;
 * with zombies at the window, every repairTapCooldownUnderAttack seconds.
 * Once the last one has gone (climbed in, say), the long wait is cut short.
 */
export function updateRepair(ctx: SimContext, p: PlayerState, cmd: InputCommand | undefined, window: number, dt: number): void {
  if (p.repairCooldown > 0) p.repairCooldown = Math.max(0, p.repairCooldown - dt);
  const w = ctx.map.windows[window];
  const underAttack = w !== undefined && windowUnderAttack(ctx, window);
  // At a window with no zombie at it, the long wait is over. (With none in range, a full one say, it runs on.)
  if (w && !underAttack) p.repairCooldown = Math.min(p.repairCooldown, BARRICADES.repairTapCooldown);
  p.repairing = p.repairCooldown > 0;
  if (!w || !cmd?.actionPressed || p.repairCooldown > 0) return;

  const planks = ctx.state.windowPlanks;
  planks[window] = Math.min(w.planks, (planks[window] ?? 0) + 1);
  p.repairCooldown = underAttack ? BARRICADES.repairTapCooldownUnderAttack : BARRICADES.repairTapCooldown;
  p.repairing = true;
  p.facing = Math.atan2(w.center.y - p.y, w.center.x - p.x);
  ctx.events.emit('barricade:repaired', { playerId: p.id, x: w.center.x, y: w.center.y });
  const gained = repairPointsAvailable(p);
  if (gained > 0) {
    p.repairPoints += gained;
    // The "+10" floats up from the window itself, not from the HUD.
    awardPoints(ctx, p.id, gained, 'repair', w.center.x, w.center.y);
  }
}
