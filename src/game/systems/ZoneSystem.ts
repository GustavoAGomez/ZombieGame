import type { GameState } from '../../core/GameState';
import { setDoorBlocking } from '../map/CollisionGrid';
import type { MapData } from '../map/MapLoader';
import type { SimContext } from './SimContext';

/**
 * Rooms are unlocked, not doors: a door or a main staircase sells the locked
 * room on its other side, at that room's price (MapZone.cost, the same from
 * any side). Once a room is unlocked, every door and portal between it and
 * another unlocked room is open: one can walk into it from anywhere already
 * open. Doors and portals that lead to rooms still locked stay closed (they
 * are how those rooms are bought), so unlocking one room never opens the
 * next ones in a chain.
 */

/** The zone an access between zones `a` and `b` would unlock: its locked side when exactly one is locked, else -1. */
export function zoneToUnlock(state: GameState, a: number, b: number): number {
  const ua = state.zonesUnlocked[a] === true;
  const ub = state.zonesUnlocked[b] === true;
  if (ua === ub) return -1;
  return ua ? b : a;
}

/** Unlocks zone `index` (its zombie spawns come alive) and opens the accesses that now join two unlocked zones. */
export function unlockZone(ctx: SimContext, index: number): void {
  if (index < 0 || index >= ctx.state.zonesUnlocked.length) return;
  ctx.state.zonesUnlocked[index] = true;
  openUnlockedAccesses(ctx);
}

/** Opens every closed door and portal whose two zones are unlocked. Zombies learn the new ways at once. */
export function openUnlockedAccesses(ctx: SimContext): void {
  const { map, state, grid, nav } = ctx;
  let opened = false;
  map.doors.forEach((door, i) => {
    if (state.doorsOpen[i] || !bothUnlocked(state, door.fromZoneIndex, door.toZoneIndex)) return;
    state.doorsOpen[i] = true;
    setDoorBlocking(grid, door, false);
    opened = true;
  });
  for (const portal of map.portals) {
    const other = map.portals[portal.other];
    if (!other || state.portalsOpen[portal.link] || !bothUnlocked(state, portal.zoneIndex, other.zoneIndex)) continue;
    state.portalsOpen[portal.link] = true;
    opened = true;
  }
  if (opened) nav.age = Infinity;
}

/** At the start of a match: the accesses between the zones it starts with, open (doors, then portal pairs). */
export function initialAccesses(map: MapData): { doors: boolean[]; portals: boolean[] } {
  const unlocked = map.zones.map((z) => z.startsUnlocked);
  const open = (a: number, b: number): boolean => unlocked[a] === true && unlocked[b] === true;
  const portals = Array.from({ length: map.portalLinks }, () => false);
  for (const portal of map.portals) {
    const other = map.portals[portal.other];
    if (other && open(portal.zoneIndex, other.zoneIndex)) portals[portal.link] = true;
  }
  return { doors: map.doors.map((d) => open(d.fromZoneIndex, d.toZoneIndex)), portals };
}

function bothUnlocked(state: GameState, a: number, b: number): boolean {
  return state.zonesUnlocked[a] === true && state.zonesUnlocked[b] === true;
}
