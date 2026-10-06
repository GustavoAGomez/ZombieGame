import { describe, expect, it } from 'vitest';
import { DUNGEON, ENEMY_ROOM_TYPES } from '../../config/dungeon';
import { CURSE_EFFECTS, RARITY_CHANCES, RARITY_PRICES, UPGRADES, UPGRADE_EFFECTS, UPGRADE_IDS, rarityOf, type UpgradeId } from '../../config/upgrades';
import type { GameEvents } from '../../core/EventBus';
import type { Room } from '../../core/RunState';
import { dungeonContext } from '../../test/dungeonFixtures';
import { damageBoss } from '../systems/BossCombat';
import { damageZombie, isZombieAlive } from '../systems/Combat';
import { dungeonOffer, roomAt, tapDungeon } from '../systems/DungeonSystem';
import { buyItem, shopItemStatus } from '../systems/ShopSystem';
import type { SimContext } from '../systems/SimContext';
import { stepSimulation } from '../systems/Simulation';
import { bossChestRows, chooseBossUpgrade, drawOffers, offerable, rarityChances, wizardFor, wizardPrice, wizardRows, WIZARD_ROWS } from './wizardShop';

const DT = 1 / 60;

function steps(ctx: SimContext, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepSimulation(ctx, DT);
}

function teleport(ctx: SimContext, x: number, y: number): void {
  const p = ctx.state.players[0]!;
  p.x = p.prevX = x;
  p.y = p.prevY = y;
}

