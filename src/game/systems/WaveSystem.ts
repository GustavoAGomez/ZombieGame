import { WAVES } from '../../config/balance';
import type { GameState } from '../../core/GameState';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { countAlive } from './SpawnSystem';
import { zombiesInRound } from './waveFormulas';

/**
 * Round flow (spec 01 §4.8–4.9). A round spawns zombiesInRound(r) zombies,
 * the first one once the round banner has shown; when they are all dead
 * there are WAVES.restTime seconds of rest and the next round starts. When
 * every player is dead the match is over.
 */
export function updateWaves(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  const { wave } = state;
  if (wave.phase === 'over') return;
  if (!state.players.some(isPlayerAlive)) {
    wave.phase = 'over';
    wave.toSpawn = 0;
    ctx.events.emit('game:over', { round: wave.round, score: state.players[0]?.score ?? 0 });
    return;
  }
  if (!wave.auto) return;
  if (wave.phase === 'active') {
    if (wave.toSpawn === 0 && countAlive(ctx) === 0) {
      wave.phase = 'rest';
      wave.restTimer = WAVES.restTime;
      ctx.events.emit('round:cleared', { round: wave.round });
    }
    return;
  }
  wave.restTimer -= dt;
  if (wave.restTimer <= 0) startRound(state, wave.round + 1);
}

/** Starts round `round`: its zombie count, and the first spawn after the banner. */
export function startRound(state: GameState, round: number): void {
  const { wave } = state;
  wave.round = round;
  wave.phase = 'active';
  wave.toSpawn = zombiesInRound(round);
  wave.spawnTimer = WAVES.bannerDuration;
  wave.restTimer = 0;
}

/** "HAS SOBREVIVIDO N RONDAS": the round reached, as in Black Ops. */
export function roundsSurvived(state: GameState): number {
  return state.wave.round;
}
