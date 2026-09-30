import { describe, expect, it } from 'vitest';
import { LOADOUT, MELEE, WEAPONS } from '../../config/balance';
import { command, createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { stepSimulation } from './Simulation';
import { hasAnyAmmo, reloadProgress } from './WeaponSystem';

describe('WeaponSystem · firing', () => {
  it('fires the pistol at 4 shots/s while held', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    command(ctx).fire = true;
    runTicks(ctx, 60, stepSimulation); // 1 s: shots at 0, .25, .5, .75 (+1 at t=1 boundary)
    const fired = WEAPONS.pistol.magazine - (p.weapons[0]?.magazine ?? 0);
    expect(fired).toBeGreaterThanOrEqual(4);
    expect(fired).toBeLessThanOrEqual(5);
  });

  it('fires the SMG at 11 shots/s on average', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.activeSlot = 1;
    command(ctx).fire = true;
    runTicks(ctx, 120, stepSimulation); // 2 s -> 22 shots (+1)
    const fired = WEAPONS.smg.magazine - (p.weapons[1]?.magazine ?? 0);
    expect(fired).toBeGreaterThanOrEqual(22);
    expect(fired).toBeLessThanOrEqual(23);
  });

  it('records the tick of every bullet for the muzzle flash', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.lastShotTick).toBe(0);
    runTicks(ctx, 20, stepSimulation);
    expect(p.lastShotTick).toBe(15); // 4 shots/s at 60 Hz
  });

  it('does not fire without the trigger', () => {
    const ctx = createTestContext();
    runTicks(ctx, 60, stepSimulation);
    expect(player(ctx).weapons[0]?.magazine).toBe(WEAPONS.pistol.magazine);
    expect(ctx.state.bullets.some((b) => b.active)).toBe(false);
  });

  it('spawns bullets at the muzzle, within the spread cone', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const cmd = command(ctx);
    cmd.fire = true;
    cmd.aimManual = true;
    cmd.aimX = 1;
    cmd.aimY = 0;
    p.activeSlot = 1;
    for (let i = 0; i < 30; i++) {
      stepSimulation(ctx, 1 / 60);
      for (const b of ctx.state.bullets) {
        if (!b.active) continue;
        const deviation = Math.abs(Math.atan2(b.dirY, b.dirX)) * (180 / Math.PI);
        expect(deviation).toBeLessThanOrEqual(WEAPONS.smg.spread / 2 + 1e-6);
      }
    }
  });
});

describe('WeaponSystem · reload and switch', () => {
  it('reloads automatically when the magazine empties, taking 1.6 s', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const slot = p.weapons[0]!;
    slot.magazine = 1;
    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    command(ctx).fire = false;
    expect(slot.magazine).toBe(0);
    stepSimulation(ctx, 1 / 60);
    expect(p.reloadTimer).toBeCloseTo(WEAPONS.pistol.reloadTime, 5);
    expect(reloadProgress(p)).toBeCloseTo(0);
    runTicks(ctx, Math.round(WEAPONS.pistol.reloadTime * 60) - 2, stepSimulation);
    expect(slot.magazine).toBe(0);
    runTicks(ctx, 3, stepSimulation);
    expect(slot.magazine).toBe(WEAPONS.pistol.magazine);
    expect(slot.reserve).toBe(WEAPONS.pistol.startReserve - WEAPONS.pistol.magazine);
    expect(reloadProgress(p)).toBeNull();
  });

  it('reloads only what is left in reserve', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const slot = p.weapons[0]!;
    slot.magazine = 0;
    slot.reserve = 3;
    runTicks(ctx, 120, stepSimulation);
    expect(slot.magazine).toBe(3);
    expect(slot.reserve).toBe(0);
  });

  it('switches weapon in 0.4 s, cannot fire meanwhile, and cancels a reload', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const cmd = command(ctx);
    p.weapons[0]!.magazine = 0;
    stepSimulation(ctx, 1 / 60);
    expect(p.reloadTimer).toBeGreaterThan(0);

    cmd.switchWeapon = true;
    stepSimulation(ctx, 1 / 60);
    cmd.switchWeapon = false;
    expect(p.activeSlot).toBe(1);
    expect(p.reloadTimer).toBe(0);
    expect(p.switchTimer).toBeCloseTo(LOADOUT.switchTime);

    cmd.fire = true;
    runTicks(ctx, Math.floor(LOADOUT.switchTime * 60) - 1, stepSimulation);
    expect(p.weapons[1]!.magazine).toBe(WEAPONS.smg.magazine);
    runTicks(ctx, 3, stepSimulation);
    expect(p.weapons[1]!.magazine).toBeLessThan(WEAPONS.smg.magazine);
  });

  it('toggles back to the first slot', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const cmd = command(ctx);
    cmd.switchWeapon = true;
    stepSimulation(ctx, 1 / 60);
    stepSimulation(ctx, 1 / 60);
    expect(p.activeSlot).toBe(0);
  });
});

describe('WeaponSystem · aiming', () => {
  it('auto-aims at the nearest living zombie in range', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    placeZombie(ctx, 0, p.x + 100, p.y);
    placeZombie(ctx, 1, p.x, p.y - 60);
    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.aimX).toBeCloseTo(0);
    expect(p.aimY).toBeCloseTo(-1);
    expect(p.aimManual).toBe(false);
  });

  it('ignores zombies out of range or behind walls, then uses the facing', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    placeZombie(ctx, 0, p.x + WEAPONS.pistol.range + 20, p.y); // too far
    const d1 = ctx.map.doors[0]!;
    placeZombie(ctx, 1, d1.center.x, d1.center.y + 40); // behind the closed door
    p.facing = Math.PI; // west
    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.aimX).toBeCloseTo(-1);
    expect(p.aimY).toBeCloseTo(0);
  });

  it('sees through windows', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const w1 = ctx.map.windows[0]!;
    p.x = w1.center.x;
    p.y = w1.center.y + 60;
    placeZombie(ctx, 0, w1.exterior.x, w1.exterior.y);
    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.aimY).toBeCloseTo(-1);
  });

  it('uses the drag direction when aiming manually and faces it', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    placeZombie(ctx, 0, p.x, p.y - 50);
    const cmd = command(ctx);
    cmd.fire = true;
    cmd.aimManual = true;
    cmd.aimX = 1;
    cmd.aimY = 0;
    cmd.moveY = 1; // walking south while shooting east
    stepSimulation(ctx, 1 / 60);
    expect([p.aimX, p.aimY]).toEqual([1, 0]);
    expect(p.facing).toBeCloseTo(0);
    expect(p.aimManual).toBe(true);
  });
});

describe('WeaponSystem · melee', () => {
  it('melees when every weapon is empty: 50 damage every 0.6 s', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    for (const w of p.weapons) {
      w.magazine = 0;
      w.reserve = 0;
    }
    expect(hasAnyAmmo(p)).toBe(false);
    const z = placeZombie(ctx, 0, p.x + 20, p.y, 500);
    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    expect(z.hp).toBe(500 - MELEE.damage);
    runTicks(ctx, Math.floor(MELEE.cooldown * 60) - 1, stepSimulation);
    expect(z.hp).toBe(500 - MELEE.damage);
    runTicks(ctx, 2, stepSimulation);
    expect(z.hp).toBe(500 - 2 * MELEE.damage);
  });

  it('misses zombies beyond 20 px from their hitbox edge', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    for (const w of p.weapons) {
      w.magazine = 0;
      w.reserve = 0;
    }
    const z = placeZombie(ctx, 0, p.x + 40, p.y, 500);
    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    expect(z.hp).toBe(500);
  });
});
