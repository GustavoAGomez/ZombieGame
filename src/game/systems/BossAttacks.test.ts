import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../config/balance';
import { BOSSES } from '../../config/bosses';
import { createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { bossZone } from '../entities/Boss';
import { chargeWindup, chooseAttack, inSlamArc, leapAirTime, slamWindup, startAttack } from './BossAttacks';
import { damageBoss } from './BossCombat';
import { bossSpeed, spawnBoss } from './BossSystem';
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

/** The charge's corridor boss `b` is announcing (fails if it is announcing anything else). */
function corridor(b: Parameters<typeof bossZone>[0]) {
  const zone = bossZone(b, TS);
  if (zone?.kind !== 'corridor') throw new Error(`no corridor: ${zone?.kind}`);
  return zone;
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
    const zone = corridor(b);
    expect(zone.width).toBe(CHARGE.width);
    expect(zone.dirX).toBeCloseTo(1);
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
    const zone = corridor(b);
    // The east wall (x 576) is 156 px from its centre: its front reaches it after 576 − 420 − 32 px.
    expect(zone.length).toBeLessThan(CHARGE.distance);
    expect(zone.x + zone.length).toBeLessThanOrEqual(576 + 1);
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

const SLAM = BOSSES.butcher.slam;
const LEAP = BOSSES.butcher.leap;

function attacking(ctx: SimContext, attack: 'slam' | 'leap', x: number, y: number) {
  const b = spawnBoss(ctx, 0, 'butcher', 'base', x, y);
  if (!b) throw new Error('no boss slot');
  startAttack(ctx, b, attack, player(ctx));
  return b;
}

describe('the triple slam (spec 07 §4.2)', () => {
  it('hits three times in its arc, each blow announced first, then stands still', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 260;
    p.y = p.prevY = 272;
    const b = attacking(ctx, 'slam', 200, 272);
    expect(bossZone(b, TS)?.kind).toBe('arc');
    runTicks(ctx, Math.ceil(slamWindup(b) * 60) + 1, stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp - SLAM.damage);
    expect(b.count).toBe(1);
    // Thrown away from it (16 px in all), and back in its arc for the next ones.
    p.x = p.prevX = b.x + 50;
    p.y = p.prevY = b.y;
    runTicks(ctx, Math.ceil(slamWindup(b) * 60) + 1, stepSimulation);
    p.x = p.prevX = b.x + 50;
    p.y = p.prevY = b.y;
    runTicks(ctx, Math.ceil(slamWindup(b) * 60) + 1, stepSimulation);
    expect(b.count).toBe(3);
    expect(p.hp).toBe(PLAYER.maxHp - 3 * SLAM.damage);
    expect(b.stage).toBe('recover');
    runTicks(ctx, Math.ceil(SLAM.recovery * 60) + 1, stepSimulation);
    expect(b.phase).toBe('walking');
    expect(b.lastAttack).toBe('slam');
  });

  it('misses outside its arc, beyond its reach and behind it', () => {
    const ctx = createTestContext();
    const b = attacking(ctx, 'slam', 300, 272);
    b.aimX = 1;
    b.aimY = 0;
    expect(inSlamArc(b, 380, 272)).toBe(true);
    expect(inSlamArc(b, 300 + SLAM.reach + 2, 272)).toBe(false);
    expect(inSlamArc(b, 300 + 30, 272 + 60)).toBe(true); // 63° off its aim: inside ±80°
    expect(inSlamArc(b, 300, 272 + 60)).toBe(false); // 90°
    expect(inSlamArc(b, 240, 272)).toBe(false);
  });

  it('turns towards the player at most 45° between blows, and steps forward', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 260;
    p.y = p.prevY = 272;
    const b = attacking(ctx, 'slam', 200, 272);
    // Behind it before the first blow falls: it can only turn 45° towards them.
    p.x = p.prevX = 120 + 30;
    p.y = p.prevY = 272;
    const x = b.x;
    runTicks(ctx, Math.ceil(slamWindup(b) * 60) + 1, stepSimulation);
    expect(Math.abs(Math.atan2(b.aimY, b.aimX))).toBeCloseTo(Math.PI / 4, 2);
    expect(Math.hypot(b.x - x, b.y - 272)).toBeCloseTo(SLAM.step, 0);
  });
});

