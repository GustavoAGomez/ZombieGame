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

/** How far (tiles) around a zone its border is hidden while it is locked: walls, doors, fences, the land beyond. */
export const FOG_EDGE_TILES = 3;

/**
 * For cells outside every zone and not covered by fogOwners (walls on a
 * border, doors, windows, fences, land outside the lot): a bitmask of the
 * zones within FOG_EDGE_TILES. Such a cell stays dark while none of those
 * zones is unlocked, so the outline of the house is not given away either.
 */
export function fogEdges(map: MapData, owners: Int16Array): Int32Array {
  const { width, height, cellZone } = map;
  const masks = new Int32Array(width * height);
  const r = FOG_EDGE_TILES;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if ((owners[i] ?? -1) >= 0) continue;
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
      masks[i] = mask;
    }
  }
  return masks;
}
