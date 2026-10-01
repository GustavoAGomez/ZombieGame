import { describe, expect, it } from 'vitest';
import { MERCHANT, PLAYER } from '../../config/balance';
import type { MerchantState } from '../../core/GameState';
import { command, createTestContext, player } from '../../test/fixtures';
import { pickMerchantSpot, updateMerchants } from './MerchantSystem';
import { stepSimulation } from './Simulation';
import { startRound } from './WaveSystem';

type Ctx = ReturnType<typeof createTestContext>;

// room01: inicio (spots 0 and 1, the starting zone), pasillo (2 and 3), almacen (4).
const INICIO = 0;
const PASILLO = 1;
const ALMACEN = 2;

const blue = (ctx: Ctx): MerchantState => ctx.state.merchants.find((m) => m.id === 'blue')!;
const red = (ctx: Ctx): MerchantState => ctx.state.merchants.find((m) => m.id === 'red')!;
const zoneOf = (ctx: Ctx, m: MerchantState): number => ctx.map.merchantSpots[m.spot]?.zoneIndex ?? -1;

function unlock(ctx: Ctx, ...zones: number[]): void {
  for (const z of zones) ctx.state.zonesUnlocked[z] = true;
}

/** Starts round `round` and lets the merchants react, as on the tick a round begins. */
function nextRound(ctx: Ctx, round = ctx.state.wave.round + 1): void {
  startRound(ctx.state, round);
  updateMerchants(ctx);
}

