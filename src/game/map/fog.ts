import type { MapData } from './MapLoader';

/**
 * Which zone's darkness covers each cell (row-major, -1 = none) while that
 * zone is locked: its floor, plus the walls and obstacles inside it
 * (partitions, pillars), so the layout of a locked room cannot be guessed.
 * Walls on its border, doors and windows are not covered.
 */
export function fogOwners(map: MapData): Int16Array {
  const { width, height, cellZone, walls } = map;
  const zoneAt = (x: number, y: number): number => (x >= 0 && y >= 0 && x < width && y < height ? (cellZone[y * width + x] ?? -1) : -1);
  const isWall = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height && (walls[y * width + x] ?? 0) !== 0;
  const owner = new Int16Array(width * height).fill(-1);
  for (let i = 0; i < owner.length; i++) owner[i] = cellZone[i] ?? -1;
  // A wall belongs to a zone when every non-wall cell around it is that zone.
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isWall(x, y) || zoneAt(x, y) >= 0) continue;
      let zone = -1;
      let inner = true;
      for (let dy = -1; dy <= 1 && inner; dy++) {
        for (let dx = -1; dx <= 1 && inner; dx++) {
          if ((dx === 0 && dy === 0) || isWall(x + dx, y + dy)) continue;
          const z = zoneAt(x + dx, y + dy);
          if (z < 0 || (zone >= 0 && z !== zone)) inner = false;
          else zone = z;
        }
      }
      if (inner && zone >= 0) owner[y * width + x] = zone;
    }
  }
  return owner;
}

/** How far (tiles) a cell that touches no zone (land beyond a fence, the middle of a thick wall) looks for one. */
export const FOG_EDGE_TILES = 3;

/**
 * For cells outside every zone and not covered by fogOwners (walls on a
 * border, doors, windows, fences, land outside the lot): a bitmask of the
 * zones the cell touches (its 8 neighbours). Such a cell stays dark while
 * none of those zones is unlocked, so a room shows its own walls, doors and
 * windows and nothing of the rooms around it, not even their walls. A cell
 * that touches no zone takes the zones within FOG_EDGE_TILES instead.
 */
export function fogEdges(map: MapData, owners: Int16Array): Int32Array {
  const { width, height, cellZone } = map;
  const masks = new Int32Array(width * height);
  const zonesAround = (x: number, y: number, r: number): number => {
    let mask = 0;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const z = cellZone[ny * width + nx] ?? -1;
        if (z >= 0 && z < 31) mask |= 1 << z;
      }
    }
    return mask;
  };
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if ((owners[i] ?? -1) >= 0) continue;
      masks[i] = zonesAround(x, y, 1) || zonesAround(x, y, FOG_EDGE_TILES);
    }
  }
  return masks;
}

/** Whether a cell is dark with the zones of `unlockedMask` (bit per zone) unlocked. */
export function cellHidden(cell: number, owners: Int16Array, edges: Int32Array, unlockedMask: number): boolean {
  const owner = owners[cell] ?? -1;
  if (owner >= 0) return ((unlockedMask >> owner) & 1) === 0;
  const mask = edges[cell] ?? 0;
  return mask !== 0 && (mask & unlockedMask) === 0;
}
