/**
 * The dungeon's wizard and the boss's chest (spec 09 §7.1, §7.3): the
 * offers drawn from what the run can still take, the rows of the panel
 * (ShopSystem and HudPresenter hand over to these in the dungeon), what
 * buying each one does, and the upgrade joining the run. The lasting
 * numbers of an upgrade are read through src/game/dungeon/stats.ts.
 */
import { DUNGEON } from '../../config/dungeon';
import type { MerchantId, MerchantItemId } from '../../config/merchants';
import { RARITY_CHANCES, RARITY_PRICES, UPGRADES, UPGRADE_EFFECTS, UPGRADE_IDS, rarityOf, type Rarity, type UpgradeId } from '../../config/upgrades';
import type { GameEvents } from '../../core/EventBus';
import type { GameState, PlayerState } from '../../core/GameState';
import { random } from '../../core/Rng';
import type { RunState } from '../../core/RunState';
import type { ShopItemStatus } from '../../core/shop';
import { emitRooms } from '../systems/DungeonSystem';
import type { SimContext } from '../systems/SimContext';
import { copiesOf, maxHpWith, playerStats } from './stats';

type ShopRow = GameEvents['shop:state']['rows'][number];

/** Row indices of the wizard's panel (§7.1): the offers first, then a new offer, a key and a medkit. */
export const WIZARD_ROWS = { reroll: DUNGEON.merchant.offers, key: DUNGEON.merchant.offers + 1, medkit: DUNGEON.merchant.offers + 2 } as const;

/** The wizard of each rarity: blue sells common offers, red rare ones, gold legendary ones (§7.1). */
const WIZARD_BY_RARITY: Readonly<Record<Rarity, MerchantId>> = { common: 'blue', rare: 'red', legendary: 'gold' };
const RARITY_RANK: Readonly<Record<Rarity, number>> = { common: 0, rare: 1, legendary: 2 };

/** The chance of each rarity on `floor` (§7.1). */
export function rarityChances(floor: number): Readonly<Record<Rarity, number>> {
  return floor >= RARITY_CHANCES.lateFromFloor ? RARITY_CHANCES.late : RARITY_CHANCES.early;
}

function rollRarity(state: GameState, floor: number): Rarity {
  const chances = rarityChances(floor);
  const r = random(state);
  if (r < chances.legendary) return 'legendary';
  if (r < chances.legendary + chances.rare) return 'rare';
  return 'common';
}

/** The upgrades the run can still be offered (§7.1): none past its copies, none already in `taken`. */
export function offerable(run: Pick<RunState, 'upgrades'>, taken: readonly UpgradeId[] = []): UpgradeId[] {
  return UPGRADE_IDS.filter((id) => copiesOf(run, id) < UPGRADES[id].maxCopies && !taken.includes(id));
}

/**
 * Draws `count` different upgrades with `floor`'s chances (§7.1), each
 * slot of the rarity rolled or the nearest one with something left. With
 * `atLeastRare`, one of them is rare or better when any is left (§7.3).
 */
export function drawOffers(state: GameState, run: RunState, count: number, floor: number, atLeastRare = false): UpgradeId[] {
  const drawn: UpgradeId[] = [];
  for (let i = 0; i < count; i++) {
    const pool = offerable(run, drawn);
    if (pool.length === 0) break;
    drawn.push(pickOfRarity(state, pool, rollRarity(state, floor)));
  }
  if (atLeastRare && drawn.length > 0 && drawn.every((id) => rarityOf(id) === 'common')) {
    const rare = offerable(run, drawn).filter((id) => rarityOf(id) !== 'common');
    if (rare.length > 0) drawn[drawn.length - 1] = rare[Math.floor(random(state) * rare.length)] as UpgradeId;
  }
  return drawn;
}

function pickOfRarity(state: GameState, pool: readonly UpgradeId[], rarity: Rarity): UpgradeId {
  const order: Rarity[] = rarity === 'common' ? ['common', 'rare', 'legendary'] : rarity === 'rare' ? ['rare', 'common', 'legendary'] : ['legendary', 'rare', 'common'];
  for (const r of order) {
    const of = pool.filter((id) => rarityOf(id) === r);
    if (of.length > 0) return of[Math.floor(random(state) * of.length)] as UpgradeId;
  }
  return pool[0] as UpgradeId;
}

