import { updateBullets } from './BulletSystem';
import { updateDummies } from './DummySystem';
import { updateMovement } from './MovementSystem';
import type { SimContext } from './SimContext';
import { updateSpecial } from './SpecialSystem';
import { updateWeapons } from './WeaponSystem';

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
  updateSpecial(ctx, dt);
  updateMovement(ctx, dt);
  updateWeapons(ctx, dt);
  updateBullets(ctx, dt);
  updateDummies(ctx, dt);
  state.tick++;
  state.time += dt;
}
