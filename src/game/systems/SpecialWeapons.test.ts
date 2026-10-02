import { describe, expect, it } from 'vitest';
import { POINTS } from '../../config/balance';
import { merchantDef } from '../../config/merchants';
import { WEAPON_SPECIALS, WEAPONS, type WeaponId } from '../../config/weapons';
import { createWeaponSlot } from '../../core/GameState';
import { command, createTestContext, holdFire, placeZombie, player, runTicks } from '../../test/fixtures';
import { updateBurns } from './BurnSystem';
import type { SimContext } from './SimContext';
import { shopItemStatus } from './ShopSystem';
import { stepSimulation } from './Simulation';
import { updateWeapons } from './WeaponSystem';

/** Spec 06 §2.3 and §4: the flamethrower, the gold specials of the three special weapons, and the merchants. */

const FLAMER = WEAPONS.flamethrower;
const DT = 1 / 60;

function holding(id: WeaponId, special = false): SimContext {
  const ctx = createTestContext();
  const p = player(ctx);
  p.weapons = [createWeaponSlot(id)];
  p.weapons[0]!.special = special;
  p.activeSlot = 0;
  return ctx;
}

/** Fire held past the first-shot delay, dragged east. */
const fireEast = (ctx: SimContext): void => void Object.assign(holdFire(ctx), { aimManual: true, aimX: 1, aimY: 0 });
const slot = (ctx: SimContext) => player(ctx).weapons[0]!;

describe('flamethrower', () => {
  it('burns every zombie in its 40° cone within 90 px, and none outside', () => {
    const ctx = holding('flamethrower');
    const p = player(ctx);
    const inside = [placeZombie(ctx, 0, p.x + 50, p.y, 100), placeZombie(ctx, 1, p.x + 70, p.y + 15, 100)]; // 12°
    const wide = placeZombie(ctx, 2, p.x + 40, p.y + 30, 100); // 37°: outside ±20°
    const far = placeZombie(ctx, 3, p.x + 110, p.y, 100); // 104 px to its hitbox
    fireEast(ctx);
    updateWeapons(ctx, DT);
    for (const z of inside) {
      expect(z.hp).toBeCloseTo(100 - FLAMER.damage);
      expect(z.burn.timer).toBeCloseTo(FLAMER.burn!.duration);
    }
    expect([wide.hp, far.hp]).toEqual([100, 100]);
    expect(wide.burn.timer).toBe(0);
    expect(player(ctx).coneOn).toBe(true);
  });

  it('does not burn a zombie out of sight: walls stop the jet', () => {
    const ctx = holding('flamethrower');
    const p = player(ctx);
    const d1 = ctx.map.doors[0]!;
    p.x = d1.center.x;
    p.y = d1.y - 20;
    const z = placeZombie(ctx, 0, d1.center.x, d1.y + d1.height + 20, 100);
    Object.assign(holdFire(ctx), { aimManual: true, aimX: 0, aimY: 1 });
    runTicks(ctx, 12, updateWeapons);
    expect(z.hp).toBe(100);
    expect(z.burn.timer).toBe(0);
  });

  it('spends 12 rounds per second of jet and reloads its 60-round tank in 2.5 s', () => {
    const ctx = holding('flamethrower');
    fireEast(ctx);
    runTicks(ctx, 60, updateWeapons);
    expect(slot(ctx).magazine).toBe(FLAMER.magazine - 12);
    runTicks(ctx, 60 * 4, updateWeapons); // 5 s in all: empty
    expect(slot(ctx).magazine).toBe(0);
    runTicks(ctx, 2, updateWeapons);
    expect(player(ctx).reloadTimer).toBeGreaterThan(FLAMER.reloadTime - 0.1);
    command(ctx).fire = false;
    runTicks(ctx, Math.ceil(FLAMER.reloadTime * 60) + 1, updateWeapons);
    expect(slot(ctx)).toMatchObject({ magazine: FLAMER.magazine, reserve: FLAMER.startReserve - FLAMER.magazine });
  });

  it('sets on fire for 2 units over 2 s; touching again restarts the fire, never stacks it', () => {
    const ctx = holding('flamethrower');
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 50, p.y, 100);
    fireEast(ctx);
    runTicks(ctx, 30, updateWeapons); // 0.5 s in the jet: 5 ticks of 0.4
    command(ctx).fire = false;
    updateWeapons(ctx, DT);
    const direct = 100 - z.hp;
    expect(direct).toBeCloseTo(5 * FLAMER.damage);
    runTicks(ctx, 60 * 3, (c, dt) => updateBurns(c, dt));
    // One fire of 2 units (restarted by every touch), plus the few ticks while it burned in the jet.
    expect(100 - z.hp - direct).toBeLessThan(FLAMER.burn!.damage + 0.8);
    expect(100 - z.hp - direct).toBeGreaterThan(FLAMER.burn!.damage - 0.2);
    expect(z.burn.timer).toBe(0);
  });

  it('scores once per zombie each 0.5 s, and its fire ticks never', () => {
    const ctx = holding('flamethrower');
    const p = player(ctx);
    placeZombie(ctx, 0, p.x + 50, p.y, 1000);
    const money = p.money;
    fireEast(ctx);
    runTicks(ctx, 60, stepSimulation);
    command(ctx).fire = false;
    runTicks(ctx, 180, stepSimulation); // still burning: no points
    expect(p.money).toBe(money + 2 * POINTS.hit);
  });

  it('waits for the first-shot delay like the guns', () => {
    const ctx = holding('flamethrower');
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 50, p.y, 100);
    Object.assign(command(ctx), { fire: true, aimManual: true, aimX: 1, aimY: 0 });
    runTicks(ctx, Math.floor(FLAMER.firstShotDelay * 60) - 1, updateWeapons);
    expect(z.hp).toBe(100);
    expect(slot(ctx).magazine).toBe(FLAMER.magazine);
    runTicks(ctx, 2, updateWeapons);
    expect(z.hp).toBeLessThan(100);
  });
});