/** Which wizard sells `offers`: the one of its best rarity (§7.1). */
export function wizardFor(offers: readonly UpgradeId[]): MerchantId {
  let best: Rarity = 'common';
  for (const id of offers) if (RARITY_RANK[rarityOf(id)] > RARITY_RANK[best]) best = rarityOf(id);
  return WIZARD_BY_RARITY[best];
}

/**
 * The wizard appears (§7.1) in the room just cleared, on its wizard spot
 * (or at `at` when the room has none), with its smoke: the one of the
 * offer's best rarity. The last wizard leaves: one at a time.
 */
export function summonWizard(ctx: SimContext, run: RunState, room: number, at: { x: number; y: number }): void {
  const { state, map } = ctx;
  const offers = drawOffers(state, run, DUNGEON.merchant.offers, run.floor);
  const id = wizardFor(offers);
  const index = state.merchants.findIndex((m) => m.id === id);
  const m = state.merchants[index];
  if (!m) return;
  if (run.shop) {
    const old = state.merchants[run.shop.merchant];
    if (old && old !== m) old.active = false;
  }
  for (const p of state.players) p.shopMerchant = -1;
  const spot = map.merchantSpots.findIndex((s) => s.zoneIndex === room);
  const target = map.merchantSpots[spot] ?? at;
  m.enabled = true;
  m.fromSpot = -1;
  m.spot = spot;
  m.active = true;
  m.x = target.x;
  m.y = target.y;
  m.moveTick = state.tick;
  m.visitPurchases.fill(0);
  run.shop = { merchant: index, room, offers, rerolls: 0, bought: false, keyBought: false, medkitBought: false };
  ctx.events.emit('merchant:moved', { merchant: id, first: true });
  ctx.events.emit('dungeon:wizard', { room, merchant: id });
}

/** What row `index` costs now (§7.1): the offer's rarity, the new offer dearer each time, the key and the medkit; Diezmo raises them all. */
export function wizardPrice(run: RunState, index: number): number {
  const shop = run.shop;
  if (!shop) return 0;
  const offer = shop.offers[index];
  const base =
    index < DUNGEON.merchant.offers ? (offer ? RARITY_PRICES[rarityOf(offer)] : 0)
    : index === WIZARD_ROWS.reroll ? DUNGEON.merchant.rerollBase + shop.rerolls * DUNGEON.merchant.rerollStep
    : index === WIZARD_ROWS.key ? DUNGEON.merchant.key
    : DUNGEON.merchant.medkit;
  return Math.round(base * playerStats(run).prices);
}

/** The COMPRAR button of row `index` of the wizard's panel for player `playerIndex` (§7.1). */
export function wizardItemStatus(state: GameState, playerIndex: number, index: number): ShopItemStatus {
  const run = state.run;
  const p = state.players[playerIndex];
  const shop = run?.shop;
  if (!run || !p || !shop) return { kind: 'hidden' };
  if (index < DUNGEON.merchant.offers) {
    // Buying one takes the others away.
    if (shop.bought || !shop.offers[index]) return { kind: 'hidden' };
  } else if (index === WIZARD_ROWS.reroll) {
    if (shop.bought || offerable(run, shop.offers).length === 0) return { kind: 'hidden' };
  } else if (index === WIZARD_ROWS.key) {
    if (shop.keyBought) return { kind: 'limit' };
  } else if (index === WIZARD_ROWS.medkit) {
    if (shop.medkitBought) return { kind: 'limit' };
    if (p.hp >= p.maxHp) return { kind: 'unavailable', reason: 'hpFull' };
  } else return { kind: 'hidden' };
  const price = wizardPrice(run, index);
  if (p.money < price) return { kind: 'short', missing: price - p.money };
  return { kind: 'buy' };
}

/** The rows of the wizard's panel (§7.1), in order; the hidden ones are left out. */
export function wizardRows(state: GameState, playerIndex: number): ShopRow[] {
  const run = state.run;
  const shop = run?.shop;
  if (!run || !shop) return [];
  const rows: ShopRow[] = [];
  const indices = [...shop.offers.map((_, i) => i), WIZARD_ROWS.reroll, WIZARD_ROWS.key, WIZARD_ROWS.medkit];
  for (const index of indices) {
    const status = wizardItemStatus(state, playerIndex, index);
    if (status.kind === 'hidden') continue;
    const offer = index < DUNGEON.merchant.offers ? shop.offers[index] : undefined;
    const item: MerchantItemId = offer ? 'upgrade' : index === WIZARD_ROWS.reroll ? 'reroll' : index === WIZARD_ROWS.key ? 'key' : 'medkit';
    const row: ShopRow = { index, item, price: wizardPrice(run, index), status };
    rows.push(offer ? { ...row, upgrade: offer, rarity: rarityOf(offer) } : row);
  }
  return rows;
}