/** The first combat room next to the start, and a tile well inside it. */
function nextRoom(ctx: SimContext): { room: number; x: number; y: number } {
  const run = ctx.state.run!;
  const start = run.plan.rooms[run.plan.start] as Room;
  const room = start.doors.map((d) => d.room).find((r) => ENEMY_ROOM_TYPES.includes((run.plan.rooms[r] as Room).type));
  if (room === undefined) throw new Error('la semilla no tiene sala de combate junto al inicio');
  const zone = ctx.map.zones[room]!;
  return { room, x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
}

/** Clears the room next to the start as the fifth one: the wizard appears there. */
function clearFifthRoom(ctx: SimContext): number {
  const run = ctx.state.run!;
  steps(ctx, 0.1);
  run.merchantCounter = DUNGEON.merchant.every - 1;
  const { room, x, y } = nextRoom(ctx);
  teleport(ctx, x, y);
  stepSimulation(ctx, DT);
  run.fight!.later = [];
  steps(ctx, DUNGEON.fight.spawnWarning + DT);
  for (const z of ctx.state.zombies) if (isZombieAlive(z)) damageZombie(ctx, z, 1e9, 0);
  stepSimulation(ctx, DT);
  return room;
}

describe('the offers (spec 09 §7.1)', () => {
  it('draws distinct upgrades the run can still take, never past their copies', () => {
    const ctx = dungeonContext(3);
    const run = ctx.state.run!;
    run.upgrades.push('magnet', 'vitality', 'vitality', 'vitality');
    const pool = offerable(run);
    expect(pool).not.toContain('magnet');
    expect(pool).not.toContain('vitality');
    expect(pool).toHaveLength(UPGRADE_IDS.length - 2);
    for (let i = 0; i < 50; i++) {
      const offers = drawOffers(ctx.state, run, 3, 1);
      expect(offers).toHaveLength(3);
      expect(new Set(offers).size).toBe(3);
      expect(offers).not.toContain('magnet');
    }
  });

  it('follows the floor\'s chances, roughly, and runs out gracefully', () => {
    const ctx = dungeonContext(4);
    const run = ctx.state.run!;
    expect(rarityChances(1)).toBe(RARITY_CHANCES.early);
    expect(rarityChances(RARITY_CHANCES.lateFromFloor)).toBe(RARITY_CHANCES.late);
    const counts = { common: 0, rare: 0, legendary: 0 };
    for (let i = 0; i < 600; i++) for (const id of drawOffers(ctx.state, run, 1, 1)) counts[rarityOf(id)]++;
    expect(counts.common / 600).toBeGreaterThan(0.5);
    expect(counts.legendary / 600).toBeLessThan(0.2);
    // Everything taken but one common: that one, alone.
    run.upgrades = UPGRADE_IDS.flatMap((id) => (id === 'greed' ? [] : Array<UpgradeId>(UPGRADES[id].maxCopies).fill(id)));
    expect(drawOffers(ctx.state, run, 3, 3)).toEqual(['greed']);
    run.upgrades.push('greed', 'greed');
    expect(drawOffers(ctx.state, run, 3, 3)).toEqual([]);
  });

  it('the boss chest\'s draw has one rare or better, and the wizard is the colour of the best', () => {
    const ctx = dungeonContext(6);
    const run = ctx.state.run!;
    for (let i = 0; i < 40; i++) expect(drawOffers(ctx.state, run, 3, 1, true).some((id) => rarityOf(id) !== 'common')).toBe(true);
    expect(wizardFor(['vitality', 'greed'])).toBe('blue');
    expect(wizardFor(['vitality', 'piercing'])).toBe('red');
    expect(wizardFor(['ward', 'piercing', 'vitality'])).toBe('gold');
  });
});

describe('the wizard (spec 09 §7.1)', () => {
  it('appears in the fifth room cleared, on its wizard spot, and the HUD hears', () => {
    const ctx = dungeonContext(1);
    const run = ctx.state.run!;
    const wizards: GameEvents['dungeon:wizard'][] = [];
    const rooms: GameEvents['dungeon:rooms'][] = [];
    ctx.events.on('dungeon:wizard', (e) => wizards.push(e));
    ctx.events.on('dungeon:rooms', (e) => rooms.push(e));
    const room = clearFifthRoom(ctx);
    expect(run.shop).not.toBeNull();
    expect(run.shop!.room).toBe(room);
    expect(run.shop!.offers).toHaveLength(DUNGEON.merchant.offers);
    const m = ctx.state.merchants[run.shop!.merchant]!;
    expect(m.active).toBe(true);
    expect(m.id).toBe(wizardFor(run.shop!.offers));
    expect(roomAt(ctx, m.x, m.y)).toBe(room);
    expect(wizards).toEqual([{ room, merchant: m.id }]);
    expect(rooms.at(-1)?.wizardRoom).toBe(room);
    // Survival's rounds never move it.
    steps(ctx, 2);
    expect(m.active).toBe(true);
    expect(roomAt(ctx, m.x, m.y)).toBe(room);
  });

  it('sells its rows: an upgrade (the others go), a dearer offer each time, a key and a medkit once', () => {
    const ctx = dungeonContext(1);
    const run = ctx.state.run!;
    const p = ctx.state.players[0]!;
    const taken: GameEvents['dungeon:upgrade'][] = [];
    ctx.events.on('dungeon:upgrade', (e) => taken.push(e));
    clearFifthRoom(ctx);
    const shop = run.shop!;
    const merchant = shop.merchant;
    const m = ctx.state.merchants[merchant]!;
    teleport(ctx, m.x + 24, m.y);
    stepSimulation(ctx, DT);
    expect(p.contextAction).toBe('merchant');
    // The rows: the three offers at their rarity's price, the new offer, the key and the medkit.
    const rows = wizardRows(ctx.state, 0);
    expect(rows.map((r) => r.item)).toEqual(['upgrade', 'upgrade', 'upgrade', 'reroll', 'key', 'medkit']);
    expect(rows[0]!.price).toBe(RARITY_PRICES[rarityOf(shop.offers[0]!)]);
    expect(rows[3]!.price).toBe(DUNGEON.merchant.rerollBase);
    expect(rows[5]!.status).toEqual({ kind: 'unavailable', reason: 'hpFull' });
    p.money = 20;
    expect(shopItemStatus(ctx.state, merchant, 0, 0)).toEqual({ kind: 'short', missing: rows[0]!.price - 20 });
    p.money = 5000;
    // A new offer: the price climbs, the first offer is drawn again.
    expect(buyItem(ctx, 0, merchant, WIZARD_ROWS.reroll)).toBe(true);
    expect(p.money).toBe(5000 - DUNGEON.merchant.rerollBase);
    expect(shop.rerolls).toBe(1);
    expect(wizardPrice(run, WIZARD_ROWS.reroll)).toBe(DUNGEON.merchant.rerollBase + DUNGEON.merchant.rerollStep);
    // An upgrade: in the run, the other offers gone, the reroll with them.
    const money = p.money;
    const id = shop.offers[1]!;
    expect(buyItem(ctx, 0, merchant, 1)).toBe(true);
    expect(run.upgrades).toEqual([id]);
    expect(p.money).toBe(money - RARITY_PRICES[rarityOf(id)]);
    expect(taken).toEqual([{ playerId: p.id, id, rarity: rarityOf(id), free: false }]);
    expect(shopItemStatus(ctx.state, merchant, 0, 0)).toEqual({ kind: 'hidden' });
    expect(shopItemStatus(ctx.state, merchant, 0, WIZARD_ROWS.reroll)).toEqual({ kind: 'hidden' });
    expect(wizardRows(ctx.state, 0).map((r) => r.item)).toEqual(['key', 'medkit']);
    // The key, once.
    expect(buyItem(ctx, 0, merchant, WIZARD_ROWS.key)).toBe(true);
    expect(run.keys).toBe(1);
    expect(shopItemStatus(ctx.state, merchant, 0, WIZARD_ROWS.key)).toEqual({ kind: 'limit' });
    // The medkit heals 40, once.
    p.hp = 50;
    expect(buyItem(ctx, 0, merchant, WIZARD_ROWS.medkit)).toBe(true);
    expect(p.hp).toBe(50 + DUNGEON.combat.medkitHeal);
    expect(shopItemStatus(ctx.state, merchant, 0, WIZARD_ROWS.medkit)).toEqual({ kind: 'limit' });
  });

  it('Diezmo raises its prices, and Vitalidad raises the life at once', () => {
    const ctx = dungeonContext(1);
    const run = ctx.state.run!;
    const p = ctx.state.players[0]!;
    clearFifthRoom(ctx);
    run.curses.push('tithe');
    expect(wizardPrice(run, WIZARD_ROWS.key)).toBe(Math.round(DUNGEON.merchant.key * CURSE_EFFECTS.tithe.prices));
    run.shop!.offers = ['vitality', 'greed', 'magnet'];
    p.money = 5000;
    p.hp = 60;
    expect(buyItem(ctx, 0, run.shop!.merchant, 0)).toBe(true);
    expect(p.maxHp).toBe(100 + UPGRADE_EFFECTS.vitality.maxHp);
    expect(p.hp).toBe(60 + UPGRADE_EFFECTS.vitality.heal);
  });
});

describe('the boss\'s chest (spec 09 §7.3)', () => {
  it('appears with the boss dead, offers three upgrades with one rare or better, and gives the one chosen for free', () => {
    // On the first floor: the last one's win ends the match before any chest.
    const ctx = dungeonContext(5, 1);
    const run = ctx.state.run!;
    const p = ctx.state.players[0]!;
    const taken: GameEvents['dungeon:upgrade'][] = [];
    ctx.events.on('dungeon:upgrade', (e) => taken.push(e));
    steps(ctx, 0.1);
    const arena = run.plan.boss;
    const bossDoor = run.doorKinds.indexOf('boss');
    const door = ctx.map.doors[bossDoor]!;
    run.bossKey = true;
    teleport(ctx, door.center.x, door.center.y);
    tapDungeon(ctx, p, dungeonOffer(ctx.map, ctx.state, p)!);
    const spot = ctx.map.bossSpots.find((s) => s.zoneIndex === arena)!;
    teleport(ctx, spot.x - 160, spot.y);
    stepSimulation(ctx, DT);
    steps(ctx, DUNGEON.boss.fallDelay + DUNGEON.boss.shadow + 1);
    const boss = ctx.state.bosses.find((b) => b.active)!;
    while (boss.phase !== 'dead') {
      damageBoss(ctx, boss, 1e9, 0);
      stepSimulation(ctx, DT);
    }
    const chest = run.chests.find((c) => c.kind === 'boss')!;
    expect(chest).toBeDefined();
    expect(chest.room).toBe(arena);
    expect(run.bossChoice).toMatchObject({ chest: run.chests.indexOf(chest) });
    const offers = run.bossChoice!.offers;
    expect(offers).toHaveLength(DUNGEON.bossChest.offers);
    expect(offers.some((id) => rarityOf(id) !== 'common')).toBe(true);
    // Its panel opens from the action button and shows the three, free.
    teleport(ctx, chest.x, chest.y);
    const offer = dungeonOffer(ctx.map, ctx.state, p)!;
    expect(offer.action).toBe('chest');
    tapDungeon(ctx, p, offer);
    expect(p.shopChest).toBe(run.chests.indexOf(chest));
    expect(chest.opened).toBe(false);
    const rows = bossChestRows(ctx.state);
    expect(rows.map((r) => r.upgrade)).toEqual(offers);
    expect(rows.every((r) => r.price === 0 && r.status.kind === 'buy')).toBe(true);
    const money = p.money;
    expect(chooseBossUpgrade(ctx, 0, 1)).toBe(true);
    expect(run.upgrades).toEqual([offers[1]]);
    expect(p.money).toBe(money);
    expect(chest.opened).toBe(true);
    expect(run.bossChoice).toBeNull();
    expect(p.shopChest).toBe(-1);
    expect(taken).toEqual([{ playerId: p.id, id: offers[1], rarity: rarityOf(offers[1]!), free: true }]);
    expect(dungeonOffer(ctx.map, ctx.state, p)?.action).not.toBe('chest');
  });
});
