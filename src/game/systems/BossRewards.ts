import { BOSS } from '../../config/balance';
import { ITEM_IDS, itemDef } from '../../config/items';
import type { GameState } from '../../core/GameState';
import { BLOCK_PLAYER } from '../map/CollisionGrid';
import { spawnPickup } from './PickupSystem';
import { awardPoints } from './PointsSystem';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';

/**
 * What a boss leaves when it dies (spec 07 §6): BOSS.rewardPoints points and
 * money to every player alive, a health and an ammo pickup where it falls,
 * and, the first time a boss dies in the match, the items that come from
 * it (items.ts: the living heart). Everything lands on walkable floor of an
 * unlocked room, the nearest to where it fell.
 */
export function bossRewards(ctx: SimContext, x: number, y: number): void {
  const { state } = ctx;
  state.bossKills++;
  for (const p of state.players) if (isPlayerAlive(p)) awardPoints(ctx, p.id, BOSS.rewardPoints, 'kill');
  const at = nearestWalkable(ctx, x, y) ?? { x, y };
  const left = nearestWalkable(ctx, at.x - BOSS.rewardSpread, at.y) ?? at;
  const right = nearestWalkable(ctx, at.x + BOSS.rewardSpread, at.y) ?? at;
  spawnPickup(ctx, 'health', left.x, left.y);
  spawnPickup(ctx, 'ammo', right.x, right.y);
  if (state.bossKills === 1) dropFirstBossItems(ctx, at.x, at.y);
}

/** The items that come from the first boss (spec 07 §7), unless one is in play already (items are unique). */
function dropFirstBossItems(ctx: SimContext, x: number, y: number): void {
  const { state } = ctx;
  for (const id of ITEM_IDS) {
    if (itemDef(id).spawn?.when !== 'first_boss_kill' || itemInPlay(state, id)) continue;
    state.groundItems.push({ item: id, active: true, x, y, spot: -1 });
    ctx.events.emit('item:dropped', { item: id, x, y });
  }
}

/** Some player carries it, it lies on the floor, or an activation has it. */
export function itemInPlay(state: GameState, id: (typeof ITEM_IDS)[number]): boolean {
  return (
    state.players.some((p) => p.items.includes(id)) ||
    state.groundItems.some((g) => g.item === id && g.active) ||
    state.activations.some((a) => a.received.includes(id))
  );
}

/**
 * The centre of the tile nearest to (x, y) a player can stand on in an
 * unlocked room (searching outwards, BOSS.dropSearchTiles at most); null
 * when there is none.
 */
export function nearestWalkable(ctx: SimContext, x: number, y: number): { x: number; y: number } | null {
  const { map, grid, state } = ctx;
  const ts = map.tileSize;
  const cx = Math.floor(x / ts);
  const cy = Math.floor(y / ts);
  const ok = (tx: number, ty: number): boolean => {
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
    const i = ty * map.width + tx;
    const zone = map.cellZone[i] ?? -1;
    return ((grid.cells[i] ?? 0) & BLOCK_PLAYER) === 0 && zone >= 0 && state.zonesUnlocked[zone] === true;
  };
  if (ok(cx, cy)) return { x, y };
  for (let r = 1; r <= BOSS.dropSearchTiles; r++) {
    let best: { x: number; y: number } | null = null;
    let bestSq = Infinity;
    for (let ty = cy - r; ty <= cy + r; ty++) {
      for (let tx = cx - r; tx <= cx + r; tx++) {
        if (Math.max(Math.abs(tx - cx), Math.abs(ty - cy)) !== r || !ok(tx, ty)) continue;
        const px = (tx + 0.5) * ts;
        const py = (ty + 0.5) * ts;
        const sq = (px - x) ** 2 + (py - y) ** 2;
        if (sq < bestSq) {
          bestSq = sq;
          best = { x: px, y: py };
        }
      }
    }
    if (best) return best;
  }
  return null;
}
