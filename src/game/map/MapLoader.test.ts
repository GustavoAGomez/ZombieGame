import { describe, expect, it } from 'vitest';
import { buildRoom01Map } from '../../../scripts/gen-placeholder-map';
import { MapParseError, TILE_COLLIDES, parseMap } from './MapLoader';
import type { TiledMap, TiledObjectLayer } from './tiled';

const clone = (): TiledMap => structuredClone(buildRoom01Map());

describe('parseMap (room01 placeholder)', () => {
  const map = parseMap(buildRoom01Map());

  it('reads size and tileset', () => {
    expect(map.tileSize).toBe(32);
    expect(map.widthPx).toBe(map.width * 32);
    expect(map.tilesets.map((t) => t.name)).toEqual(['interior']);
    const t = map.tilesets[0]!;
    expect(map.gidFlags[t.firstGid + 1]! & TILE_COLLIDES).toBeTruthy(); // wall
    expect(map.gidFlags[t.firstGid]! & TILE_COLLIDES).toBeFalsy(); // floor
  });

  it('builds the three zones from spec 01 §3', () => {
    expect(map.zones.map((z) => [z.id, z.width / 32, z.height / 32, z.startsUnlocked])).toEqual([
      ['inicio', 14, 9, true],
      ['pasillo', 16, 5, false],
      ['almacen', 8, 8, false],
    ]);
  });

  it('places six windows with outward directions', () => {
    const byId = Object.fromEntries(map.windows.map((w) => [w.id, w]));
    expect(Object.keys(byId)).toEqual(['W1', 'W2', 'W3', 'W4', 'W5', 'W6']);
    expect(byId.W1?.outward).toEqual({ x: 0, y: -1 });
    expect(byId.W2?.outward).toEqual({ x: -1, y: 0 });
    expect(byId.W3?.outward).toEqual({ x: 1, y: 0 });
    expect(byId.W4?.outward).toEqual({ x: 0, y: 1 });
    expect(byId.W5?.outward).toEqual({ x: 1, y: 0 });
    expect(byId.W6?.outward).toEqual({ x: 1, y: 0 });
    expect(byId.W1?.axis).toBe('horizontal');
    expect(byId.W2?.axis).toBe('vertical');
    for (const w of map.windows) expect(w.planks).toBe(5);
  });

  it('puts every window between an interior point and its spawn 2 tiles outside', () => {
    for (const w of map.windows) {
      const spawn = map.zombieSpawns.find((s) => s.window === w.id);
      expect(spawn, w.id).toBeDefined();
      if (!spawn) continue;
      expect(Math.hypot(spawn.x - w.center.x, spawn.y - w.center.y)).toBeCloseTo(64);
      // Interior point lies on floor inside the window's zone.
      const tx = Math.floor(w.interior.x / 32);
      const ty = Math.floor(w.interior.y / 32);
      expect(map.floor[ty * map.width + tx]).toBeGreaterThan(0);
      const zone = map.zones[map.cellZone[ty * map.width + tx] ?? -1];
      expect(zone?.id).toBe(w.zone);
      // Exterior point lies between the window and the spawn.
      const toSpawn = Math.hypot(spawn.x - w.exterior.x, spawn.y - w.exterior.y);
      expect(toSpawn).toBeLessThan(64);
    }
  });

  it('reads doors D1 and D2 with cost, zones and axis', () => {
    expect(map.doors.map((d) => [d.id, d.cost, d.fromZone, d.toZone, d.tiles.length, d.axis])).toEqual([
      ['D1', 750, 'inicio', 'pasillo', 2, 'horizontal'],
      ['D2', 1000, 'pasillo', 'almacen', 2, 'vertical'],
    ]);
  });

  it('puts the player spawn inside the starting zone', () => {
    const tx = Math.floor(map.playerSpawn.x / 32);
    const ty = Math.floor(map.playerSpawn.y / 32);
    expect(map.zones[map.cellZone[ty * map.width + tx] ?? -1]?.id).toBe('inicio');
  });

  it('accepts `class` instead of `type` on objects (Tiled 1.9+)', () => {
    const raw = clone();
    const layer = raw.layers.find((l) => l.name === 'objects') as TiledObjectLayer;
    for (const obj of layer.objects) {
      obj.class = obj.type;
      delete obj.type;
    }
    expect(parseMap(raw).windows).toHaveLength(6);
  });
});

describe('parseMap validation', () => {
  it('rejects maps without required layers', () => {
    const raw = clone();
    raw.layers = raw.layers.filter((l) => l.name !== 'walls');
    expect(() => parseMap(raw)).toThrow(MapParseError);
  });

  it('rejects external tilesets', () => {
    const raw = clone();
    const tileset = raw.tilesets[0];
    if (tileset) tileset.source = 'interior.tsj';
    expect(() => parseMap(raw)).toThrow(/map:build/);
  });

  it('rejects spawns pointing to unknown windows', () => {
    const raw = clone();
    const layer = raw.layers.find((l) => l.name === 'objects') as TiledObjectLayer;
    const spawn = layer.objects.find((o) => o.type === 'zombie_spawn');
    const prop = spawn?.properties?.find((p) => p.name === 'window');
    if (prop) prop.value = 'W99';
    expect(() => parseMap(raw)).toThrow(/W99/);
  });

  it('rejects non-map JSON', () => {
    expect(() => parseMap({ foo: 1 })).toThrow(MapParseError);
  });
});
