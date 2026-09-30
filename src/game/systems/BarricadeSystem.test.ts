import { describe, expect, it, vi } from 'vitest';
import { BARRICADES, POINTS, ZOMBIES } from '../../config/balance';
import { command, createTestContext, player, runTicks } from '../../test/fixtures';
import { repairableWindow } from './BarricadeSystem';
import { stepSimulation } from './Simulation';
import { spawnZombie } from './SpawnSystem';

type Ctx = ReturnType<typeof createTestContext>;

/** Puts the player just inside window `index`, with `planks` left. */
function atWindow(ctx: Ctx, index: number, planks: number) {
  const w = ctx.map.windows[index]!;
  const p = player(ctx);
  p.x = p.prevX = w.interior.x;
  p.y = p.prevY = w.interior.y;
  ctx.state.windowPlanks[index] = planks;
  return { w, p };
}

const repairTicks = Math.round(BARRICADES.repairInterval * 60);

describe('BarricadeSystem · context action', () => {
  it('offers repair within 40 px of a window that is missing planks', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 0, 3);
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('repair');
    expect(p.contextTarget).toBe(0);
  });

  it('offers nothing when the window is full or too far', () => {
    const ctx = createTestContext();
    const { w, p } = atWindow(ctx, 0, 5);
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('none');

    ctx.state.windowPlanks[0] = 2;
    p.y = w.center.y + BARRICADES.repairRange + 2;
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('none');
    expect(repairableWindow(ctx, p)).toBe(-1);
  });

  it('offers nothing to a dead player', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 0, 1);
    p.hp = 0;
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('none');
  });
});

describe('BarricadeSystem · repairing', () => {
  it('puts back one plank every 0.6 s while held, +10 points each', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 0, 0);
    const onPoints = vi.fn();
    ctx.events.on('points:gained', onPoints);
    command(ctx).action = true;
    runTicks(ctx, repairTicks - 1, stepSimulation);
    expect(ctx.state.windowPlanks[0]).toBe(0);
    runTicks(ctx, 2, stepSimulation);
    expect(ctx.state.windowPlanks[0]).toBe(1);
    expect(p.points).toBe(POINTS.start + BARRICADES.pointsPerPlank);
    expect(onPoints).toHaveBeenCalledWith({ playerId: 0, amount: 10, reason: 'repair' });
    expect(p.repairing).toBe(true);

    runTicks(ctx, repairTicks * 6, stepSimulation);
    expect(ctx.state.windowPlanks[0]).toBe(5); // never above the window's planks
    expect(p.points).toBe(POINTS.start + 5 * BARRICADES.pointsPerPlank);
  });

  it('starts over when the chip is released', () => {
    const ctx = createTestContext();
    atWindow(ctx, 0, 2);
    const cmd = command(ctx);
    cmd.action = true;
    runTicks(ctx, repairTicks - 5, stepSimulation);
    cmd.action = false;
    stepSimulation(ctx, 1 / 60);
    cmd.action = true;
    runTicks(ctx, repairTicks - 5, stepSimulation);
    expect(ctx.state.windowPlanks[0]).toBe(2);
  });

  it('faces the window while repairing', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 1, 2); // left window
    command(ctx).action = true;
    stepSimulation(ctx, 1 / 60);
    expect(Math.abs(p.facing)).toBeCloseTo(Math.PI);
  });

  it('caps repair points at 500 per round but keeps repairing', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 0, 0);
    p.repairPoints = BARRICADES.maxRepairPointsPerRound - 10;
    const start = p.points;
    command(ctx).action = true;
    runTicks(ctx, repairTicks * 3 + 2, stepSimulation);
    expect(ctx.state.windowPlanks[0]).toBe(3);
    expect(p.points).toBe(start + 10);
    expect(p.repairPoints).toBe(BARRICADES.maxRepairPointsPerRound);
  });

  it('resets the repair limit when the round changes', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 0, 0);
    p.repairPoints = BARRICADES.maxRepairPointsPerRound;
    ctx.state.wave.round = 2;
    const start = p.points;
    command(ctx).action = true;
    runTicks(ctx, repairTicks + 2, stepSimulation);
    expect(p.points).toBe(start + 10);
    expect(p.repairRound).toBe(2);
  });

  it('works while a zombie tears the same window', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 0, 2);
    const z = ctx.state.zombies[0]!;
    spawnZombie(ctx, z, ctx.map.zombieSpawns.findIndex((s) => s.windowIndex === 0));
    z.kind = 'walker';
    p.hp = 1e9; // survive if it gets in
    command(ctx).action = true;
    // Repairs (1 plank / 0.6 s) outpace a walker tearing (1 plank / 1.4 s).
    runTicks(ctx, 60 * 6, stepSimulation);
    expect(z.ai).toBe('tearing');
    expect(ctx.state.windowPlanks[0]).toBeGreaterThanOrEqual(4);
    expect(ZOMBIES.kinds.walker.tearTime).toBeGreaterThan(BARRICADES.repairInterval);
  });
});
