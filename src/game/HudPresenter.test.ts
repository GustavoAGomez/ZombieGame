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
