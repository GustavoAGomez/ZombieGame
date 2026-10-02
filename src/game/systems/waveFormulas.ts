import { WAVES, ZOMBIE_MIX, ZOMBIES, type ZombieKind } from '../../config/balance';

/** Pure round formulas from spec 01 §4.4 and §4.8. */

/** HP in damage units: 3, plus hpPerExtraHit every hpRoundsPerExtraHit rounds survived (now 1 every 3 rounds: 3, 3, 3, 4, 4, 4, 5…). */
export function zombieHp(round: number): number {
  const r = Math.max(1, Math.floor(round));
  return ZOMBIES.hpBase + Math.floor((r - 1) / ZOMBIES.hpRoundsPerExtraHit) * ZOMBIES.hpPerExtraHit;
}

export interface ZombieMix {
  walker: number;
  runner: number;
  sprinter: number;
}

/**
 * Share of each type. Runners ramp from 20 % (round 3) to 50 % (round 5)
 * and sit at 60 % from round 6. Sprinters appear at round 8 with 10 %,
 * +10 % per round up to 30 %, taking their share from walkers.
 */
export function zombieMix(round: number): ZombieMix {
  const r = Math.max(1, Math.floor(round));
  const m = ZOMBIE_MIX;
  let runner = 0;
  if (r >= m.runnerLateFromRound) runner = m.runnerLateShare;
  else if (r >= m.runnerRampStartRound) {
    const t = (r - m.runnerRampStartRound) / (m.runnerRampEndRound - m.runnerRampStartRound);
    runner = m.runnerRampStartShare + (m.runnerRampEndShare - m.runnerRampStartShare) * Math.min(1, t);
  }
  let sprinter = 0;
  if (r >= m.sprinterFromRound) {
    sprinter = Math.min(m.sprinterMaxShare, m.sprinterStartShare + m.sprinterSharePerRound * (r - m.sprinterFromRound));
  }
  const walker = Math.max(0, 1 - runner - sprinter);
  return { walker, runner, sprinter };
}

/** Picks a type for round `round` from a uniform random number in [0, 1). */
export function pickZombieKind(round: number, roll: number): ZombieKind {
  const mix = zombieMix(round);
  if (roll < mix.sprinter) return 'sprinter';
  if (roll < mix.sprinter + mix.runner) return 'runner';
  return 'walker';
}

/** Zombies in round r: 6 + 4 × (r − 1), capped at 80. */
export function zombiesInRound(round: number): number {
  const r = Math.max(1, Math.floor(round));
  return Math.min(WAVES.zombiesMax, WAVES.zombiesBase + WAVES.zombiesPerRound * (r - 1));
}

/** Seconds between spawns: max(0.4, 2.0 − 0.1 × (r − 1)). */
export function spawnInterval(round: number): number {
  const r = Math.max(1, Math.floor(round));
  return Math.max(WAVES.spawnIntervalMin, WAVES.spawnIntervalBase - WAVES.spawnIntervalPerRound * (r - 1));
}
