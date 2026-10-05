import { WEAPON_CASES } from '../../config/balance';
import type { WeaponId } from '../../config/weapons';
import type { GameState, PlayerState, WeaponSlotState } from '../../core/GameState';
import type { MapData, MapWeaponCase } from '../map/MapLoader';
import { findWeapon, giveWeapon, needsSwapConfirm, refillWeapon, weaponReplacedBy } from './InventorySystem';
import { spendMoney } from './PointsSystem';
import type { SimContext } from './SimContext';
import { isFullyLoaded } from './weaponStats';

/**
 * Weapon cases (spec 04 §3): fixed furniture that sells a basic weapon. Only
 * from its front, within WEAPON_CASES.interactRange, and in an unlocked
 * zone. Not carried: the weapon (into a free slot, or in place of the one in
 * hand, asking first if that one is upgraded). Carried: its ammo, at
 * caseAmmoPriceFactor of the price. Cases never run out.
 */

const FRONT: Record<MapWeaponCase['facing'], { x: number; y: number }> = {
  south: { x: 0, y: 1 },
  east: { x: 1, y: 0 },
  west: { x: -1, y: 0 },
};

/** Middle of the case's front edge (world px). */
export function caseFront(c: MapWeaponCase, tileSize: number): { x: number; y: number } {
  const n = FRONT[c.facing];
  return { x: c.x + (n.x * tileSize) / 2, y: c.y + (n.y * tileSize) / 2 };
}

/** The player stands in front of the case (not beside or behind it), close enough to use it. */
export function inFrontOf(c: MapWeaponCase, tileSize: number, x: number, y: number): boolean {
  const n = FRONT[c.facing];
  const f = caseFront(c, tileSize);
  const dx = x - f.x;
  const dy = y - f.y;
  // On the front side of the case's face, and within reach of its middle.
  return dx * n.x + dy * n.y >= 0 && dx * dx + dy * dy <= WEAPON_CASES.interactRange ** 2;
}

/** The weapon case `p` can use now (nearest front in reach, in an unlocked zone), or -1. */
export function caseInReach(map: MapData, state: GameState, p: PlayerState): number {
  let best = -1;
  let bestSq = Infinity;
  map.weaponCases.forEach((c, i) => {
    if (!state.zonesUnlocked[c.zoneIndex] || !inFrontOf(c, map.tileSize, p.x, p.y)) return;
    const f = caseFront(c, map.tileSize);
    const d = (f.x - p.x) ** 2 + (f.y - p.y) ** 2;
    if (d < bestSq) {
      bestSq = d;
      best = i;
    }
  });
  return best;
}

/**
 * What the case offers this player and what the action button says:
 *   buy      the weapon, for `price`
 *   ammo     its ammo (the weapon is carried), for `price`; `full` when there is nothing to buy
 *   confirm  the weapon, waiting for the second tap: it replaces `replaces`, upgraded
 * `enabled` when the tap would buy; otherwise `missing` money (or the ammo is full).
 */
export interface CaseOffer {
  mode: 'buy' | 'ammo' | 'confirm';
  weapon: WeaponId;
  price: number;
  enabled: boolean;
  missing: number;
  full: boolean;
  replaces: WeaponSlotState | null;
}

export function ammoPrice(c: MapWeaponCase): number {
  return Math.round(c.cost * WEAPON_CASES.caseAmmoPriceFactor);
}

export function caseOffer(map: MapData, p: PlayerState, caseIndex: number): CaseOffer | null {
  const c = map.weaponCases[caseIndex];
  if (!c) return null;
  const owned = p.weapons[findWeapon(p, c.weapon)];
  if (owned) {
    const price = ammoPrice(c);
    const full = isFullyLoaded(owned);
    return { mode: 'ammo', weapon: c.weapon, price, enabled: !full && p.money >= price, missing: Math.max(0, price - p.money), full, replaces: null };
  }
  const confirming = p.swapConfirmCase === caseIndex && needsSwapConfirm(p, c.weapon);
  return {
    mode: confirming ? 'confirm' : 'buy',
    weapon: c.weapon,
    price: c.cost,
    enabled: p.money >= c.cost,
    missing: Math.max(0, c.cost - p.money),
    full: false,
    replaces: weaponReplacedBy(p, c.weapon),
  };
}

/**
 * A tap on the action button at case `caseIndex`. Buying a weapon that
 * would throw away an upgraded one first asks (the button shows "CAMBIAR …
 * POR …"); the second tap within WEAPON_CASES.swapConfirmTime buys it.
 * True when something was bought.
 */
export function tapCase(ctx: SimContext, p: PlayerState, caseIndex: number): boolean {
  const c = ctx.map.weaponCases[caseIndex];
  const offer = caseOffer(ctx.map, p, caseIndex);
  if (!c || !offer) return false;
  if (!offer.enabled) {
    ctx.events.emit('action:denied', { playerId: p.id });
    return false;
  }
  if (offer.mode === 'buy' && needsSwapConfirm(p, c.weapon)) {
    p.swapConfirmCase = caseIndex;
    p.swapConfirmTimer = WEAPON_CASES.swapConfirmTime;
    return false;
  }
  if (!spendMoney(p, offer.price)) return false;
  if (offer.mode === 'ammo') {
    const slot = p.weapons[findWeapon(p, c.weapon)];
    if (slot) refillWeapon(slot);
    // Nothing left to reload.
    if (p.weapons[p.activeSlot] === slot) p.reloadTimer = 0;
  } else {
    giveWeapon(p, c.weapon);
  }
  p.swapConfirmCase = -1;
  p.swapConfirmTimer = 0;
  ctx.events.emit('money:spent', { playerId: p.id, amount: offer.price, source: 'case' });
  ctx.events.emit('weaponCase:purchase', { playerId: p.id, weapon: c.weapon, ammo: offer.mode === 'ammo' });
  return true;
}

/** The confirmation lapses with time or when the player is no longer at that case. */
export function updateSwapConfirm(p: PlayerState, caseIndex: number, dt: number): void {
  if (p.swapConfirmCase < 0) return;
  p.swapConfirmTimer -= dt;
  if (p.swapConfirmCase !== caseIndex || p.swapConfirmTimer <= 0) {
    p.swapConfirmCase = -1;
    p.swapConfirmTimer = 0;
  }
}
