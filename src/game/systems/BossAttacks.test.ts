import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../config/balance';
import { BOSSES } from '../../config/bosses';
import { createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { bossZone } from '../entities/Boss';
import { chargeWindup, startAttack } from './BossAttacks';
import { damageBoss } from './BossCombat';
import { spawnBoss } from './BossSystem';
import { stepSimulation } from './Simulation';
import type { SimContext } from './SimContext';

/** Spec 07 §4.1: the charge. room01's first room runs from x 128 to 576 and y 128 to 416. */

const CHARGE = BOSSES.butcher.charge;
const TS = 32;

function charging(ctx: SimContext, x: number, y: number) {
  const b = spawnBoss(ctx, 0, 'butcher', 'base', x, y);
  if (!b) throw new Error('no boss slot');
  startAttack(ctx, b, 'charge', player(ctx));
  return b;
}

/** Ticks until the windup is over (the run starts on the next one). */
const windupTicks = (ctx: SimContext) => Math.ceil(chargeWindup(ctx.state.bosses[0]!) * 60) + 1;

describe('the charge (spec 07 §4.1)', () => {
  it('announces a corridor towards the player, which follows them until it locks a moment before the run', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 400;
    p.y = p.prevY = 272;
    const b = charging(ctx, 200, 272);
    stepSimulation(ctx, 1 / 60);
    const zone = bossZone(b, TS);
    expect(zone?.kind).toBe('corridor');
    expect(zone?.width).toBe(CHARGE.width);
    expect(zone?.dirX).toBeCloseTo(1);
    // It follows the player while it can…
    p.y = p.prevY = 320;
    stepSimulation(ctx, 1 / 60);
    expect(b.aimY).toBeGreaterThan(0.1);
    const aimY = b.aimY;
    // …and locks lockBefore s before it runs.
    runTicks(ctx, Math.ceil((CHARGE.windup - CHARGE.lockBefore) * 60) + 1, stepSimulation);
    p.y = p.prevY = 200;
    runTicks(ctx, 5, stepSimulation);
    expect(b.stage).toBe('windup');
    expect(b.aimY).toBeCloseTo(aimY, 1);
    expect(b.aimY).toBeGreaterThan(0.1);
  });

  it('runs its distance; a player it catches takes its damage once and is thrown', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 300;
    p.y = p.prevY = 272;
    const b = charging(ctx, 180, 272);
    runTicks(ctx, windupTicks(ctx), stepSimulation);
    expect(b.stage).toBe('run');
    runTicks(ctx, 60, stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp - CHARGE.damage);
    // Off its line: thrown and then out of its way.
    expect(Math.abs(p.y - 272) + Math.abs(p.x - 300)).toBeGreaterThan(CHARGE.knockback - 1);
    expect(b.stage).toBe('brake');
    expect(b.x - 180).toBeCloseTo(CHARGE.distance, 0);
  });

  it('runs over the zombies in its way: they die, and nobody scores', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 520;
    p.y = p.prevY = 140;
    const b = charging(ctx, 180, 272);
    b.aimX = 1;
    b.aimY = 0;
    const z = placeZombie(ctx, 0, 330, 280, 5, 'idle');
    const money = p.money;
    // Its way locked east, whatever the player does.
    b.timer = 0.01;
    runTicks(ctx, 60, stepSimulation);
    expect(z.hp).toBeLessThanOrEqual(0);
    expect(z.ai).toBe('dead');
    expect(p.money).toBe(money);
  });

  it('into a wall it is stunned for 2 s and takes double damage; with no wall it brakes and takes the normal', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    // The player against the east wall: the run ends in it.
    p.x = p.prevX = 560;
    p.y = p.prevY = 200;
    const b = charging(ctx, 420, 200);
    const zone = bossZone(b, TS);
    runTicks(ctx, windupTicks(ctx) + 40, stepSimulation);
    expect(b.stage).toBe('stunned');
    expect(zone).not.toBeNull();
    const hp = b.hp;
    damageBoss(ctx, b, 5);
    expect(b.hp).toBe(hp - 5 * CHARGE.stunDamageFactor);
    runTicks(ctx, Math.ceil(CHARGE.stunTime * 60) + 1, stepSimulation);
    expect(b.phase).toBe('walking');
    expect(b.lastAttack).toBe('charge');

    const open = createTestContext();
    const q = player(open);
    q.x = q.prevX = 520;
    q.y = q.prevY = 400;
    const c = charging(open, 180, 160);
    c.aimX = 1;
    c.aimY = 0;
    c.timer = 0.01;
    runTicks(open, 60, stepSimulation);
    expect(c.stage).toBe('brake');
    const before = c.hp;
    damageBoss(open, c, 5);
    expect(c.hp).toBe(before - 5);
  });

  it('draws its corridor only as far as it will get', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 560;
    p.y = p.prevY = 200;
    const b = charging(ctx, 420, 200);
    stepSimulation(ctx, 1 / 60);
    const zone = bossZone(b, TS);
    // The east wall (x 576) is 156 px from its centre: its front reaches it after 576 − 420 − 32 px.
    expect(zone?.length).toBeLessThan(CHARGE.distance);
    expect((zone?.x ?? 0) + (zone?.length ?? 0)).toBeLessThanOrEqual(576 + 1);
  });

  it('spares a dashing player', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 300;
    p.y = p.prevY = 272;
    const b = charging(ctx, 180, 272);
    runTicks(ctx, windupTicks(ctx), stepSimulation);
    p.dashTimer = 10;
    p.dashCooldown = 10;
    runTicks(ctx, 40, stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp);
    expect(b.hitPlayers).toBe(0);
  });
});
