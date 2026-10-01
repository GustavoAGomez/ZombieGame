/**
 * Design rules of a full game map (docs/specs/02-mapa-mansion.md §4). Used by
 * `map:build`, `assets:check` and the tests. Returns readable errors in
 * Spanish; an empty list means the map is valid.
 */
import { BLOCK_PLAYER, buildCollisionGrid } from '../../src/game/map/CollisionGrid';
import { parseMap, type MapData } from '../../src/game/map/MapLoader';
import type { TiledMap, TiledSourceMap } from '../../src/game/map/tiled';

export const MAP_RULES = {
  minZones: 8,
  maxZones: 10,
  minBarricadesPerInteriorZone: 2,
  minCost: 750,
  maxCost: 2000,
  minPassageTiles: 2,
  /** The player must start strictly farther than this from every barricade. */
  minPlayerBarricadeTiles: 6,
  /** Furniture with collision keeps farther than this (tiles, Chebyshev) from barricades, doors and portals. */
  minPropClearanceTiles: 2,
  minExitsPerZone: 2,
  maxWidth: 100,
  maxHeight: 70,
} as const;

export interface MapValidation {
  errors: string[];
  /** Parsed map when it could be parsed. */
  map?: MapData;
}

export function validateMap(raw: TiledSourceMap | TiledMap): MapValidation {
  const errors: string[] = [];
  const R = MAP_RULES;

  const external = raw.tilesets.filter((t) => 'source' in t && t.source).map((t) => ('source' in t ? t.source : ''));
  if (external.length > 0) {
    errors.push(`tilesets externos (${external.join(', ')}): ejecuta npm run map:build para embeberlos`);
    return { errors };
  }
  if (raw.width > R.maxWidth || raw.height > R.maxHeight) {
    errors.push(`el mapa mide ${raw.width}×${raw.height}; el máximo es ${R.maxWidth}×${R.maxHeight}`);
  }

  let map: MapData;
  try {
    map = parseMap(raw);
  } catch (err) {
    errors.push((err as Error).message);
    return { errors };
  }
  const ts = map.tileSize;
  const zoneName = (i: number): string => map.zones[i]?.id ?? `#${i}`;

  // Zones.
  if (map.zones.length < R.minZones || map.zones.length > R.maxZones) {
    errors.push(`hay ${map.zones.length} zonas; deben ser de ${R.minZones} a ${R.maxZones}`);
  }
  const initial = map.zones.filter((z) => z.startsUnlocked);
  if (initial.length !== 1) errors.push(`debe haber exactamente una zona inicial (startsUnlocked) y hay ${initial.length}`);
  const playerCell = Math.floor(map.playerSpawn.y / ts) * map.width + Math.floor(map.playerSpawn.x / ts);
  const playerZone = map.cellZone[playerCell] ?? -1;
  if (!map.zones[playerZone]?.startsUnlocked) errors.push('el jugador no aparece dentro de la zona inicial');

  // Barricades.
  map.zones.forEach((zone, i) => {
    if (!zone.interior) return;
    const count = map.windows.filter((w) => w.zoneIndex === i).length;
    if (count < R.minBarricadesPerInteriorZone) {
      errors.push(`la zona interior ${zone.id} tiene ${count} barricadas; necesita al menos ${R.minBarricadesPerInteriorZone}`);
    }
  });
  for (const w of map.windows) {
    const d = Math.hypot(w.center.x - map.playerSpawn.x, w.center.y - map.playerSpawn.y) / ts;
    if (d <= R.minPlayerBarricadeTiles) {
      errors.push(`el jugador aparece a ${d.toFixed(1)} tiles de ${w.id}; debe estar a más de ${R.minPlayerBarricadeTiles}`);
    }
  }

  // Doors and portals.
  const checkPassage = (kind: string, id: string, cost: number, tiles: number): void => {
    if (cost < R.minCost || cost > R.maxCost) errors.push(`${kind} ${id} cuesta ${cost}; debe costar de ${R.minCost} a ${R.maxCost}`);
    if (tiles < R.minPassageTiles) errors.push(`${kind} ${id} mide ${tiles} tile; debe medir al menos ${R.minPassageTiles}`);
  };
  const zoneOfCell = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < map.width && y < map.height ? (map.cellZone[y * map.width + x] ?? -1) : -1;
  for (const door of map.doors) {
    checkPassage('la puerta', door.id, door.cost, door.tiles.length);
    for (const zone of [door.fromZoneIndex, door.toZoneIndex]) {
      const touches = door.tiles.some(
        (t) =>
          zoneOfCell(t.x, t.y) === zone ||
          zoneOfCell(t.x + 1, t.y) === zone ||
          zoneOfCell(t.x - 1, t.y) === zone ||
          zoneOfCell(t.x, t.y + 1) === zone ||
          zoneOfCell(t.x, t.y - 1) === zone,
      );
      if (!touches) errors.push(`la puerta ${door.id} no toca la zona ${zoneName(zone)}`);
    }
  }
  for (const portal of map.portals) {
    checkPassage('el portal', portal.id, portal.cost, portal.tiles.length);
    if (portal.tiles.some((t) => zoneOfCell(t.x, t.y) !== portal.zoneIndex)) {
      errors.push(`el portal ${portal.id} se sale de su zona ${portal.zone}`);
    }
    const other = map.portals[portal.other];
    if (other && (other.cost !== portal.cost || other.secondary !== portal.secondary)) {
      errors.push(`los extremos ${portal.id} y ${other.id} deben tener el mismo coste y el mismo valor de secondary`);
    }
  }

  // Exits per zone (doors + portal ends).
  map.zones.forEach((zone, i) => {
    const exits =
      map.doors.filter((d) => d.fromZoneIndex === i || d.toZoneIndex === i).length +
      map.portals.filter((p) => p.zoneIndex === i).length;
    if (exits < R.minExitsPerZone) errors.push(`la zona ${zone.id} tiene ${exits} salida(s); necesita al menos ${R.minExitsPerZone}`);
  });

  // Reachability on the real tiles, with every door and portal open.
  const grid = buildCollisionGrid(map, map.doors.map(() => true));
  const portalAt = new Map<number, number>();
  map.portals.forEach((portal, i) => {
    for (const t of portal.tiles) portalAt.set(t.y * map.width + t.x, i);
    for (const t of portal.tiles) {
      if ((grid.cells[t.y * map.width + t.x] ?? 0) & BLOCK_PLAYER) errors.push(`el portal ${portal.id} está sobre una casilla bloqueada`);
    }
  });
  const seen = new Uint8Array(map.width * map.height);
  const queue: number[] = [];
  const visit = (cell: number): void => {
    if (seen[cell] || ((grid.cells[cell] ?? 0) & BLOCK_PLAYER) !== 0) return;
    seen[cell] = 1;
    queue.push(cell);
  };
  visit(playerCell);
  while (queue.length > 0) {
    const cell = queue.pop() ?? 0;
    const x = cell % map.width;
    const y = (cell - x) / map.width;
    if (x > 0) visit(cell - 1);
    if (x < map.width - 1) visit(cell + 1);
    if (y > 0) visit(cell - map.width);
    if (y < map.height - 1) visit(cell + map.width);
    const portal = map.portals[portalAt.get(cell) ?? -1];
    const other = portal ? map.portals[portal.other] : undefined;
    for (const t of other?.tiles ?? []) visit(t.y * map.width + t.x);
  }
  const reached = new Set<number>();
  const isolated = new Map<number, number>();
  seen.forEach((v, cell) => {
    if (v) reached.add(map.cellZone[cell] ?? -1);
    else if ((map.cellZone[cell] ?? -1) >= 0 && ((grid.cells[cell] ?? 0) & BLOCK_PLAYER) === 0) {
      const z = map.cellZone[cell] ?? -1;
      isolated.set(z, (isolated.get(z) ?? 0) + 1);
    }
  });
  map.zones.forEach((zone, i) => {
    if (!reached.has(i)) errors.push(`la zona ${zone.id} no es alcanzable desde la inicial con todo abierto`);
    else if (isolated.has(i)) errors.push(`la zona ${zone.id} tiene ${isolated.get(i)} casillas a las que no se puede llegar (¿atrezo cerrando un paso?)`);
  });

  // Furniture: keeps clear of barricades, doors, portals and the player, and never leaves a pass under 2 tiles.
  // Only furniture on the same side counts: a wall in between already keeps the way clear.
  const keepClear: { what: string; tiles: { x: number; y: number }[]; zones: number[] }[] = [
    ...map.windows.map((w) => ({ what: `la barricada ${w.id}`, tiles: [{ x: w.tileX, y: w.tileY }], zones: [w.zoneIndex] })),
    ...map.doors.map((d) => ({ what: `la puerta ${d.id}`, tiles: d.tiles, zones: [d.fromZoneIndex, d.toZoneIndex] })),
    ...map.portals.map((p) => ({ what: `el portal ${p.id}`, tiles: p.tiles, zones: [p.zoneIndex] })),
  ];
  const free = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < map.width && y < map.height && ((grid.cells[y * map.width + x] ?? 0) & BLOCK_PLAYER) === 0;
  const inOpenSquare = (x: number, y: number): boolean =>
    [
      [0, 0],
      [-1, 0],
      [0, -1],
      [-1, -1],
    ].some(([dx = 0, dy = 0]) => free(x + dx, y + dy) && free(x + dx + 1, y + dy) && free(x + dx, y + dy + 1) && free(x + dx + 1, y + dy + 1));
  for (const prop of map.props) {
    if (!prop.collides) continue;
    const propZone = map.cellZone[(prop.tiles[0]?.y ?? 0) * map.width + (prop.tiles[0]?.x ?? 0)] ?? -1;
    for (const k of keepClear) {
      if (!k.zones.includes(propZone)) continue;
      const near = prop.tiles.some((t) => k.tiles.some((u) => Math.max(Math.abs(t.x - u.x), Math.abs(t.y - u.y)) <= R.minPropClearanceTiles));
      if (near) errors.push(`el atrezo ${prop.id} (${prop.key}) está a ${R.minPropClearanceTiles} tiles o menos de ${k.what}`);
    }
    if (prop.tiles.some((t) => t.y * map.width + t.x === playerCell)) errors.push(`el atrezo ${prop.id} tapa el spawn del jugador`);
    const narrow = new Set<string>();
    for (const t of prop.tiles) {
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const x = t.x + dx;
        const y = t.y + dy;
        if (free(x, y) && !inOpenSquare(x, y)) narrow.add(`${x},${y}`);
      }
    }
    if (narrow.size > 0) errors.push(`el atrezo ${prop.id} (${prop.key}) deja un paso de menos de 2 tiles en ${[...narrow].join(' ')}`);
  }

  return { errors, map };
}
