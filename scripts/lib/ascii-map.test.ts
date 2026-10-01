import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BLOCK_BULLET, BLOCK_PLAYER, BLOCK_SIGHT, buildCollisionGrid, cellBlocks } from '../../src/game/map/CollisionGrid';
import { parseMap, tilesetForGid } from '../../src/game/map/MapLoader';
import type { TiledProperty, TiledSourceMap, TiledTileLayer } from '../../src/game/map/tiled';
import { compileSource, readTilesets } from '../build-map';
import { AsciiMapError, COMPILED_HASH, compileAsciiMap, computeRegions, contentHash, parseAsciiMap, zoneRects } from './ascii-map';
import { embeddedMansion, mansionPlanText } from './mansion-fixture';
import { validateMap } from './validate-map';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tilesets = readTilesets(resolve(root, 'art-src/tiled/tilesets'));

/** A small but complete plan: two rooms joined by a paid door, a yard and the street. */
const TINY = `HHHHHHHHHHHH
H....H.....H
H....D.....W
H.P..D.....H
H....H.....H
HHWHHHHHHHHH
gggggggggggg
ssssssssssss
aaaaaaaaaaaa

## Zonas
| id | nombre | inicial | interior | spawns abiertos | semilla | suelo | paredes |
|---|---|---|---|---|---|---|---|
| a | A | sí | sí | no | 1,1 | 0 | — |
| b | B | no | sí | no | 7,2 | 2 | — |
| fuera | Fuera | no | no | no | 0,6 | — | — |

## Puertas de pago (D)
| id | casillas | de | a | coste |
|---|---|---|---|---|
| D1 | 5,2 5,3 | a | b | 750 |

## Barricadas (W)
| id | casilla | zona | tipo |
|---|---|---|---|
| W1 | 2,5 | a | ventana |
| W2 | 11,2 | b | ventana |

## Jugador (P)
| casilla |
|---|
| 2,3 |
`;

const layer = (map: TiledSourceMap, name: string) => map.layers.find((l) => l.name === name) as TiledTileLayer;

