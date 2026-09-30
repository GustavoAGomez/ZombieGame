import { updateBarricades } from './BarricadeSystem';
import { updateBullets } from './BulletSystem';
import { updateBlood } from './Combat';
import { updateHealth } from './HealthSystem';
import { updateMovement } from './MovementSystem';
import { updatePickups } from './PickupSystem';
import type { SimContext } from './SimContext';
import { updateSpawns } from './SpawnSystem';
import { updateSpecial } from './SpecialSystem';
import { updateWeapons } from './WeaponSystem';
import { updateZombies } from './ZombieSystem';

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
  updateBarricades(ctx, dt);
  updateBullets(ctx, dt);
  updateSpawns(ctx, dt);
  updateZombies(ctx, dt);
  updatePickups(ctx, dt);
  updateHealth(ctx, dt);
  updateBlood(ctx, dt);
  state.tick++;
  state.time += dt;
}
