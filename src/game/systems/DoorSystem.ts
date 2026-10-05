import { DOORS } from '../../config/balance';
import type { GameState, PlayerState } from '../../core/GameState';
import type { MapData } from '../map/MapLoader';
import { spendMoney } from './PointsSystem';
import type { SimContext } from './SimContext';
import { unlockZone, zoneToUnlock } from './ZoneSystem';

/**
 * Doors (spec 01 §4.7, then rooms instead of doors): a closed door within
 * 48 px offers the chip to unlock the room on its other side, at that
 * room's price. Unlocking it opens this door and every other one between
 * that room and the rooms already open (ZoneSystem), and turns on its
 * zombie spawns.
 */

export interface DoorQuery {
  door: number;
  distSq: number;
}

const query: DoorQuery = { door: -1, distSq: 0 };

/**
 * Nearest closed door within 48 px of its centre (door -1 when none) and its
 * squared distance. Returns a shared object: read it before the next call.
 */
export function nearestClosedDoor(ctx: SimContext, p: PlayerState): Readonly<DoorQuery> {
  const { map, state } = ctx;
  let door = -1;
  let distSq = DOORS.interactRange * DOORS.interactRange;
  for (let i = 0; i < map.doors.length; i++) {
    const d = map.doors[i];
    if (!d || state.doorsOpen[i]) continue;
    const dx = d.center.x - p.x;
    const dy = d.center.y - p.y;
    const dSq = dx * dx + dy * dy;
    if (dSq <= distSq) {
      door = i;
      distSq = dSq;
    }
  }
  query.door = door;
  query.distSq = distSq;
  return query;
}

/** The room closed door `index` would unlock (its locked side), or -1. */
export function doorTarget(map: MapData, state: GameState, index: number): number {
  const door = map.doors[index];
  if (!door || state.doorsOpen[index]) return -1;
  return zoneToUnlock(state, door.fromZoneIndex, door.toZoneIndex);
}

/** Tries to unlock the room behind door `index` for player `p`, at the room's price. Returns true if it did. */
export function tryBuyDoor(ctx: SimContext, p: PlayerState, index: number): boolean {
  const door = ctx.map.doors[index];
  const target = doorTarget(ctx.map, ctx.state, index);
  const room = ctx.map.zones[target];
  if (!door || !room || !spendMoney(p, room.cost)) return false;
  unlockZone(ctx, target);
  ctx.events.emit('door:opened', { doorId: door.id, playerId: p.id });
  return true;
}

/** Opens door `index` for free (tests, debug): both its rooms unlock, with every access between open rooms. */
export function openDoor(ctx: SimContext, index: number): void {
  const door = ctx.map.doors[index];
  if (!door) return;
  ctx.state.zonesUnlocked[door.fromZoneIndex] = true;
  unlockZone(ctx, door.toZoneIndex);
}
