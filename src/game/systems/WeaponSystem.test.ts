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

  it('keeps its rate after a reload with the trigger held: no burst of the shots missed while reloading', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.activeSlot = 1; // SMG, the fastest
    const slot = p.weapons[1]!;
    slot.magazine = 1;
    command(ctx).fire = true;
    const shotTicks: number[] = [];
    let last = p.lastShotTick;
    for (let t = 0; t < Math.round((WEAPONS.smg.reloadTime + 1) * 60); t++) {
      stepSimulation(ctx, 1 / 60);
      if (p.lastShotTick !== last) shotTicks.push((last = p.lastShotTick));
    }
    // First shot, the reload, then shots spaced at the weapon's rate again: never two on consecutive ticks.
    expect(shotTicks.length).toBeGreaterThan(5);
    const gaps = shotTicks.slice(1).map((tick, i) => tick - (shotTicks[i] ?? 0));
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(Math.floor(60 / WEAPONS.smg.fireRate));
  });

  it('reloads on demand with room in the magazine and bullets in reserve, not otherwise', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const slot = p.weapons[0]!;
    const cmd = command(ctx);
    // Full magazine: nothing to reload.
    cmd.reload = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.reloadTimer).toBe(0);
    // Two shots fired: the reload starts and tops the magazine up from the reserve.
    slot.magazine -= 2;
    const reserve = slot.reserve;
    cmd.reload = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.reloadTimer).toBeGreaterThan(0);
    runTicks(ctx, Math.round(WEAPONS.pistol.reloadTime * 60) + 2, stepSimulation);
    expect(slot.magazine).toBe(WEAPONS.pistol.magazine);
    expect(slot.reserve).toBe(reserve - 2);
    // Without reserve the button does nothing.
    slot.magazine = 3;
    slot.reserve = 0;
    cmd.reload = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.reloadTimer).toBe(0);
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

  it('picks the weapon of the HUD slot tapped, with the switch time; the same or a missing slot does nothing', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const cmd = command(ctx);
    cmd.selectWeapon = 1;
    stepSimulation(ctx, 1 / 60);
    cmd.selectWeapon = -1;
    expect(p.activeSlot).toBe(1);
    expect(p.switchTimer).toBeCloseTo(LOADOUT.switchTime);
    runTicks(ctx, 60, stepSimulation);
    // The slot already in hand, or one beyond the weapons carried: nothing happens.
    for (const slot of [1, 2, 5]) {
      cmd.selectWeapon = slot;
      stepSimulation(ctx, 1 / 60);
      expect(p.activeSlot).toBe(1);
      expect(p.switchTimer).toBe(0);
    }
    cmd.selectWeapon = 0;
    stepSimulation(ctx, 1 / 60);
    expect(p.activeSlot).toBe(0);
  });

  it('never carries more than LOADOUT.maxWeapons weapons', () => {
    expect(player(createTestContext()).weapons.length).toBeLessThanOrEqual(LOADOUT.maxWeapons);
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
  it('knifes from its own button at any time, turning to the nearest zombie in reach, even behind', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.facing = 0; // facing east…
    const z = placeZombie(ctx, 0, p.x - 18, p.y, 500); // …with a zombie right behind
    const magazine = p.weapons[0]!.magazine;
    const cmd = command(ctx);
    cmd.melee = true;
    stepSimulation(ctx, 1 / 60);
    expect(z.hp).toBe(500 - MELEE.damage);
    expect(p.weapons[0]!.magazine).toBe(magazine); // no bullet fired
    expect(Math.cos(p.meleeAngle)).toBeCloseTo(-1); // turned to it
    expect(p.facing).toBeCloseTo(p.meleeAngle);
    expect(p.meleeTimer).toBeGreaterThan(0);
  });

  it('sprays blood from the knifed zombie\'s body, away from the player', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 18, p.y, 500);
    const hits: { x: number; y: number; dirX: number; groundY: number }[] = [];
    ctx.events.on('zombie:hit', (e) => hits.push(e));
    command(ctx).melee = true;
    stepSimulation(ctx, 1 / 60);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.x).toBe(z.x);
    expect(hits[0]?.y).toBeLessThan(z.y);
    expect(hits[0]?.groundY).toBe(z.y);
    expect(hits[0]?.dirX).toBeCloseTo(1);
  });

  it('waits its cooldown between slashes and swings even when nothing is in reach', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 18, p.y, 500);
    const cmd = command(ctx);
    cmd.melee = true;
    stepSimulation(ctx, 1 / 60);
    runTicks(ctx, Math.floor(MELEE.cooldown * 60) - 2, stepSimulation); // pressed again and again: ignored
    expect(z.hp).toBe(500 - MELEE.damage);
    runTicks(ctx, 3, stepSimulation);
    expect(z.hp).toBe(500 - 2 * MELEE.damage);
    // With nothing in reach the slash still happens, where the player faces.
    z.x += 200;
    p.facing = Math.PI / 2;
    runTicks(ctx, Math.ceil(MELEE.cooldown * 60) + 1, stepSimulation);
    expect(z.hp).toBe(500 - 2 * MELEE.damage);
    expect(p.meleeTick).toBeGreaterThan(Math.floor(MELEE.cooldown * 60));
    expect(Math.sin(p.meleeAngle)).toBeCloseTo(1);
  });

  it('knifes with the fire button when every weapon is empty, every 0.6 s', () => {
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

describe('shots from the drawn muzzle', () => {
  /** The player art's muzzle points (DIRECTIONS_8 order), as measured in the manifest. */
  const ART_MUZZLES = [
    { x: -1, y: -9 },
    { x: 16, y: -13 },
    { x: 20, y: -23 },
    { x: 16, y: -33 },
    { x: -1, y: -41 },
    { x: -17, y: -33 },
    { x: -21, y: -23 },
    { x: -16, y: -12 },
  ];

  function autoFireAt(dx: number, dy: number): number {
    const ctx = createTestContext();
    ctx.muzzles = ART_MUZZLES;
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + dx, p.y + dy, 1000);
    const cmd = command(ctx);
    cmd.fire = true;
    cmd.aimManual = false;
    runTicks(ctx, 40, stepSimulation);
    return z.hp;
  }

  it('auto-aim hits in all 8 directions', () => {
    for (const [dx, dy] of [
      [120, 0],
      [-120, 0],
      [0, 110],
      [0, -110],
      [85, 85],
      [-85, 85],
      [85, -85],
      [-85, -85],
    ] as const) {
      expect(autoFireAt(dx, dy), `${dx},${dy}`).toBeLessThan(1000);
    }
  });

  it('hits a zombie right in front even when the gun is drawn beyond it (point-blank)', () => {
    const ctx = createTestContext();
    ctx.muzzles = ART_MUZZLES;
    const p = player(ctx);
    // Facing north the muzzle is drawn 41 px up, above this zombie's head.
    const z = placeZombie(ctx, 0, p.x, p.y - 10, 1000);
    const cmd = command(ctx);
    Object.assign(cmd, { fire: true, aimManual: true, aimX: 0, aimY: -1 });
    stepSimulation(ctx, 1 / 60);
    expect(z.hp).toBe(1000 - WEAPONS.pistol.damage);
  });

  it('draws each bullet from the muzzle of its direction', () => {
    const ctx = createTestContext();
    ctx.muzzles = ART_MUZZLES;
    const p = player(ctx);
    const cmd = command(ctx);
    Object.assign(cmd, { fire: true, aimManual: true, aimX: 1, aimY: 0 });
    stepSimulation(ctx, 1 / 60);
    const b = ctx.state.bullets.find((x) => x.active)!;
    expect(b.prevX + b.drawX).toBeCloseTo(p.x + 20);
    expect(b.prevY + b.drawY).toBeCloseTo(p.y - 23);
  });
});