describe('MerchantSystem · appearing and teleporting', () => {
  it('shows the blue merchant from the start of round 2, in the starting zone; red and gold stay away', () => {
    const ctx = createTestContext();
    const moved: { merchant: string; first: boolean }[] = [];
    ctx.events.on('merchant:moved', (e) => moved.push(e));
    updateMerchants(ctx);
    expect(blue(ctx).active).toBe(false);
    nextRound(ctx, 2);
    expect(blue(ctx).active).toBe(true);
    expect(zoneOf(ctx, blue(ctx))).toBe(INICIO);
    const spot = ctx.map.merchantSpots[blue(ctx).spot]!;
    expect([blue(ctx).x, blue(ctx).y]).toEqual([spot.x, spot.y]);
    expect(moved).toEqual([{ merchant: 'blue', first: true }]);
    for (let r = 3; r <= 8; r++) nextRound(ctx, r);
    expect(ctx.state.merchants.filter((m) => m.id !== 'blue').every((m) => !m.active)).toBe(true);
  });

  it('appears at once when the match starts in a later round', () => {
    const ctx = createTestContext();
    ctx.state.wave.round = 5;
    updateMerchants(ctx);
    expect(zoneOf(ctx, blue(ctx))).toBe(INICIO);
  });

  it('moves to another unlocked zone at the start of every round, and only then', () => {
    const ctx = createTestContext();
    unlock(ctx, PASILLO, ALMACEN);
    const moved: boolean[] = [];
    ctx.events.on('merchant:moved', (e) => moved.push(e.first));
    nextRound(ctx, 2);
    for (let r = 3; r <= 20; r++) {
      const before = zoneOf(ctx, blue(ctx));
      const spot = blue(ctx).spot;
      for (let t = 0; t < 30; t++) updateMerchants(ctx);
      expect(blue(ctx).spot).toBe(spot);
      nextRound(ctx, r);
      expect(zoneOf(ctx, blue(ctx))).not.toBe(before);
      expect(blue(ctx).fromSpot).toBe(spot);
      expect(blue(ctx).moveTick).toBe(ctx.state.tick);
    }
    expect(moved).toEqual([true, ...Array.from({ length: 18 }, () => false)]);
  });

  it('never goes to a zone that is still locked', () => {
    const ctx = createTestContext();
    unlock(ctx, PASILLO);
    nextRound(ctx, 2);
    const zones: number[] = [];
    for (let r = 3; r <= 12; r++) {
      nextRound(ctx, r);
      zones.push(zoneOf(ctx, blue(ctx)));
    }
    expect(zones).toEqual([PASILLO, INICIO, PASILLO, INICIO, PASILLO, INICIO, PASILLO, INICIO, PASILLO, INICIO]);
  });

  it('changes spot inside the only unlocked zone, and stays put when that zone has a single spot', () => {
    const ctx = createTestContext();
    nextRound(ctx, 2);
    const first = blue(ctx).spot;
    nextRound(ctx, 3);
    expect(blue(ctx).spot).toBe(first === 0 ? 1 : 0);

    const lone = createTestContext();
    lone.map.zoneMerchantSpots[INICIO] = [0];
    const moved: boolean[] = [];
    lone.events.on('merchant:moved', (e) => moved.push(e.first));
    nextRound(lone, 2);
    nextRound(lone, 3);
    expect(blue(lone).spot).toBe(0);
    expect(moved).toEqual([true]);
  });

  it('never puts two merchants in the same zone when there is an alternative', () => {
    const ctx = createTestContext(7);
    red(ctx).enabled = true;
    unlock(ctx, PASILLO, ALMACEN);
    nextRound(ctx, 2);
    // Both start in the starting zone, on different spots.
    expect([zoneOf(ctx, blue(ctx)), zoneOf(ctx, red(ctx))]).toEqual([INICIO, INICIO]);
    expect(blue(ctx).spot).not.toBe(red(ctx).spot);
    for (let r = 3; r <= 20; r++) {
      nextRound(ctx, r);
      expect(zoneOf(ctx, blue(ctx))).not.toBe(zoneOf(ctx, red(ctx)));
    }
    // With two zones open, one goes to the other zone and the other changes spot at home.
    const two = createTestContext(7);
    red(two).enabled = true;
    unlock(two, PASILLO);
    nextRound(two, 2);
    for (let r = 3; r <= 10; r++) {
      nextRound(two, r);
      expect(zoneOf(two, blue(two))).not.toBe(zoneOf(two, red(two)));
    }
  });

  it('draws the same spots with the same seed', () => {
    const run = (seed: number): number[] => {
      const ctx = createTestContext(seed);
      unlock(ctx, PASILLO, ALMACEN);
      const spots: number[] = [];
      for (let r = 2; r <= 15; r++) {
        nextRound(ctx, r);
        spots.push(blue(ctx).spot);
      }
      return spots;
    };
    expect(run(3)).toEqual(run(3));
    expect(new Set([4, 5, 6, 7, 8].map((s) => run(s).join()))).not.toEqual(new Set([run(4).join()]));
  });

  it('has nowhere to go on a map without spots', () => {
    const ctx = createTestContext();
    ctx.map.zoneMerchantSpots = ctx.map.zoneMerchantSpots.map(() => []);
    expect(pickMerchantSpot(ctx.map, ctx.state, 0)).toBe(-1);
    nextRound(ctx, 2);
    expect(blue(ctx).active).toBe(false);
  });
});

describe('MerchantSystem · body', () => {
  it('is solid: the player cannot walk through it', () => {
    const ctx = createTestContext();
    nextRound(ctx, 2);
    const m = blue(ctx);
    const p = player(ctx);
    p.x = p.prevX = m.x + 40;
    p.y = p.prevY = m.y;
    command(ctx).moveX = -1;
    let closest = Infinity;
    for (let t = 0; t < 60; t++) {
      stepSimulation(ctx, 1 / 60);
      closest = Math.min(closest, Math.hypot(p.x - m.x, p.y - m.y));
    }
    expect(closest).toBeGreaterThanOrEqual(PLAYER.hitboxRadius + MERCHANT.radius - 0.01);
  });

  it('pushes out a player it appears on', () => {
    const ctx = createTestContext();
    nextRound(ctx, 2);
    const m = blue(ctx);
    const p = player(ctx);
    p.x = p.prevX = m.x;
    p.y = p.prevY = m.y;
    stepSimulation(ctx, 1 / 60);
    expect(Math.hypot(p.x - m.x, p.y - m.y)).toBeGreaterThanOrEqual(PLAYER.hitboxRadius + MERCHANT.radius - 0.01);
  });
});
