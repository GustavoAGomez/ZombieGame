import { describe, expect, it } from 'vitest';
import { BOOSTS, WEAPON_UPGRADES, WEAPONS } from '../../config/balance';
import { command, createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { storeBoost } from './BoostSystem';
import { moveMerchant } from './MerchantSystem';
import { shopItemStatus } from './ShopSystem';
import { stepSimulation } from './Simulation';
import { bulletDamage, fireRate, levelUp, magazineSize, maxReserve } from './weaponStats';

type Ctx = ReturnType<typeof createTestContext>;

const PISTOL = 0;
const SMG = 1;

function fire(ctx: Ctx, ticks: number, aimX = 1, aimY = 0): void {
  const cmd = command(ctx);
  cmd.fire = true;
  cmd.aimManual = true;
  cmd.aimX = aimX;
  cmd.aimY = aimY;
  runTicks(ctx, ticks, stepSimulation);
  cmd.fire = false;
}

describe('weapon levels', () => {
  it('level 1 doubles magazine and reserve and refills the weapon; level 2 fires 1.5 times as fast; level 3 doubles the damage', () => {
    const ctx = createTestContext();
    const pistol = player(ctx).weapons[PISTOL]!;
    pistol.magazine = 1;
    pistol.reserve = 2;
    levelUp(pistol);
    expect([pistol.level, magazineSize(pistol), maxReserve(pistol)]).toEqual([1, WEAPONS.pistol.magazine * 2, WEAPONS.pistol.maxReserve * 2]);
    expect([pistol.magazine, pistol.reserve]).toEqual([WEAPONS.pistol.magazine * 2, WEAPONS.pistol.maxReserve * 2]);
    expect(fireRate(pistol)).toBe(WEAPONS.pistol.fireRate);
    levelUp(pistol);
    expect(fireRate(pistol)).toBe(WEAPONS.pistol.fireRate * WEAPON_UPGRADES.fireRateFactor);
    expect(bulletDamage(pistol)).toBe(WEAPONS.pistol.damage);
    levelUp(pistol);
    expect(bulletDamage(pistol)).toBe(WEAPONS.pistol.damage * WEAPON_UPGRADES.damageFactor);
    levelUp(pistol);
    expect(pistol.level).toBe(WEAPON_UPGRADES.maxLevel);
  });

  it('shoots faster at level 2: the SMG empties more rounds in the same time', () => {
    const shots = (level: number): number => {
      const ctx = createTestContext();
      const p = player(ctx);
      p.activeSlot = SMG;
      const smg = p.weapons[SMG]!;
      for (let i = 0; i < level; i++) levelUp(smg);
      const before = smg.magazine;
      fire(ctx, 60);
      return before - smg.magazine;
    };
    expect(shots(2) / shots(1)).toBeCloseTo(WEAPON_UPGRADES.fireRateFactor, 1);
  });

  it('level 3 and double damage stack: ×4, and the bullets look lighter, light blue or gold', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const pistol = p.weapons[PISTOL]!;
    for (let i = 0; i < 3; i++) levelUp(pistol);
    fire(ctx, 1);
    expect(ctx.state.bullets.find((b) => b.active)?.look).toBe('upgraded');
    for (const b of ctx.state.bullets) b.active = false;
    storeBoost(p, 'double_damage');
    command(ctx).boost = true;
    stepSimulation(ctx, 1 / 60);
    command(ctx).boost = false;
    runTicks(ctx, 30, stepSimulation);
    fire(ctx, 1);
    const boosted = ctx.state.bullets.find((b) => b.active);
    expect(boosted?.damage).toBe(WEAPONS.pistol.damage * WEAPON_UPGRADES.damageFactor * BOOSTS.damageFactor);
    expect(boosted?.look).toBe('boosted');
    pistol.special = true;
    for (const b of ctx.state.bullets) b.active = false;
    runTicks(ctx, 30, stepSimulation);
    fire(ctx, 1);
    expect(ctx.state.bullets.find((b) => b.active)?.look).toBe('special');
  });
});

