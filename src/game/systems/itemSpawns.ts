import { ITEM_IDS, itemDef } from '../../config/items';
import type { GroundItemState } from '../../core/GameState';
import { random, type RngState } from '../../core/Rng';
import type { MapData } from '../map/MapLoader';

/**
 * Where the special items lie when a match starts (spec 05 §2). Pure, with
 * the match's RNG: the same seed puts them in the same spots.
 */

/** Zone index of the player's spawn. */
function startZone(map: MapData): number {
  const tx = Math.floor(map.playerSpawn.x / map.tileSize);
  const ty = Math.floor(map.playerSpawn.y / map.tileSize);
  return map.cellZone[ty * map.width + tx] ?? -1;
}

/**
 * An item spot drawn among the map's, leaving out the start zone when asked
 * and spots already `taken`; -1 when none is left (no random number is used
 * then).
 */
export function pickItemSpot(map: MapData, rng: RngState, excludeStartZone: boolean, taken: ReadonlySet<number> = new Set()): number {
  const start = startZone(map);
  const candidates = map.itemSpots.flatMap((s, i) => ((excludeStartZone && s.zoneIndex === start) || taken.has(i) ? [] : [i]));
  if (candidates.length === 0) return -1;
  return candidates[Math.floor(random(rng) * candidates.length)] ?? -1;
}

/** The items that lie on the map from the start of the match, each in a spot of its own. */
export function placeMatchItems(rng: RngState, map: MapData): GroundItemState[] {
  const placed: GroundItemState[] = [];
  const taken = new Set<number>();
  for (const id of ITEM_IDS) {
    const rule = itemDef(id).spawn;
    if (rule?.when !== 'match_start') continue;
    const spot = pickItemSpot(map, rng, rule.excludeStartZone, taken);
    const s = map.itemSpots[spot];
    if (!s) continue;
    taken.add(spot);
    placed.push({ item: id, active: true, x: s.x, y: s.y, spot });
  }
  return placed;
}
