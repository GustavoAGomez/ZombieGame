import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../config/balance';
import { createTestContext, player, runTicks } from '../../test/fixtures';
import { damagePlayer } from './HealthSystem';
import { stepSimulation } from './Simulation';

describe('HealthSystem', () => {
  it('does not regenerate: health only comes back with a health pickup', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    damagePlayer(ctx, p, 60, p.x + 10, p.y);
    expect(p.hp).toBe(40);
    // A long while without being hurt.
    runTicks(ctx, 30 * 60, stepSimulation);
    expect(p.hp).toBe(40);
    expect(p.hp).toBeLessThan(PLAYER.maxHp);
  });

  it('leaves a dead player dead', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    damagePlayer(ctx, p, 200, p.x + 10, p.y);
    runTicks(ctx, 600, stepSimulation);
    expect(p.hp).toBe(0);
  });
});
