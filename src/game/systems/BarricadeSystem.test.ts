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

const cooldownTicks = Math.round(BARRICADES.repairTapCooldown * 60);

/** One tap of the chip (press edge for a single tick). */
function tap(ctx: Ctx): void {
  const cmd = command(ctx);
  cmd.actionPressed = true;
  stepSimulation(ctx, 1 / 60);
  cmd.actionPressed = false;
}

/** Taps `n` times, waiting out the cooldown between taps. */
function tapTimes(ctx: Ctx, n: number): void {
  for (let i = 0; i < n; i++) {
    tap(ctx);
    runTicks(ctx, cooldownTicks, stepSimulation);
  }
}

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

describe('BarricadeSystem · repairing with taps', () => {
  it('puts back one plank per tap, +10 points each, announced at the window', () => {
    const ctx = createTestContext();
    const { w, p } = atWindow(ctx, 0, 0);
    const onPoints = vi.fn();
    ctx.events.on('points:gained', onPoints);
    tap(ctx);
    expect(ctx.state.windowPlanks[0]).toBe(1);
    expect(p.points).toBe(POINTS.start + BARRICADES.pointsPerPlank);
    expect(onPoints).toHaveBeenCalledWith({ playerId: 0, amount: 10, reason: 'repair', x: w.center.x, y: w.center.y });
    expect(p.repairing).toBe(true);

    tapTimes(ctx, 7);
    expect(ctx.state.windowPlanks[0]).toBe(5); // never above the window's planks
    expect(p.points).toBe(POINTS.start + 5 * BARRICADES.pointsPerPlank);
  });

  it('ignores taps faster than the cooldown', () => {
    const ctx = createTestContext();
    atWindow(ctx, 0, 0);
    tap(ctx);
    tap(ctx);
    tap(ctx);
    expect(ctx.state.windowPlanks[0]).toBe(1);
    runTicks(ctx, cooldownTicks, stepSimulation);
    tap(ctx);
    expect(ctx.state.windowPlanks[0]).toBe(2);
  });

  it('does not repair while simply holding the chip', () => {
    const ctx = createTestContext();
    atWindow(ctx, 0, 2);
    command(ctx).action = true;
    runTicks(ctx, 120, stepSimulation);
    expect(ctx.state.windowPlanks[0]).toBe(2);
  });

  it('faces the window when repairing', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 1, 2); // left window
    tap(ctx);
    expect(Math.abs(p.facing)).toBeCloseTo(Math.PI);
  });

  it('caps repair points at 500 per round but keeps repairing', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 0, 0);
    p.repairPoints = BARRICADES.maxRepairPointsPerRound - 10;
    const start = p.points;
    tapTimes(ctx, 3);
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
    tap(ctx);
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
    // Tapping twice per second outpaces a walker tearing one plank every 1.4 s.
    for (let i = 0; i < 12; i++) {
      tap(ctx);
      runTicks(ctx, 29, stepSimulation);
    }
    expect(z.ai).toBe('tearing');
    expect(ctx.state.windowPlanks[0]).toBeGreaterThanOrEqual(4);
    expect(ZOMBIES.kinds.walker.tearTime).toBeGreaterThan(0.5);
  });
});
