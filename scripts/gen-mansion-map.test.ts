import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCK_ALL, BLOCK_BULLET, BLOCK_PLAYER, BLOCK_SIGHT, BLOCK_ZOMBIE, buildCollisionGrid, cellBlocks } from '../src/game/map/CollisionGrid';
import { TILE_COLLIDES, parseMap, tilesetForGid } from '../src/game/map/MapLoader';
import type { TiledTileLayer } from '../src/game/map/tiled';
import {
  DOORS,
  MANSION_HEIGHT,
  MANSION_TILESETS,
  MANSION_WIDTH,
  OPEN_SPAWNS,
  PORTALS,
  WINDOWS,
  ZONES,
  buildMansionMap,
  readMansionTilesets,
} from './gen-mansion-map';
import { embeddedMansion } from './lib/mansion-fixture';
import { validateMap } from './lib/validate-map';

const tilesetsDir = resolve(dirname(fileURLToPath(import.meta.url)), '../art-src/tiled/tilesets');

describe('gen-mansion-map', () => {
  const raw = embeddedMansion();
  const map = parseMap(raw);
  const grid = buildCollisionGrid(map, map.doors.map(() => false));
  const layer = (name: string) => raw.layers.find((l) => l.name === name) as TiledTileLayer;
  const tileProps = (x: number, y: number): Record<string, unknown> => {
    const gid = map.floor[y * map.width + x] ?? 0;
    const ts = tilesetForGid(map.tilesets, gid);
    const t = raw.tilesets.find((r) => r.name === ts?.name);
    const def = t?.tiles?.find((d) => d.id === gid - (ts?.firstGid ?? 0));
    return { tileset: ts?.name, ...Object.fromEntries((def?.properties ?? []).map((p) => [p.name, p.value])) };
  };

  it('passes the map validator', () => {
    expect(validateMap(raw).errors).toEqual([]);
  });

  it('follows the tables of spec 02 §2', () => {
    expect([map.width, map.height]).toEqual([MANSION_WIDTH, MANSION_HEIGHT]);
    expect(map.zones.map((z) => z.id)).toEqual(ZONES.map((z) => z.id));
    expect(map.zones.filter((z) => z.startsUnlocked).map((z) => z.id)).toEqual(['recibidor']);
    expect(map.zones.filter((z) => z.openSpawns).map((z) => z.id)).toEqual(['calle', 'azotea']);
    expect(map.windows).toHaveLength(WINDOWS.length);
    expect(map.windows.filter((w) => w.kind === 'fence').map((w) => w.id)).toEqual(['F1', 'F2', 'F3']);
    expect(map.doors.map((d) => d.cost)).toEqual(DOORS.map((d) => d.cost));
    expect(map.portals).toHaveLength(PORTALS.length * 2);
    expect(map.portalLinks).toBe(PORTALS.length);
    expect(map.openSpawns).toHaveLength(OPEN_SPAWNS.length);
    expect([Math.floor(map.playerSpawn.x / 32), Math.floor(map.playerSpawn.y / 32)]).toEqual([28, 31]);
  });

  it('links each portal end with the other one', () => {
    const p1 = map.portals.find((p) => p.id === 'P1a');
    const p1b = map.portals.find((p) => p.id === 'P1b');
    expect(p1?.zone).toBe('cocina');
    expect(p1b?.zone).toBe('sotano');
    expect(p1?.arrival).toEqual(p1b?.center);
    expect(p1?.link).toBe(p1b?.link);
    expect(map.portals.filter((p) => p.secondary).map((p) => p.id)).toEqual(['P3a', 'P3b', 'P4a', 'P4b']);
    expect(map.portals.find((p) => p.id === 'P3a')?.kind).toBe('hatch');
  });

  it('keeps the tilesets external, in GID order', () => {
    const source = buildMansionMap(readMansionTilesets(tilesetsDir));
    expect(source.tilesets.map((t) => ('source' in t ? t.source : ''))).toEqual(MANSION_TILESETS.map((n) => `tilesets/${n}.tsj`));
    const gids = source.tilesets.map((t) => t.firstgid);
    expect(gids[0]).toBe(1);
    expect([...gids].sort((a, b) => a - b)).toEqual(gids);
    expect(readdirSync(tilesetsDir).filter((f) => f.endsWith('.tsj'))).toHaveLength(MANSION_TILESETS.length);
  });

  it('is deterministic', () => {
    const tilesets = readMansionTilesets(tilesetsDir);
    expect(JSON.stringify(buildMansionMap(tilesets))).toBe(JSON.stringify(buildMansionMap(tilesets)));
  });

  it('resolves the Wang terrains from the measured corners', () => {
    // Street: sidewalk on rows 41–42, curb on 43 and 50, asphalt in between.
    expect(tileProps(10, 41)).toMatchObject({ tileset: 'tileset_street', terrain_corners: '1111' });
    expect(tileProps(10, 43)).toMatchObject({ terrain_corners: '1100' });
    expect(tileProps(10, 46)).toMatchObject({ terrain_corners: '0000' });
    expect(tileProps(10, 50)).toMatchObject({ terrain_corners: '0011' });
    // Pool: deck all around, water inside, rim tiles in between.
    expect(tileProps(22, 6)).toMatchObject({ tileset: 'tileset_pool', terrain_corners: '1111' });
    expect(tileProps(24, 8)).toMatchObject({ terrain_corners: '1010', water: true });
    expect(tileProps(30, 9)).toMatchObject({ terrain_corners: '0000', water: true });
    expect(tileProps(24, 7)).toMatchObject({ terrain_corners: '1110' });
    // Garden: lawn, then the patio terrace along the house.
    expect(tileProps(10, 5)).toMatchObject({ tileset: 'tileset_garden', terrain_corners: '1111' });
    expect(tileProps(10, 12)).toMatchObject({ terrain_corners: '1100' });
    expect(tileProps(10, 14)).toMatchObject({ terrain_corners: '0000' });
  });

  it('water stops bodies but not bullets; the pool rim corners are walkable', () => {
    expect(cellBlocks(grid, 30, 9, BLOCK_PLAYER | BLOCK_ZOMBIE)).toBe(true);
    expect(cellBlocks(grid, 30, 9, BLOCK_BULLET)).toBe(false);
    expect(cellBlocks(grid, 30, 9, BLOCK_SIGHT)).toBe(false);
    expect(cellBlocks(grid, 24, 8, BLOCK_PLAYER)).toBe(true);
    expect(cellBlocks(grid, 24, 7, BLOCK_PLAYER)).toBe(false);
    expect(cellBlocks(grid, 23, 8, BLOCK_PLAYER)).toBe(false);
  });

  it('surrounds the roof with void', () => {
    for (const [x, y] of [
      [76, 10],
      [96, 10],
      [85, 2],
      [85, 18],
    ] as const) {
      expect(cellBlocks(grid, x, y, BLOCK_PLAYER | BLOCK_ZOMBIE)).toBe(true);
      expect(cellBlocks(grid, x, y, BLOCK_BULLET)).toBe(false);
    }
    expect(cellBlocks(grid, 85, 10, BLOCK_PLAYER)).toBe(false);
  });

  it('builds walls with colliding kit pieces and leaves openings for doors and windows', () => {
    const walls = layer('walls');
    let count = 0;
    walls.data.forEach((gid, i) => {
      if (gid === 0) return;
      count++;
      expect(map.gidFlags[gid]! & TILE_COLLIDES).toBe(TILE_COLLIDES);
      expect(grid.cells[i]).toBe(BLOCK_ALL);
      expect(map.floor[i]).not.toBe(0); // dark ground under every wall
    });
    expect(count).toBeGreaterThan(400);
    for (const door of map.doors) {
      for (const t of door.tiles) expect(map.walls[t.y * map.width + t.x]).toBe(0);
    }
    const kitOf = (x: number, y: number) => tilesetForGid(map.tilesets, map.walls[y * map.width + x] ?? 0)?.name;
    expect(kitOf(3, 20)).toBe('kit_exterior');
    expect(kitOf(20, 30)).toBe('kit_interior');
    expect(kitOf(30, 2)).toBe('kit_fence');
    expect(kitOf(76, 30)).toBe('kit_basement');
  });

  it('places every window spawn two tiles outside its window', () => {
    for (const w of map.windows) {
      const spawn = map.zombieSpawns.find((s) => s.window === w.id);
      expect(spawn).toBeDefined();
      expect(Math.round((spawn!.x - w.center.x) / 32)).toBe(w.outward.x * 2);
      expect(Math.round((spawn!.y - w.center.y) / 32)).toBe(w.outward.y * 2);
    }
  });
});
