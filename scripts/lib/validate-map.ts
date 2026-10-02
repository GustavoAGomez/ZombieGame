/**
 * Design rules of a full game map (docs/specs/02-mapa-mansion.md §4, the
 * merchant spots of docs/specs/03-magos.md §1, the weapon cases of spec 04
 * §3 and the item spots of spec 05 §2). Used by
 * `map:build`, `assets:check` and the tests. Returns readable errors in
 * Spanish; an empty list means the map is valid.
 */
import { BLOCK_PLAYER, buildCollisionGrid } from '../../src/game/map/CollisionGrid';
import { ACTIVATIONS } from '../../src/config/activations';
import { parseMap, TILE_WATER, type MapData } from '../../src/game/map/MapLoader';
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
  minMerchantSpotsPerZone: 1,
  maxMerchantSpotsPerZone: 2,
  /** Merchant spots keep strictly farther than this (tiles) from barricades, doors, portals and spawns. */
  minMerchantClearanceTiles: 3,
  /** Weapon cases keep at least this far (tiles, centre to centre) from barricades, doors and merchant spots (spec 04 §3). */
  minCaseClearanceTiles: 3,
  minItemSpotsPerZone: 1,
  maxItemSpotsPerZone: 2,
  /** Item spots keep at least this far (tiles, centre to centre) from barricades, doors, portals, spawns, merchant spots and weapon cases (spec 05 §2). */
  minItemClearanceTiles: 2,
  maxWidth: 120,
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
  // A window spawn inside a zone is off once that zone is unlocked (players walk there): with the whole map
  // unlocked, the zombies still need somewhere to come from.
  if (map.openSpawns.length === 0 && map.zombieSpawns.every((s) => s.zoneIndex >= 0)) {
    errors.push('con todo desbloqueado no queda ningún spawn: hace falta un spawn de barricada fuera de toda zona o un spawn de entrada');
  }

  // Rooms are unlocked, not doors: every zone the match does not start with has a price, and a door or a
  // main staircase to buy it through (secondary ones open by themselves, never sold).
  map.zones.forEach((zone, i) => {
    if (zone.startsUnlocked) return;
    if (zone.cost < R.minCost || zone.cost > R.maxCost) errors.push(`la zona ${zone.id} cuesta ${zone.cost}; debe costar de ${R.minCost} a ${R.maxCost}`);
    const byDoor = map.doors.some((d) => d.fromZoneIndex === i || d.toZoneIndex === i);
    const byStairs = map.portals.some((p) => !p.secondary && (p.zoneIndex === i || map.portals[p.other]?.zoneIndex === i));
    if (!byDoor && !byStairs) errors.push(`la zona ${zone.id} no tiene ninguna puerta ni escalera principal por la que desbloquearla`);
  });

  // Doors and portals.
  const checkPassage = (kind: string, id: string, tiles: number): void => {
    if (tiles < R.minPassageTiles) errors.push(`${kind} ${id} mide ${tiles} tile; debe medir al menos ${R.minPassageTiles}`);
  };
  const zoneOfCell = (x: number, y: number): number =>
    x >= 0 && y >= 0 && x < map.width && y < map.height ? (map.cellZone[y * map.width + x] ?? -1) : -1;
  for (const door of map.doors) {
    checkPassage('la puerta', door.id, door.tiles.length);
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
    checkPassage('el portal', portal.id, portal.tiles.length);
    if (portal.tiles.some((t) => zoneOfCell(t.x, t.y) !== portal.zoneIndex)) {
      errors.push(`el portal ${portal.id} se sale de su zona ${portal.zone}`);
    }
    const other = map.portals[portal.other];
    if (other && other.secondary !== portal.secondary) {
      errors.push(`los extremos ${portal.id} y ${other.id} deben tener el mismo valor de secondary`);
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

  validateMerchantSpots(map, free, inOpenSquare, errors);
  validateWeaponCases(map, free, inOpenSquare, errors);
  validateItemSpots(map, free, (x, y) => seen[y * map.width + x] === 1, errors);
  // Every activation needs its place on the map (spec 05 §6).
  for (const a of ACTIVATIONS) {
    const site = map.activationSites.find((s) => s.id === a.site);
    if (!site) errors.push(`la activación ${a.id} necesita un activation_site "${a.site}" en el mapa`);
    else if (site.width <= 0 || site.height <= 0) errors.push(`el activation_site ${site.id} no tiene superficie`);
  }
  return { errors, map };
}

/**
 * Weapon cases (spec 04 §3): in their zone, with a free tile in front to buy
 * from, at least minCaseClearanceTiles from barricades, doors and merchant
 * spots of their own zone (as with furniture, a wall in between already
 * keeps them apart: a merchant in the next room is never reached from the
 * case's front), and never leaving a pass under 2 tiles (the grid already
 * counts them as solid).
 */
function validateWeaponCases(
  map: MapData,
  free: (x: number, y: number) => boolean,
  inOpenSquare: (x: number, y: number) => boolean,
  errors: string[],
): void {
  const R = MAP_RULES;
  const ts = map.tileSize;
  const centre = (t: { x: number; y: number }) => ({ x: (t.x + 0.5) * ts, y: (t.y + 0.5) * ts });
  const keepAway: { what: string; points: { x: number; y: number }[]; zones: number[] }[] = [
    ...map.windows.map((w) => ({ what: `la barricada ${w.id}`, points: [w.center], zones: [w.zoneIndex] })),
    ...map.doors.map((d) => ({ what: `la puerta ${d.id}`, points: d.tiles.map(centre), zones: [d.fromZoneIndex, d.toZoneIndex] })),
    ...map.merchantSpots.map((s, i) => ({ what: `el punto de mago ${i + 1} (${s.zone})`, points: [s], zones: [s.zoneIndex] })),
  ];
  const FRONT = { south: [0, 1], east: [1, 0], west: [-1, 0] } as const;
  for (const c of map.weaponCases) {
    const who = `la vitrina ${c.id}`;
    if ((map.cellZone[c.tileY * map.width + c.tileX] ?? -1) !== c.zoneIndex) errors.push(`${who} no cae en su zona ${c.zone}`);
    if ((map.walls[c.tileY * map.width + c.tileX] ?? 0) !== 0) errors.push(`${who} está sobre una pared (${c.tileX},${c.tileY})`);
    const [fx, fy] = FRONT[c.facing];
    if (!free(c.tileX + fx, c.tileY + fy)) errors.push(`${who} no tiene una casilla libre delante (${c.tileX + fx},${c.tileY + fy})`);
    for (const k of keepAway) {
      if (!k.zones.includes(c.zoneIndex)) continue;
      const d = Math.min(...k.points.map((p) => Math.hypot(p.x - c.x, p.y - c.y))) / ts;
      if (d < R.minCaseClearanceTiles) errors.push(`${who} está a ${d.toFixed(1)} tiles de ${k.what}; debe estar a ${R.minCaseClearanceTiles} o más`);
    }
    const narrow = SIDES.map(([dx, dy]) => [c.tileX + dx, c.tileY + dy] as const).filter(([x, y]) => free(x, y) && !inOpenSquare(x, y));
    if (narrow.length > 0) errors.push(`${who} deja un paso de menos de 2 tiles en ${narrow.map(([x, y]) => `${x},${y}`).join(' ')}`);
  }
}

/**
 * Item spots (spec 05 §2): 1 or 2 per zone, on a free tile of their zone
 * that can be walked to, and at least minItemClearanceTiles from barricades,
 * doors, portals, spawns, merchant spots and weapon cases. Water, void and
 * furniture with collision are not free; the ASCII plan also keeps them out
 * from under any prop. Being somewhere believable is for the design review.
 */
function validateItemSpots(
  map: MapData,
  free: (x: number, y: number) => boolean,
  reachable: (x: number, y: number) => boolean,
  errors: string[],
): void {
  const R = MAP_RULES;
  const ts = map.tileSize;
  map.zones.forEach((zone, i) => {
    const count = map.itemSpots.filter((s) => s.zoneIndex === i).length;
    if (count < R.minItemSpotsPerZone || count > R.maxItemSpotsPerZone) {
      errors.push(`la zona ${zone.id} tiene ${count} puntos de objeto; deben ser de ${R.minItemSpotsPerZone} a ${R.maxItemSpotsPerZone}`);
    }
  });
  const centre = (t: { x: number; y: number }) => ({ x: (t.x + 0.5) * ts, y: (t.y + 0.5) * ts });
  const keepAway: { what: string; points: { x: number; y: number }[] }[] = [
    ...map.windows.map((w) => ({ what: `la barricada ${w.id}`, points: [w.center] })),
    ...map.doors.map((d) => ({ what: `la puerta ${d.id}`, points: d.tiles.map(centre) })),
    ...map.portals.map((p) => ({ what: `el portal ${p.id}`, points: p.tiles.map(centre) })),
    ...map.zombieSpawns.map((s) => ({ what: `el spawn de ${s.window}`, points: [s] })),
    ...map.openSpawns.map((s, i) => ({ what: `la entrada del spawn ${i + 1}`, points: [s.entry] })),
    { what: 'el spawn del jugador', points: [map.playerSpawn] },
    ...map.merchantSpots.map((s, i) => ({ what: `el punto de mago ${i + 1} (${s.zone})`, points: [s] })),
    ...map.weaponCases.map((c) => ({ what: `la vitrina ${c.id}`, points: [c] })),
  ];
  map.itemSpots.forEach((spot, i) => {
    const who = `el punto de objeto ${i + 1} (${spot.zone})`;
    const tx = Math.floor(spot.x / ts);
    const ty = Math.floor(spot.y / ts);
    if ((map.cellZone[ty * map.width + tx] ?? -1) !== spot.zoneIndex) errors.push(`${who} no cae en su zona`);
    if (!free(tx, ty)) {
      errors.push(`${who} está en una casilla bloqueada (${tx},${ty}): agua, vacío, pared o atrezo`);
      return;
    }
    if (!reachable(tx, ty)) errors.push(`${who} no se puede alcanzar a pie (${tx},${ty})`);
    for (const k of keepAway) {
      const d = Math.min(...k.points.map((p) => Math.hypot(p.x - spot.x, p.y - spot.y))) / ts;
      if (d < R.minItemClearanceTiles) errors.push(`${who} está a ${d.toFixed(1)} tiles ${k.what.startsWith('el ') ? `del ${k.what.slice(3)}` : `de ${k.what}`}; debe estar a ${R.minItemClearanceTiles} o más`);
    }
  });
}

const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/**
 * Merchant spots (spec 03 §1): 1 or 2 per zone, each against a wall or in a
 * corner, farther than 3 tiles from barricades, doors, portals and spawns,
 * and never narrowing a pass under 2 tiles (the merchant is solid). The edge
 * of the water counts as a wall: the red merchant comes out of the pool and
 * stands right by it (spec 05 §6).
 */
function validateMerchantSpots(
  map: MapData,
  free: (x: number, y: number) => boolean,
  inOpenSquare: (x: number, y: number) => boolean,
  errors: string[],
): void {
  const R = MAP_RULES;
  const ts = map.tileSize;
  map.zones.forEach((zone, i) => {
    const count = map.zoneMerchantSpots[i]?.length ?? 0;
    if (count < R.minMerchantSpotsPerZone || count > R.maxMerchantSpotsPerZone) {
      errors.push(`la zona ${zone.id} tiene ${count} puntos de mago; deben ser de ${R.minMerchantSpotsPerZone} a ${R.maxMerchantSpotsPerZone}`);
    }
  });
  const centre = (t: { x: number; y: number }) => ({ x: (t.x + 0.5) * ts, y: (t.y + 0.5) * ts });
  const keepAway: { what: string; points: { x: number; y: number }[] }[] = [
    ...map.windows.map((w) => ({ what: `la barricada ${w.id}`, points: [w.center] })),
    ...map.doors.map((d) => ({ what: `la puerta ${d.id}`, points: d.tiles.map(centre) })),
    ...map.portals.map((p) => ({ what: `el portal ${p.id}`, points: p.tiles.map(centre) })),
    ...map.zombieSpawns.map((s) => ({ what: `el spawn de ${s.window}`, points: [s] })),
    ...map.openSpawns.map((s, i) => ({ what: `la entrada del spawn ${i + 1}`, points: [s.entry] })),
    { what: 'el spawn del jugador', points: [map.playerSpawn] },
  ];
  map.merchantSpots.forEach((spot, i) => {
    const who = `el punto de mago ${i + 1} (${spot.zone})`;
    const tx = Math.floor(spot.x / ts);
    const ty = Math.floor(spot.y / ts);
    if ((map.cellZone[ty * map.width + tx] ?? -1) !== spot.zoneIndex) errors.push(`${who} no cae en su zona`);
    if (!free(tx, ty)) {
      errors.push(`${who} está en una casilla bloqueada (${tx},${ty})`);
      return;
    }
    const wall = (x: number, y: number): boolean =>
      x >= 0 &&
      y >= 0 &&
      x < map.width &&
      y < map.height &&
      ((map.walls[y * map.width + x] ?? 0) !== 0 || ((map.gidFlags[map.floor[y * map.width + x] ?? 0] ?? 0) & TILE_WATER) !== 0);
    if (!SIDES.some(([dx, dy]) => wall(tx + dx, ty + dy))) errors.push(`${who} no está pegado a una pared ni al agua (${tx},${ty})`);
    for (const k of keepAway) {
      const d = Math.min(...k.points.map((p) => Math.hypot(p.x - spot.x, p.y - spot.y))) / ts;
      if (d <= R.minMerchantClearanceTiles) errors.push(`${who} está a ${d.toFixed(1)} tiles de ${k.what}; debe estar a más de ${R.minMerchantClearanceTiles}`);
    }
    // With the merchant standing there, every free cell next to it must still be part of an open 2×2 square.
    const freeWithMerchant = (x: number, y: number): boolean => free(x, y) && !(x === tx && y === ty);
    const narrow = SIDES.map(([dx, dy]) => [tx + dx, ty + dy] as const).filter(
      ([x, y]) =>
        freeWithMerchant(x, y) &&
        !inOpenSquareWith(x, y, freeWithMerchant) &&
        // Already narrow without the merchant: that is the map, not the spot.
        inOpenSquare(x, y),
    );
    if (narrow.length > 0) errors.push(`${who} deja un paso de menos de 2 tiles en ${narrow.map(([x, y]) => `${x},${y}`).join(' ')}`);
  });
}

function inOpenSquareWith(x: number, y: number, free: (x: number, y: number) => boolean): boolean {
  return [
    [0, 0],
    [-1, 0],
    [0, -1],
    [-1, -1],
  ].some(([dx = 0, dy = 0]) => free(x + dx, y + dy) && free(x + dx + 1, y + dy) && free(x + dx, y + dy + 1) && free(x + dx + 1, y + dy + 1));
}
