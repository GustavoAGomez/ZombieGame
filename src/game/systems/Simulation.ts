import { updateBullets } from './BulletSystem';
import { updateBlood } from './Combat';
import { updateHealth } from './HealthSystem';
import { updateInteractions } from './InteractionSystem';
import { blockPlayersByMerchants, updateMerchants } from './MerchantSystem';
import { updateMovement } from './MovementSystem';
import { updatePickups } from './PickupSystem';
import { updatePlayerPortals, updateZombiePortals } from './PortalSystem';
import type { SimContext } from './SimContext';
import { updateSpawns } from './SpawnSystem';
import { updateSpecial } from './SpecialSystem';
import { updateWaves } from './WaveSystem';
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
  blockPlayersByMerchants(ctx);
  updatePlayerPortals(ctx);
  updateWeapons(ctx, dt);
  updateInteractions(ctx, dt);
  updateBullets(ctx, dt);
  updateSpawns(ctx, dt);
  updateZombies(ctx, dt);
  updateZombiePortals(ctx);
  updatePickups(ctx, dt);
  updateHealth(ctx, dt);
  updateBlood(ctx, dt);
  updateWaves(ctx, dt);
  // After the waves: a merchant moves on the very tick its round starts.
  updateMerchants(ctx);
  state.tick++;
  state.time += dt;
}
