import { describe, expect, it, vi } from 'vitest';
import { WAVES } from '../../config/balance';
import { createGameState } from '../../core/GameState';
import { createMansionContext, createTestContext, player } from '../../test/fixtures';
import { damageBoss, isBossHittable } from './BossCombat';
import { damageZombie, isZombieAlive } from './Combat';
import { awardPoints, spendMoney } from './PointsSystem';
import type { SimContext } from './SimContext';
import { stepSimulation } from './Simulation';
import { roundsSurvived, startRound } from './WaveSystem';
import { roundZombies, spawnInterval, zombiesInRound } from './waveFormulas';

const DT = 1 / 60;

/** Turns the round flow on, as in a real match. */
function withWaves(ctx: SimContext, round = 1): SimContext {
  ctx.state.wave.auto = true;
  startRound(ctx.state, round);
  return ctx;
}

/** Kills every zombie as soon as it appears, and every boss as soon as it can be hurt (the player does not die and earns the points). */
function killAll(ctx: SimContext): void {
  for (const z of ctx.state.zombies) if (isZombieAlive(z)) damageZombie(ctx, z, 1e9, 0);
  for (const b of ctx.state.bosses) if (isBossHittable(b)) damageBoss(ctx, b, 1e9, 0);
}

describe('WaveSystem', () => {
  it('starts a match on round 1 with its zombies, the first after the banner', () => {
    const state = createGameState(createTestContext().map);
    expect(state.wave).toMatchObject({ round: 1, phase: 'active', toSpawn: zombiesInRound(1), spawnTimer: WAVES.bannerDuration, auto: true });
    expect(createGameState(createTestContext().map, { startRound: 4 }).wave.toSpawn).toBe(zombiesInRound(4));
  });

  it('waits for the round banner before the first spawn', () => {
    const ctx = withWaves(createTestContext());
    const spawned = () => ctx.state.zombies.filter((z) => z.active).length;
    for (let t = 0; t < Math.floor(WAVES.bannerDuration * 60) - 2; t++) stepSimulation(ctx, DT);
    expect(spawned()).toBe(0);
    for (let t = 0; t < 4; t++) stepSimulation(ctx, DT);
    expect(spawned()).toBe(1);
  });

  it('rests 8 s once every zombie of the round is dead, then starts the next round', () => {
    const ctx = withWaves(createTestContext());
    const cleared = vi.fn();
    ctx.events.on('round:cleared', cleared);
    let guard = 0;
    while (ctx.state.wave.phase === 'active' && guard++ < 60 * 60) {
      stepSimulation(ctx, DT);
      killAll(ctx);
    }
    expect(ctx.state.wave).toMatchObject({ round: 1, phase: 'rest', toSpawn: 0 });
    expect(cleared).toHaveBeenCalledWith({ round: 1 });
    for (let t = 0; t < WAVES.restTime * 60 - 2; t++) stepSimulation(ctx, DT);
    expect(ctx.state.wave.phase).toBe('rest');
    for (let t = 0; t < 4; t++) stepSimulation(ctx, DT);
    expect(ctx.state.wave).toMatchObject({ round: 2, phase: 'active', toSpawn: zombiesInRound(2) });
  });

  it('can be played from round 1 to round 10, each round with the zombies of its formula (half of them, and its boss, in round 6)', () => {
    const ctx = withWaves(createMansionContext(5));
    const spawnedIn = new Map<number, number>();
    const seen = new Set<object>();
    let guard = 0;
    while (ctx.state.wave.round < 10 && guard++ < 60 * 60 * 30) {
      player(ctx).hp = player(ctx).maxHp;
      stepSimulation(ctx, DT);
      for (const z of ctx.state.zombies) {
        if (isZombieAlive(z) && !seen.has(z)) {
          seen.add(z);
          spawnedIn.set(ctx.state.wave.round, (spawnedIn.get(ctx.state.wave.round) ?? 0) + 1);
        }
      }
      killAll(ctx);
      for (const z of ctx.state.zombies) if (!z.active) seen.delete(z);
    }
    expect(ctx.state.wave.round).toBe(10);
    for (let r = 1; r < 10; r++) expect(spawnedIn.get(r), `round ${r}`).toBe(roundZombies(r));
    expect(roundZombies(6)).toBe(Math.ceil(zombiesInRound(6) / 2));
    expect(ctx.state.bossKills).toBe(1);
    expect(player(ctx).score).toBeGreaterThan(0);
  });

  it('spawns at the round interval', () => {
    const ctx = withWaves(createTestContext(), 5);
    ctx.state.wave.spawnTimer = 0;
    const times: number[] = [];
    for (let t = 0; t < 60 * 6; t++) {
      const before = ctx.state.wave.toSpawn;
      stepSimulation(ctx, DT);
      if (ctx.state.wave.toSpawn < before) times.push(ctx.state.time);
    }
    expect(times.length).toBeGreaterThanOrEqual(3);
    expect((times[1] ?? 0) - (times[0] ?? 0)).toBeCloseTo(spawnInterval(5), 1);
  });

  it('ends the match once the player dies, only once', () => {
    const ctx = withWaves(createTestContext(), 3);
    const over = vi.fn();
    ctx.events.on('game:over', over);
    player(ctx).score = 1234;
    player(ctx).hp = 0;
    stepSimulation(ctx, DT);
    stepSimulation(ctx, DT);
    expect(over).toHaveBeenCalledTimes(1);
    expect(over).toHaveBeenCalledWith({ round: 3, score: 1234 });
    expect(ctx.state.wave.phase).toBe('over');
    expect(roundsSurvived(ctx.state)).toBe(3);
    runForAWhile(ctx);
    expect(ctx.state.zombies.some((z) => z.active)).toBe(false);
  });

  it('stays on the same round when the flow is off (system tests)', () => {
    const ctx = createTestContext(1, 0);
    for (let t = 0; t < 60 * 20; t++) stepSimulation(ctx, DT);
    expect(ctx.state.wave).toMatchObject({ round: 1, phase: 'active' });
  });
});

describe('score', () => {
  it('counts every point earned, also the ones spent', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    awardPoints(ctx, p.id, 100, 'kill');
    spendMoney(p, 300);
    expect(p.money).toBe(500 + 100 - 300);
    expect(p.score).toBe(100);
  });
});

function runForAWhile(ctx: SimContext): void {
  for (let t = 0; t < 60 * 10; t++) stepSimulation(ctx, DT);
}
