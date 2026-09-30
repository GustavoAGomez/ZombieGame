import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../config/balance';
import { createTestContext, runTicks } from '../../test/fixtures';
import { stepSimulation } from './Simulation';

describe('MovementSystem', () => {
  it('does not move without input', () => {
    const ctx = createTestContext();
    const p = ctx.state.players[0]!;
    const { x, y } = p;
    runTicks(ctx, 30, stepSimulation);
    expect([p.x, p.y]).toEqual([x, y]);
    expect(p.moving).toBe(false);
  });

  it('moves at 88 px/s at full deflection', () => {
    const ctx = createTestContext();
    const p = ctx.state.players[0]!;
    const x0 = p.x;
    ctx.commands[0]!.moveX = 1;
    runTicks(ctx, 60, stepSimulation);
    expect(p.x - x0).toBeCloseTo(PLAYER.speed, 5);
    expect(p.moving).toBe(true);
    expect(p.facing).toBeCloseTo(0);
  });

  it('scales speed with the analog magnitude and never exceeds 1', () => {
    const ctx = createTestContext();
    const p = ctx.state.players[0]!;
    const x0 = p.x;
    ctx.commands[0]!.moveX = 0.5;
    runTicks(ctx, 60, stepSimulation);
    expect(p.x - x0).toBeCloseTo(PLAYER.speed * 0.5, 5);

    const ctx2 = createTestContext();
    const p2 = ctx2.state.players[0]!;
    ctx2.commands[0]!.moveX = 3;
    runTicks(ctx2, 30, stepSimulation);
    expect(p2.x - ctx2.map.playerSpawn.x).toBeCloseTo(PLAYER.speed * 0.5, 5);
  });

  it('never goes through the walls of the starting room', () => {
    for (const [mx, my] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, -0.7]] as const) {
      const ctx = createTestContext();
      const p = ctx.state.players[0]!;
      ctx.commands[0]!.moveX = mx;
      ctx.commands[0]!.moveY = my;
      runTicks(ctx, 60 * 10, stepSimulation);
      const zone = ctx.map.zones[0]!;
      expect(p.x).toBeGreaterThanOrEqual(zone.x + PLAYER.hitboxRadius - 0.01);
      expect(p.x).toBeLessThanOrEqual(zone.x + zone.width - PLAYER.hitboxRadius + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(zone.y + PLAYER.hitboxRadius - 0.01);
      expect(p.y).toBeLessThanOrEqual(zone.y + zone.height - PLAYER.hitboxRadius + 0.01);
    }
  });

  it('does not pass through a closed door or a window', () => {
    const ctx = createTestContext();
    const p = ctx.state.players[0]!;
    const d1 = ctx.map.doors[0]!;
    p.x = d1.center.x;
    p.y = d1.y - 20;
    ctx.commands[0]!.moveY = 1;
    runTicks(ctx, 120, stepSimulation);
    expect(p.y).toBeLessThanOrEqual(d1.y - PLAYER.hitboxRadius + 0.01);

    const w1 = ctx.map.windows[0]!;
    p.x = w1.center.x;
    p.y = w1.center.y + 40;
    ctx.commands[0]!.moveY = -1;
    runTicks(ctx, 120, stepSimulation);
    expect(p.y).toBeGreaterThanOrEqual(w1.center.y + 16 + PLAYER.hitboxRadius - 0.01);
  });

  it('slides along a wall when pushing diagonally into it', () => {
    const ctx = createTestContext();
    const p = ctx.state.players[0]!;
    const zone = ctx.map.zones[0]!;
    p.y = zone.y + PLAYER.hitboxRadius + 1;
    const x0 = p.x;
    ctx.commands[0]!.moveX = 0.7071;
    ctx.commands[0]!.moveY = -0.7071;
    runTicks(ctx, 30, stepSimulation);
    expect(p.x).toBeGreaterThan(x0 + 20);
  });

  it('slows down to a walk while shooting and remembers the move direction', () => {
    const ctx = createTestContext();
    const p = ctx.state.players[0]!;
    const x0 = p.x;
    ctx.commands[0]!.moveX = 1;
    ctx.commands[0]!.fire = true;
    runTicks(ctx, 60, stepSimulation);
    expect(p.x - x0).toBeCloseTo(PLAYER.speed * PLAYER.shootingSpeedFactor, 5);
    expect([p.moveX, p.moveY]).toEqual([1, 0]);
  });

  it('keeps prevX/prevY one tick behind for interpolation', () => {
    const ctx = createTestContext();
    const p = ctx.state.players[0]!;
    ctx.commands[0]!.moveX = 1;
    stepSimulation(ctx, 1 / 60);
    expect(p.x - p.prevX).toBeCloseTo(PLAYER.speed / 60);
  });
});
