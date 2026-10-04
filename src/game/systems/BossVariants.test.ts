import { describe, expect, it } from 'vitest';
import { BOSS, PLAYER } from '../../config/balance';
import { BOSSES } from '../../config/bosses';
import { createMansionContext, createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { chargeWindup, leapAirTime, leavePuddle, slamWindup, startAttack } from './BossAttacks';
import { spawnBoss, startBossEntry } from './BossSystem';
import type { SimContext } from './SimContext';
import { stepSimulation } from './Simulation';
import { startRound } from './WaveSystem';

/** Spec 07 §1, §6: the variants, two bosses at once and the rounds after the first. */

function boss(ctx: SimContext, variant: 'base' | 'rabid' | 'putrid', slot = 0, x = 400, y = 272) {
  const b = spawnBoss(ctx, slot, 'butcher', variant, x, y);
  if (!b) throw new Error('no boss slot');
  return b;
}

describe('boss variants (spec 07 §1)', () => {
  it('the rabid one: more health and damage, shorter windups (never under 80 %), enraged from the start', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 300;
    p.y = p.prevY = 272;
    const b = boss(ctx, 'rabid', 0, 180, 272);
    expect(b.maxHp).toBeCloseTo(BOSSES.butcher.hp * 1.8);
    expect(b.enraged).toBe(true);
    expect(chargeWindup(b)).toBeCloseTo(BOSSES.butcher.charge.windup * 0.85);
    startAttack(ctx, b, 'charge', p);
    runTicks(ctx, Math.ceil(chargeWindup(b) * 60) + 60, stepSimulation);
    expect(p.hp).toBeCloseTo(PLAYER.maxHp - BOSSES.butcher.charge.damage * 1.25);
  });

  it('the putrid one leaves a puddle at every landing, which hurts whoever stands in it until it dries up', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 430;
    p.y = p.prevY = 272;
    const b = boss(ctx, 'putrid', 0, 520, 272);
    expect(b.maxHp).toBeCloseTo(BOSSES.butcher.hp * 2.5);
    startAttack(ctx, b, 'leap', p);
    const landing = { x: b.targetX, y: b.targetY };
    // Out of the way of the landing and its ring, then into the puddle once they are over.
    p.x = p.prevX = 150;
    runTicks(ctx, Math.ceil((leapAirTime(b) + 0.2) * 60), stepSimulation);
    const puddle = ctx.state.puddles.find((pd) => pd.active);
    if (!puddle) throw new Error('no puddle');
    expect(Math.hypot(puddle.x - landing.x, puddle.y - landing.y)).toBeLessThan(1);
    // The boss away, so only the puddle can hurt.
    b.active = false;
    const hp = p.hp;
    p.x = p.prevX = puddle.x;
    p.y = p.prevY = puddle.y;
    runTicks(ctx, Math.ceil(BOSS.puddle.time * 60) + 30, stepSimulation);
    expect(p.hp).toBeLessThan(hp);
    expect(hp - p.hp).toBeLessThanOrEqual(BOSS.puddle.damagePerSecond * BOSS.puddle.time + 1e-6);
    expect(ctx.state.puddles.some((pd) => pd.active)).toBe(false);
  });

  it('the base one leaves no puddle', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 430;
    p.y = p.prevY = 272;
    const b = boss(ctx, 'base', 0, 520, 272);
    startAttack(ctx, b, 'leap', p);
    runTicks(ctx, Math.ceil((leapAirTime(b) + 0.2) * 60), stepSimulation);
    expect(ctx.state.puddles.some((pd) => pd.active)).toBe(false);
  });
});

describe('two bosses at once (spec 07 §6)', () => {
  it('only one starts winding up an attack in every 0.8 s', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.godMode = true;
    p.x = p.prevX = 350;
    p.y = p.prevY = 272;
    const a = boss(ctx, 'base', 0, 260, 200);
    const b = boss(ctx, 'base', 1, 260, 340);
    a.walkTimer = 0;
    b.walkTimer = 0;
    const starts: number[] = [];
    let attacking = [false, false];
    for (let i = 0; i < 120; i++) {
      stepSimulation(ctx, 1 / 60);
      const now = [a.phase === 'attacking', b.phase === 'attacking'];
      now.forEach((on, k) => {
        if (on && !attacking[k]) starts.push(ctx.state.time);
      });
      attacking = now;
    }
    expect(starts.length).toBeGreaterThanOrEqual(2);
    expect((starts[1] ?? 0) - (starts[0] ?? 0)).toBeGreaterThanOrEqual(BOSS.attackStagger - 1e-6);
  });
});

