import { describe, expect, it } from 'vitest';
import { BLOCK_BULLET, BLOCK_PLAYER, BLOCK_SIGHT, BLOCK_ZOMBIE, buildCollisionGrid, cellBlocks } from '../../src/game/map/CollisionGrid';
import { parseMap } from '../../src/game/map/MapLoader';
import { AsciiMapError, parseAsciiMap } from './ascii-map';
import { embeddedMansion, mansionPlanText } from './mansion-fixture';
import { validateMap } from './validate-map';

describe('weapon cases on the mansion (spec 04 §3)', () => {
  const map = parseMap(embeddedMansion());

  it('sells the SMG in the living room and the shotgun in the dining room, both facing south', () => {
    expect(map.weaponCases.map((c) => [c.id, c.weapon, c.cost, c.facing, c.zone, c.tileX, c.tileY])).toEqual([
      ['V1', 'smg', 1000, 'south', 'salon', 24, 35],
      ['V2', 'shotgun', 1500, 'south', 'comedor', 53, 30],
    ]);
  });

  it('is solid for bodies and bullets but lets the line of sight through, like furniture', () => {
    const grid = buildCollisionGrid(map, map.doors.map(() => false));
    for (const c of map.weaponCases) {
      for (const mask of [BLOCK_PLAYER, BLOCK_ZOMBIE, BLOCK_BULLET]) expect(cellBlocks(grid, c.tileX, c.tileY, mask)).toBe(true);
      expect(cellBlocks(grid, c.tileX, c.tileY, BLOCK_SIGHT)).toBe(false);
    }
  });

  it('passes the map rules: free front, clearances and passes', () => {
    expect(validateMap(embeddedMansion()).errors).toEqual([]);
  });
});

describe('weapon cases in the ASCII plan', () => {
  const withCase = (row: string): string =>
    mansionPlanText().replace(/(\| V2 \|[^\n]*\n)/, `$1${row}\n`);

  it('never face north: the front must be seen from the camera', () => {
    expect(() => parseAsciiMap(withCase('| V3 | 26,38 | smg | 1000 | norte | salon | — |'))).toThrow(AsciiMapError);
  });

  it('sell a known weapon at a positive price, on plain floor', () => {
    expect(() => parseAsciiMap(withCase('| V3 | 26,38 | rifle | 1000 | sur | salon | — |'))).toThrow(/rifle/);
    expect(() => parseAsciiMap(withCase('| V3 | 26,38 | smg | 0 | sur | salon | — |'))).toThrow(/coste/);
    expect(() => parseAsciiMap(withCase('| V3 | 16,33 | smg | 1000 | sur | salon | — |'))).toThrow(/suelo/);
  });
});
