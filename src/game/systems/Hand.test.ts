import { describe, expect, it, vi } from 'vitest';
import { embeddedMansion } from '../../../scripts/lib/mansion-fixture';
import { validateMap } from '../../../scripts/lib/validate-map';
import { HAND } from '../../config/balance';
import { WEAPONS, type WeaponId } from '../../config/weapons';
import { createWeaponSlot } from '../../core/GameState';
import { command, createMansionContext, createTestContext, player, runTicks, zoneIndex } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { parseMap } from '../map/MapLoader';
import type { TiledObjectLayer } from '../map/tiled';
import { createHandState, drawHandOffer, startingHandZones } from './handSpawn';
import { handOffer } from './HandSystem';
import type { SimContext } from './SimContext';
import { stepSimulation } from './Simulation';

/** Spec 06 §3: the Demon's Hand, its spots, payment, sequence and draw. */

const DT = 1 / 60;

/** The test map's hand, in the corridor (bought from the start), unlocked, with the player standing at it. */
function atTheHand(money = 5000): SimContext {
  const ctx = createTestContext();
  const spot = ctx.map.handSpots[ctx.state.hand.spot]!;
  ctx.state.zonesUnlocked[spot.zoneIndex] = true;
  const p = player(ctx);
  p.x = p.prevX = spot.x;
  p.y = p.prevY = spot.y + 20;
  p.money = money;
  return ctx;
}

/** One tap on the action button. */
function tap(ctx: SimContext): void {
  command(ctx).actionPressed = true;
  stepSimulation(ctx, DT);
  command(ctx).actionPressed = false;
}

/** `s` seconds and one tick more: a phase that ends exactly then has ended. */
const seconds = (ctx: SimContext, s: number): void => runTicks(ctx, Math.round(s * 60) + 1, stepSimulation);

describe('where the hand is', () => {
  it('starts in the living or the dining room in the mansion: interior rooms bought from the hall, not the street', () => {
    const map = createMansionContext().map;
    expect(startingHandZones(map).map((z) => map.zones[z]?.id)).toEqual(['salon', 'comedor']);
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      const hand = createHandState({ rng: seed }, map);
      seen.add(map.handSpots[hand.spot]!.zone);
      expect(hand.usesLeft).toBeGreaterThanOrEqual(HAND.usesMin);
      expect(hand.usesLeft).toBeLessThanOrEqual(HAND.usesMax);
      expect(hand.phase).toBe('idle');
    }
    expect([...seen].sort()).toEqual(['comedor', 'salon']);
    // The same seed, the same hand.
    expect(createHandState({ rng: 7 }, map)).toEqual(createHandState({ rng: 7 }, map));
  });

  it('is only offered within reach, and in an unlocked room', () => {
    const ctx = atTheHand();
    expect(handOffer(ctx.map, ctx.state, player(ctx))?.mode).toBe('pay');
    const spot = ctx.map.handSpots[ctx.state.hand.spot]!;
    ctx.state.zonesUnlocked[spot.zoneIndex] = false;
    expect(handOffer(ctx.map, ctx.state, player(ctx))).toBeNull();
    ctx.state.zonesUnlocked[spot.zoneIndex] = true;
    player(ctx).y = spot.y + HAND.interactRange + 5;
    expect(handOffer(ctx.map, ctx.state, player(ctx))).toBeNull();
  });
});

describe('what it draws', () => {
  it('nothing 10 %, a special weapon 20 % and a basic one 70 %, never one the player carries', () => {
    const rng = { rng: 12345 };
    const counts = { nothing: 0, special: 0, basic: 0 };
    for (let i = 0; i < 20_000; i++) {
      const w = drawHandOffer(rng, ['pistol'], null);
      expect(w).not.toBe('pistol');
      if (w === null) counts.nothing++;
      else counts[WEAPONS[w].category]++;
    }
    expect(counts.nothing / 20_000).toBeCloseTo(HAND.chances.nothing, 1);
    expect(counts.special / 20_000).toBeCloseTo(HAND.chances.special, 1);
    expect(counts.basic / 20_000).toBeCloseTo(HAND.chances.basic, 1);
  });

  it('does not repeat the last offer while there is another of its group', () => {
    const rng = { rng: 99 };
    for (let i = 0; i < 2000; i++) {
      const w = drawHandOffer(rng, ['pistol'], 'smg');
      if (w && WEAPONS[w].category === 'basic') expect(w).toBe('shotgun');
    }
  });

  it('gives a group with none left its share: all basics carried, specials 90 %', () => {
    const rng = { rng: 5 };
    let special = 0;
    for (let i = 0; i < 10_000; i++) {
      const w = drawHandOffer(rng, ['pistol', 'smg', 'shotgun'], null);
      if (w) {
        expect(WEAPONS[w].category).toBe('special');
        special++;
      }
    }
    expect(special / 10_000).toBeCloseTo(HAND.chances.special + HAND.chances.basic, 1);
  });
});

