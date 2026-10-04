import { describe, expect, it } from 'vitest';
import { MELEE, POINTS } from '../../config/balance';
import { BOSSES } from '../../config/bosses';
import { WEAPONS } from '../../config/weapons';
import { createWeaponSlot } from '../../core/GameState';
import { command, createTestContext, player, runTicks } from '../../test/fixtures';
import { spawnBoss } from './BossSystem';
import { igniteBoss } from './BurnSystem';
import { stepSimulation } from './Simulation';
import type { SimContext } from './SimContext';
import { updateWeapons } from './WeaponSystem';

/** Spec 07 §2: every weapon hurts a boss, which no weapon pushes. */

const DT = 1 / 60;
const HP = BOSSES.butcher.hp;

/** A boss whose footprint's west edge is `gap` px east of the player. */
function bossEast(ctx: SimContext, gap: number) {
  const p = player(ctx);
  const b = spawnBoss(ctx, 0, 'butcher', 'base', p.x + gap + 32, p.y);
  if (!b) throw new Error('no boss slot');
  // It never attacks here.
  b.walkTimer = Number.POSITIVE_INFINITY;
  return b;
}

function holding(ctx: SimContext, weapon: 'katana' | 'laser' | 'flamethrower'): SimContext {
  const p = player(ctx);
  p.weapons = [createWeaponSlot(weapon)];
  p.activeSlot = 0;
  return ctx;
}

describe('a boss as a target', () => {
  it('takes the knife within reach, scoring like a zombie hit', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const b = bossEast(ctx, 10);
    p.facing = 0;
    const money = p.money;
    command(ctx).melee = true;
    updateWeapons(ctx, DT);
    expect(b.hp).toBe(HP - MELEE.damage);
    expect(p.money).toBe(money + POINTS.meleeHit);
  });

  it('is cut by the katana, never pushed', () => {
    const ctx = holding(createTestContext(), 'katana');
    const b = bossEast(ctx, 40);
    const x = b.x;
    Object.assign(command(ctx), { fire: true, aimManual: true, aimX: 1, aimY: 0 });
    updateWeapons(ctx, DT);
    expect(b.hp).toBe(HP - WEAPONS.katana.damage);
    expect(b.x).toBe(x);
  });

  it('burns under the laser and the flamethrower', () => {
    for (const weapon of ['laser', 'flamethrower'] as const) {
      const ctx = holding(createTestContext(), weapon);
      const b = bossEast(ctx, 40);
      Object.assign(command(ctx), { fire: true, aimManual: true, aimX: 1, aimY: 0 });
      player(ctx).aimTime = 1;
      runTicks(ctx, 60, stepSimulation);
      expect(b.hp).toBeLessThan(HP);
    }
  });

  it('keeps burning once lit, without hit points', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const b = bossEast(ctx, 200);
    // Far from the player: it stays out of the way while it burns.
    b.phase = 'walking';
    const money = p.money;
    igniteBoss(b, 10, 2, p.id);
    runTicks(ctx, 150, stepSimulation);
    expect(b.hp).toBeCloseTo(HP - 10, 5);
    expect(p.money).toBe(money);
  });
});
