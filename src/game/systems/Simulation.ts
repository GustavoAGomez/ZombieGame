import { updateMovement } from './MovementSystem';
import type { SimContext } from './SimContext';

/**
 * Advances the match by one fixed step. The order of systems is the order
 * of the game rules; a future server would call exactly this.
 */
export function stepSimulation(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const p of state.players) {
    p.prevX = p.x;
    p.prevY = p.y;
  }
  updateMovement(ctx, dt);
  state.tick++;
  state.time += dt;
}