describe('paying', () => {
  it('with money: 950$, then the sequence starts and it takes no other payment', () => {
    const ctx = atTheHand(2000);
    const paid = vi.fn();
    ctx.events.on('hand:paid', paid);
    tap(ctx);
    expect(player(ctx).money).toBe(2000 - HAND.price);
    expect(ctx.state.hand).toMatchObject({ phase: 'rising', payer: 0, paid: 'money' });
    expect(paid).toHaveBeenCalledWith({ playerId: 0, blood: false });
    tap(ctx); // busy
    expect(player(ctx).money).toBe(2000 - HAND.price);
  });

  it('short of money, with blood: 40 health, the red frame of a hit, never killing', () => {
    const ctx = atTheHand(100);
    const damaged = vi.fn();
    ctx.events.on('player:damaged', damaged);
    expect(handOffer(ctx.map, ctx.state, player(ctx))).toMatchObject({ mode: 'blood', amount: HAND.bloodCost });
    tap(ctx);
    expect(player(ctx).hp).toBe(100 - HAND.bloodCost);
    expect(player(ctx).money).toBe(100);
    expect(damaged).toHaveBeenCalledTimes(1);
    expect(ctx.state.hand.paid).toBe('blood');
  });

  it('with 40 health or less and no money: what is missing, dimmed, and a tap does nothing', () => {
    const ctx = atTheHand(300);
    player(ctx).hp = HAND.bloodCost;
    expect(handOffer(ctx.map, ctx.state, player(ctx))).toMatchObject({ mode: 'short', amount: HAND.price - 300, enabled: false });
    tap(ctx);
    expect(ctx.state.hand.phase).toBe('idle');
    expect(player(ctx).hp).toBe(HAND.bloodCost);
  });
});

