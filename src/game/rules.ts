/**
 * The rules that differ between the two games (spec 09 §1), asked for here
 * and nowhere else: which of Survival's systems run, and the numbers the
 * shared systems read (a zombie's scratch, a medkit, the ammo that never
 * runs out). Survival's values are the ones of balance.ts, unchanged.
 */
import { PICKUPS, ZOMBIES } from '../config/balance';
import { DUNGEON, type GameMode } from '../config/dungeon';
import type { WeaponId } from '../config/weapons';

export interface ModeRules {
  /** Survival's rounds and the spawns at its windows and open spawns. */
  waves: boolean;
  /** Survival's paid doors and portals: the rooms that are bought. */
  payDoors: boolean;
  /** Survival's wizards, who appear by round and teleport between rooms. */
  merchants: boolean;
  /** The dungeon's rooms: doors that shut, waves, the plan (DungeonSystem). */
  dungeon: boolean;
  /** A zombie's scratch (§5.1). */
  zombieDamage: number;
  /** What a medkit heals (§5.1). */
  medkitHeal: number;
  /** Weapons whose reserve never runs out (§5.1); the magazine reloads as always. */
  infiniteReserve: readonly WeaponId[];
}

const SURVIVAL: ModeRules = {
  waves: true,
  payDoors: true,
  merchants: true,
  dungeon: false,
  zombieDamage: ZOMBIES.attackDamage,
  medkitHeal: PICKUPS.healthAmount,
  infiniteReserve: [],
};

const DUNGEON_RULES: ModeRules = {
  waves: false,
  payDoors: false,
  merchants: false,
  dungeon: true,
  zombieDamage: DUNGEON.combat.zombieDamage,
  medkitHeal: DUNGEON.combat.medkitHeal,
  infiniteReserve: DUNGEON.combat.infiniteReserve,
};

export function rulesOf(mode: GameMode): ModeRules {
  return mode === 'dungeon' ? DUNGEON_RULES : SURVIVAL;
}

/** The rules of a match, from its state. */
export function rules(state: { mode: GameMode }): ModeRules {
  return rulesOf(state.mode);
}
