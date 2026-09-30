import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../config/balance';
import { createTestContext, player, runTicks } from '../../test/fixtures';
import { damagePlayer } from './HealthSystem';
import { stepSimulation } from './Simulation';

describe('HealthSystem', () => {
  it('regenerates 40 HP/s after 3 s without damage, up to the maximum', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    damagePlayer(ctx, p, 60, p.x + 10, p.y);
    expect(p.hp).toBe(40);
    runTicks(ctx, PLAYER.regenDelay * 60 - 1, stepSimulation);
    expect(p.hp).toBe(40);
    runTicks(ctx, 61, stepSimulation);
    // One second of regeneration, give or take a tick.
    expect(Math.abs(p.hp - (40 + PLAYER.regenPerSecond))).toBeLessThanOrEqual(1);
    runTicks(ctx, 120, stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp);
  });

  it('restarts the regeneration delay on every hit', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    damagePlayer(ctx, p, 50, p.x + 10, p.y);
    runTicks(ctx, 120, stepSimulation);
    damagePlayer(ctx, p, 10, p.x + 10, p.y);
    runTicks(ctx, 120, stepSimulation);
    expect(p.hp).toBe(40);
  });

  it('does not regenerate a dead player', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    damagePlayer(ctx, p, 200, p.x + 10, p.y);
    runTicks(ctx, 600, stepSimulation);
    expect(p.hp).toBe(0);
  });
});
