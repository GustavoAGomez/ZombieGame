import { describe, expect, it, vi } from 'vitest';
import { BARRICADES, POINTS, ZOMBIES } from '../../config/balance';
import { command, createTestContext, player, runTicks } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
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
    expect(p.money).toBe(POINTS.startMoney + BARRICADES.pointsPerPlank);
    expect(onPoints).toHaveBeenCalledWith({ playerId: 0, amount: 10, reason: 'repair', x: w.center.x, y: w.center.y });
    expect(p.repairing).toBe(true);

    tapTimes(ctx, 7);
    expect(ctx.state.windowPlanks[0]).toBe(5); // never above the window's planks
    expect(p.money).toBe(POINTS.startMoney + 5 * BARRICADES.pointsPerPlank);
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
    const start = p.money;
    tapTimes(ctx, 3);
    expect(ctx.state.windowPlanks[0]).toBe(3);
    expect(p.money).toBe(start + 10);
    expect(p.repairPoints).toBe(BARRICADES.maxRepairPointsPerRound);
  });

  it('resets the repair limit when the round changes', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 0, 0);
    p.repairPoints = BARRICADES.maxRepairPointsPerRound;
    ctx.state.wave.round = 2;
    const start = p.money;
    tap(ctx);
    expect(p.money).toBe(start + 10);
    expect(p.repairRound).toBe(2);
  });

  it('works while a zombie tears the same window, but even a lone walker gets in against nonstop repairs', () => {
    const ctx = createTestContext();
    const { p } = atWindow(ctx, 0, 5);
    const z = ctx.state.zombies[0]!;
    spawnZombie(ctx, z, ctx.map.zombieSpawns.findIndex((s) => s.windowIndex === 0));
    z.kind = 'walker';
    p.hp = 1e9; // survive once it gets in
    // Slower than any zombie tears a plank: repairing never holds a window for good.
    for (const kind of Object.values(ZOMBIES.kinds)) expect(BARRICADES.repairTapCooldown).toBeGreaterThan(kind.tearTime);
    let repairedWhileTearing = false;
    const cmd = command(ctx);
    // Tapping as fast as a finger can: a tap every other tick.
    for (let t = 0; t < 60 * 60 && z.ai !== 'climbing' && z.ai !== 'chasing'; t++) {
      const before = ctx.state.windowPlanks[0]!;
      cmd.actionPressed = t % 2 === 0;
      stepSimulation(ctx, 1 / 60);
      if (z.ai === 'tearing' && ctx.state.windowPlanks[0]! > before) repairedWhileTearing = true;
    }
    cmd.actionPressed = false;
    expect(repairedWhileTearing).toBe(true);
    expect(['climbing', 'chasing']).toContain(z.ai);
  });

  it('the chip waits between repairs: dimmed until a tap counts again', () => {
    const ctx = createTestContext();
    atWindow(ctx, 0, 2);
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const action = vi.fn();
    ctx.events.on('action:context', action);
    stepSimulation(ctx, 1 / 60);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'repair', enabled: true }));
    tap(ctx);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'repair', enabled: false }));
    runTicks(ctx, cooldownTicks + 1, stepSimulation);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'repair', enabled: true }));
  });
});