describe('parseAsciiMap', () => {
  it('reads the plan and every table of the mansion', () => {
    const plan = parseAsciiMap(mansionPlanText());
    expect([plan.width, plan.height]).toEqual([100, 68]);
    expect(plan.zones.map((z) => z.id)).toEqual(['recibidor', 'salon', 'comedor', 'biblioteca', 'cocina', 'garaje', 'jardin', 'calle', 'sotano', 'azotea']);
    expect(plan.zones.filter((z) => z.startsUnlocked).map((z) => z.id)).toEqual(['recibidor']);
    expect(plan.zones.find((z) => z.id === 'sotano')?.wallKit).toBe('kit_basement');
    expect(plan.doors.map((d) => [d.id, d.cost])).toEqual([
      ['D1', 750], ['D2', 750], ['D3', 1000], ['D4', 1000], ['D5', 1250],
      ['D6', 1250], ['D7', 1250], ['D8', 1500], ['D9', 1500], ['D10', 1500],
    ]);
    expect(plan.windows).toHaveLength(18);
    expect(plan.windows.filter((w) => w.kind === 'fence').map((w) => w.id)).toEqual(['F1', 'F2', 'F3']);
    expect(plan.portals.map((p) => `${p.id}:${p.kind}:${p.secondary}`)).toEqual([
      'P1a:stairs:false', 'P1b:stairs:false', 'P2a:ladder:false', 'P2b:ladder:false',
      'P3a:hatch:true', 'P3b:hatch:true', 'P4a:ladder:true', 'P4b:ladder:true',
    ]);
    expect(plan.openSpawns).toHaveLength(5);
  });

  it('reports markers without a table entry, entries on the wrong cell and unknown characters', () => {
    const missing = TINY.replace('| W2 | 11,2 | b | ventana |\n', '');
    expect(() => parseAsciiMap(missing)).toThrow(/"W" en 11,2 no está en ninguna tabla/);
    const wrongCell = TINY.replace('| W1 | 2,5 |', '| W1 | 3,5 |');
    expect(() => parseAsciiMap(wrongCell)).toThrow(/barricada W1: en 3,5 el plano tiene "H" y no "W"/);
    const unknown = TINY.replace('H....H.....H\nHHW', 'H....H..?..H\nHHW');
    expect(() => parseAsciiMap(unknown)).toThrow(/carácter "\?" fuera de la leyenda en 8,4/);
  });

  it('collects every problem in one error', () => {
    try {
      parseAsciiMap(TINY.replace('| W1 | 2,5 |', '| W1 | 3,5 |').replace('| D1 | 5,2 5,3 |', '| D1 | 5,2 |'));
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(AsciiMapError);
      expect((err as AsciiMapError).problems.length).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('zones from regions', () => {
  it('names each region from its seed and covers it with rectangles', () => {
    const plan = parseAsciiMap(TINY);
    const { cellZone } = computeRegions(plan);
    expect(cellZone[2 * plan.width + 3]).toBe(0);
    expect(cellZone[2 * plan.width + 8]).toBe(1);
    expect(cellZone[2 * plan.width + 5]).toBe(-1); // the door closes both zones
    const rects = zoneRects(plan, cellZone, 2);
    const covered = rects.reduce((n, r) => n + r.w * r.h, 0);
    expect(covered).toBe([...cellZone].filter((z) => z === 2).length);
  });

  it('fails when two zones are the same region (a wall or a door is missing)', () => {
    const leaky = TINY.replace('H....D.....W', 'H..........W').replace('| D1 | 5,2 5,3 |', '| D1 | 5,3 |');
    expect(() => compileAsciiMap(parseAsciiMap(leaky), tilesets, 't')).toThrow(/las zonas a y b son la misma región/);
  });

  it('fails when a seed falls on a wall', () => {
    expect(() => compileAsciiMap(parseAsciiMap(TINY.replace('| 1,1 |', '| 0,0 |')), tilesets, 't')).toThrow(/semilla de la zona a/);
  });
});

describe('compileAsciiMap', () => {
  const tiny = compileAsciiMap(parseAsciiMap(TINY), tilesets, 'maps/src/tiny.txt');

  it('writes zones, doors, barricades with their spawns outside, and the player', () => {
    const objects = (tiny.layers.find((l) => l.name === 'objects') as { objects: { type?: string; name: string; x: number; y: number }[] }).objects;
    expect(objects.filter((o) => o.type === 'zone').map((o) => o.name)).toEqual(expect.arrayContaining(['a', 'b', 'fuera']));
    const spawn = objects.find((o) => o.name === 'spawn_W1');
    expect([spawn?.x, spawn?.y]).toEqual([2.5 * 32, 7.5 * 32]); // two tiles below the bottom wall
    const spawn2 = objects.find((o) => o.name === 'spawn_W2');
    expect([spawn2?.x, spawn2?.y]).toEqual([13.5 * 32, 2.5 * 32]); // two tiles right of the east wall
    expect(objects.find((o) => o.type === 'player_spawn')).toMatchObject({ x: 2.5 * 32, y: 3.5 * 32 });
  });

  it('stores a hash of its content to detect edits made in Tiled', () => {
    const props = (tiny as TiledSourceMap & { properties?: TiledProperty[] }).properties ?? [];
    expect(props.find((q) => q.name === COMPILED_HASH)?.value).toBe(contentHash(tiny));
    const edited = structuredClone(tiny);
    layer(edited, 'floor').data[0] = 1;
    expect(contentHash(edited)).not.toBe(contentHash(tiny));
    expect(contentHash(JSON.parse(JSON.stringify(tiny, null, 4)) as TiledSourceMap)).toBe(contentHash(tiny));
  });

  describe('on the mansion', () => {
    const raw = embeddedMansion();
    const map = parseMap(raw);
    const grid = buildCollisionGrid(map, map.doors.map(() => false));
    const tileProps = (x: number, y: number): Record<string, unknown> => {
      const gid = map.floor[y * map.width + x] ?? 0;
      const ts = tilesetForGid(map.tilesets, gid);
      const t = raw.tilesets.find((r) => r.name === ts?.name);
      const def = t?.tiles?.find((d) => d.id === gid - (ts?.firstGid ?? 0));
      return { tileset: ts?.name, ...Object.fromEntries((def?.properties ?? []).map((q) => [q.name, q.value])) };
    };
    const kitAt = (x: number, y: number) => tilesetForGid(map.tilesets, map.walls[y * map.width + x] ?? 0)?.name;

    it('passes the map validator', () => {
      expect(validateMap(raw).errors).toEqual([]);
    });

    it('merges the rectangles of each zone into the 10 zones', () => {
      expect(map.zones.map((z) => z.id)).toHaveLength(10);
      expect(map.zones.find((z) => z.id === 'salon')!.rects.length).toBeGreaterThan(1); // L-shaped
    });

    it('turns the sidewalk next to the asphalt into kerbs, in both streets', () => {
      expect(tileProps(30, 54)).toMatchObject({ tileset: 'tileset_street', terrain_corners: '1100' });
      expect(tileProps(30, 57)).toMatchObject({ terrain_corners: '0000' });
      expect(tileProps(30, 60)).toMatchObject({ terrain_corners: '0011' });
      expect(tileProps(1, 30)).toMatchObject({ terrain_corners: '1010' });
      expect(tileProps(7, 30)).toMatchObject({ terrain_corners: '0101' });
      expect(tileProps(4, 57)).toMatchObject({ terrain_corners: '0000' }); // the crossing
    });

    it('keeps the pool water inside the w cells', () => {
      expect(cellBlocks(grid, 45, 8, BLOCK_PLAYER)).toBe(true);
      expect(cellBlocks(grid, 45, 8, BLOCK_BULLET)).toBe(false);
      expect(cellBlocks(grid, 45, 6, BLOCK_PLAYER)).toBe(false); // deck
      expect(cellBlocks(grid, 40, 7, BLOCK_PLAYER)).toBe(false); // pool corner: one water corner
    });

    it('picks the wall kit from the character and the zone', () => {
      expect(kitAt(32, 31)).toBe('kit_interior');
      expect(kitAt(15, 30)).toBe('kit_exterior');
      expect(kitAt(30, 2)).toBe('kit_fence');
      expect(kitAt(82, 30)).toBe('kit_basement');
      expect(kitAt(86, 8)).toBe('kit_basement'); // roof chimney
    });

    it('lays lawn under fences, dark ground under house walls and the room floor under doors', () => {
      expect(tileProps(30, 2).tileset).toBe('tileset_garden');
      expect(tileProps(15, 30)).toMatchObject({ tileset: 'map_special', material: 'tierra' });
      expect(tileProps(34, 41).tileset).toBe('floors_interior'); // D8, the front door
    });

    it('puts every barricade spawn two tiles outside, where zombies come from', () => {
      const at = (id: string) => {
        const w = map.windows.find((x) => x.id === id)!;
        const s = map.zombieSpawns.find((x) => x.window === id)!;
        return [Math.round((s.x - w.center.x) / 32), Math.round((s.y - w.center.y) / 32)];
      };
      expect(at('W1')).toEqual([0, 2]); // front facade → porch
      expect(at('F3')).toEqual([-2, 0]); // side fence → side street
      expect(at('S2')).toEqual([0, 2]); // basement south wall
      expect(at('W9')).toEqual([0, -2]); // library → garden
    });
  });
});

describe('compileSource', () => {
  it('rewrites an untouched Tiled source and keeps one edited by hand unless forced', () => {
    const dir = mkdtempSync(resolve(tmpdir(), 'ascii-map-'));
    cpSync(resolve(root, 'art-src/tiled/tilesets'), resolve(dir, 'art-src/tiled/tilesets'), { recursive: true });
    cpSync(resolve(root, 'maps/src/mansion.txt'), resolve(dir, 'maps/src/m.txt'));
    expect(compileSource(dir, 'm', false)).toBe('written');
    expect(compileSource(dir, 'm', false)).toBe('unchanged');
    const target = resolve(dir, 'art-src/tiled/m.tmj');
    const map = JSON.parse(readFileSync(target, 'utf8')) as TiledSourceMap;
    writeFileSync(target, JSON.stringify(map, null, 4)); // Tiled reformats on save: still untouched
    expect(compileSource(dir, 'm', false)).toBe('written');
    layer(map, 'floor').data[5] = 1;
    writeFileSync(target, JSON.stringify(map));
    expect(compileSource(dir, 'm', false)).toBe('kept-edited');
    expect(compileSource(dir, 'm', true)).toBe('written');
  });
});

describe('decoration and props', () => {
  const WITH_PROPS = `${TINY}
## Atrezo
| id | objeto | casillas | colisión | volteo | nota |
|---|---|---|---|---|---|
| A1 | prop_mesa | 7,1 8,2 | sí | h | mesa |
| A2 | prop_alfombra | 2,1 | no | — | alfombra |
`;

  it('reads props as rectangles with flips and collision', () => {
    const plan = parseAsciiMap(WITH_PROPS);
    expect(plan.props).toEqual([
      { id: 'A1', key: 'prop_mesa', cells: [{ x: 7, y: 1 }, { x: 8, y: 1 }, { x: 7, y: 2 }, { x: 8, y: 2 }], collides: true, flipX: true, flipY: false },
      { id: 'A2', key: 'prop_alfombra', cells: [{ x: 2, y: 1 }], collides: false, flipX: false, flipY: false },
    ]);
  });

  it('rejects props on walls, on other props or with a bad key', () => {
    expect(() => parseAsciiMap(WITH_PROPS.replace('| 7,1 8,2 |', '| 0,1 1,1 |'))).toThrow(/la casilla 0,1 es "H"/);
    expect(() => parseAsciiMap(WITH_PROPS.replace('| 2,1 |', '| 8,2 |'))).toThrow(/ya es de A1/);
    expect(() => parseAsciiMap(WITH_PROPS.replace('prop_alfombra', 'Alfombra'))).toThrow(/prop_<nombre>/);
    const twoSizes = WITH_PROPS.replace('| A2 | prop_alfombra | 2,1 |', '| A2 | prop_mesa | 2,1 |');
    expect(() => parseAsciiMap(twoSizes)).toThrow(/prop_mesa mide 1×1 y en otro sitio 2×2; usa otra clave/);
  });

  it('writes props, shadows and flipped decals; props block bodies and bullets but not sight', () => {
    const compiled = compileAsciiMap(parseAsciiMap(WITH_PROPS), tilesets, 't');
    const map = parseMap(embed(compiled));
    expect(map.props.map((p) => [p.id, p.key, p.collides, p.flipX])).toEqual([
      ['A1', 'prop_mesa', true, true],
      ['A2', 'prop_alfombra', false, false],
    ]);
    const grid = buildCollisionGrid(map, map.doors.map(() => false));
    expect(cellBlocks(grid, 7, 1, BLOCK_PLAYER | BLOCK_BULLET)).toBe(true);
    expect(cellBlocks(grid, 7, 1, BLOCK_SIGHT)).toBe(false);
    expect(cellBlocks(grid, 2, 1, BLOCK_PLAYER)).toBe(false);
    // Under the top wall and to the right of the left wall there is a soft shadow.
    const shadowAt = (x: number, y: number) => map.shadows[y * map.width + x] ?? 0;
    expect(shadowAt(2, 1)).toBeGreaterThan(0);
    expect(shadowAt(1, 3)).toBeGreaterThan(0);
    expect(shadowAt(3, 3)).toBe(0);
    expect(shadowAt(7, 3)).toBeGreaterThan(0); // below the table
    expect(map.decals.length).toBeGreaterThan(0);
    expect(map.decals.some((d) => d.flipX || d.flipY)).toBe(true);
  });

  it('mixes a rare floor variant with "main+rare"', () => {
    const compiled = compileAsciiMap(parseAsciiMap(WITH_PROPS.replace('| a | A | sí | sí | no | 1,1 | 0 |', '| a | A | sí | sí | no | 1,1 | 0+2 |')), tilesets, 't');
    const floor = layer(compiled, 'floor').data;
    const firstFloors = compiled.tilesets.find((t) => 'source' in t && t.source === 'tilesets/floors_interior.tsj')!.firstgid;
    const inA = [1, 2, 3, 4].flatMap((y) => [1, 2, 3, 4].map((x) => (floor[y * 12 + x] ?? 0) - firstFloors));
    expect(new Set(inA).size).toBeGreaterThan(1);
    expect(inA.every((v) => v === 0 || v === 2)).toBe(true);
  });
});

/** Embeds the tilesets of a compiled test map so parseMap can read it. */
function embed(compiled: TiledSourceMap) {
  return {
    ...compiled,
    tilesets: compiled.tilesets.map((t) => {
      if (!('source' in t) || !t.source) return t;
      const tsj = JSON.parse(readFileSync(resolve(root, 'art-src/tiled', t.source), 'utf8')) as Record<string, unknown>;
      return { firstgid: t.firstgid, ...tsj };
    }),
  } as never;
}