describe('weapon specials', () => {
  it('pistol: three bullets in a fan (centre, ±12°) for one round, each with the full damage', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const pistol = p.weapons[PISTOL]!;
    pistol.special = true;
    const before = pistol.magazine;
    fire(ctx, 1);
    const bullets = ctx.state.bullets.filter((b) => b.active);
    expect(bullets).toHaveLength(WEAPON_UPGRADES.fanProjectiles);
    expect(pistol.magazine).toBe(before - 1);
    const angles = bullets.map((b) => (Math.atan2(b.dirY, b.dirX) * 180) / Math.PI).sort((a, b) => a - b);
    expect(angles[1]! - angles[0]!).toBeCloseTo(WEAPON_UPGRADES.fanAngle);
    expect(angles[2]! - angles[1]!).toBeCloseTo(WEAPON_UPGRADES.fanAngle);
    for (const b of bullets) expect(b.damage).toBe(WEAPONS.pistol.damage);
  });

  it('SMG: a bullet goes through up to 3 zombies, never twice the same one', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.activeSlot = SMG;
    p.weapons[SMG]!.special = true;
    // Four zombies in a row along the shot, 20 px apart.
    const zombies = [40, 60, 80, 100].map((dx, i) => placeZombie(ctx, i, p.x + dx, p.y, 100));
    fire(ctx, 1);
    runTicks(ctx, 40, stepSimulation);
    expect(zombies.map((z) => 100 - z.hp)).toEqual([1, 1, 1, 0]);
    expect(ctx.state.bullets.some((b) => b.active)).toBe(false);
  });

  it('SMG: a wall still stops a piercing bullet', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.activeSlot = SMG;
    p.weapons[SMG]!.special = true;
    // room01: the starting room's west wall is at x 3; a zombie in front of it and one behind.
    p.x = p.prevX = 5.5 * 32;
    p.y = p.prevY = 6.5 * 32;
    const front = placeZombie(ctx, 0, 4.5 * 32, p.y, 100);
    const behind = placeZombie(ctx, 1, 2.5 * 32, p.y, 100);
    fire(ctx, 1, -1, 0);
    runTicks(ctx, 40, stepSimulation);
    expect([100 - front.hp, 100 - behind.hp]).toEqual([1, 0]);
  });
});

describe('red and gold merchants', () => {
  /** The red (1) or gold (2) merchant switched on and placed, with the player at its shop. */
  function atMerchant(index: number): Ctx {
    const ctx = createTestContext();
    const m = ctx.state.merchants[index]!;
    m.enabled = true;
    moveMerchant(ctx, index);
    const p = player(ctx);
    p.x = p.prevX = m.x + 20;
    p.y = p.prevY = m.y;
    p.points = 50000;
    p.shopMerchant = index;
    return ctx;
  }

  function buy(ctx: Ctx, item: number, slot = -1): void {
    command(ctx).shopBuy = item;
    command(ctx).shopSlot = slot;
    stepSimulation(ctx, 1 / 60);
    command(ctx).shopBuy = -1;
    command(ctx).shopSlot = -1;
  }

  it('red: one level for the weapon in hand, once per visit, and NIVEL MÁXIMO at level 3', () => {
    const ctx = atMerchant(1);
    const p = player(ctx);
    const pistol = p.weapons[PISTOL]!;
    expect(shopItemStatus(ctx.state, 1, 0, 0)).toEqual({ kind: 'buy' });
    buy(ctx, 0);
    expect([pistol.level, p.points]).toEqual([1, 47000]);
    expect(shopItemStatus(ctx.state, 1, 0, 0)).toEqual({ kind: 'limit' });
    buy(ctx, 0);
    expect(pistol.level).toBe(1);
    // A new visit; at level 3 there is nothing more.
    moveMerchant(ctx, 1);
    pistol.level = 3;
    expect(shopItemStatus(ctx.state, 1, 0, 0)).toEqual({ kind: 'unavailable', reason: 'maxLevel' });
  });

  it('gold: a row per weapon carried; it gives that weapon its special, and YA TIENE ESPECIAL after', () => {
    const ctx = atMerchant(2);
    const p = player(ctx);
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const shops: { rows: { slot?: number; weapon?: string; status: { kind: string } }[] }[] = [];
    ctx.events.on('shop:state', (e) => shops.push(e));
    presenter.publish(ctx.state);
    expect(shops.at(-1)?.rows.map((r) => [r.slot, r.weapon, r.status.kind])).toEqual([
      [PISTOL, 'pistol', 'buy'],
      [SMG, 'smg', 'buy'],
    ]);
    buy(ctx, 0, SMG);
    expect([p.weapons[PISTOL]!.special, p.weapons[SMG]!.special, p.points]).toEqual([false, true, 40000]);
    expect(shopItemStatus(ctx.state, 2, 0, 0, SMG)).toEqual({ kind: 'unavailable', reason: 'hasSpecial' });
    // Without a weapon slot the special is not sold.
    expect(shopItemStatus(ctx.state, 2, 0, 0)).toEqual({ kind: 'hidden' });
  });
});
