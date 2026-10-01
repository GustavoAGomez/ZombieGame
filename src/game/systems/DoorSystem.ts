import { DOORS } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import { setDoorBlocking } from '../map/CollisionGrid';
import { spendMoney } from './PointsSystem';
import type { SimContext } from './SimContext';

/**
 * Doors (spec 01 §4.7). A closed door within 48 px offers the chip; a tap
 * buys it if the player can afford it. Buying opens it for good: its tiles
 * become walkable floor and the zones on both sides unlock, which also
 * turns on their zombie spawns.
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

/** Tries to buy door `index` for player `p`. Returns true if it opened. */
export function tryBuyDoor(ctx: SimContext, p: PlayerState, index: number): boolean {
  const door = ctx.map.doors[index];
  if (!door || ctx.state.doorsOpen[index]) return false;
  if (!spendMoney(p, door.cost)) return false;
  openDoor(ctx, index);
  ctx.events.emit('door:opened', { doorId: door.id, playerId: p.id });
  return true;
}

export function openDoor(ctx: SimContext, index: number): void {
  const { map, state, grid, nav } = ctx;
  const door = map.doors[index];
  if (!door) return;
  state.doorsOpen[index] = true;
  setDoorBlocking(grid, door, false);
  if (door.toZoneIndex >= 0) state.zonesUnlocked[door.toZoneIndex] = true;
  if (door.fromZoneIndex >= 0) state.zonesUnlocked[door.fromZoneIndex] = true;
  // Zombies must learn the new way in right away.
  nav.age = Infinity;
}
