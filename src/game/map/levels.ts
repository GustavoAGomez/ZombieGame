import { TILE_VOID, type MapData } from './MapLoader';

/**
 * Levels: groups of zones joined by doors. Portals (stairs, ladders, the
 * hatch) lead to another level, so the ground floor, the basement and the
 * roof are separate levels. The camera never shows beyond the level the
 * player is on, so what lies around an island never gives the trick away.
 */
export interface MapLevel {
  /** Indices into MapData.zones. */
  zones: number[];
  /** Area worth showing, in world px: the zones plus their walls, without empty borders. */
  bounds: { x: number; y: number; width: number; height: number };
}

export interface MapLevels {
  levels: MapLevel[];
  /** Level index per zone. */
  zoneLevel: number[];
}

export function computeLevels(map: MapData): MapLevels {
  const parent = map.zones.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i] ?? i] ?? i;
    return i;
  };
  for (const door of map.doors) {
    if (door.fromZoneIndex >= 0 && door.toZoneIndex >= 0) parent[find(door.fromZoneIndex)] = find(door.toZoneIndex);
  }
  const roots: number[] = [];
  const zoneLevel = map.zones.map((_, i) => {
    const root = find(i);
    if (!roots.includes(root)) roots.push(root);
    return roots.indexOf(root);
  });
  const levels: MapLevel[] = roots.map((_, level) => {
    const zones = zoneLevel.flatMap((l, z) => (l === level ? [z] : []));
    return { zones, bounds: levelBounds(map, zones) };
  });
  return { levels, zoneLevel };
}

/** Bounding box of the zones, one tile wider for their walls, then trimmed of borders with nothing to show. */
function levelBounds(map: MapData, zones: readonly number[]): MapLevel['bounds'] {
  const ts = map.tileSize;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const zi of zones) {
    for (const r of map.zones[zi]?.rects ?? []) {
      x0 = Math.min(x0, Math.floor(r.x / ts));
      y0 = Math.min(y0, Math.floor(r.y / ts));
      x1 = Math.max(x1, Math.ceil((r.x + r.width) / ts) - 1);
      y1 = Math.max(y1, Math.ceil((r.y + r.height) / ts) - 1);
    }
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, width: map.widthPx, height: map.heightPx };
  x0 = Math.max(0, x0 - 1);
  y0 = Math.max(0, y0 - 1);
  x1 = Math.min(map.width - 1, x1 + 1);
  y1 = Math.min(map.height - 1, y1 + 1);
  const shows = (x: number, y: number): boolean => {
    const i = y * map.width + x;
    const floor = map.floor[i] ?? 0;
    const voidFloor = floor === 0 || ((map.gidFlags[floor] ?? 0) & TILE_VOID) !== 0;
    return !voidFloor || (map.walls[i] ?? 0) !== 0;
  };
  const columnShows = (x: number): boolean => {
    for (let y = y0; y <= y1; y++) if (shows(x, y)) return true;
    return false;
  };
  const rowShows = (y: number): boolean => {
    for (let x = x0; x <= x1; x++) if (shows(x, y)) return true;
    return false;
  };
  while (x0 < x1 && !columnShows(x0)) x0++;
  while (x1 > x0 && !columnShows(x1)) x1--;
  while (y0 < y1 && !rowShows(y0)) y0++;
  while (y1 > y0 && !rowShows(y1)) y1--;
  return { x: x0 * ts, y: y0 * ts, width: (x1 - x0 + 1) * ts, height: (y1 - y0 + 1) * ts };
}

/**
 * Camera bounds for a level: its area, widened (centred) on any axis where
 * the view is bigger than the level, so a small island sits in the middle of
 * the screen with void around it.
 */
export function cameraBounds(
  bounds: MapLevel['bounds'],
  viewWidth: number,
  viewHeight: number,
): { x: number; y: number; width: number; height: number } {
  let { x, y, width, height } = bounds;
  if (width < viewWidth) {
    x -= (viewWidth - width) / 2;
    width = viewWidth;
  }
  if (height < viewHeight) {
    y -= (viewHeight - height) / 2;
    height = viewHeight;
  }
  return { x, y, width, height };
}
