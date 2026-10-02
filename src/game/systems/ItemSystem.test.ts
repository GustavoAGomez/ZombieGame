import { describe, expect, it, vi } from 'vitest';
import { ITEMS } from '../../config/balance';
import type { ItemId } from '../../config/items';
import { command, createMansionContext, player } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { pickUpItem } from './ItemSystem';
import { pickItemSpot } from './itemSpawns';
import { stepSimulation } from './Simulation';

type Ctx = ReturnType<typeof createMansionContext>;

function startZone(ctx: Ctx): number {
  const { map } = ctx;
  return map.cellZone[Math.floor(map.playerSpawn.y / map.tileSize) * map.width + Math.floor(map.playerSpawn.x / map.tileSize)] ?? -1;
}

function wand(ctx: Ctx) {
  const g = ctx.state.groundItems.find((i) => i.item === 'worn_wand');
  if (!g) throw new Error('no wand on the map');
  return g;
}

function tap(ctx: Ctx): void {
  command(ctx).actionPressed = true;
  stepSimulation(ctx, 1 / 60);
  command(ctx).actionPressed = false;
}

describe('special items · the wand on the map (spec 05 §2)', () => {
  it('lies in a spot of any zone but the starting one, the same spot with the same seed', () => {
    const spots = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const ctx = createMansionContext(seed);
      const g = wand(ctx);
      const spot = ctx.map.itemSpots[g.spot]!;
      expect(spot.zoneIndex, `seed ${seed}`).not.toBe(startZone(ctx));
      expect([g.x, g.y]).toEqual([spot.x, spot.y]);
      expect(wand(createMansionContext(seed)).spot).toBe(g.spot);
      spots.add(g.spot);
    }
    // Different seeds, different places: it has to be found every match.
    expect(spots.size).toBeGreaterThan(5);
  });

  it('draws no spot (and no random number) when the map has none to offer', () => {
    const ctx = createMansionContext();
    const rng = { rng: 7 };
    const all = new Set(ctx.map.itemSpots.map((_, i) => i));
    expect(pickItemSpot(ctx.map, rng, false, all)).toBe(-1);
    expect(rng.rng).toBe(7);
  });
});

describe('special items · picking them up (spec 05 §3)', () => {
  it('offers to pick up the wand within reach, and a tap puts it in the inventory', () => {
    const ctx = createMansionContext(3);
    const p = player(ctx);
    const g = wand(ctx);
    const picked = vi.fn();
    ctx.events.on('item:picked', picked);
    // Just out of reach: nothing.
    p.x = p.prevX = g.x + ITEMS.pickupRange + 2;
    p.y = p.prevY = g.y;
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).not.toBe('pickup');
    // Within reach: the action button offers it.
    p.x = p.prevX = g.x + ITEMS.pickupRange - 4;
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('pickup');
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const action = vi.fn();
    ctx.events.on('action:context', action);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'pickup', item: 'worn_wand', enabled: true }));
    tap(ctx);
    expect(p.items).toEqual(['worn_wand']);
    expect(g.active).toBe(false);
    expect(picked).toHaveBeenCalledWith({ playerId: p.id, item: 'worn_wand' });
    // Gone from the floor: the button no longer offers it.
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).not.toBe('pickup');
  });

  it('only while there is room: never more than ITEMS.maxSlots items', () => {
    const ctx = createMansionContext(3);
    const p = player(ctx);
    const g = wand(ctx);
    // Full with stand-ins (only two items exist yet).
    p.items = Array.from({ length: ITEMS.maxSlots }, (_, i) => `stand_in_${i}` as ItemId);
    p.x = p.prevX = g.x;
    p.y = p.prevY = g.y + 8;
    stepSimulation(ctx, 1 / 60);
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const action = vi.fn();
    ctx.events.on('action:context', action);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'pickup', enabled: false }));
    tap(ctx);
    expect(p.items).toHaveLength(ITEMS.maxSlots);
    expect(g.active).toBe(true);
    expect(pickUpItem(ctx, p, ctx.state.groundItems.indexOf(g))).toBe(false);
  });
});
