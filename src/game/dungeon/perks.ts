/**
 * The upgrades that act on a blow (spec 09 §7.2): Verdugo's critical hits
 * and Incendiarias' fire. Called where bullets and the knife land, with the
 * player's stats; neutral stats roll nothing, so Survival's dice never move.
 */
import type { RngState } from '../../core/Rng';
import { random } from '../../core/Rng';
import type { PlayerStats } from './stats';

/** Verdugo: the blow's damage, × its multiplier now and then. */
export function critDamage(state: RngState, perks: Readonly<PlayerStats>, amount: number): number {
  if (!perks.crit || random(state) >= perks.crit.chance) return amount;
  return amount * perks.crit.multiplier;
}

/** Incendiarias: whether this blow sets its target alight. */
export function rollIgnite(state: RngState, perks: Readonly<PlayerStats>): boolean {
  return perks.igniteChance > 0 && random(state) < perks.igniteChance;
}
