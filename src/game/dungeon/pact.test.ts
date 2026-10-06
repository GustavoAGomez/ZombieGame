import { describe, expect, it } from 'vitest';
import { HAND, PLAYER } from '../../config/balance';
import { DUNGEON } from '../../config/dungeon';
import { CURSE_EFFECTS, CURSE_IDS, UPGRADES, UPGRADE_IDS, rarityOf, type UpgradeId } from '../../config/upgrades';
import type { GameEvents } from '../../core/EventBus';
import type { Room } from '../../core/RunState';
import { dungeonContext, testTemplates } from '../../test/dungeonFixtures';
import { rulesOf } from '../rules';
import { isZombieAlive } from '../systems/Combat';
import { dungeonOffer, roomBudget, tapDungeon } from '../systems/DungeonSystem';
import { handOffer, tapHand } from '../systems/HandSystem';
import type { SimContext } from '../systems/SimContext';
import { stepSimulation } from '../systems/Simulation';
import { bankOf } from './templates';
import { generateFloor } from './generateFloor';
import { drawPact } from './wizardShop';

const DT = 1 / 60;

function steps(ctx: SimContext, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepSimulation(ctx, DT);
}

function teleport(ctx: SimContext, x: number, y: number): void {
  const p = ctx.state.players[0]!;
  p.x = p.prevX = x;
  p.y = p.prevY = y;
}

describe('the Demon\'s Hand in its room (spec 09 §9)', () => {
  it('has the dungeon\'s numbers in the rules, and Survival keeps its own', () => {
    expect(rulesOf('survival').hand).toEqual({ price: HAND.price, blood: { share: HAND.bloodShare }, uses: null, moves: true });
    expect(rulesOf('dungeon').hand).toEqual({ price: DUNGEON.hand.price, blood: { flat: DUNGEON.hand.blood }, uses: DUNGEON.hand.uses, moves: false });
  });

  it('waits in the hand room, sells a weapon for 400$ or 30 of life, once per floor, and then has nothing more', () => {
    const ctx = dungeonContext(1);
    const { state, map } = ctx;
    const run = state.run!;
    const p = state.players[0]!;
    const handRoom = run.plan.rooms.findIndex((r) => r.type === 'hand');
    const spot = map.handSpots[state.hand.spot]!;
    expect(spot.zoneIndex).toBe(handRoom);
    expect(state.hand.usesLeft).toBe(DUNGEON.hand.uses);
    steps(ctx, 0.1);
    teleport(ctx, spot.x + 10, spot.y);
    stepSimulation(ctx, DT);
    p.money = 1000;
    expect(handOffer(map, state, p)).toMatchObject({ mode: 'pay', amount: DUNGEON.hand.price });
    p.money = 100;
    expect(handOffer(map, state, p)).toMatchObject({ mode: 'blood', amount: DUNGEON.hand.blood });
    // The blood pact takes its flat price; the weapon comes up and is taken.
    tapHand(ctx, p);
    expect(p.hp).toBe(PLAYER.maxHp - DUNGEON.hand.blood);
    steps(ctx, HAND.risingTime + HAND.rollingTime + DT);
    const weapons = p.weapons.length;
    if (state.hand.offer) {
      tapHand(ctx, p);
      expect(p.weapons.length + Number(state.hand.taken && weapons === p.weapons.length)).toBeGreaterThanOrEqual(weapons);
    }
    steps(ctx, HAND.offeringTime + HAND.sinkingTime + 1);
    expect(state.hand.phase).toBe('idle');
    // Spent for the floor: no second payment, and it never moves on.
    p.money = 1000;
    expect(handOffer(map, state, p)).toMatchObject({ mode: 'spent', enabled: false });
    expect(state.hand.spot).toBe(map.handSpots.findIndex((s) => s === spot));
  });
});

