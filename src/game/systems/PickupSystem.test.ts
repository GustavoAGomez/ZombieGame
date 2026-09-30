import { describe, expect, it, vi } from 'vitest';
import { PICKUPS, PLAYER, WEAPONS } from '../../config/balance';
import { createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { damageZombie } from './Combat';
import { applyPickup, dropKindFor, spawnPickup } from './PickupSystem';
import { stepSimulation } from './Simulation';

describe('dropKindFor', () => {
  it('splits one roll into ammo, health or nothing', () => {
    expect(dropKindFor(0)).toBe('ammo');
    expect(dropKindFor(PICKUPS.ammoChance - 1e-9)).toBe('ammo');
    expect(dropKindFor(PICKUPS.ammoChance)).toBe('health');
    expect(dropKindFor(PICKUPS.ammoChance + PICKUPS.healthChance - 1e-9)).toBe('health');
    expect(dropKindFor(PICKUPS.ammoChance + PICKUPS.healthChance)).toBeNull();
    expect(dropKindFor(0.999)).toBeNull();
  });
});

describe('drops from killed zombies', () => {
  it('drops at roughly the configured rates', () => {
    const ctx = createTestContext(123);
    const kills = 3000;
    let ammo = 0;
    let health = 0;
    for (let i = 0; i < kills; i++) {
      for (const p of ctx.state.pickups) p.active = false;
      const z = placeZombie(ctx, 0, 300, 300, 1);
      damageZombie(ctx, z, 10);
      const drop = ctx.state.pickups.find((p) => p.active);
      if (drop?.kind === 'ammo') ammo++;
      if (drop?.kind === 'health') health++;
    }
    expect(ammo / kills).toBeCloseTo(PICKUPS.ammoChance, 1);
    expect(health / kills).toBeCloseTo(PICKUPS.healthChance, 1);
  });

  it('moves drops of zombies killed outside to the window interior point', () => {
    const ctx = createTestContext(1);
    const w1 = ctx.map.windows[0]!;
    let found = false;
    for (let i = 0; i < 500 && !found; i++) {
      const z = placeZombie(ctx, 0, w1.exterior.x, w1.exterior.y - 20, 1);
      z.window = 0;
      damageZombie(ctx, z, 10);
      const drop = ctx.state.pickups.find((p) => p.active);
      if (drop) {
        expect([drop.x, drop.y]).toEqual([w1.interior.x, w1.interior.y]);
        found = true;
      }
    }
    expect(found).toBe(true);
  });
});

describe('collecting pickups', () => {
  it('heals 50 HP on touch and emits pickup:collected', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.hp = 30;
    p.lastDamageTime = ctx.state.time; // no regeneration during the test
    const onCollected = vi.fn();
    ctx.events.on('pickup:collected', onCollected);
    spawnPickup(ctx, 'health', p.x + PLAYER.hitboxRadius + PICKUPS.radius - 1, p.y);
    stepSimulation(ctx, 1 / 60);
    expect(p.hp).toBe(30 + PICKUPS.healthAmount);
    expect(ctx.state.pickups.some((x) => x.active)).toBe(false);
    expect(onCollected).toHaveBeenCalledWith({ playerId: 0, kind: 'health' });
  });

  it('adds one magazine to each reserve, capped at the maximum', () => {
    const p = player(createTestContext());
    p.weapons[0]!.reserve = 10;
    p.weapons[1]!.reserve = WEAPONS.smg.maxReserve - 5;
    expect(applyPickup(p, 'ammo')).toBe(true);
    expect(p.weapons[0]!.reserve).toBe(10 + WEAPONS.pistol.magazine);
    expect(p.weapons[1]!.reserve).toBe(WEAPONS.smg.maxReserve);
  });

  it('stays on the floor when it would be wasted', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    spawnPickup(ctx, 'health', p.x, p.y);
    spawnPickup(ctx, 'ammo', p.x, p.y);
    stepSimulation(ctx, 1 / 60);
    expect(ctx.state.pickups.filter((x) => x.active)).toHaveLength(2);
  });

  it('is not collected from afar', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.hp = 10;
    p.lastDamageTime = ctx.state.time;
    spawnPickup(ctx, 'health', p.x + PLAYER.hitboxRadius + PICKUPS.radius + 2, p.y);
    stepSimulation(ctx, 1 / 60);
    expect(p.hp).toBe(10);
  });

  it('disappears after 15 s', () => {
    const ctx = createTestContext();
    const pickup = spawnPickup(ctx, 'ammo', 5 * 32, 6 * 32)!;
    runTicks(ctx, PICKUPS.lifetime * 60 - 2, stepSimulation);
    expect(pickup.active).toBe(true);
    runTicks(ctx, 3, stepSimulation);
    expect(pickup.active).toBe(false);
  });

  it('replaces the oldest pickup when the pool is full', () => {
    const ctx = createTestContext();
    for (let i = 0; i < PICKUPS.poolSize; i++) {
      spawnPickup(ctx, 'ammo', 100 + i, 200);
      stepSimulation(ctx, 1 / 60);
    }
    spawnPickup(ctx, 'health', 999, 200);
    expect(ctx.state.pickups.some((p) => p.x === 100)).toBe(false);
    expect(ctx.state.pickups.some((p) => p.x === 999 && p.kind === 'health')).toBe(true);
  });
});
