import { describe, expect, it, vi } from 'vitest';
import { command, createTestContext, player } from '../test/fixtures';
import { HudPresenter } from './HudPresenter';
import { stepSimulation } from './systems/Simulation';

describe('HudPresenter', () => {
  it('emits weapon and cooldown state once, then only on change', () => {
    const ctx = createTestContext();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const weapon = vi.fn();
    const cooldown = vi.fn();
    ctx.events.on('weapon:state', weapon);
    ctx.events.on('special:cooldown', cooldown);

    presenter.publish(ctx.state);
    presenter.publish(ctx.state);
    stepSimulation(ctx, 1 / 60);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenCalledTimes(1);
    expect(weapon).toHaveBeenLastCalledWith({ weapon: 'pistol', level: 0, special: false, magazine: 8, reserve: 64, reloadProgress: null, switching: false });
    expect(cooldown).toHaveBeenCalledTimes(1);

    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenCalledTimes(2);
    expect(weapon).toHaveBeenLastCalledWith(expect.objectContaining({ magazine: 7 }));
    expect(player(ctx).weapons[0]?.magazine).toBe(7);
  });

  it('publishes the weapon slots for the bottom bar, then only when a weapon, the active one or its ammo changes', () => {
    const ctx = createTestContext();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const loadout = vi.fn();
    ctx.events.on('weapons:loadout', loadout);
    presenter.publish(ctx.state);
    presenter.publish(ctx.state);
    expect(loadout).toHaveBeenCalledTimes(1);
    expect(loadout).toHaveBeenLastCalledWith({
      slots: [
        { weapon: 'pistol', magazine: 8, reserve: 64 },
        { weapon: 'smg', magazine: 30, reserve: 120 },
      ],
      active: 0,
    });
    command(ctx).selectWeapon = 1;
    stepSimulation(ctx, 1 / 60);
    presenter.publish(ctx.state);
    expect(loadout).toHaveBeenCalledTimes(2);
    expect(loadout).toHaveBeenLastCalledWith(expect.objectContaining({ active: 1 }));
  });
});

describe('HudPresenter · action chip and points', () => {
  it('shows the repair chip with +10, then +0 once the round limit is reached', () => {
    const ctx = createTestContext();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const action = vi.fn();
    const points = vi.fn();
    ctx.events.on('action:context', action);
    ctx.events.on('points:changed', points);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith({ kind: null, amount: 0, enabled: false });
    expect(points).toHaveBeenLastCalledWith({ points: 500, score: 0 });

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

describe('HudPresenter · door chip', () => {
  it('shows the cost when affordable and the missing points otherwise', () => {
    const ctx = createTestContext();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const action = vi.fn();
    ctx.events.on('action:context', action);
    const d1 = ctx.map.doors[0]!;
    const p = player(ctx);
    p.x = d1.center.x;
    p.y = d1.y - 10;
    stepSimulation(ctx, 1 / 60);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith({ kind: 'door', amount: 250, enabled: false });
    p.points = 900;
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith({ kind: 'door', amount: 750, enabled: true });
  });
});