describe('the rounds after the first (spec 07 §1, §6)', () => {
  /** The bosses that come out in round `round` of the mansion, as variant names. */
  function bossesOf(round: number) {
    const ctx = createMansionContext(11);
    ctx.state.wave.auto = true;
    player(ctx).godMode = true;
    startRound(ctx.state, round);
    runTicks(ctx, Math.round(BOSS.entryDelay * 60) + 5, stepSimulation);
    return ctx.state.bosses.filter((b) => b.active);
  }

  it('brings the rabid one in round 12, two base ones in 18 and the putrid one in 24', () => {
    expect(bossesOf(12).map((b) => b.variant)).toEqual(['rabid']);
    expect(bossesOf(18).map((b) => b.variant)).toEqual(['base', 'base']);
    expect(bossesOf(24).map((b) => b.variant)).toEqual(['putrid']);
  });

  it('two bosses come out of different places', () => {
    const [a, b] = bossesOf(18);
    expect(a && b && Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(64);
  });

  it('round 36 is round 12 again, its boss ×1.3 health', () => {
    const [b] = bossesOf(36);
    expect(b?.variant).toBe('rabid');
    expect(b?.maxHp).toBeCloseTo(BOSSES.butcher.hp * 1.8 * 1.3);
  });
});

describe('the putrid trail and the zombies (petición del usuario)', () => {
  it('the putrid one leaves a trail of puddles along its charge, every 32 px', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.godMode = true;
    p.x = p.prevX = 520;
    p.y = p.prevY = 400;
    const b = boss(ctx, 'putrid', 0, 180, 200);
    startAttack(ctx, b, 'charge', p);
    b.aimX = 1;
    b.aimY = 0;
    b.timer = 0.01;
    runTicks(ctx, 60, stepSimulation);
    const trail = ctx.state.puddles.filter((pd) => pd.active && pd.radius === BOSS.puddle.trailRadius);
    const run = BOSSES.butcher.charge.distance;
    expect(trail.length).toBeGreaterThanOrEqual(Math.floor(run / BOSS.puddle.trailSpacing));
    expect(trail.length).toBeLessThanOrEqual(Math.ceil(run / BOSS.puddle.trailSpacing) + 1);
    for (const pd of trail) {
      expect(pd.y).toBeCloseTo(200, 0);
      expect(pd.x).toBeGreaterThanOrEqual(180 - 1);
      expect(pd.x).toBeLessThanOrEqual(180 + run + 1);
    }
  });

  it('overlapping puddles do not add up', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    leavePuddle(ctx, p.x - 5, p.y, 30);
    leavePuddle(ctx, p.x + 5, p.y, 30);
    runTicks(ctx, Math.round(BOSS.puddle.tickInterval * 60) + 1, stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp - BOSS.puddle.damagePerSecond * BOSS.puddle.tickInterval);
  });

  it('every blow hurts the zombies too, with no points; bosses never hurt each other', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.godMode = true;
    p.x = p.prevX = 260;
    p.y = p.prevY = 272;
    const b = boss(ctx, 'base', 0, 200, 272);
    const other = boss(ctx, 'base', 1, 480, 200);
    other.walkTimer = Number.POSITIVE_INFINITY;
    const money = p.money;
    // The slam: a zombie in its arc takes the blow.
    const inArc = placeZombie(ctx, 0, 250, 300, 100, 'idle');
    startAttack(ctx, b, 'slam', p);
    runTicks(ctx, Math.ceil(slamWindup(b) * 60) + 1, stepSimulation);
    expect(inArc.hp).toBe(100 - BOSSES.butcher.slam.damage);
    // A leap: the landing and its ring.
    const ctx2 = createTestContext();
    const q = player(ctx2);
    q.godMode = true;
    q.x = q.prevX = 400;
    q.y = q.prevY = 272;
    const c = boss(ctx2, 'base', 0, 200, 272);
    const under = placeZombie(ctx2, 0, 400, 280, 100, 'idle');
    const ringed = placeZombie(ctx2, 1, 400 + 90, 272, 100, 'idle');
    startAttack(ctx2, c, 'leap', q);
    q.x = q.prevX = 140;
    runTicks(ctx2, Math.ceil((leapAirTime(c) + 1) * 60), stepSimulation);
    expect(under.hp).toBeLessThanOrEqual(100 - BOSSES.butcher.leap.landDamage);
    expect(ringed.hp).toBe(100 - BOSSES.butcher.leap.waveDamage);
    // Nobody scored, and the other boss was not touched.
    expect(p.money).toBe(money);
    expect(other.hp).toBe(other.maxHp);
  });

  it('its fall from the sky and the puddles hurt zombies too', () => {
    const ctx = createMansionContext(4);
    const b = startBossEntry(ctx, 0, 'butcher', 'base');
    if (!b) throw new Error('no entry');
    const inCircle = placeZombie(ctx, 0, b.x + 10, b.y, 100, 'idle');
    runTicks(ctx, Math.round((BOSS.warningTime + BOSS.fallTime) * 60) + 2, stepSimulation);
    expect(inCircle.hp).toBe(100 - BOSS.dropDamage);
    leavePuddle(ctx, b.x + 200, b.y, 30);
    const wading = placeZombie(ctx, 1, b.x + 200, b.y, 100, 'idle');
    runTicks(ctx, Math.round(BOSS.puddle.tickInterval * 60) + 1, stepSimulation);
    expect(wading.hp).toBeLessThan(100);
  });
});