/** Player `playerIndex` buys row `index` from the wizard (§7.1). True when bought. */
export function buyWizardItem(ctx: SimContext, playerIndex: number, index: number): boolean {
  const { state } = ctx;
  const run = state.run;
  const p = state.players[playerIndex];
  const shop = run?.shop;
  if (!run || !p || !shop) return false;
  const status = wizardItemStatus(state, playerIndex, index);
  if (status.kind !== 'buy') {
    if (status.kind === 'short') ctx.events.emit('action:denied', { playerId: p.id });
    return false;
  }
  const m = state.merchants[shop.merchant];
  if (!m) return false;
  const price = wizardPrice(run, index);
  p.money -= price;
  ctx.events.emit('money:spent', { playerId: p.id, amount: price });
  let item: MerchantItemId;
  const offer = shop.offers[index];
  if (index < DUNGEON.merchant.offers && offer) {
    item = 'upgrade';
    shop.bought = true;
    takeUpgrade(ctx, run, p, offer, false);
  } else if (index === WIZARD_ROWS.reroll) {
    item = 'reroll';
    shop.rerolls++;
    shop.offers = drawOffers(state, run, DUNGEON.merchant.offers, run.floor);
    ctx.events.emit('dungeon:reroll', { price });
  } else if (index === WIZARD_ROWS.key) {
    item = 'key';
    shop.keyBought = true;
    run.keys++;
    emitRooms(ctx, run);
  } else {
    item = 'medkit';
    shop.medkitBought = true;
    p.hp = Math.min(p.maxHp, p.hp + DUNGEON.combat.medkitHeal);
  }
  ctx.events.emit('merchant:purchase', { playerId: p.id, merchant: m.id, item });
  return true;
}

/**
 * An upgrade joins the run (§7.1, §7.3): the lasting numbers change at
 * once (the life's top, and Vitalidad heals its share), and the HUD hears.
 */
export function takeUpgrade(ctx: SimContext, run: RunState, p: PlayerState, id: UpgradeId, free: boolean): void {
  run.upgrades.push(id);
  p.maxHp = maxHpWith(playerStats(run));
  if (id === 'vitality') p.hp += UPGRADE_EFFECTS.vitality.heal;
  p.hp = Math.min(p.hp, p.maxHp);
  ctx.events.emit('dungeon:upgrade', { playerId: p.id, id, rarity: rarityOf(id), free });
}

/**
 * The boss's chest appears (§7.3) where the arena keeps its chest spot. Its
 * three upgrades are drawn now, with the next floor's chances and one rare
 * or better, so leaving and coming back finds the same choice.
 */
export function placeBossChest(ctx: SimContext, run: RunState, room: number, at: { x: number; y: number }): void {
  const chest = run.chests.push({ x: at.x, y: at.y, room, kind: 'boss', weapon: null, opened: false }) - 1;
  run.bossChoice = { chest, offers: drawOffers(ctx.state, run, DUNGEON.bossChest.offers, run.floor + 1, true) };
}

/** The boss chest's panel (§7.3): its upgrades, free, one to choose. */
export function bossChestRows(state: GameState): ShopRow[] {
  const choice = state.run?.bossChoice;
  if (!choice) return [];
  return choice.offers.map((id, i) => ({ index: i, item: 'upgrade', price: 0, status: { kind: 'buy' }, upgrade: id, rarity: rarityOf(id) }));
}

/** Player `playerIndex` takes offer `index` of the boss's chest (§7.3): the chest opens, the panel closes. True when taken. */
export function chooseBossUpgrade(ctx: SimContext, playerIndex: number, index: number): boolean {
  const { state } = ctx;
  const run = state.run;
  const p = state.players[playerIndex];
  const choice = run?.bossChoice;
  const id = choice?.offers[index];
  if (!run || !p || !choice || !id) return false;
  const chest = run.chests[choice.chest];
  if (chest) chest.opened = true;
  run.bossChoice = null;
  for (const o of state.players) o.shopChest = -1;
  takeUpgrade(ctx, run, p, id, true);
  if (chest) ctx.events.emit('dungeon:chestOpened', { kind: chest.kind, x: chest.x, y: chest.y });
  return true;
}
