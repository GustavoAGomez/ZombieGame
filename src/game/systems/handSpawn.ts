import { HAND } from '../../config/balance';
import { WEAPON_IDS, WEAPONS, type WeaponId } from '../../config/weapons';
import type { HandState } from '../../core/GameState';
import { random, type RngState } from '../../core/Rng';
import type { MapData } from '../map/MapLoader';

/**
 * Where the Demon's Hand starts and what it draws (spec 06 §3.2, §3.5).
 * Pure, with the match's RNG: the same seed gives the same hand. Kept apart
 * from HandSystem so GameState can create the hand without pulling in the
 * systems.
 */

/** A hand at no spot, waiting: the state before the match places it. */
export function emptyHand(): HandState {
  return { spot: -1, phase: 'idle', timer: 0, phaseTick: 0, usesLeft: 0, offer: null, taken: false, lastOffered: null, payer: -1, paid: null, mock: false, debugFree: false };
}

/**
 * Zones where the hand can start: the interior ones bought straight from a
 * starting zone, by a door or a main staircase (in the mansion, the living
 * and the dining room; the street is bought from the hall too, but it is
 * outside: docs/DECISIONS.md). Without interior ones, any of those; without
 * any, every zone but the starting ones.
 */
export function startingHandZones(map: MapData): number[] {
  const start = (z: number): boolean => map.zones[z]?.startsUnlocked === true;
  const next = new Set<number>();
  for (const d of map.doors) {
    if (start(d.fromZoneIndex) && !start(d.toZoneIndex)) next.add(d.toZoneIndex);
    if (start(d.toZoneIndex) && !start(d.fromZoneIndex)) next.add(d.fromZoneIndex);
  }
  for (const p of map.portals) {
    const other = map.portals[p.other];
    if (!other || p.secondary) continue;
    if (start(p.zoneIndex) && !start(other.zoneIndex)) next.add(other.zoneIndex);
  }
  const withSpot = [...next].filter((z) => map.handSpots.some((s) => s.zoneIndex === z));
  const interior = withSpot.filter((z) => map.zones[z]?.interior);
  if (interior.length > 0) return interior.sort((a, b) => a - b);
  if (withSpot.length > 0) return withSpot.sort((a, b) => a - b);
  return map.zones.flatMap((z, i) => (!z.startsUnlocked && map.handSpots.some((s) => s.zoneIndex === i) ? [i] : []));
}

/**
 * The spot the tired hand moves to (spec 06 §3.6): one of a zone other
 * than its current one and the starting ones, unlocked or not, drawn with
 * the match's RNG; -1 when there is none.
 */
export function nextHandSpot(rng: RngState, map: MapData, current: number): number {
  const here = map.handSpots[current]?.zoneIndex ?? -1;
  const candidates = map.handSpots.flatMap((s, i) => (s.zoneIndex !== here && !map.zones[s.zoneIndex]?.startsUnlocked ? [i] : []));
  if (candidates.length === 0) return -1;
  return candidates[Math.floor(random(rng) * candidates.length)] ?? -1;
}

/** Uses the hand takes in a new spot: from usesMin to usesMax, all as likely. */
export function drawUses(rng: RngState): number {
  return HAND.usesMin + Math.floor(random(rng) * (HAND.usesMax - HAND.usesMin + 1));
}

/** The hand as the match starts: in the spot of a zone drawn among startingHandZones, with its uses drawn. */
export function createHandState(rng: RngState, map: MapData): HandState {
  const hand = emptyHand();
  const zones = startingHandZones(map);
  if (zones.length === 0) return hand;
  const zone = zones[Math.floor(random(rng) * zones.length)] ?? zones[0];
  hand.spot = map.handSpots.findIndex((s) => s.zoneIndex === zone);
  hand.usesLeft = drawUses(rng);
  return hand;
}

/**
 * What a payment draws (spec 06 §3.5 and the user's answers): nothing,
 * a special weapon or a basic one with HAND.chances, never a weapon in
 * `carried`. A group with none left gives its share to the other; within a
 * group all are as likely, leaving out `last` (the previous offer) while
 * there is another. Null: nothing.
 */
export function drawHandOffer(rng: RngState, carried: readonly WeaponId[], last: WeaponId | null): WeaponId | null {
  const left = (category: 'special' | 'basic'): WeaponId[] => WEAPON_IDS.filter((id) => WEAPONS[id].category === category && !carried.includes(id));
  const specials = left('special');
  const basics = left('basic');
  const { nothing, special, basic } = HAND.chances;
  const wSpecial = specials.length > 0 ? special + (basics.length > 0 ? 0 : basic) : 0;
  const wBasic = basics.length > 0 ? basic + (specials.length > 0 ? 0 : special) : 0;
  const roll = random(rng) * (nothing + wSpecial + wBasic);
  if (roll < nothing) return null;
  const group = roll < nothing + wSpecial ? specials : basics;
  const pool = group.length > 1 ? group.filter((id) => id !== last) : group;
  return pool[Math.floor(random(rng) * pool.length)] ?? null;
}
