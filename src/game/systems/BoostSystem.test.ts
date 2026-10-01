import { describe, expect, it } from 'vitest';
import { BOOSTS, MELEE, PLAYER, WEAPONS } from '../../config/balance';
import { command, createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { drawRoundBoost, storeBoost } from './BoostSystem';
import { updateMerchants } from './MerchantSystem';
import { shopItemStatus } from './ShopSystem';
import { stepSimulation } from './Simulation';
import { startRound } from './WaveSystem';

type Ctx = ReturnType<typeof createTestContext>;

const ROUND_BOOST = 1;

/** Taps the boost button for one tick. */
function tapBoost(ctx: Ctx): void {
  command(ctx).boost = true;
  stepSimulation(ctx, 1 / 60);
  command(ctx).boost = false;
}

describe('BoostSystem · the round boost', () => {
  it('is drawn with the seed: the same seed draws the same boosts, and both kinds come up', () => {
    const draws = (seed: number): string[] => {
      const state = createTestContext(seed).state;
      return Array.from({ length: 30 }, () => drawRoundBoost(state));
    };
    expect(draws(5)).toEqual(draws(5));
    expect(new Set(draws(5))).toEqual(new Set(BOOSTS.kinds));
  });

  it('is drawn again every time the merchant moves, and sold from the shop into the slot', () => {
    const ctx = createTestContext(2);
    ctx.state.zonesUnlocked.fill(true);
    const seen = new Set<string>();
    for (let r = 2; r <= 12; r++) {
      startRound(ctx.state, r);
      updateMerchants(ctx);
      seen.add(ctx.state.merchants[0]!.boost);
    }
    expect(seen).toEqual(new Set(BOOSTS.kinds));

    const m = ctx.state.merchants[0]!;
    const p = player(ctx);
    p.x = p.prevX = m.x + 20;
    p.y = p.prevY = m.y;
    p.points = 900;
    expect(shopItemStatus(ctx.state, 0, 0, ROUND_BOOST)).toEqual({ kind: 'short', missing: 100 });
    p.points = 1000;
    expect(shopItemStatus(ctx.state, 0, 0, ROUND_BOOST)).toEqual({ kind: 'buy' });
    p.shopMerchant = 0;
    command(ctx).shopBuy = ROUND_BOOST;
    stepSimulation(ctx, 1 / 60);
    command(ctx).shopBuy = -1;
    expect(p.points).toBe(0);
    expect(p.boostStored).toBe(m.boost);
  });
});

describe('BoostSystem · the slot', () => {
  it('keeps a stored boost between rounds until its button is tapped', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    storeBoost(p, 'speed');
    runTicks(ctx, 120, stepSimulation);
    startRound(ctx.state, 5);
    runTicks(ctx, 60, stepSimulation);
    expect([p.boostStored, p.boostActive]).toEqual(['speed', null]);
    tapBoost(ctx);
    expect([p.boostStored, p.boostActive]).toEqual([null, 'speed']);
  });

  it('runs for 10 s of simulated time, then ends', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    storeBoost(p, 'double_damage');
    tapBoost(ctx);
    runTicks(ctx, BOOSTS.duration * 60 - 3, stepSimulation);
    expect(p.boostActive).toBe('double_damage');
    // Nothing moves while no tick runs (the pause stops the ticks).
    const left = p.boostTimer;
    expect(p.boostTimer).toBe(left);
    runTicks(ctx, 3, stepSimulation);
    expect([p.boostActive, p.boostTimer]).toEqual([null, 0]);
  });

  it('replaces a stored boost with a newly bought one, and ends a running one at once', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    storeBoost(p, 'speed');
    storeBoost(p, 'double_damage');
    expect([p.boostStored, p.boostActive]).toEqual(['double_damage', null]);
    tapBoost(ctx);
    runTicks(ctx, 60, stepSimulation);
    storeBoost(p, 'speed');
    expect([p.boostStored, p.boostActive, p.boostTimer]).toEqual(['speed', null, 0]);
  });

  it('loses both the stored and the running boost when the player dies', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    storeBoost(p, 'speed');
    tapBoost(ctx);
    p.boostStored = 'double_damage';
    p.hp = 0;
    stepSimulation(ctx, 1 / 60);
    expect([p.boostStored, p.boostActive]).toEqual([null, null]);
  });
});

describe('BoostSystem · effects', () => {
  it('speed: the player walks 1.5 times as far', () => {
    const walked = (boost: boolean): number => {
      const ctx = createTestContext();
      const p = player(ctx);
      if (boost) {
        storeBoost(p, 'speed');
        tapBoost(ctx);
      }
      const x0 = p.x;
      command(ctx).moveX = 1;
      runTicks(ctx, 20, stepSimulation);
      return p.x - x0;
    };
    expect(walked(false)).toBeCloseTo((PLAYER.speed * 20) / 60);
    expect(walked(true)).toBeCloseTo(walked(false) * BOOSTS.speedFactor);
  });

  it('double damage: bullets and the knife hit twice as hard, and the bullets are marked for the tint', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    storeBoost(p, 'double_damage');
    tapBoost(ctx);
    command(ctx).fire = true;
    stepSimulation(ctx, 1 / 60);
    command(ctx).fire = false;
    const bullet = ctx.state.bullets.find((b) => b.active);
    expect(bullet?.damage).toBe(WEAPONS.pistol.damage * BOOSTS.damageFactor);
    expect(bullet?.boosted).toBe(true);

    const z = placeZombie(ctx, 0, p.x + 18, p.y, 500);
    command(ctx).melee = true;
    stepSimulation(ctx, 1 / 60);
    command(ctx).melee = false;
    expect(z.hp).toBe(500 - MELEE.damage * BOOSTS.damageFactor);
  });
});

describe('HudPresenter · boost slot', () => {
  it('publishes the stored boost, then the running one with its ring and seconds, and the end', () => {
    const ctx = createTestContext();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const states: unknown[] = [];
    ctx.events.on('boost:state', (e) => states.push(e));
    presenter.publish(ctx.state);
    storeBoost(player(ctx), 'speed');
    presenter.publish(ctx.state);
    presenter.publish(ctx.state);
    tapBoost(ctx);
    runTicks(ctx, 2.5 * 60, stepSimulation);
    presenter.publish(ctx.state);
    runTicks(ctx, BOOSTS.duration * 60, stepSimulation);
    presenter.publish(ctx.state);
    expect(states).toEqual([
      { stored: null, active: null, progress: 0, seconds: 0 },
      { stored: 'speed', active: null, progress: 0, seconds: 0 },
      { stored: null, active: 'speed', progress: 0.75, seconds: 8 },
      { stored: null, active: null, progress: 0, seconds: 0 },
    ]);
  });
});
