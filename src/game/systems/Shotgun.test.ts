import { describe, expect, it } from 'vitest';
import { PLAYER, POINTS } from '../../config/balance';
import { WEAPON_SPECIALS, WEAPONS } from '../../config/weapons';
import { createWeaponSlot } from '../../core/GameState';
import { createTestContext, holdFire, placeZombie, player, runTicks } from '../../test/fixtures';
import { falloffFactor, updateBullets } from './BulletSystem';
import { burnTicks, igniteZombie, isBurning, updateBurns } from './BurnSystem';
import { stepSimulation } from './Simulation';

type Ctx = ReturnType<typeof createTestContext>;
const SHOTGUN = WEAPONS.shotgun;

/** The player holding only a shotgun, with the special if asked. */
function withShotgun(special = false): Ctx {
  const ctx = createTestContext();
  const p = player(ctx);
  const slot = createWeaponSlot('shotgun');
  slot.special = special;
  p.weapons = [slot];
  p.activeSlot = 0;
  return ctx;
}

function pullTrigger(ctx: Ctx, aimX = 1, aimY = 0): void {
  const cmd = holdFire(ctx);
  cmd.aimManual = true;
  cmd.aimX = aimX;
  cmd.aimY = aimY;
  stepSimulation(ctx, 1 / 60);
  cmd.fire = false;
}

const activeBullets = (ctx: Ctx) => ctx.state.bullets.filter((b) => b.active);

describe('hunting shotgun (spec 04 §1)', () => {
  it('fires 6 pellets for one shell', () => {
    const ctx = withShotgun();
    const slot = player(ctx).weapons[0]!;
    expect(slot.magazine).toBe(SHOTGUN.magazine);
    pullTrigger(ctx);
    expect(activeBullets(ctx)).toHaveLength(SHOTGUN.pellets ?? 0);
    expect(slot.magazine).toBe(SHOTGUN.magazine - 1);
  });

  it('spreads them evenly over 22° with a small random variation each', () => {
    const ctx = withShotgun();
    pullTrigger(ctx);
    const angles = activeBullets(ctx)
      .map((b) => (Math.atan2(b.dirY, b.dirX) * 180) / Math.PI)
      .sort((a, b) => a - b);
    const jitter = SHOTGUN.pelletJitter ?? 0;
    const width = angles[angles.length - 1]! - angles[0]!;
    expect(width).toBeGreaterThan(SHOTGUN.spread! - jitter - 1e-6);
    expect(width).toBeLessThan(SHOTGUN.spread! + jitter + 1e-6);
    const step = SHOTGUN.spread! / ((SHOTGUN.pellets ?? 2) - 1);
    for (let i = 1; i < angles.length; i++) {
      const gap = angles[i]! - angles[i - 1]!;
      expect(gap).toBeGreaterThan(step - jitter - 1e-6);
      expect(gap).toBeLessThan(step + jitter + 1e-6);
    }
    // All pellets centred on the aim.
    expect((angles[0]! + angles[angles.length - 1]!) / 2).toBeCloseTo(0, 0);
  });

  it('does full damage up to 60 px and falls linearly to 40 % at its range', () => {
    const b = { range: SHOTGUN.range - PLAYER.muzzleDistance, falloffFrom: 60 - PLAYER.muzzleDistance, falloffMin: 0.4 };
    expect(falloffFactor(b, 0)).toBe(1);
    expect(falloffFactor(b, 60 - PLAYER.muzzleDistance)).toBe(1);
    expect(falloffFactor(b, b.range)).toBeCloseTo(0.4);
    // Halfway between 60 px and the range: halfway between 100 % and 40 %.
    expect(falloffFactor(b, (b.falloffFrom + b.range) / 2)).toBeCloseTo(0.7);
    // Bullets without falloff always do full damage.
    expect(falloffFactor({ range: 300, falloffFrom: 0, falloffMin: 1 }, 290)).toBe(1);
  });

  it('a close zombie takes the full 0.9 per pellet and is pushed back a little', () => {
    const ctx = withShotgun();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 30, p.y, 1000, 'chasing');
    const x0 = z.x;
    pullTrigger(ctx);
    runTicks(ctx, 10, (c, dt) => updateBullets(c, dt));
    const lost = 1000 - z.hp;
    // Every pellet that hit did 0.9: the damage is a whole number of pellets.
    expect(lost).toBeGreaterThan(0);
    const pellets = lost / SHOTGUN.damage;
    expect(Math.abs(pellets - Math.round(pellets))).toBeLessThan(1e-6);
    expect(z.x).toBeGreaterThan(x0);
  });

  it('pellets from far away do less than up close', () => {
    const near = withShotgun();
    const zn = placeZombie(near, 0, player(near).x + 30, player(near).y, 1000, 'idle');
    pullTrigger(near);
    runTicks(near, 30, (c, dt) => updateBullets(c, dt));
    const far = withShotgun();
    const zf = placeZombie(far, 0, player(far).x + 130, player(far).y, 1000, 'idle');
    pullTrigger(far);
    runTicks(far, 30, (c, dt) => updateBullets(c, dt));
    const perPelletNear = (1000 - zn.hp) / Math.max(1, Math.round((1000 - zn.hp) / SHOTGUN.damage));
    expect(perPelletNear).toBeCloseTo(SHOTGUN.damage);
    expect(1000 - zf.hp).toBeGreaterThan(0);
    expect(1000 - zf.hp).toBeLessThan(1000 - zn.hp);
  });

  it('with the fire special its pellets are orange and set zombies on fire', () => {
    const ctx = withShotgun(true);
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 30, p.y, 1000, 'idle');
    pullTrigger(ctx);
    expect(activeBullets(ctx).every((b) => b.look === 'fire' && b.burns)).toBe(true);
    runTicks(ctx, 10, (c, dt) => updateBullets(c, dt));
    expect(isBurning(z)).toBe(true);
  });
});