describe('the sequence', () => {
  /** Paid, with the draw replaced by `offer` (the draw itself is tested above). */
  function paidFor(offer: WeaponId | null, money = 5000): SimContext {
    const ctx = atTheHand(money);
    tap(ctx);
    ctx.state.hand.offer = offer;
    return ctx;
  }

  it('rises 0.6 s, rolls 2 s, offers 8 s and sinks 0.6 s', () => {
    const ctx = paidFor('smg');
    const offered = vi.fn();
    ctx.events.on('hand:offer', offered);
    seconds(ctx, HAND.risingTime);
    expect(ctx.state.hand.phase).toBe('rolling');
    seconds(ctx, HAND.rollingTime);
    expect(ctx.state.hand.phase).toBe('offering');
    expect(offered).toHaveBeenCalledWith({ weapon: 'smg', special: false });
    seconds(ctx, HAND.offeringTime);
    expect(ctx.state.hand.phase).toBe('sinking');
    seconds(ctx, HAND.sinkingTime);
    expect(ctx.state.hand.phase).toBe('idle');
    // Not taken in time: it sank with the weapon, and the payment is lost.
    expect(player(ctx).weapons.map((w) => w.id)).toEqual(['pistol']);
  });

  it('lets the one who paid take the weapon: into a free slot, in hand, full of ammo', () => {
    const ctx = paidFor('flamethrower');
    const taken = vi.fn();
    ctx.events.on('hand:taken', taken);
    seconds(ctx, HAND.risingTime + HAND.rollingTime + 0.1);
    const p = player(ctx);
    expect(handOffer(ctx.map, ctx.state, p)).toMatchObject({ mode: 'take', weapon: 'flamethrower' });
    tap(ctx);
    const slot = p.weapons[p.activeSlot]!;
    expect(slot).toMatchObject({ id: 'flamethrower', magazine: WEAPONS.flamethrower.magazine, reserve: WEAPONS.flamethrower.maxReserve });
    expect(ctx.state.hand).toMatchObject({ phase: 'sinking', taken: true });
    expect(taken).toHaveBeenCalledWith({ playerId: 0, weapon: 'flamethrower' });
  });

  it('flashes and names a special weapon as it opens', () => {
    const ctx = paidFor('laser');
    const offered = vi.fn();
    ctx.events.on('hand:offer', offered);
    seconds(ctx, HAND.risingTime + HAND.rollingTime + 0.1);
    expect(offered).toHaveBeenCalledWith({ weapon: 'laser', special: true });
  });

  it('with every slot full, replaces the weapon in hand, asking first if it is upgraded', () => {
    const ctx = paidFor('katana');
    const p = player(ctx);
    p.weapons = [createWeaponSlot('pistol'), createWeaponSlot('smg'), createWeaponSlot('shotgun')];
    p.activeSlot = 1;
    p.weapons[1]!.levels.damage = 2;
    seconds(ctx, HAND.risingTime + HAND.rollingTime + 0.1);
    tap(ctx);
    expect(handOffer(ctx.map, ctx.state, p)).toMatchObject({ mode: 'confirm', weapon: 'katana' });
    expect(p.weapons.map((w) => w.id)).toEqual(['pistol', 'smg', 'shotgun']);
    tap(ctx);
    expect(p.weapons.map((w) => w.id)).toEqual(['pistol', 'katana', 'shotgun']);
  });

  it('only the one who paid can take it', () => {
    const ctx = paidFor('smg');
    seconds(ctx, HAND.risingTime + HAND.rollingTime + 0.1);
    ctx.state.hand.payer = 3; // someone else's
    expect(handOffer(ctx.map, ctx.state, player(ctx))).toBeNull();
  });

  it('opens empty when the draw gave nothing, and the payment is lost', () => {
    const ctx = paidFor(null);
    seconds(ctx, HAND.risingTime + HAND.rollingTime + 0.1);
    expect(ctx.state.hand.phase).toBe('empty');
    expect(handOffer(ctx.map, ctx.state, player(ctx))).toBeNull();
    seconds(ctx, HAND.emptyTime + HAND.sinkingTime);
    expect(ctx.state.hand.phase).toBe('idle');
    expect(player(ctx).money).toBe(5000 - HAND.price);
  });

  it('tells the HUD what the button does', () => {
    const ctx = atTheHand(100);
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const action = vi.fn();
    ctx.events.on('action:context', action);
    stepSimulation(ctx, DT);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith({ kind: 'hand', amount: HAND.bloodCost, enabled: true, hand: { mode: 'blood' } });
  });
});

describe('hand spots on the map (validate-map)', () => {
  const objects = (raw: ReturnType<typeof embeddedMansion>) => (raw.layers.find((l) => l.name === 'objects') as TiledObjectLayer).objects;
  const handSpot = (raw: ReturnType<typeof embeddedMansion>, id: string) => objects(raw).find((o) => o.type === 'hand_spot' && o.name === id)!;

  it('the mansion has one per room but the hall, and passes', () => {
    const raw = embeddedMansion();
    const map = parseMap(raw);
    expect(map.handSpots.map((s) => s.zone).sort()).toEqual(['azotea', 'biblioteca', 'calle', 'cocina', 'comedor', 'garaje', 'jardin', 'salon', 'sotano']);
    expect(validateMap(raw).errors).toEqual([]);
    expect(zoneIndex(createMansionContext(), 'recibidor')).toBeGreaterThanOrEqual(0);
  });

  it('rejects a spot next to a door, in a narrow passage or against a wall, and a room without one', () => {
    const ctx = createMansionContext();
    const d2 = ctx.map.doors.find((d) => d.id === 'D2')!;
    const raw = embeddedMansion();
    // H2 (dining room) right next to its door.
    const h2 = handSpot(raw, 'H2');
    h2.x = (d2.tiles[0]!.x + 1.5) * 32;
    h2.y = (d2.tiles[0]!.y + 0.5) * 32;
    const errors = validateMap(raw).errors.join('\n');
    expect(errors).toMatch(/punto de mano .* de la puerta D2/);
    // H1 (living room) against the west wall.
    const raw2 = embeddedMansion();
    const h1 = handSpot(raw2, 'H1');
    h1.x = 16.5 * 32; // the facade's wall right to its west
    h1.y = 32.5 * 32;
    expect(validateMap(raw2).errors.join('\n')).toMatch(/vecinas bloqueadas|paso de menos de 3/);
    // No spot in the garage.
    const raw3 = embeddedMansion();
    const list = objects(raw3);
    list.splice(list.indexOf(handSpot(raw3, 'H5')), 1);
    expect(validateMap(raw3).errors).toContain('la zona garaje tiene 0 puntos de mano; debe tener 1');
  });
});
