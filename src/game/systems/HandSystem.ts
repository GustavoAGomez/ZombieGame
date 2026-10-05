import { HAND, WEAPON_CASES } from '../../config/balance';
import { WEAPONS, type WeaponId } from '../../config/weapons';
import type { GameState, HandPhase, PlayerState, WeaponSlotState } from '../../core/GameState';
import type { MapData } from '../map/MapLoader';
import { drawHandOffer, drawUses, nextHandSpot } from './handSpawn';
import { findWeapon, giveWeapon, needsSwapConfirm, refillWeapon, weaponReplacedBy } from './InventorySystem';
import { spendMoney } from './PointsSystem';
import type { SimContext } from './SimContext';

/**
 * The Demon's Hand (spec 06 §3): a crack in the floor of one zone where,
 * within HAND.interactRange, the action button offers a weapon drawn at
 * random, for HAND.price or, short of money, for half the player's maximum
 * health (the blood pact never kills: it needs more health than that; and
 * each player makes it once per spot).
 *
 * The draw happens at the payment, with the match's RNG; then the hand
 * rises with its fist closed, weapon outlines roll over it, and it opens
 * with the weapon floating over it for offeringTime s, or empty when the
 * draw gave nothing (the payment is lost). Only the one who paid can take
 * it: into a free slot, or in place of the weapon in hand (asking first if
 * that one is upgraded, like a weapon case), full of ammo. Not taken in
 * time, it sinks with the weapon. While a sequence is under way it takes no
 * other payment. The game goes on all along.
 *
 * It tires (spec 06 §3.6): in each spot it takes usesLeft payments (4 to 8);
 * the next one gets the mocking gesture instead of a draw, the payment
 * back, and the hand sinks; moveDelay s later it comes up in the spot of
 * another zone, with its uses drawn again.
 */

/** What the action button offers a player at the hand, and what a tap does. */
export interface HandOffer {
  /**
   *   pay      pay HAND.price (`amount`)
   *   blood    the blood pact: bloodCost(p) health (`amount`)
   *   short    neither: `amount` money missing (the button is dimmed and shakes)
   *   take     take the weapon on offer
   *   confirm  take it, waiting for the second tap: it replaces `replaces`, upgraded
   */
  mode: 'pay' | 'blood' | 'short' | 'take' | 'confirm';
  amount: number;
  enabled: boolean;
  weapon: WeaponId | null;
  replaces: WeaponSlotState | null;
}

/** Health the blood pact takes from `p`: a share of their maximum health. */
export function bloodCost(p: PlayerState): number {
  return Math.round(p.maxHp * HAND.bloodShare);
}

/** The player is within reach of the hand's crack, in an unlocked zone. */
export function handInReach(map: MapData, state: GameState, p: PlayerState): boolean {
  const spot = map.handSpots[state.hand.spot];
  if (!spot || !state.zonesUnlocked[spot.zoneIndex]) return false;
  return (spot.x - p.x) ** 2 + (spot.y - p.y) ** 2 <= HAND.interactRange ** 2;
}

/** What the hand offers `p` now, or null (out of reach, or busy with a sequence that is not theirs to take). */
export function handOffer(map: MapData, state: GameState, p: PlayerState): HandOffer | null {
  if (!handInReach(map, state, p)) return null;
  const hand = state.hand;
  if (hand.phase === 'idle') {
    if (p.money >= HAND.price) return { mode: 'pay', amount: HAND.price, enabled: true, weapon: null, replaces: null };
    const blood = bloodCost(p);
    // Once per spot: healing up does not buy another weapon until the hand moves.
    if (p.hp > blood && !hand.bloodPacts.includes(p.id)) return { mode: 'blood', amount: blood, enabled: true, weapon: null, replaces: null };
    return { mode: 'short', amount: HAND.price - p.money, enabled: false, weapon: null, replaces: null };
  }
  if (hand.phase === 'offering' && !hand.taken && hand.offer && hand.payer === p.id) {
    const confirming = p.handConfirmTimer > 0 && needsSwapConfirm(p, hand.offer);
    return { mode: confirming ? 'confirm' : 'take', amount: 0, enabled: true, weapon: hand.offer, replaces: weaponReplacedBy(p, hand.offer) };
  }
  return null;
}

/** A tap on the action button at the hand: pay (money or blood) or take the weapon on offer. */
export function tapHand(ctx: SimContext, p: PlayerState): void {
  const offer = handOffer(ctx.map, ctx.state, p);
  if (!offer) return;
  if (!offer.enabled) {
    ctx.events.emit('action:denied', { playerId: p.id });
    return;
  }
  if (offer.mode === 'pay' || offer.mode === 'blood') pay(ctx, p, offer.mode === 'blood');
  else takeOffer(ctx, p);
}