describe('the three leaps (spec 07 §4.3)', () => {
  /** The player runs west at `speed` of their running speed from takeoff on; their health once the first ring is done. */
  function runFromLeap(speed: number): number {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 430;
    p.y = p.prevY = 272;
    const b = attacking(ctx, 'leap', 520, 272);
    expect(bossZone(b, TS)?.kind).toBe('circle');
    const cmd = ctx.commands[0];
    if (!cmd) throw new Error('no command');
    cmd.moveX = -speed;
    // In the air, then the ring all the way out; the next takeoff waits LEAP.between.
    runTicks(ctx, Math.ceil((leapAirTime(b) + LEAP.waveRadius / LEAP.waveSpeed) * 60) + 2, stepSimulation);
    expect(b.count).toBe(1);
    return p.hp;
  }

  it('lands where the player stood: running straight away from the circle, the ring never catches them; walking it does', () => {
    expect(runFromLeap(1)).toBe(PLAYER.maxHp);
    // Half speed (shooting): out of the landing, but the ring catches up.
    expect(runFromLeap(0.5)).toBe(PLAYER.maxHp - LEAP.waveDamage);
  });

  it('cannot be hurt in the air, and hurts whoever is under it when it lands', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 430;
    p.y = p.prevY = 272;
    const b = attacking(ctx, 'leap', 520, 272);
    stepSimulation(ctx, 1 / 60);
    expect(damageBoss(ctx, b, 10)).toBe(false);
    runTicks(ctx, Math.ceil(leapAirTime(b) * 60) + 1, stepSimulation);
    expect(b.count).toBe(1);
    expect(p.hp).toBeLessThanOrEqual(PLAYER.maxHp - LEAP.landDamage);
  });

  it('lands only where its footprint fits', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    // The player hugging the north-west corner of the room: it lands as close as it fits.
    p.x = p.prevX = 136;
    p.y = p.prevY = 136;
    const b = attacking(ctx, 'leap', 400, 300);
    expect(b.targetX - 32).toBeGreaterThanOrEqual(128);
    expect(b.targetY - 32).toBeGreaterThanOrEqual(128);
  });

  it('its ring stops at walls and hurts once per leap', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    // Lands by the room's south wall (y 416); the player behind it, in the corridor beyond.
    p.x = p.prevX = 300;
    p.y = p.prevY = 380;
    const b = attacking(ctx, 'leap', 300, 250);
    p.x = p.prevX = 300;
    p.y = p.prevY = 470;
    runTicks(ctx, Math.ceil((leapAirTime(b) + 1) * 60), stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp);
    // In the open, a ring hurts once even if the player stays in its band.
    const open = createTestContext();
    const q = player(open);
    q.x = q.prevX = 400;
    q.y = q.prevY = 272;
    const c = attacking(open, 'leap', 400, 272);
    q.x = q.prevX = c.targetX + 100;
    q.y = q.prevY = c.targetY;
    runTicks(open, Math.ceil((leapAirTime(c) + 1) * 60), stepSimulation);
    expect(q.hp).toBe(PLAYER.maxHp - LEAP.waveDamage);
  });

  it('spares a dashing player: landing and ring', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 430;
    p.y = p.prevY = 272;
    const b = attacking(ctx, 'leap', 520, 272);
    p.dashTimer = 100;
    p.dashCooldown = 100;
    runTicks(ctx, Math.ceil((leapAirTime(b) + 1) * 60), stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp);
  });
});

describe('picking an attack (spec 07 §4.4)', () => {
  function picks(distance: number, last: 'charge' | 'slam' | 'leap' | null, tries = 60): Set<string> {
    const ctx = createTestContext();
    const p = player(ctx);
    p.x = p.prevX = 160;
    p.y = p.prevY = 272;
    const b = spawnBoss(ctx, 0, 'butcher', 'base', 160 + distance, 272);
    if (!b) throw new Error('no boss');
    stepSimulation(ctx, 1 / 60);
    b.x = 160 + distance;
    b.y = 272;
    b.lastAttack = last;
    const seen = new Set<string>();
    for (let i = 0; i < tries; i++) seen.add(String(chooseAttack(ctx, b, 0, p)));
    return seen;
  }

  it('close: the slam or the leaps; mid-range with a clear way: the charge or the leaps; farther: the leaps', () => {
    expect(picks(60, null)).toEqual(new Set(['slam', 'leap']));
    expect(picks(200, null)).toEqual(new Set(['charge', 'leap']));
    expect(picks(300, null)).toEqual(new Set(['leap']));
  });

  it('never makes the same attack twice running', () => {
    expect(picks(60, 'slam')).toEqual(new Set(['leap']));
    expect(picks(200, 'leap')).toEqual(new Set(['charge']));
    expect(picks(300, 'leap')).toEqual(new Set(['null']));
  });
});

describe('the fury (spec 07 §5)', () => {
  it('under half its health it roars and is enraged until it dies: faster, shorter walks, the same windups', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const b = spawnBoss(ctx, 0, 'butcher', 'base', p.x + 150, p.y);
    if (!b) throw new Error('no boss');
    const roars: number[] = [];
    ctx.events.on('boss:roar', (e) => roars.push(e.x));
    const windup = chargeWindup(b);
    damageBoss(ctx, b, BOSSES.butcher.hp * 0.4);
    expect(b.enraged).toBe(false);
    damageBoss(ctx, b, BOSSES.butcher.hp * 0.15);
    expect(b.enraged).toBe(true);
    stepSimulation(ctx, 1 / 60);
    expect(b.phase).toBe('roaring');
    expect(roars).toHaveLength(1);
    runTicks(ctx, Math.ceil(BOSSES.butcher.fury.roarTime * 60) + 1, stepSimulation);
    expect(b.phase).toBe('walking');
    expect(bossSpeed(b)).toBeCloseTo(BOSSES.butcher.speed * 1.25);
    expect(b.walkTimer).toBeLessThanOrEqual(BOSSES.butcher.walkTime.max * 0.5);
    expect(chargeWindup(b)).toBe(windup);
  });
});
