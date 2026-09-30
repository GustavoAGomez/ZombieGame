import { describe, expect, it, vi } from 'vitest';
import { command, createTestContext, player } from '../test/fixtures';
import { HudPresenter } from './HudPresenter';
import { stepSimulation } from './systems/Simulation';

describe('HudPresenter', () => {
  it('emits weapon and cooldown state once, then only on change', () => {
    const ctx = createTestContext();
    const presenter = new HudPresenter(ctx.events);
    const weapon = vi.fn();
    const cooldown = vi.fn();
    ctx.events.on('weapon:state', weapon);
    ctx.events.on('special:cooldown', cooldown);

    presenter.publish(ctx.state);
    presenter.publish(ctx.state);
    stepSimulation(ctx, 1 / 60);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenCalledTimes(1);
    expect(weapon).toHaveBeenLastCalledWith({ weapon: 'pistol', magazine: 8, reserve: 64, reloadProgress: null, switching: false });
    expect(cooldown).toHaveBeenCalledTimes(1);

    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenCalledTimes(2);
    expect(weapon).toHaveBeenLastCalledWith(expect.objectContaining({ magazine: 7 }));
    expect(player(ctx).weapons[0]?.magazine).toBe(7);
  });
});

describe('HudPresenter · action chip and points', () => {
  it('shows the repair chip with +10, then +0 once the round limit is reached', () => {
    const ctx = createTestContext();
    const presenter = new HudPresenter(ctx.events);
    const action = vi.fn();
    const points = vi.fn();
    ctx.events.on('action:context', action);
    ctx.events.on('points:changed', points);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith({ kind: null, amount: 0, enabled: false });
    expect(points).toHaveBeenLastCalledWith({ points: 500 });

    const w = ctx.map.windows[0]!;
    const p = player(ctx);
    p.x = w.interior.x;
    p.y = w.interior.y;
    ctx.state.windowPlanks[0] = 1;
    stepSimulation(ctx, 1 / 60);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith({ kind: 'repair', amount: 10, enabled: true });

    p.repairPoints = 500;
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith({ kind: 'repair', amount: 0, enabled: true });
    const calls = action.mock.calls.length;
    presenter.publish(ctx.state);
    expect(action.mock.calls.length).toBe(calls);
  });
});