function pay(ctx: SimContext, p: PlayerState, blood: boolean): void {
  const { state } = ctx;
  const hand = state.hand;
  if (hand.debugFree) {
    hand.paid = null;
  } else if (blood) {
    p.hp -= bloodCost(p);
    hand.paid = 'blood';
    hand.bloodPacts.push(p.id);
    // Like a hit (the red frame and the player's blood), but from nowhere: no push.
    ctx.events.emit('player:damaged', { playerId: p.id, hp: p.hp, maxHp: p.maxHp, x: p.x, y: p.y, fromX: p.x, fromY: p.y });
  } else {
    if (!spendMoney(p, HAND.price)) return;
    hand.paid = 'money';
    ctx.events.emit('money:spent', { playerId: p.id, amount: HAND.price });
  }
  hand.payer = p.id;
  hand.taken = false;
  // Tired: no draw, the mocking gesture (the payment comes back).
  hand.mock = hand.usesLeft <= 0;
  if (hand.mock) {
    hand.offer = null;
  } else {
    hand.usesLeft--;
    hand.offer = drawHandOffer(state, p.weapons.map((w) => w.id), hand.lastOffered);
    if (hand.offer) hand.lastOffered = hand.offer;
  }
  setPhase(state, 'rising', HAND.risingTime);
  ctx.events.emit('hand:paid', { playerId: p.id, blood });
}

function takeOffer(ctx: SimContext, p: PlayerState): void {
  const hand = ctx.state.hand;
  const weapon = hand.offer;
  if (!weapon) return;
  // Throwing away an upgraded weapon asks first, like a weapon case.
  if (needsSwapConfirm(p, weapon) && p.handConfirmTimer <= 0) {
    p.handConfirmTimer = WEAPON_CASES.swapConfirmTime;
    return;
  }
  giveWeapon(p, weapon);
  const slot = p.weapons[findWeapon(p, weapon)];
  if (slot) refillWeapon(slot);
  p.handConfirmTimer = 0;
  hand.taken = true;
  setPhase(ctx.state, 'sinking', HAND.sinkingTime);
  ctx.events.emit('hand:taken', { playerId: p.id, weapon });
}

function setPhase(state: GameState, phase: HandPhase, time: number): void {
  const hand = state.hand;
  hand.phase = phase;
  hand.timer = time;
  hand.phaseTick = state.tick;
}

/** Runs the hand's sequence (after the interactions) and the players' pending confirmations. */
export function updateHand(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  // A confirmation lapses with time, or as soon as the player is no longer at the hand.
  for (const p of state.players) {
    if (p.handConfirmTimer > 0) p.handConfirmTimer = p.contextAction === 'hand' ? Math.max(0, p.handConfirmTimer - dt) : 0;
  }
  const hand = state.hand;
  if (hand.phase === 'idle') return;
  hand.timer -= dt;
  if (hand.timer > 0) return;
  switch (hand.phase) {
    case 'rising':
      if (hand.mock) {
        setPhase(state, 'mocking', HAND.mockTime);
      } else {
        setPhase(state, 'rolling', HAND.rollingTime);
        ctx.events.emit('hand:rolling', { playerId: hand.payer });
      }
      break;
    case 'mocking':
      refund(ctx);
      setPhase(state, 'sinking', HAND.sinkingTime);
      break;
    case 'rolling':
      if (hand.offer) {
        setPhase(state, 'offering', HAND.offeringTime);
        ctx.events.emit('hand:offer', { weapon: hand.offer, special: WEAPONS[hand.offer].category === 'special' });
      } else {
        setPhase(state, 'empty', HAND.emptyTime);
      }
      break;
    case 'offering':
    case 'empty':
      setPhase(state, 'sinking', HAND.sinkingTime);
      break;
    case 'sinking':
      if (hand.mock) setPhase(state, 'away', HAND.moveDelay);
      else setPhase(state, 'idle', 0);
      hand.payer = -1;
      hand.paid = null;
      hand.offer = null;
      hand.taken = false;
      break;
    case 'away':
      moveHand(ctx);
      break;
  }
}

/** The tired hand gives the payment back to the one who paid: the money, or the health of the blood pact. */
function refund(ctx: SimContext): void {
  const hand = ctx.state.hand;
  const p = ctx.state.players.find((q) => q.id === hand.payer);
  if (!p || !hand.paid) return;
  if (hand.paid === 'money') p.money += HAND.price;
  else p.hp = Math.min(p.maxHp, p.hp + bloodCost(p));
  ctx.events.emit('hand:refunded', { playerId: p.id, blood: hand.paid === 'blood', amount: hand.paid === 'money' ? HAND.price : bloodCost(p) });
}

/**
 * The hand comes up in the spot of another zone (not its current one nor a
 * starting one), waiting, with its uses drawn again; announced to everyone.
 * Also the debug's MOVER MANO, at any moment.
 */
export function moveHand(ctx: SimContext): void {
  const { state, map } = ctx;
  const hand = state.hand;
  const spot = nextHandSpot(state, map, hand.spot);
  if (spot >= 0) hand.spot = spot;
  hand.usesLeft = drawUses(state);
  hand.mock = false;
  hand.bloodPacts.length = 0;
  hand.payer = -1;
  hand.paid = null;
  hand.offer = null;
  hand.taken = false;
  setPhase(state, 'idle', 0);
  ctx.events.emit('hand:moved', { zone: map.handSpots[hand.spot]?.zone ?? '' });
}
