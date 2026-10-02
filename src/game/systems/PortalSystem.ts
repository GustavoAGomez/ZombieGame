import { PORTALS } from '../../config/balance';
import type { GameState, PlayerState, ZombieState } from '../../core/GameState';
import { UNREACHABLE, distanceAt } from '../map/FlowField';
import type { MapData, MapPortal } from '../map/MapLoader';
import { isZombieAlive } from './Combat';
import { isPlayerAlive } from './HealthSystem';
import { spendMoney } from './PointsSystem';
import type { SimContext } from './SimContext';
import { unlockZone, zoneToUnlock } from './ZoneSystem';

/**
 * Portals between islands (spec 02 §3.6): stairs, ladders and a hatch that
 * are bought like doors and then carry players and zombies to the other end.
 *
 * - Buying one end opens both ends and unlocks both zones.
 * - A second entrance (`secondary`) can only be bought once both of its
 *   zones are already unlocked, so it is never the cheap way into an island.
 * - Stepping on an open end moves you to the centre of the other end. That
 *   end stays locked for you until you step off it, so you never bounce back.
 * - A chasing zombie on an open end goes through only when the other end
 *   is closer to the player on the flow field (which links both ends).
 */

export interface PortalQuery {
  portal: number;
  distSq: number;
}

const query: PortalQuery = { portal: -1, distSq: 0 };

export function isPortalOpen(ctx: SimContext, index: number): boolean {
  const portal = ctx.map.portals[index];
  return portal !== undefined && ctx.state.portalsOpen[portal.link] === true;
}

/**
 * A main staircase sells the locked room at its other end. A secondary one
 * is never bought: it opens by itself once both its rooms are unlocked
 * (ZoneSystem), and until then it is locked.
 */
export function isPortalBuyable(map: MapData, state: GameState, index: number): boolean {
  return portalTarget(map, state, index) >= 0;
}

/** The room closed main portal `index` would unlock (the locked end), or -1 (secondary, open, or nothing to unlock). */
export function portalTarget(map: MapData, state: GameState, index: number): number {
  const portal = map.portals[index];
  const other = portal ? map.portals[portal.other] : undefined;
  if (!portal || !other || portal.secondary || state.portalsOpen[portal.link]) return -1;
  return zoneToUnlock(state, portal.zoneIndex, other.zoneIndex);
}

/**
 * Nearest closed portal end within PORTALS.interactRange of its centre
 * (portal -1 when none). Returns a shared object: read it before the next call.
 */
export function nearestClosedPortal(ctx: SimContext, p: PlayerState): Readonly<PortalQuery> {
  const { map } = ctx;
  let portal = -1;
  let distSq = PORTALS.interactRange * PORTALS.interactRange;
  for (let i = 0; i < map.portals.length; i++) {
    const end = map.portals[i];
    if (!end || isPortalOpen(ctx, i)) continue;
    const dSq = (end.center.x - p.x) ** 2 + (end.center.y - p.y) ** 2;
    if (dSq <= distSq) {
      portal = i;
      distSq = dSq;
    }
  }
  query.portal = portal;
  query.distSq = distSq;
  return query;
}

/** Tries to buy portal end `index` for player `p`. Returns true if it opened. */
export function tryBuyPortal(ctx: SimContext, p: PlayerState, index: number): boolean {
  const portal = ctx.map.portals[index];
  const target = portalTarget(ctx.map, ctx.state, index);
  const room = ctx.map.zones[target];
  if (!portal || !room || !spendMoney(p, room.cost)) return false;
  unlockZone(ctx, target);
  ctx.events.emit('portal:opened', { portalId: portal.id, playerId: p.id });
  return true;
}

/** Opens portal `index` for free (tests, debug): both its rooms unlock, with every access between open rooms. */
export function openPortal(ctx: SimContext, index: number): void {
  const { map, state } = ctx;
  const portal = map.portals[index];
  const other = portal ? map.portals[portal.other] : undefined;
  if (!portal || !other) return;
  state.zonesUnlocked[portal.zoneIndex] = true;
  unlockZone(ctx, other.zoneIndex);
}

/** Portal end under world point (x, y), or -1. */
export function portalAt(ctx: SimContext, x: number, y: number): number {
  const { map } = ctx;
  const tx = Math.floor(x / map.tileSize);
  const ty = Math.floor(y / map.tileSize);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return -1;
  return map.cellPortal[ty * map.width + tx] ?? -1;
}

interface Traveller {
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  portalLock: number;
}

/** Releases the lock once off that end; returns the open end to travel through, or undefined. */
function portalToUse(ctx: SimContext, t: Traveller): MapPortal | undefined {
  const here = portalAt(ctx, t.x, t.y);
  if (t.portalLock >= 0 && here !== t.portalLock) t.portalLock = -1;
  if (here < 0 || here === t.portalLock || !isPortalOpen(ctx, here)) return undefined;
  return ctx.map.portals[here];
}

function travel(t: Traveller, portal: MapPortal): void {
  // No interpolation across the jump: prev = new position.
  t.x = t.prevX = portal.arrival.x;
  t.y = t.prevY = portal.arrival.y;
  t.portalLock = portal.other;
}

/** Runs right after movement. */
export function updatePlayerPortals(ctx: SimContext): void {
  for (const p of ctx.state.players) {
    if (!isPlayerAlive(p)) continue;
    const portal = portalToUse(ctx, p);
    if (!portal) continue;
    travel(p, portal);
    p.teleports++;
  }
}

/** Runs right after the zombies move. */
export function updateZombiePortals(ctx: SimContext): void {
  const { map } = ctx;
  for (const z of ctx.state.zombies) {
    if (!isZombieAlive(z) || z.ai !== 'chasing') continue;
    const portal = portalToUse(ctx, z);
    if (!portal) continue;
    const other = map.portals[portal.other];
    if (!other || !otherEndIsCloser(ctx, z, other)) continue;
    travel(z, portal);
  }
}

/** Compares with the nearest tile of the other end: the flow field links the ends through it. */
function otherEndIsCloser(ctx: SimContext, z: ZombieState, other: MapPortal): boolean {
  const here = distanceAt(ctx.nav, z.x, z.y);
  if (here === UNREACHABLE) return false;
  const ts = ctx.map.tileSize;
  for (const t of other.tiles) {
    const there = distanceAt(ctx.nav, (t.x + 0.5) * ts, (t.y + 0.5) * ts);
    if (there !== UNREACHABLE && there < here) return true;
  }
  return false;
}
