import { BOOSTS, type BoostKind } from '../../config/balance';
import type { GameState, PlayerState } from '../../core/GameState';
import { random } from '../../core/Rng';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';

/**
 * Temporary boosts (spec 03 §5). A player has one slot: a bought boost is
 * stored there until its button is tapped, then runs for BOOSTS.duration
 * seconds of simulated time (so the pause freezes it). Buying another one
 * replaces the stored one or ends the running one at once. Dying loses both.
 */
export function updateBoosts(ctx: SimContext, dt: number): void {
  const { state, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    if (!p) continue;
    if (!isPlayerAlive(p)) {
      clearBoosts(p);
      continue;
    }
    if (commands[i]?.boost && p.boostStored) {
      p.boostActive = p.boostStored;
      p.boostStored = null;
      p.boostTimer = BOOSTS.duration;
    }
    if (p.boostActive) {
      p.boostTimer -= dt;
      if (p.boostTimer <= 0) {
        p.boostActive = null;
        p.boostTimer = 0;
      }
    }
  }
}

/** Puts a bought boost in the slot: whatever was stored or running goes away. */
export function storeBoost(p: PlayerState, kind: BoostKind): void {
  p.boostStored = kind;
  p.boostActive = null;
  p.boostTimer = 0;
}

function clearBoosts(p: PlayerState): void {
  p.boostStored = null;
  p.boostActive = null;
  p.boostTimer = 0;
}

/** Walking speed multiplier of the running boost. */
export function speedFactor(p: PlayerState): number {
  return p.boostActive === 'speed' ? BOOSTS.speedFactor : 1;
}

/** Damage multiplier of the running boost, for every weapon and the knife. */
export function damageFactor(p: PlayerState): number {
  return p.boostActive === 'double_damage' ? BOOSTS.damageFactor : 1;
}

/** The boost a merchant sells this visit, drawn with the match's seeded RNG. */
export function drawRoundBoost(state: GameState): BoostKind {
  return BOOSTS.kinds[Math.floor(random(state) * BOOSTS.kinds.length)] ?? BOOSTS.kinds[0];
}