describe('burn effect (spec 04 §1)', () => {
  const FIRE = WEAPON_SPECIALS.fire;
  /** The shotgun's fire for a pellet hit of `hit`: 40 % of it over 1.5 s. */
  const shotgunFire = (z: Parameters<typeof igniteZombie>[0], hit: number, owner: number): void =>
    igniteZombie(z, hit * FIRE.fireDamageFactor, FIRE.fireDuration, owner);
  const burnPerTick = (hit: number): number => (hit * FIRE.fireDamageFactor) / burnTicks(FIRE.fireDuration);

  it('burns for 40 % of the hit in total, a tick every 0.15 s for 1.5 s', () => {
    const ctx = createTestContext();
    const z = placeZombie(ctx, 0, 100, 100, 1000, 'idle');
    shotgunFire(z, 1, 0);
    const changes: number[] = [];
    let hp = z.hp;
    for (let t = 1; t <= 120; t++) {
      updateBurns(ctx, 1 / 60);
      if (z.hp !== hp) {
        changes.push(t);
        hp = z.hp;
      }
    }
    expect(burnTicks(FIRE.fireDuration)).toBe(10);
    expect(changes).toHaveLength(10);
    // Every 9 sim ticks = 0.15 s.
    expect(changes).toEqual([9, 18, 27, 36, 45, 54, 63, 72, 81, 90]);
    expect(1000 - z.hp).toBeCloseTo(FIRE.fireDamageFactor);
    expect(isBurning(z)).toBe(false);
  });

  it('a new hit restarts the duration without stacking, keeping the highest damage per tick', () => {
    const ctx = createTestContext();
    const z = placeZombie(ctx, 0, 100, 100, 1000, 'idle');
    shotgunFire(z, 1, 0);
    runTicks(ctx, 36, (c, dt) => updateBurns(c, dt)); // 4 ticks
    expect(1000 - z.hp).toBeCloseTo(4 * burnPerTick(1));
    shotgunFire(z, 0.5, 0); // weaker: the per-tick damage stays
    expect(z.burn.perTick).toBeCloseTo(burnPerTick(1));
    expect(z.burn.timer).toBeCloseTo(FIRE.fireDuration);
    runTicks(ctx, 120, (c, dt) => updateBurns(c, dt));
    // 4 ticks before the new hit and a full fire of 10 after it: one fire, not two.
    expect(1000 - z.hp).toBeCloseTo(14 * burnPerTick(1));
    shotgunFire(z, 2, 0); // stronger: takes over
    expect(z.burn.perTick).toBeCloseTo(burnPerTick(2));
  });

  it('gives no points for fire ticks, only the kill if it dies burning', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, 100, 100, 1000, 'idle');
    const money = p.money;
    shotgunFire(z, 1, p.id);
    runTicks(ctx, 100, (c, dt) => updateBurns(c, dt));
    expect(p.money).toBe(money);
    // Now one that dies to the fire.
    const weak = placeZombie(ctx, 1, 140, 100, burnPerTick(1) * 2.5, 'idle');
    shotgunFire(weak, 1, p.id);
    runTicks(ctx, 100, (c, dt) => updateBurns(c, dt));
    expect(weak.ai).toBe('dead');
    expect(p.money).toBe(money + POINTS.kill);
  });

  it('can turn a zombie into a crawler on a fire tick', () => {
    const ctx = createTestContext();
    const z = placeZombie(ctx, 0, 100, 100, 1 + burnPerTick(1) / 2, 'chasing');
    shotgunFire(z, 1, 0);
    runTicks(ctx, 9, (c, dt) => updateBurns(c, dt));
    expect(z.hp).toBeLessThanOrEqual(1);
    expect(z.hp).toBeGreaterThan(0);
  });
});
