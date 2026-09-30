import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../config/balance';
import { command, createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { updateBullets } from './BulletSystem';
import { stepSimulation } from './Simulation';

function fireOnce(ctx: ReturnType<typeof createTestContext>, aimX: number, aimY: number): void {
  const cmd = command(ctx);
  cmd.fire = true;
  cmd.aimManual = true;
  cmd.aimX = aimX;
  cmd.aimY = aimY;
  stepSimulation(ctx, 1 / 60);
  cmd.fire = false;
}

describe('BulletSystem', () => {
  it('damages the first zombie it hits and disappears', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const near = placeZombie(ctx, 0, p.x + 60, p.y, 100);
    const far = placeZombie(ctx, 1, p.x + 120, p.y, 100);
    fireOnce(ctx, 1, 0);
    runTicks(ctx, 30, stepSimulation);
    expect(near.hp).toBe(100 - WEAPONS.pistol.damage);
    expect(far.hp).toBe(100);
    expect(ctx.state.bullets.some((b) => b.active)).toBe(false);
  });

  it('does not skip a zombie thinner than one tick of travel', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 40, p.y + 5, 100);
    fireOnce(ctx, 1, 0);
    runTicks(ctx, 20, stepSimulation);
    expect(z.hp).toBe(100 - WEAPONS.pistol.damage);
  });

  it('stops at walls and closed doors', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const d1 = ctx.map.doors[0]!;
    p.x = d1.center.x;
    p.y = d1.y - 30;
    const behind = placeZombie(ctx, 0, d1.center.x, d1.y + 60, 100);
    fireOnce(ctx, 0, 1);
    runTicks(ctx, 60, stepSimulation);
    expect(behind.hp).toBe(100);
    expect(ctx.state.bullets.some((b) => b.active)).toBe(false);
  });

  it('flies through windows to hit zombies outside', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const w1 = ctx.map.windows[0]!;
    p.x = w1.center.x;
    p.y = w1.center.y + 60;
    const outside = placeZombie(ctx, 0, w1.exterior.x, w1.exterior.y, 100);
    fireOnce(ctx, 0, -1);
    runTicks(ctx, 30, stepSimulation);
    expect(outside.hp).toBe(100 - WEAPONS.pistol.damage);
  });

  it('expires after the weapon range', () => {
    const ctx = createTestContext();
    fireOnce(ctx, 1, 0);
    const bullet = ctx.state.bullets.find((b) => b.active)!;
    // Park it in open space and let it travel its remaining distance.
    bullet.x = 5 * 32;
    bullet.y = 6 * 32;
    bullet.dirX = 1;
    bullet.dirY = 0;
    bullet.remaining = 100;
    let ticks = 0;
    while (bullet.active && ticks < 100) {
      updateBullets(ctx, 1 / 60);
      ticks++;
    }
    expect(bullet.active).toBe(false);
    expect(bullet.x - 5 * 32).toBeCloseTo(100, 0);
  });
});
