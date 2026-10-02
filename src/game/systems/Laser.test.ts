import { describe, expect, it, vi } from 'vitest';
import { POINTS } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
import { createWeaponSlot } from '../../core/GameState';
import { command, createTestContext, holdFire, placeZombie, player, runTicks } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { refillWeapon } from './InventorySystem';
import { stepSimulation } from './Simulation';
import type { SimContext } from './SimContext';
import { updateWeapons } from './WeaponSystem';

/** Spec 06 §2.1: the laser, a continuous ray through every zombie in line, on a battery. */

const LASER = WEAPONS.laser;
const BATTERY = LASER.battery!;
const DT = 1 / 60;

function withLaser(): SimContext {
  const ctx = createTestContext();
  const p = player(ctx);
  p.weapons = [createWeaponSlot('laser')];
  p.activeSlot = 0;
  return ctx;
}

/** The fire button held (past the first-shot delay), dragged east. */
function beamEast(ctx: SimContext): void {
  Object.assign(holdFire(ctx), { aimManual: true, aimX: 1, aimY: 0 });
}

const slot = (ctx: SimContext) => player(ctx).weapons[0]!;

describe('laser', () => {
  it('does 6 per second to a zombie in the ray, in ticks of 0.1 s', () => {
    const ctx = withLaser();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 60, p.y, 100);
    beamEast(ctx);
    updateWeapons(ctx, DT);
    expect(z.hp).toBeCloseTo(100 - LASER.damage); // the first tick at once
    runTicks(ctx, 59, updateWeapons); // 1 s in all: ticks at 0, 0.1 … 0.9
    expect(z.hp).toBeCloseTo(100 - 6);
    expect(p.beamOn).toBe(true);
  });

  it('goes through every zombie in line, up to its 280 px', () => {
    const ctx = withLaser();
    const p = player(ctx);
    const line = [40, 90, 140].map((dx, i) => placeZombie(ctx, i, p.x + dx, p.y, 100));
    const off = placeZombie(ctx, 3, p.x + 60, p.y - 60, 100);
    beamEast(ctx);
    runTicks(ctx, 6, updateWeapons);
    for (const z of line) expect(z.hp).toBeCloseTo(100 - LASER.damage);
    expect(off.hp).toBe(100);
    expect(p.beamLength).toBeLessThanOrEqual(LASER.range);
  });

  it('is stopped by walls: the closed door shields the zombie behind it', () => {
    const ctx = withLaser();
    const p = player(ctx);
    const d1 = ctx.map.doors[0]!;
    p.x = d1.center.x;
    p.y = d1.y - 40;
    const z = placeZombie(ctx, 0, d1.center.x, d1.y + d1.height + 30, 100);
    Object.assign(holdFire(ctx), { aimManual: true, aimX: 0, aimY: 1 });
    runTicks(ctx, 12, updateWeapons);
    expect(z.hp).toBe(100);
    expect(p.beamLength).toBeLessThan(LASER.range);
  });

  it('waits for the first-shot delay like the guns, and only fires while held', () => {
    const ctx = withLaser();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 60, p.y, 100);
    Object.assign(command(ctx), { fire: true, aimManual: true, aimX: 1, aimY: 0 });
    runTicks(ctx, Math.floor(LASER.firstShotDelay * 60) - 1, updateWeapons);
    expect(z.hp).toBe(100);
    expect(p.beamOn).toBe(false);
    runTicks(ctx, 2, updateWeapons);
    expect(z.hp).toBeLessThan(100);
    // A tap shorter than the delay gives nothing (no pending shot for a beam).
    const ctx2 = withLaser();
    const z2 = placeZombie(ctx2, 0, player(ctx2).x + 60, player(ctx2).y, 100);
    command(ctx2).fire = true;
    runTicks(ctx2, 2, updateWeapons);
    command(ctx2).fire = false;
    runTicks(ctx2, 60, updateWeapons);
    expect(z2.hp).toBe(100);
  });

  it('drains 25 per second and recharges 20 per second once 0.8 s have passed without firing', () => {
    const ctx = withLaser();
    beamEast(ctx);
    runTicks(ctx, 120, updateWeapons); // 2 s
    expect(slot(ctx).battery).toBeCloseTo(BATTERY.capacity - 2 * BATTERY.drain, 0);
    command(ctx).fire = false;
    runTicks(ctx, Math.floor(BATTERY.rechargeDelay * 60) - 1, updateWeapons);
    expect(slot(ctx).battery).toBeCloseTo(50, 0);
    runTicks(ctx, 60 + 1, updateWeapons); // 1 s of recharge
    expect(slot(ctx).battery).toBeCloseTo(50 + BATTERY.recharge, 0);
  });

  it('overheats when it runs dry: locked 3 s, then it recharges as usual', () => {
    const ctx = withLaser();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 60, p.y, 1000);
    beamEast(ctx);
    runTicks(ctx, Math.ceil((BATTERY.capacity / BATTERY.drain) * 60) + 1, updateWeapons); // 4 s
    expect(slot(ctx).battery).toBe(0);
    expect(slot(ctx).overheat).toBeGreaterThan(BATTERY.overheatTime - 0.1);
    const hp = z.hp;
    runTicks(ctx, 60, updateWeapons); // still held: nothing comes out
    expect(p.beamOn).toBe(false);
    expect(z.hp).toBe(hp);
    runTicks(ctx, Math.ceil((BATTERY.overheatTime - 1) * 60), updateWeapons);
    expect(slot(ctx).overheat).toBe(0);
    command(ctx).fire = false;
    runTicks(ctx, 60, updateWeapons);
    expect(slot(ctx).battery).toBeCloseTo(BATTERY.recharge, 0);
  });

  it('recharges in the holster too', () => {
    const ctx = withLaser();
    const p = player(ctx);
    p.weapons.push(createWeaponSlot('pistol'));
    slot(ctx).battery = 10;
    p.activeSlot = 1;
    runTicks(ctx, 60 * 2, updateWeapons);
    expect(slot(ctx).battery).toBeGreaterThan(10);
  });

  it('scores one hit per zombie each 0.5 s of contact, not one per tick', () => {
    const ctx = withLaser();
    const p = player(ctx);
    placeZombie(ctx, 0, p.x + 60, p.y, 1000);
    placeZombie(ctx, 1, p.x + 100, p.y, 1000);
    const money = p.money;
    beamEast(ctx);
    runTicks(ctx, 60, stepSimulation); // hits scored at 0 and 0.5 s
    expect(p.money).toBe(money + 2 * 2 * POINTS.hit);
  });

  it('uses no ammo: max ammo and ammo pickups leave its battery alone', () => {
    const ctx = withLaser();
    beamEast(ctx);
    runTicks(ctx, 60, updateWeapons);
    const battery = slot(ctx).battery;
    refillWeapon(slot(ctx));
    expect(slot(ctx).battery).toBe(battery);
    expect(slot(ctx)).toMatchObject({ magazine: 0, reserve: 0 });
  });

  it('shows its battery on the HUD, and when it is overheated', () => {
    const ctx = withLaser();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const weapon = vi.fn();
    ctx.events.on('weapon:state', weapon);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenLastCalledWith(expect.objectContaining({ weapon: 'laser', ammo: 'battery', battery: 1, overheated: false }));
    slot(ctx).battery = 0;
    slot(ctx).overheat = 2;
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenLastCalledWith(expect.objectContaining({ battery: 0, overheated: true }));
  });
});