describe('gold specials of the special weapons', () => {
  it('flamethrower, "Fuego infernal": one that dies burning bursts, 2 damage in 40 px, and the bursts chain', () => {
    const ctx = holding('flamethrower', true);
    const p = player(ctx);
    const first = placeZombie(ctx, 0, p.x + 60, p.y, 0.3); // in the jet, dies on the first tick
    const second = placeZombie(ctx, 1, p.x + 60, p.y + 35, 1); // 31°: out of the jet, in the burst
    const third = placeZombie(ctx, 2, p.x + 60, p.y + 70, 100); // only the second one's burst reaches it
    const blasts: unknown[] = [];
    ctx.events.on('fire:blast', (e) => blasts.push(e));
    fireEast(ctx);
    stepSimulation(ctx, DT);
    expect(first.ai).toBe('dead');
    expect(second.ai).toBe('dead');
    expect(third.hp).toBeCloseTo(100 - WEAPON_SPECIALS.hellfire.damage);
    expect(third.burn.hellfire).toBe(true);
    expect(blasts).toHaveLength(2);
  });

  it('flamethrower without it: no burst', () => {
    const ctx = holding('flamethrower');
    const p = player(ctx);
    placeZombie(ctx, 0, p.x + 60, p.y, 0.3);
    const near = placeZombie(ctx, 1, p.x + 60, p.y + 35, 1);
    fireEast(ctx);
    stepSimulation(ctx, DT);
    expect(near.hp).toBe(1);
  });

  it('laser, "Sobrecarga": twice the damage and the battery lasts twice as long', () => {
    const plain = holding('laser');
    const charged = holding('laser', true);
    const zs = [plain, charged].map((ctx) => placeZombie(ctx, 0, player(ctx).x + 60, player(ctx).y, 100));
    for (const ctx of [plain, charged]) {
      fireEast(ctx);
      runTicks(ctx, 60, updateWeapons);
    }
    expect(100 - zs[1]!.hp).toBeCloseTo(2 * (100 - zs[0]!.hp));
    const battery = WEAPONS.laser.battery!;
    expect(battery.capacity - slot(charged).battery).toBeCloseTo((battery.capacity - slot(plain).battery) / 2);
  });

  it('katana, "Filo de sangre": each kill heals 2, at most 10 per sweep', () => {
    const run = (special: boolean): number => {
      const ctx = holding('katana', special);
      const p = player(ctx);
      p.hp = 50;
      // Six weak zombies in the arc: six kills.
      for (let i = 0; i < 6; i++) placeZombie(ctx, i, p.x + 20, p.y - 15 + i * 6, 1);
      fireEast(ctx);
      updateWeapons(ctx, DT);
      return p.hp;
    };
    expect(run(false)).toBe(50);
    expect(run(true)).toBe(50 + WEAPON_SPECIALS.blood_edge.maxHealPerSweep);
    const one = holding('katana', true);
    player(one).hp = 50;
    placeZombie(one, 0, player(one).x + 20, player(one).y, 1);
    fireEast(one);
    updateWeapons(one, DT);
    expect(player(one).hp).toBe(50 + WEAPON_SPECIALS.blood_edge.healPerKill);
  });
});

describe('merchants with a special weapon (spec 06 §4)', () => {
  const merchant = (ctx: SimContext, id: 'blue' | 'red' | 'gold'): number => {
    const i = ctx.state.merchants.findIndex((m) => m.id === id);
    ctx.state.merchants[i]!.active = true;
    return i;
  };
  const item = (id: 'blue' | 'red' | 'gold', item: string): number => merchantDef(id).items.findIndex((it) => it.id === item);

  it('red: its three rows say not upgradable', () => {
    for (const id of ['katana', 'laser', 'flamethrower'] as const) {
      const ctx = holding(id);
      player(ctx).money = 100_000;
      const red = merchant(ctx, 'red');
      for (const kind of ['upgrade_ammo', 'upgrade_fire_rate', 'upgrade_damage']) {
        expect(shopItemStatus(ctx.state, red, 0, item('red', kind)), `${id} ${kind}`).toEqual({ kind: 'unavailable', reason: 'notUpgradable' });
      }
    }
  });

  it('gold: sells the special of each one', () => {
    for (const id of ['katana', 'laser', 'flamethrower'] as const) {
      const ctx = holding(id);
      player(ctx).money = 100_000;
      expect(shopItemStatus(ctx.state, merchant(ctx, 'gold'), 0, item('gold', 'weapon_special'), 0), id).toEqual({ kind: 'buy' });
    }
  });

  it('blue, max ammo: refills the flamethrower and leaves the laser and the katana alone', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.weapons = [createWeaponSlot('flamethrower'), createWeaponSlot('laser'), createWeaponSlot('katana')];
    p.weapons[0]!.magazine = 3;
    p.weapons[0]!.reserve = 10;
    p.weapons[1]!.battery = 40;
    p.money = 100_000;
    const blue = merchant(ctx, 'blue');
    expect(shopItemStatus(ctx.state, blue, 0, item('blue', 'max_ammo'))).toEqual({ kind: 'buy' });
    p.weapons[0]!.magazine = FLAMER.magazine;
    p.weapons[0]!.reserve = FLAMER.maxReserve;
    // With the flamethrower full, nothing left to buy: the laser's battery and the katana do not count.
    expect(shopItemStatus(ctx.state, blue, 0, item('blue', 'max_ammo'))).toEqual({ kind: 'unavailable', reason: 'ammoFull' });
  });
});
