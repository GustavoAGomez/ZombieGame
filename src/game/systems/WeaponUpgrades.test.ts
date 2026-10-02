import { describe, expect, it } from 'vitest';
import { BOOSTS } from '../../config/balance';
import { UPGRADE_LEVELS, WEAPON_SPECIALS, WEAPONS } from '../../config/weapons';
import { command, createTestContext, placeZombie, player, runTicks, withSmg } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { storeBoost } from './BoostSystem';
import { moveMerchant } from './MerchantSystem';
import { shopItemStatus } from './ShopSystem';
import { stepSimulation } from './Simulation';
import { bulletDamage, fireRate, magazineSize, maxReserve, upgradeWeapon } from './weaponStats';

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

describe('weapon upgrades, a level per kind', () => {
  it('ammo refills the weapon to its new capacity; fire rate and damage grow with their own level only', () => {
    const ctx = withSmg(createTestContext());
    const pistol = player(ctx).weapons[PISTOL]!;
    pistol.magazine = 1;
    pistol.reserve = 2;
    upgradeWeapon(pistol, 'ammo');
    expect([pistol.levels.ammo, magazineSize(pistol), maxReserve(pistol)]).toEqual([1, WEAPONS.pistol.magazine * 1.5, WEAPONS.pistol.maxReserve * 1.5]);
    expect([pistol.magazine, pistol.reserve]).toEqual([WEAPONS.pistol.magazine * 1.5, WEAPONS.pistol.maxReserve * 1.5]);
    expect(fireRate(pistol)).toBe(WEAPONS.pistol.fireRate);
    upgradeWeapon(pistol, 'fire_rate');
    upgradeWeapon(pistol, 'fire_rate');
    expect(fireRate(pistol)).toBeCloseTo(WEAPONS.pistol.fireRate * UPGRADE_LEVELS.fire_rate[1]!);
    expect(bulletDamage(pistol)).toBe(WEAPONS.pistol.damage);
    for (let i = 0; i < 5; i++) upgradeWeapon(pistol, 'damage');
    // Three levels at most.
    expect(pistol.levels).toEqual({ ammo: 1, fire_rate: 2, damage: 3 });
    expect(bulletDamage(pistol)).toBeCloseTo(WEAPONS.pistol.damage * UPGRADE_LEVELS.damage[2]!);
  });

  it('shoots faster with fire rate levels: the SMG empties more rounds in the same time', () => {
    const shots = (level: number): number => {
      const ctx = withSmg(createTestContext());
      const p = player(ctx);
      p.activeSlot = SMG;
      const smg = p.weapons[SMG]!;
      for (let i = 0; i < level; i++) upgradeWeapon(smg, 'fire_rate');
      const before = smg.magazine;
      fire(ctx, 60);
      return before - smg.magazine;
    };
    // Whole shots in one second: about ×1.75 (11 shots against 19–20).
    const ratio = shots(3) / shots(0);
    expect(ratio).toBeGreaterThan(UPGRADE_LEVELS.fire_rate[2]! - 0.1);
    expect(ratio).toBeLessThan(UPGRADE_LEVELS.fire_rate[2]! + 0.1);
  });

  it('damage levels and double damage stack, and the bullets look lighter, light blue or gold', () => {
    const ctx = withSmg(createTestContext());
    const p = player(ctx);
    const pistol = p.weapons[PISTOL]!;
    upgradeWeapon(pistol, 'damage');
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
    expect(boosted?.damage).toBeCloseTo(WEAPONS.pistol.damage * UPGRADE_LEVELS.damage[0]! * BOOSTS.damageFactor);
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
    const ctx = withSmg(createTestContext());
    const p = player(ctx);
    const pistol = p.weapons[PISTOL]!;
    pistol.special = true;
    const before = pistol.magazine;
    fire(ctx, 1);
    const bullets = ctx.state.bullets.filter((b) => b.active);
    expect(bullets).toHaveLength(WEAPON_SPECIALS.fan.projectiles);
    expect(pistol.magazine).toBe(before - 1);
    const angles = bullets.map((b) => (Math.atan2(b.dirY, b.dirX) * 180) / Math.PI).sort((a, b) => a - b);
    expect(angles[1]! - angles[0]!).toBeCloseTo(WEAPON_SPECIALS.fan.angle);
    expect(angles[2]! - angles[1]!).toBeCloseTo(WEAPON_SPECIALS.fan.angle);
    for (const b of bullets) expect(b.damage).toBe(WEAPONS.pistol.damage);
  });

  it('SMG: a bullet goes through up to 3 zombies, never twice the same one', () => {
    const ctx = withSmg(createTestContext());
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
    const ctx = withSmg(createTestContext());
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
    const ctx = withSmg(createTestContext());
    const m = ctx.state.merchants[index]!;
    m.enabled = true;
    // This round's visit, as the debug button and the summoning do: it teleports from the next round.
    m.round = ctx.state.wave.round;
    moveMerchant(ctx, index);
    const p = player(ctx);
    p.x = p.prevX = m.x + 20;
    p.y = p.prevY = m.y;
    p.money = 50000;
    p.shopMerchant = index;
    return ctx;
  }

  /** The red merchant teleports (a new visit) and the player walks up to it and opens its shop again. */
  function revisit(ctx: Ctx): void {
    moveMerchant(ctx, 1);
    const m = ctx.state.merchants[1]!;
    const p = player(ctx);
    p.x = p.prevX = m.x + 20;
    p.y = p.prevY = m.y;
    p.shopMerchant = 1;
  }

  function buy(ctx: Ctx, item: number, slot = -1): void {
    command(ctx).shopBuy = item;
    command(ctx).shopSlot = slot;
    stepSimulation(ctx, 1 / 60);
    command(ctx).shopBuy = -1;
    command(ctx).shopSlot = -1;
  }

  it('red: one level of the kind the player picks, for the weapon in hand, once per visit, each level dearer', () => {
    const ctx = atMerchant(1);
    const p = player(ctx);
    const pistol = p.weapons[PISTOL]!;
    const AMMO = 0;
    const RATE = 1;
    const DAMAGE = 2;
    expect(shopItemStatus(ctx.state, 1, 0, DAMAGE)).toEqual({ kind: 'buy' });
    buy(ctx, DAMAGE);
    expect([pistol.levels.damage, p.money]).toEqual([1, 50000 - 1500]);
    // Once per visit, whatever the kind.
    expect(shopItemStatus(ctx.state, 1, 0, AMMO)).toEqual({ kind: 'limit' });
    buy(ctx, AMMO);
    expect(pistol.levels.ammo).toBe(0);
    // A new visit: the second damage level costs more.
    revisit(ctx);
    buy(ctx, DAMAGE);
    expect([pistol.levels.damage, p.money]).toEqual([2, 50000 - 1500 - 3000]);
    revisit(ctx);
    buy(ctx, DAMAGE);
    expect([pistol.levels.damage, p.money]).toEqual([3, 50000 - 1500 - 3000 - 5000]);
    // At level 3 there is nothing more of that kind; the others are still on sale.
    revisit(ctx);
    expect(shopItemStatus(ctx.state, 1, 0, DAMAGE)).toEqual({ kind: 'unavailable', reason: 'maxLevel' });
    expect(shopItemStatus(ctx.state, 1, 0, RATE)).toEqual({ kind: 'buy' });
  });

  it('red: its panel has a row per kind with the weapon, its level and the price of the next one', () => {
    const ctx = atMerchant(1);
    const p = player(ctx);
    p.weapons[PISTOL]!.levels.fire_rate = 2;
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const shops: { rows: { item: string; weapon?: string; level?: number; price: number }[] }[] = [];
    ctx.events.on('shop:state', (e) => shops.push(e));
    presenter.publish(ctx.state);
    expect(shops.at(-1)?.rows.map((r) => [r.item, r.weapon, r.level, r.price])).toEqual([
      ['upgrade_ammo', 'pistol', 0, 1500],
      ['upgrade_fire_rate', 'pistol', 2, 5000],
      ['upgrade_damage', 'pistol', 0, 1500],
    ]);
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
    expect([p.weapons[PISTOL]!.special, p.weapons[SMG]!.special, p.money]).toEqual([false, true, 40000]);
    expect(shopItemStatus(ctx.state, 2, 0, 0, SMG)).toEqual({ kind: 'unavailable', reason: 'hasSpecial' });
    // Without a weapon slot the special is not sold.
    expect(shopItemStatus(ctx.state, 2, 0, 0)).toEqual({ kind: 'hidden' });
  });
});
