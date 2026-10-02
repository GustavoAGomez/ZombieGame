import { describe, expect, it } from 'vitest';
import { buildRoom01Map } from '../../../scripts/gen-placeholder-map';
import { MapParseError, TILE_COLLIDES, parseMap } from './MapLoader';
import type { TiledMap, TiledObjectLayer, TiledProperty } from './tiled';

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

  it('reads doors D1 and D2 with zones and axis, and the price of each room', () => {
    expect(map.doors.map((d) => [d.id, d.fromZone, d.toZone, d.tiles.length, d.axis])).toEqual([
      ['D1', 'inicio', 'pasillo', 2, 'horizontal'],
      ['D2', 'pasillo', 'almacen', 2, 'vertical'],
    ]);
    expect(map.zones.map((z) => [z.id, z.cost])).toEqual([
      ['inicio', 0],
      ['pasillo', 750],
      ['almacen', 1000],
    ]);
  });

  it('reads the merchant spots and groups them by zone', () => {
    expect(map.merchantSpots.map((s) => [s.x / 32 - 0.5, s.y / 32 - 0.5, s.zone])).toEqual([
      [4, 4, 'inicio'],
      [17, 12, 'inicio'],
      [4, 14, 'pasillo'],
      [15, 18, 'pasillo'],
      [21, 24, 'almacen'],
    ]);
    expect(map.zoneMerchantSpots).toEqual([[0, 1], [2, 3], [4]]);
  });

  it('rejects merchant spots in unknown zones', () => {
    const json = clone();
    const spot = (json.layers.find((l) => l.name === 'objects') as TiledObjectLayer).objects.find((o) => o.type === 'merchant_spot');
    spot!.properties = [{ name: 'zone', type: 'string', value: 'atico' }];
    expect(() => parseMap(json)).toThrow(/merchant_spot .* unknown zone "atico"/);
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

describe('parseMap: zones flags, fences, open spawns and portals (spec 02)', () => {
  const objectsOf = (raw: TiledMap): TiledObjectLayer['objects'] =>
    (raw.layers.find((l) => l.name === 'objects') as TiledObjectLayer).objects;
  const prop = (name: string, value: string | number | boolean): TiledProperty => ({
    name,
    type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'int' : 'string',
    value,
  });
  const portal = (id: string, pair: string, zone: string, x: number, y: number, extra: TiledProperty[] = []) => ({
    id: 900 + x,
    name: id,
    type: 'portal',
    x: x * 32,
    y: y * 32,
    width: 64,
    height: 32,
    rotation: 0,
    visible: true,
    properties: [prop('id', id), prop('pair', pair), prop('zone', zone), ...extra],
  });

  it('defaults the new properties for older maps', () => {
    const map = parseMap(buildRoom01Map());
    expect(map.zones.every((z) => !z.interior && !z.openSpawns)).toBe(true);
    expect(map.windows.every((w) => w.kind === 'window')).toBe(true);
    expect(map.openSpawns).toEqual([]);
    expect(map.portals).toEqual([]);
    expect(map.portalLinks).toBe(0);
  });

  it('reads interior, openSpawns and fence windows', () => {
    const raw = clone();
    const objects = objectsOf(raw);
    objects.find((o) => o.name === 'inicio')?.properties?.push(prop('interior', true), prop('openSpawns', true));
    objects.find((o) => o.name === 'W1')?.properties?.push(prop('kind', 'fence'));
    const map = parseMap(raw);
    expect(map.zones[0]).toMatchObject({ interior: true, openSpawns: true });
    expect(map.windows[0]?.kind).toBe('fence');
  });

  it('rejects unknown window kinds', () => {
    const raw = clone();
    objectsOf(raw).find((o) => o.name === 'W1')?.properties?.push(prop('kind', 'door'));
    expect(() => parseMap(raw)).toThrow(/unknown kind "door"/);
  });

  it('turns a zombie_spawn without window into an entrance from off the map to its zone', () => {
    const raw = clone();
    const objects = objectsOf(raw);
    objects.find((o) => o.name === 'pasillo')?.properties?.push(prop('openSpawns', true));
    // A gap in the pasillo's west wall (3,16) onto the void: from (1,16) the zombie walks in to (4,16).
    const gap = 16 * raw.width + 3;
    for (const name of ['floor', 'walls']) {
      const layer = raw.layers.find((l) => l.name === name);
      if (layer && 'data' in layer && Array.isArray(layer.data)) layer.data[gap] = 0;
    }
    const zone = [prop('zone', 'pasillo')];
    const open = { id: 800, name: 'E1', type: 'zombie_spawn', point: true, x: 1.5 * 32, y: 16.5 * 32, width: 0, height: 0, rotation: 0, visible: true, properties: zone };
    objects.push(open);
    expect(parseMap(raw).openSpawns).toEqual([{ x: 1.5 * 32, y: 16.5 * 32, zoneIndex: 1, entry: { x: 4.5 * 32, y: 16.5 * 32 } }]);
    open.x = 0.5 * 32; // four tiles out: too far
    expect(() => parseMap(raw)).toThrow(/within 3 tiles/);
    open.x = 8.5 * 32; // on the pasillo's floor: zombies would appear in front of the player
    expect(() => parseMap(raw)).toThrow(/off the map or on the void/);
    open.x = 1.5 * 32;
    zone[0] = prop('zone', 'inicio'); // inicio has no openSpawns
    expect(() => parseMap(raw)).toThrow(/openSpawns/);
  });

  it('knows the zone each window spawn lies in', () => {
    const map = parseMap(clone());
    expect(map.zombieSpawns.every((s) => s.zoneIndex === -1)).toBe(true); // all outside the house
  });

  it('pairs portal ends, shares the link and arrives at the other centre', () => {
    const raw = clone();
    objectsOf(raw).push(
      portal('Aa', 'Ab', 'inicio', 5, 5, [prop('kind', 'hatch'), prop('secondary', true)]),
      portal('Ab', 'Aa', 'almacen', 22, 20),
    );
    const map = parseMap(raw);
    const [a, b] = map.portals;
    expect(map.portalLinks).toBe(1);
    expect(a).toMatchObject({ id: 'Aa', other: 1, link: 0, zone: 'inicio', kind: 'hatch', secondary: true });
    expect(b).toMatchObject({ id: 'Ab', other: 0, link: 0, kind: 'stairs', secondary: false });
    expect(a?.tiles).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
    ]);
    expect(a?.arrival).toEqual(b?.center);
    expect(b?.arrival).toEqual({ x: 6 * 32, y: 5.5 * 32 });
  });

  it('rejects portals without a reciprocal pair', () => {
    const raw = clone();
    objectsOf(raw).push(portal('Aa', 'Ab', 'inicio', 5, 5), portal('Ab', 'Ac', 'almacen', 22, 20), portal('Ac', 'Ab', 'pasillo', 6, 15));
    expect(() => parseMap(raw)).toThrow(/must reference each other/);
    const lonely = clone();
    objectsOf(lonely).push(portal('Aa', 'Zz', 'inicio', 5, 5));
    expect(() => parseMap(lonely)).toThrow(/unknown pair "Zz"/);
  });
});

describe('parseMap: zones made of several rectangles', () => {
  it('merges zone objects that share an id into one zone', () => {
    const raw = clone();
    const objects = (raw.layers.find((l) => l.name === 'objects') as TiledObjectLayer).objects;
    // A second rectangle for "almacen" at the top-left corner, flagged as interior.
    objects.push({
      id: 700,
      name: 'almacen',
      type: 'zone',
      x: 0,
      y: 0,
      width: 64,
      height: 32,
      rotation: 0,
      visible: true,
      properties: [
        { name: 'id', type: 'string', value: 'almacen' },
        { name: 'interior', type: 'bool', value: true },
      ],
    });
    const map = parseMap(raw);
    const almacen = map.zones.findIndex((z) => z.id === 'almacen');
    expect(map.zones).toHaveLength(3);
    expect(map.zones[almacen]?.rects).toHaveLength(2);
    expect(map.zones[almacen]?.interior).toBe(true);
    expect(map.zones[almacen]).toMatchObject({ x: 0, y: 0 });
    expect(map.cellZone[0]).toBe(almacen);
    expect(map.cellZone[1]).toBe(almacen);
    expect(map.cellZone[21 * map.width + 24]).toBe(almacen); // the original room still belongs to it
  });
});
