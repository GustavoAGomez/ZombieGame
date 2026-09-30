import { describe, expect, it } from 'vitest';
import { WAVES } from '../../config/balance';
import { createTestContext, runTicks } from '../../test/fixtures';
import { countAlive, pickSpawn, spawnWeight } from './SpawnSystem';
import { stepSimulation } from './Simulation';
import { spawnInterval, zombieHp } from './waveFormulas';

describe('SpawnSystem', () => {
  it('only uses spawns of unlocked zones', () => {
    const ctx = createTestContext();
    const used = new Set<string>();
    for (let i = 0; i < 300; i++) {
      const s = pickSpawn(ctx);
      used.add(ctx.map.zombieSpawns[s]!.window);
    }
    expect([...used].sort()).toEqual(['W1', 'W2', 'W3']);

    ctx.state.zonesUnlocked[1] = true;
    for (let i = 0; i < 500; i++) used.add(ctx.map.zombieSpawns[pickSpawn(ctx)]!.window);
    expect(used.has('W4')).toBe(true);
    expect(used.has('W6')).toBe(false);
  });

  it('weights closer spawns higher', () => {
    const ctx = createTestContext();
    const p = ctx.state.players[0]!;
    const w2 = ctx.map.windows[1]!; // left window
    p.x = w2.interior.x;
    p.y = w2.interior.y;
    const near = ctx.map.zombieSpawns.findIndex((s) => s.window === 'W2');
    const far = ctx.map.zombieSpawns.findIndex((s) => s.window === 'W3');
    expect(spawnWeight(ctx, near)).toBeGreaterThan(spawnWeight(ctx, far));
  });

  it('spawns one zombie per interval with the round hp', () => {
    const ctx = createTestContext(1, -1);
    ctx.state.wave.round = 3;
    stepSimulation(ctx, 1 / 60);
    expect(countAlive(ctx)).toBe(1);
    expect(ctx.state.zombies[0]!.maxHp).toBe(zombieHp(3));
    runTicks(ctx, Math.round(spawnInterval(3) * 60) - 2, stepSimulation);
    expect(countAlive(ctx)).toBe(1);
    runTicks(ctx, 3, stepSimulation);
    expect(countAlive(ctx)).toBe(2);
  });

  it('stops at 20 alive and at the round total', () => {
    const ctx = createTestContext(1, -1);
    ctx.state.wave.round = 30; // fastest interval
    ctx.state.players[0]!.hp = 1e9; // survive the crowd
    runTicks(ctx, 60 * 30, stepSimulation);
    expect(countAlive(ctx)).toBe(WAVES.maxAlive);

    const limited = createTestContext(1, 3);
    runTicks(limited, 60 * 20, stepSimulation);
    expect(countAlive(limited)).toBe(3);
    expect(limited.state.wave.toSpawn).toBe(0);
  });
});
