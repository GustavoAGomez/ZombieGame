import { BOSS, WAVES } from '../../config/balance';
import { bossesForRound } from '../../config/bosses';
import type { GameState } from '../../core/GameState';
import { isBossAlive } from './BossCombat';
import { freeBossSlot, startBossEntry } from './BossSystem';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { countAlive, freeZombieSlot, pickSpawn, spawnZombie } from './SpawnSystem';
import { bossDelayOf, roundZombies } from './waveFormulas';

/**
 * Round flow (spec 01 §4.8–4.9). A round spawns roundZombies(r) zombies,
 * the first one once the round banner has shown; when they are all dead
 * there are WAVES.restTime seconds of rest and the next round starts. When
 * every player is dead the match is over.
 *
 * A boss round (spec 07 §6) spawns half its zombies, and its bosses
 * (bosses.ts) come out BOSS.entryDelay s after the banner. It ends only
 * when the bosses and every zombie are dead: while a boss lives on after
 * the round's zombies are over, one more zombie comes every
 * BOSS.dripInterval s (fewer than BOSS.dripMaxAlive alive, BOSS.dripMax at
 * most). Any boss alive holds the round, one called up from the debug
 * panel too.
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
    if (wave.bossDelay >= 0) {
      wave.bossDelay -= dt;
      if (wave.bossDelay <= 0) {
        wave.bossDelay = -1;
        bringRoundBosses(ctx);
      }
    }
    const bossAlive = state.bosses.some(isBossAlive);
    if (bossAlive && wave.toSpawn === 0) dripZombies(ctx, dt);
    if (wave.toSpawn === 0 && countAlive(ctx) === 0 && !bossAlive && wave.bossDelay < 0) {
      wave.phase = 'rest';
      wave.restTimer = WAVES.restTime;
      ctx.events.emit('round:cleared', { round: wave.round });
    }
    return;
  }
  wave.restTimer -= dt;
  if (wave.restTimer <= 0) startRound(state, wave.round + 1);
}

/** Starts round `round`: its zombie count, its bosses' delay, and the first spawn after the banner. */
export function startRound(state: GameState, round: number): void {
  const { wave } = state;
  wave.round = round;
  wave.phase = 'active';
  wave.toSpawn = roundZombies(round);
  wave.spawnTimer = WAVES.bannerDuration;
  wave.restTimer = 0;
  wave.bossDelay = bossDelayOf(round);
  wave.dripping = false;
  wave.dripTimer = BOSS.dripInterval;
  wave.dripLeft = BOSS.dripMax;
}

/** The round's bosses come out of the floor, each in a free slot (spec 07 §6). */
function bringRoundBosses(ctx: SimContext): void {
  for (const b of bossesForRound(ctx.state.wave.round)) {
    const slot = freeBossSlot(ctx);
    if (slot < 0) return;
    startBossEntry(ctx, slot, b.boss, b.variant, b.hpFactor);
  }
}

/**
 * A boss alive and the round's zombies over: once none is left, one more
 * every BOSS.dripInterval s while fewer than BOSS.dripMaxAlive are alive,
 * BOSS.dripMax at most. It keeps the tension up and gives ammo.
 */
function dripZombies(ctx: SimContext, dt: number): void {
  const { wave } = ctx.state;
  if (!wave.dripping) {
    if (countAlive(ctx) > 0) return;
    wave.dripping = true;
    wave.dripTimer = BOSS.dripInterval;
  }
  wave.dripTimer -= dt;
  if (wave.dripTimer > 0) return;
  wave.dripTimer += BOSS.dripInterval;
  if (wave.dripLeft <= 0 || countAlive(ctx) >= BOSS.dripMaxAlive) return;
  const slot = freeZombieSlot(ctx);
  const spawn = pickSpawn(ctx);
  if (!slot || spawn < 0) return;
  spawnZombie(ctx, slot, spawn);
  wave.dripLeft--;
}

/** "HAS SOBREVIVIDO N RONDAS": the round reached, as in Black Ops. */
export function roundsSurvived(state: GameState): number {
  return state.wave.round;
}