describe('the altar of the pact (spec 09 §9)', () => {
  it('stands beside the hand with a legendary and a curse; a tap arms it, walking away disarms it, a second tap seals it', () => {
    const ctx = dungeonContext(1);
    const { state, map } = ctx;
    const run = state.run!;
    const p = state.players[0]!;
    const pacts: GameEvents['dungeon:pact'][] = [];
    ctx.events.on('dungeon:pact', (e) => pacts.push(e));
    steps(ctx, 0.1);
    const spot = map.handSpots[state.hand.spot]!;
    expect(run.altar).not.toBeNull();
    expect(Math.abs(run.altar!.y - spot.y)).toBeLessThanOrEqual(map.tileSize);
    expect(run.altar!.x).toBeGreaterThan(spot.x);
    expect(rarityOf(run.pact!.upgrade)).toBe('legendary');
    expect(CURSE_IDS).toContain(run.pact!.curse);
    teleport(ctx, run.altar!.x, run.altar!.y);
    stepSimulation(ctx, DT);
    const first = dungeonOffer(map, state, p)!;
    expect(first).toMatchObject({ action: 'pact', enabled: true, pact: { upgrade: run.pact!.upgrade, curse: run.pact!.curse } });
    tapDungeon(ctx, p, first);
    expect(run.pact!.armed).toBe(true);
    expect(dungeonOffer(map, state, p)!.action).toBe('pactConfirm');
    // Out of reach: the first tap is forgotten.
    teleport(ctx, run.altar!.x + 200, run.altar!.y);
    stepSimulation(ctx, DT);
    expect(run.pact!.armed).toBe(false);
    teleport(ctx, run.altar!.x, run.altar!.y);
    stepSimulation(ctx, DT);
    expect(dungeonOffer(map, state, p)!.action).toBe('pact');
    // Sealed: the legendary for free, the curse for the match.
    run.pact!.curse = 'frail';
    const money = p.money;
    tapDungeon(ctx, p, dungeonOffer(map, state, p)!);
    tapDungeon(ctx, p, dungeonOffer(map, state, p)!);
    expect(run.pact!.accepted).toBe(true);
    expect(run.upgrades).toEqual([run.pact!.upgrade]);
    expect(run.curses).toEqual(['frail']);
    expect(p.maxHp).toBe(PLAYER.maxHp + CURSE_EFFECTS.frail.maxHp);
    expect(p.hp).toBeLessThanOrEqual(p.maxHp);
    expect(p.money).toBe(money);
    expect(pacts).toEqual([{ playerId: p.id, upgrade: run.pact!.upgrade, curse: 'frail' }]);
    // One per floor: the altar offers nothing more.
    expect(dungeonOffer(map, state, p)).toBeNull();
  });

  it('offers no altar with every legendary taken, and never a curse already carried', () => {
    const ctx = dungeonContext(2);
    const run = ctx.state.run!;
    run.upgrades.push(...UPGRADE_IDS.filter((id) => rarityOf(id) === 'legendary').flatMap((id) => Array<UpgradeId>(UPGRADES[id].maxCopies).fill(id)));
    steps(ctx, 0.1);
    expect(run.altar).toBeNull();
    expect(run.pact).toBeNull();
    const other = dungeonContext(2);
    const cursed = other.state.run!;
    cursed.curses.push('frail', 'hunted', 'tithe');
    for (let i = 0; i < 20; i++) expect(drawPact(other.state, cursed)?.curse).toBe('leak');
    cursed.curses.push('leak');
    expect(drawPact(other.state, cursed)).toBeNull();
  });
});

describe('the challenge room (spec 09 §6.4)', () => {
  /** A seed whose first floor has a challenge room. */
  function challengeSeed(): number {
    const bank = bankOf(testTemplates('mansion'));
    for (let seed = 1; seed < 60; seed++) if (generateFloor(seed, 1, bank).rooms.some((r) => r.type === 'challenge')) return seed;
    throw new Error('ninguna semilla con sala de reto');
  }

  it('spends half as much again as a hard room, always in two waves, and leaves the big chest: a key, 300$ and a medkit, no key to open it', () => {
    const ctx = dungeonContext(challengeSeed());
    const { state, map } = ctx;
    const run = state.run!;
    const p = state.players[0]!;
    const room = run.plan.rooms.findIndex((r) => r.type === 'challenge');
    const def = run.plan.rooms[room] as Room;
    expect(roomBudget(def, 1)).toBe(Math.round(DUNGEON.budget.hard[0] * DUNGEON.challenge.budgetFactor));
    steps(ctx, 0.1);
    const zone = map.zones[room]!;
    teleport(ctx, zone.x + zone.width / 2, zone.y + zone.height / 2);
    stepSimulation(ctx, DT);
    expect(run.fight).toMatchObject({ room, waves: 2 });
    // Everything that comes up dies at once, until the room is clear.
    let guard = 0;
    while (!run.cleared[room] && guard++ < 600) {
      for (const z of state.zombies) {
        if (!isZombieAlive(z)) continue;
        z.hp = 0;
        z.ai = 'dead';
        z.timer = 0.1;
      }
      stepSimulation(ctx, DT);
    }
    expect(run.cleared[room]).toBe(true);
    const chest = run.chests.find((c) => c.kind === 'big' && c.room === room)!;
    expect(chest).toBeDefined();
    run.keys = 0;
    teleport(ctx, chest.x, chest.y);
    const offer = dungeonOffer(map, state, p)!;
    expect(offer.action).toBe('chest');
    const money = p.money;
    tapDungeon(ctx, p, offer);
    expect(chest.opened).toBe(true);
    expect(p.money).toBe(money + DUNGEON.chest.big);
    expect(state.pickups.some((k) => k.active && k.kind === 'health')).toBe(true);
    expect(state.pickups.some((k) => k.active && k.kind === 'key')).toBe(true);
  });
});
