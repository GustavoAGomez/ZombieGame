import { describe, expect, it, vi } from 'vitest';
import type { ActivationDef } from '../../config/activations';
import { ITEMS, SIM } from '../../config/balance';
import type { ActivationState } from '../../core/GameState';
import { command, createMansionContext, player } from '../../test/fixtures';
import { activationFor } from './ItemSystem';
import { stepSimulation } from './Simulation';
import { startRound } from './WaveSystem';

type Ctx = ReturnType<typeof createMansionContext>;

const RED = 1;
const BLUE = 0;

/** The player at the south edge of the garden pool, with the heart and the wand. */
function atPool(seed = 1): Ctx {
  const ctx = createMansionContext(seed);
  const pool = ctx.map.activationSites.find((s) => s.id === 'pool')!;
  const p = player(ctx);
  p.x = p.prevX = pool.x + pool.width / 2;
  p.y = p.prevY = pool.y + pool.height + 20;
  p.items = ['living_heart', 'worn_wand'];
  ctx.state.zonesUnlocked.fill(true);
  return ctx;
}

function use(ctx: Ctx, slot: number): void {
  command(ctx).useItem = slot;
  stepSimulation(ctx, 1 / 60);
  command(ctx).useItem = -1;
}

/** Until the items thrown have landed (and a tick more). */
function waitThrow(ctx: Ctx): void {
  for (let t = 0; t <= Math.round(ITEMS.throwTime * SIM.hz) + 1; t++) stepSimulation(ctx, 1 / 60);
}

function poolSpots(ctx: Ctx): number[] {
  const pool = ctx.map.activationSites.find((s) => s.id === 'pool')!;
  const c = { x: pool.x + pool.width / 2, y: pool.y + pool.height / 2 };
  return ctx.map.merchantSpots
    .map((s, i) => ({ i, d: Math.hypot(s.x - c.x, s.y - c.y), z: s.zoneIndex }))
    .filter((s) => s.z === pool.zoneIndex)
    .sort((a, b) => a.d - b.d)
    .map((s) => s.i);
}

describe('activations · throwing items into the pool (spec 05 §6)', () => {
  it('a thrown item leaves the inventory and the pool remembers it; it never takes the same item twice', () => {
    const ctx = atPool();
    const p = player(ctx);
    const thrown = vi.fn();
    const cantUse = vi.fn();
    ctx.events.on('item:thrown', thrown);
    ctx.events.on('item:cantUse', cantUse);
    use(ctx, 0);
    expect(p.items).toEqual(['worn_wand']);
    expect(ctx.state.activations[0]?.received).toEqual(['living_heart']);
    expect(thrown).toHaveBeenCalledWith(expect.objectContaining({ item: 'living_heart', activation: 'summon_red_merchant' }));
    // A second heart (a stand-in: items are unique) is not taken.
    p.items.push('living_heart');
    use(ctx, 1);
    expect(cantUse).toHaveBeenCalledWith({ playerId: p.id, slot: 1 });
    expect(p.items).toEqual(['worn_wand', 'living_heart']);
    waitThrow(ctx);
    expect(ctx.state.activations[0]?.done).toBe(false);
    expect(ctx.state.merchants[RED]?.active).toBe(false);
  });

  it('only from within reach of the water', () => {
    const ctx = atPool();
    const p = player(ctx);
    const pool = ctx.map.activationSites.find((s) => s.id === 'pool')!;
    p.y = p.prevY = pool.y + pool.height + ITEMS.useRange + 20;
    use(ctx, 0);
    expect(p.items).toHaveLength(2);
    expect(ctx.state.activations[0]?.received).toEqual([]);
  });

  for (const order of [
    [0, 0],
    [1, 0],
  ] as const) {
    it(`brings out the red merchant by the pool once both have landed (${order[0] === 0 ? 'heart first' : 'wand first'})`, () => {
      const ctx = atPool();
      const completed = vi.fn();
      const moved = vi.fn();
      ctx.events.on('activation:completed', completed);
      ctx.events.on('merchant:moved', moved);
      use(ctx, order[0]);
      waitThrow(ctx);
      use(ctx, order[1]);
      // In the air: not yet.
      expect(ctx.state.merchants[RED]?.active).toBe(false);
      waitThrow(ctx);
      const st = ctx.state.activations[0]!;
      expect(st.done).toBe(true);
      expect(player(ctx).items).toEqual([]);
      const red = ctx.state.merchants[RED]!;
      expect(red.active).toBe(true);
      expect(red.spot).toBe(poolSpots(ctx)[0]);
      expect(completed).toHaveBeenCalledWith({ playerId: 0, activation: 'summon_red_merchant', effect: { kind: 'summon_merchant', merchant: 'red' } });
      expect(moved).toHaveBeenCalledWith({ merchant: 'red', first: true });
      // Closed: it takes nothing more.
      player(ctx).items = ['living_heart'];
      use(ctx, 0);
      expect(player(ctx).items).toEqual(['living_heart']);
    });
  }

  it('the merchant comes out at the next spot when another merchant stands by the pool', () => {
    const ctx = atPool();
    const [nearest, next] = poolSpots(ctx);
    const blue = ctx.state.merchants[BLUE]!;
    const spot = ctx.map.merchantSpots[nearest!]!;
    Object.assign(blue, { active: true, enabled: true, spot: nearest, x: spot.x, y: spot.y, round: ctx.state.wave.round });
    use(ctx, 0);
    use(ctx, 0);
    waitThrow(ctx);
    expect(ctx.state.merchants[RED]?.spot).toBe(next);
  });

  it('the red merchant never comes by round, only by the activation; then it teleports every round', () => {
    const ctx = atPool();
    const red = ctx.state.merchants[RED]!;
    for (let round = 2; round <= 4; round++) {
      startRound(ctx.state, round);
      stepSimulation(ctx, 1 / 60);
      expect(red.active, `round ${round}`).toBe(false);
    }
    use(ctx, 0);
    use(ctx, 0);
    waitThrow(ctx);
    expect(red.active).toBe(true);
    const summonedAt = red.moveTick;
    // The rest of this round it stays; at the next one it teleports.
    stepSimulation(ctx, 1 / 60);
    expect(red.moveTick).toBe(summonedAt);
    startRound(ctx.state, ctx.state.wave.round + 1);
    stepSimulation(ctx, 1 / 60);
    expect(red.moveTick).toBeGreaterThan(summonedAt);
  });
});

describe('activations · by data', () => {
  it('one with order "fixed" takes its items only in turn', () => {
    const ctx = atPool();
    const p = player(ctx);
    const fixed: ActivationDef[] = [{ id: 'summon_red_merchant', site: 'pool', requires: ['worn_wand', 'living_heart'], order: 'fixed', effect: { kind: 'summon_merchant', merchant: 'red' } }];
    const states: ActivationState[] = [{ received: [], landsAt: [], thrownBy: [], done: false, doneTick: -1 }];
    expect(activationFor(ctx.map, fixed, states, p, 'living_heart')).toBe(-1);
    expect(activationFor(ctx.map, fixed, states, p, 'worn_wand')).toBe(0);
    states[0]!.received.push('worn_wand');
    expect(activationFor(ctx.map, fixed, states, p, 'living_heart')).toBe(0);
  });
});
