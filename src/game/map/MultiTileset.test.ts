import { describe, expect, it } from 'vitest';
import { buildRoom01Map } from '../../../scripts/gen-placeholder-map';
import { BLOCK_BULLET, BLOCK_PLAYER, BLOCK_SIGHT, BLOCK_ZOMBIE, buildCollisionGrid, cellBlocks } from './CollisionGrid';
import { TILE_COLLIDES, TILE_VOID, TILE_WATER, parseMap, tilesetForGid } from './MapLoader';
import type { TiledMap, TiledTileLayer } from './tiled';

/** room01 plus a second tileset (pool: tile 0 deck, tile 1 water), a third (special: void) and a tall kit. */
function multiMap(): TiledMap {
  const map = structuredClone(buildRoom01Map());
  const base = map.tilesets[0]!;
  const nextGid = base.firstgid + base.tilecount;
  map.tilesets.push(
    {
      firstgid: nextGid, name: 'pool', tilewidth: 32, tileheight: 32, tilecount: 2, columns: 2,
      image: 'pool.png', imagewidth: 64, imageheight: 32, margin: 0, spacing: 0,
      tiles: [{ id: 1, properties: [{ name: 'water', type: 'bool', value: true }] }],
    },
    {
      firstgid: nextGid + 2, name: 'special', tilewidth: 32, tileheight: 32, tilecount: 1, columns: 1,
      image: 'special.png', imagewidth: 32, imageheight: 32, margin: 0, spacing: 0,
      tiles: [{ id: 0, properties: [{ name: 'void', type: 'bool', value: true }] }],
    },
    {
      firstgid: nextGid + 3, name: 'kit', tilewidth: 32, tileheight: 48, tilecount: 2, columns: 2,
      image: 'kit.png', imagewidth: 64, imageheight: 48, margin: 0, spacing: 0, objectalignment: 'bottomleft',
      tiles: [{ id: 1, properties: [{ name: 'collides', type: 'bool', value: true }] }],
    },
  );
  const floor = map.layers.find((l) => l.name === 'floor') as TiledTileLayer;
  const walls = map.layers.find((l) => l.name === 'walls') as TiledTileLayer;
  floor.data[6 * map.width + 6] = nextGid + 1; // water
  floor.data[6 * map.width + 7] = nextGid + 2; // void
  floor.data[6 * map.width + 8] = nextGid; // deck (walkable)
  walls.data[10 * map.width + 6] = nextGid + 4; // tall kit wall
  walls.data[10 * map.width + 7] = nextGid + 3; // tall kit piece without collision
  map.layers.push({
    id: 9, name: 'decals', type: 'objectgroup', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true,
    objects: [{ id: 99, name: '', gid: nextGid, x: 200, y: 232, width: 32, height: 32, rotation: 0, visible: true }],
  });
  return map;
}

describe('maps with several tilesets', () => {
  const raw = multiMap();
  const map = parseMap(raw);
  const grid = buildCollisionGrid(map, map.doors.map(() => false));
  const pool = map.tilesets.find((t) => t.name === 'pool')!;

  it('keeps global tile ids and flags per tileset', () => {
    expect(map.tilesets.map((t) => t.name)).toEqual(['interior', 'pool', 'special', 'kit']);
    expect(map.gidFlags[pool.firstGid + 1]).toBe(TILE_WATER);
    expect(map.gidFlags[pool.firstGid + 2]).toBe(TILE_VOID);
    expect(map.gidFlags[pool.firstGid + 4]).toBe(TILE_COLLIDES);
    expect(tilesetForGid(map.tilesets, pool.firstGid + 4)?.name).toBe('kit');
    expect(tilesetForGid(map.tilesets, 999)).toBeUndefined();
    expect(map.decals).toEqual([{ gid: pool.firstGid, x: 200, y: 232 }]);
  });

  it('water and void stop bodies but not bullets or sight', () => {
    for (const x of [6, 7]) {
      expect(cellBlocks(grid, x, 6, BLOCK_PLAYER)).toBe(true);
      expect(cellBlocks(grid, x, 6, BLOCK_ZOMBIE)).toBe(true);
      expect(cellBlocks(grid, x, 6, BLOCK_BULLET)).toBe(false);
      expect(cellBlocks(grid, x, 6, BLOCK_SIGHT)).toBe(false);
    }
    expect(cellBlocks(grid, 8, 6, BLOCK_PLAYER)).toBe(false);
  });

  it('collides on tall tiles that have the property, not on the others', () => {
    expect(cellBlocks(grid, 6, 10, BLOCK_BULLET)).toBe(true);
    expect(cellBlocks(grid, 7, 10, BLOCK_PLAYER)).toBe(false);
  });

  it('blocks the player where there is no floor', () => {
    expect(cellBlocks(grid, 1, 1, BLOCK_PLAYER)).toBe(true);
    expect(cellBlocks(grid, 1, 1, BLOCK_ZOMBIE)).toBe(false);
  });
});
