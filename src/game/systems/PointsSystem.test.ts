import { describe, expect, it, vi } from 'vitest';
import { MELEE, POINTS } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
import { command, createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { damageZombie } from './Combat';
import { spendMoney } from './PointsSystem';
import { stepSimulation } from './Simulation';

describe('PointsSystem', () => {
  it('starts every player with 500 points', () => {
    expect(player(createTestContext()).money).toBe(POINTS.startMoney);
  });

  it('gives +5 per bullet hit to the shooter', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    placeZombie(ctx, 0, p.x + 60, p.y, 1000);
    const gained = vi.fn();
    ctx.events.on('points:gained', gained);
    const cmd = command(ctx);
    cmd.fire = true;
    stepSimulation(ctx, 1 / 60);
    cmd.fire = false;
    runTicks(ctx, 20, stepSimulation);
    expect(p.money).toBe(POINTS.startMoney + POINTS.hit);
    expect(gained).toHaveBeenCalledWith({ playerId: 0, amount: 5, reason: 'hit' });
  });

  it('gives +5 for the killing bullet and +50 for the kill (55 in total)', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 60, p.y, WEAPONS.pistol.damage);
    const cmd = command(ctx);
    cmd.fire = true;
    stepSimulation(ctx, 1 / 60);
    cmd.fire = false;
    runTicks(ctx, 20, stepSimulation);
    expect(z.ai).toBe('dead');
    expect(p.money).toBe(POINTS.startMoney + POINTS.hit + POINTS.kill);
  });

  it('counts knife hits (+10) and kills too', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    for (const w of p.weapons) {
      w.magazine = 0;
      w.reserve = 0;
    }
    placeZombie(ctx, 0, p.x + 18, p.y, MELEE.damage);
    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    expect(POINTS.meleeHit).toBe(10);
    expect(p.money).toBe(POINTS.startMoney + POINTS.meleeHit + POINTS.kill);
  });

  it('gives nothing for damage without an attacker', () => {
    const ctx = createTestContext();
    const z = placeZombie(ctx, 0, 300, 300, 10);
    damageZombie(ctx, z, 50);
    expect(player(ctx).money).toBe(POINTS.startMoney);
  });

  it('spends points only when affordable', () => {
    const p = player(createTestContext());
    expect(spendMoney(p, 600)).toBe(false);
    expect(p.money).toBe(500);
    expect(spendMoney(p, 500)).toBe(true);
    expect(p.money).toBe(0);
  });
});
