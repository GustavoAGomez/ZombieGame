import { MERCHANT, PLAYER } from '../../config/balance';
import { merchantDef } from '../../config/merchants';
import type { GameState, PlayerState } from '../../core/GameState';
import { random } from '../../core/Rng';
import { BLOCK_PLAYER, cellBlocks, resolveCircle } from '../map/CollisionGrid';
import type { MapData } from '../map/MapLoader';
import { drawRoundBoost } from './BoostSystem';
import type { SimContext } from './SimContext';

/**
 * Merchants (spec 03 §2). Each one appears at the start of its first round
 * on a merchant spot of the player's starting zone, and at the start of
 * every later round teleports to a spot in another unlocked zone. They are
 * invulnerable and solid for players only: zombies and bullets ignore them.
 */
export function updateMerchants(ctx: SimContext): void {
  const { state, map } = ctx;
  const { wave } = state;
  if (wave.phase === 'over') return;
  for (let i = 0; i < state.merchants.length; i++) {
    const m = state.merchants[i];
    if (!m?.enabled || m.round === wave.round || wave.round < merchantDef(m.id).firstRound) continue;
    m.round = wave.round;
    const spot = pickMerchantSpot(map, state, i);
    const target = map.merchantSpots[spot];
    // No spots on this map, or nowhere else to go: it stays.
    if (!target || (m.active && spot === m.spot)) continue;
    const first = !m.active;
    m.fromSpot = first ? -1 : m.spot;
    m.spot = spot;
    m.active = true;
    m.x = target.x;
    m.y = target.y;
    m.moveTick = state.tick;
    // A new visit: the purchase limit starts again and the round's boost is drawn.
    m.visitPurchases.fill(0);
    m.boost = drawRoundBoost(state);
    ctx.events.emit('merchant:moved', { merchant: m.id, first });
  }
}

/** Zone index of the player's spawn: where merchants first appear. */
export function startingZone(map: MapData): number {
  const tx = Math.floor(map.playerSpawn.x / map.tileSize);
  const ty = Math.floor(map.playerSpawn.y / map.tileSize);
  return map.cellZone[ty * map.width + tx] ?? -1;
}

/**
 * The spot merchant `index` goes to now (an index into map.merchantSpots),
 * its current spot when it has nowhere else to go, or -1 when the map has
 * no spot for it. In order of preference:
 *   - the first time, a spot in the player's starting zone;
 *   - a spot in another unlocked zone where no other merchant is;
 *   - another spot in its own zone (two merchants never share a zone if there is an alternative);
 *   - a spot in another unlocked zone, even with another merchant there;
 *   - where it is.
 * Spots taken by other merchants are never chosen. Ties are broken with the match's seeded RNG.
 */
export function pickMerchantSpot(map: MapData, state: GameState, index: number): number {
  const m = state.merchants[index];
  if (!m) return -1;
  const zoneOf = (spot: number): number => map.merchantSpots[spot]?.zoneIndex ?? -1;
  const others = state.merchants.filter((o, j) => j !== index && o.active);
  const takenSpots = new Set(others.map((o) => o.spot));
  const takenZones = new Set(others.map((o) => zoneOf(o.spot)));
  const freeSpots = (zone: number): number[] => (map.zoneMerchantSpots[zone] ?? []).filter((s) => !takenSpots.has(s));
  const pick = (candidates: readonly number[]): number => candidates[Math.floor(random(state) * candidates.length)] ?? -1;

  if (!m.active) {
    const start = freeSpots(startingZone(map));
    if (start.length > 0) return pick(start);
  }
  const current = m.active ? zoneOf(m.spot) : -1;
  const otherZones = map.zones.flatMap((_, z) => (z !== current && state.zonesUnlocked[z] ? [z] : []));
  const preferences = [
    otherZones.filter((z) => !takenZones.has(z)).flatMap(freeSpots),
    current >= 0 ? freeSpots(current).filter((s) => s !== m.spot) : [],
    otherZones.flatMap(freeSpots),
  ];
  for (const candidates of preferences) if (candidates.length > 0) return pick(candidates);
  return m.active ? m.spot : -1;
}

/**
 * Merchants are solid for players (spec 03 §2): a circle of MERCHANT.radius
 * pushes them out, even while dashing or when a merchant appears on them.
 */
export function blockPlayersByMerchants(ctx: SimContext): void {
  for (const p of ctx.state.players) if (p.hp > 0) blockByMerchants(ctx, p);
}

function blockByMerchants(ctx: SimContext, p: PlayerState): void {
  const minDist = PLAYER.hitboxRadius + MERCHANT.radius;
  let pushed = false;
  for (const m of ctx.state.merchants) {
    if (!m.active) continue;
    let dx = p.x - m.x;
    let dy = p.y - m.y;
    let distSq = dx * dx + dy * dy;
    if (distSq >= minDist * minDist) continue;
    if (distSq < 1e-9) {
      // Right on top of it (it appeared there): step out to the first open side.
      [dx, dy] = openSide(ctx, m.x, m.y);
      distSq = 1;
    }
    const dist = Math.sqrt(distSq);
    p.x = m.x + (dx / dist) * minDist;
    p.y = m.y + (dy / dist) * minDist;
    pushed = true;
  }
  if (pushed) resolveCircle(ctx.grid, p, PLAYER.hitboxRadius, BLOCK_PLAYER);
}

const SIDES = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

/** A direction from (x, y) whose neighbouring cell players can stand on (spots are against walls). */
function openSide(ctx: SimContext, x: number, y: number): readonly [number, number] {
  const tx = Math.floor(x / ctx.map.tileSize);
  const ty = Math.floor(y / ctx.map.tileSize);
  return SIDES.find(([dx, dy]) => !cellBlocks(ctx.grid, tx + dx, ty + dy, BLOCK_PLAYER)) ?? SIDES[0];
}
