import { describe, expect, it } from 'vitest';
import { DASH, PLAYER } from '../../config/balance';
import { command, createTestContext, player, runTicks } from '../../test/fixtures';
import { stepSimulation } from './Simulation';

describe('SpecialSystem (dash)', () => {
  it('covers 72 px in 0.18 s along the movement input', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const cmd = command(ctx);
    const x0 = p.x;
    cmd.moveX = 1;
    cmd.special = true;
    stepSimulation(ctx, 1 / 60);
    cmd.special = false;
    cmd.moveX = 0;
    runTicks(ctx, Math.ceil(DASH.duration * 60), stepSimulation);
    expect(p.x - x0).toBeCloseTo(DASH.distance, 3);
    expect(p.dashTimer).toBe(0);
  });

  it('uses the facing when standing still', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.facing = -Math.PI / 2; // north
    const y0 = p.y;
    command(ctx).special = true;
    runTicks(ctx, 20, stepSimulation);
    expect(y0 - p.y).toBeCloseTo(DASH.distance, 3);
  });

  it('respects walls', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const zone = ctx.map.zones[0]!;
    p.x = zone.x + 30;
    const cmd = command(ctx);
    cmd.moveX = -1;
    cmd.special = true;
    runTicks(ctx, 20, stepSimulation);
    expect(p.x).toBeCloseTo(zone.x + PLAYER.hitboxRadius, 3);
  });

  it('has a 4 s cooldown', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const cmd = command(ctx);
    cmd.moveX = 1;
    cmd.special = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.dashCooldown).toBeCloseTo(DASH.cooldown);
    // Holding "special" does nothing while cooling down...
    let secondDashTick = -1;
    for (let tick = 2; tick <= DASH.cooldown * 60 + 3 && secondDashTick < 0; tick++) {
      stepSimulation(ctx, 1 / 60);
      if (tick > DASH.duration * 60 + 1 && p.dashTimer > 0) secondDashTick = tick;
    }
    // ...and the next dash starts right when the 4 s are up.
    expect(secondDashTick).toBeGreaterThanOrEqual(DASH.cooldown * 60 - 1);
    expect(secondDashTick).toBeLessThanOrEqual(DASH.cooldown * 60 + 2);
  });
});
