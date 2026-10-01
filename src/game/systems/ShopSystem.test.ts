import { afterEach, describe, expect, it } from 'vitest';
import { MERCHANT, WEAPONS } from '../../config/balance';
import { merchantDef } from '../../config/merchants';
import { command, createTestContext, player } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { updateMerchants } from './MerchantSystem';
import { shopItemStatus } from './ShopSystem';
import { stepSimulation } from './Simulation';
import { startRound } from './WaveSystem';

type Ctx = ReturnType<typeof createTestContext>;

const MAX_AMMO = 0;
const ROUND_BOOST = 1;

/** The blue merchant on the map (round 2) with the player standing `dx` px to its right. */
function atMerchant(dx = 20): Ctx {
  const ctx = createTestContext();
  startRound(ctx.state, 2);
  updateMerchants(ctx);
  const m = ctx.state.merchants[0]!;
  const p = player(ctx);
  p.x = p.prevX = m.x + dx;
  p.y = p.prevY = m.y;
  return ctx;
}

function tick(ctx: Ctx, edit: (cmd: ReturnType<typeof command>) => void = () => {}): void {
  const cmd = command(ctx);
  edit(cmd);
  stepSimulation(ctx, 1 / 60);
  cmd.actionPressed = false;
  cmd.shopBuy = -1;
  cmd.shopClose = false;
}

const openShop = (ctx: Ctx): void => tick(ctx, (c) => (c.actionPressed = true));

/** Uses up some ammo of every weapon. */
function spendAmmo(ctx: Ctx): void {
  for (const slot of player(ctx).weapons) {
    slot.magazine = 1;
    slot.reserve = 3;
  }
}

describe('ShopSystem · opening and closing', () => {
  it('offers the merchant on the action button within 40 px, and a tap opens and closes its shop', () => {
    const ctx = atMerchant(MERCHANT.interactRange - 2);
    tick(ctx);
    const p = player(ctx);
    expect([p.contextAction, p.contextTarget]).toEqual(['merchant', 0]);
    openShop(ctx);
    expect(p.shopMerchant).toBe(0);
    openShop(ctx);
    expect(p.shopMerchant).toBe(-1);
  });

  it('offers nothing farther than 40 px', () => {
    const ctx = atMerchant(MERCHANT.interactRange + 4);
    openShop(ctx);
    expect(player(ctx).contextAction).not.toBe('merchant');
    expect(player(ctx).shopMerchant).toBe(-1);
  });

  it('closes with the X and when the player walks farther than 64 px, but not before', () => {
    const ctx = atMerchant();
    openShop(ctx);
    tick(ctx, (c) => (c.shopClose = true));
    expect(player(ctx).shopMerchant).toBe(-1);

    openShop(ctx);
    const p = player(ctx);
    const m = ctx.state.merchants[0]!;
    p.x = p.prevX = m.x + MERCHANT.closeRange - 2;
    tick(ctx);
    expect(p.shopMerchant).toBe(0);
    p.x = p.prevX = m.x + MERCHANT.closeRange + 2;
    tick(ctx);
    expect(p.shopMerchant).toBe(-1);
  });

  it('closes when the merchant teleports away', () => {
    const ctx = atMerchant();
    ctx.state.zonesUnlocked[1] = true;
    openShop(ctx);
    startRound(ctx.state, 3);
    tick(ctx);
    tick(ctx);
    expect(player(ctx).shopMerchant).toBe(-1);
  });
});

describe('ShopSystem · buying', () => {
  afterEach(() => {
    delete (merchantDef('blue') as { maxPurchasesPerVisit?: number }).maxPurchasesPerVisit;
  });

  it('max ammo fills magazine and reserve of every weapon, costs 750 and cancels a reload', () => {
    const ctx = atMerchant();
    const p = player(ctx);
    p.money = 1000;
    spendAmmo(ctx);
    p.reloadTimer = 0.5;
    const spent: number[] = [];
    const bought: string[] = [];
    ctx.events.on('money:spent', (e) => spent.push(e.amount));
    ctx.events.on('merchant:purchase', (e) => bought.push(`${e.merchant}:${e.item}`));
    openShop(ctx);
    tick(ctx, (c) => (c.shopBuy = MAX_AMMO));
    expect(p.money).toBe(250);
    expect(p.weapons.map((w) => [w.magazine, w.reserve])).toEqual(p.weapons.map((w) => [WEAPONS[w.id].magazine, WEAPONS[w.id].maxReserve]));
    expect(p.reloadTimer).toBe(0);
    expect(spent).toEqual([750]);
    expect(bought).toEqual(['blue:max_ammo']);
  });

  it('says what each button shows: missing points, full ammo, and items not sold yet', () => {
    const ctx = atMerchant();
    const p = player(ctx);
    p.money = 500;
    spendAmmo(ctx);
    expect(shopItemStatus(ctx.state, 0, 0, MAX_AMMO)).toEqual({ kind: 'short', missing: 250 });
    p.money = 750;
    expect(shopItemStatus(ctx.state, 0, 0, MAX_AMMO)).toEqual({ kind: 'buy' });
    for (const slot of p.weapons) {
      slot.magazine = WEAPONS[slot.id].magazine;
      slot.reserve = WEAPONS[slot.id].maxReserve;
    }
    expect(shopItemStatus(ctx.state, 0, 0, MAX_AMMO)).toEqual({ kind: 'unavailable', reason: 'ammoFull' });
    // The round boost is always worth buying.
    p.money = 5000;
    expect(shopItemStatus(ctx.state, 0, 0, ROUND_BOOST)).toEqual({ kind: 'buy' });
  });

  it('refuses purchases that are not possible: shop closed, short of points or nothing to fill', () => {
    const ctx = atMerchant();
    const p = player(ctx);
    p.money = 5000;
    spendAmmo(ctx);
    tick(ctx, (c) => (c.shopBuy = MAX_AMMO));
    expect(p.money).toBe(5000);
    openShop(ctx);
    p.money = 100;
    tick(ctx, (c) => (c.shopBuy = MAX_AMMO));
    expect(p.money).toBe(100);
    p.money = 5000;
    tick(ctx, (c) => (c.shopBuy = MAX_AMMO));
    tick(ctx, (c) => (c.shopBuy = MAX_AMMO));
    expect(p.money).toBe(4250);
  });

  it('stops at maxPurchasesPerVisit until the merchant moves', () => {
    (merchantDef('blue') as { maxPurchasesPerVisit?: number }).maxPurchasesPerVisit = 1;
    const ctx = atMerchant();
    const p = player(ctx);
    p.money = 5000;
    spendAmmo(ctx);
    openShop(ctx);
    tick(ctx, (c) => (c.shopBuy = MAX_AMMO));
    spendAmmo(ctx);
    expect(shopItemStatus(ctx.state, 0, 0, MAX_AMMO)).toEqual({ kind: 'limit' });
    startRound(ctx.state, 3);
    updateMerchants(ctx);
    expect(shopItemStatus(ctx.state, 0, 0, MAX_AMMO)).toEqual({ kind: 'buy' });
  });
});

describe('HudPresenter · shop', () => {
  it('publishes the merchant on the action button and the open panel with its rows, only on change', () => {
    const ctx = atMerchant();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const shops: unknown[] = [];
    const contexts: unknown[] = [];
    ctx.events.on('shop:state', (e) => shops.push(e));
    ctx.events.on('action:context', (e) => contexts.push(e));
    const p = player(ctx);
    p.money = 500;
    spendAmmo(ctx);
    tick(ctx);
    presenter.publish(ctx.state);
    expect(contexts.at(-1)).toEqual({ kind: 'merchant', amount: 0, enabled: true, merchant: 'blue' });
    openShop(ctx);
    presenter.publish(ctx.state);
    presenter.publish(ctx.state);
    const boost = ctx.state.merchants[0]!.boost;
    expect(shops.at(-1)).toEqual({
      merchant: 'blue',
      rows: [
        { index: 0, item: 'max_ammo', price: 750, status: { kind: 'short', missing: 250 } },
        { index: 1, item: 'round_boost', price: 1000, status: { kind: 'short', missing: 500 }, boost },
      ],
    });
    p.money = 800;
    presenter.publish(ctx.state);
    expect(shops.at(-1)).toEqual({
      merchant: 'blue',
      rows: [
        { index: 0, item: 'max_ammo', price: 750, status: { kind: 'buy' } },
        { index: 1, item: 'round_boost', price: 1000, status: { kind: 'short', missing: 200 }, boost },
      ],
    });
    expect(shops).toHaveLength(3);
  });
});
