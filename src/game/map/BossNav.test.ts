import { describe, expect, it } from 'vitest';
import type { GameState } from '../../core/GameState';
import { BOSS_UNREACHABLE, bossStepsAt, computeBossNav, createBossNav, footprintFits, moveBossBox, updateBossBlocking } from './BossNav';
import { TILE_COLLIDES, type MapData } from './MapLoader';

const TS = 32;

/**
 * Minimal map from ASCII: '.' floor, '#' wall, 'P' furniture with collision
 * on the floor, 'C' a weapon case. One unlocked zone over all of it.
 */
function asciiMap(rows: string[]): MapData {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const floor = new Int32Array(width * height);
  const walls = new Int32Array(width * height);
  const props: MapData['props'] = [];
  const weaponCases: MapData['weaponCases'] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '#') walls[y * width + x] = 1;
      else floor[y * width + x] = 2;
      if (ch === 'P') props.push({ id: `p${props.length}`, key: 'prop_x', x: x * TS, y: y * TS, width: TS, height: TS, tiles: [{ x, y }], collides: true, flipX: false, flipY: false });
      if (ch === 'C') weaponCases.push({ tileX: x, tileY: y } as MapData['weaponCases'][number]);
    }),
  );
  const gidFlags = new Uint8Array(4);
  gidFlags[1] = TILE_COLLIDES;
  return {
    width,
    height,
    tileSize: TS,
    floor,
    walls,
    decor: new Int32Array(width * height),
    gidFlags,
    cellZone: new Int16Array(width * height).fill(0),
    windows: [],
    doors: [],
    portals: [],
    props,
    weaponCases,
    handSpots: [],
  } as unknown as MapData;
}

const openState = { zonesUnlocked: [true], doorsOpen: [], hand: { spot: -1 }, merchants: [] } as unknown as GameState;

/** Steps from the middle of the top room to a target in the bottom one, through the gap in the middle row. */
function stepsThrough(gap: string): number {
  const rows = ['##########', '#........#', '#........#', '#........#', gap, '#........#', '#........#', '#........#', '##########'];
  const map = asciiMap(rows);
  const nav = createBossNav(map, 2);
  updateBossBlocking(nav, map, openState);
  computeBossNav(nav, 5 * TS, 7 * TS);
  return bossStepsAt(nav, 5 * TS, 2 * TS);
}

describe('BossNav (spec 07 §2)', () => {
  it('goes through a 2-tile door but never through a 1-tile gap', () => {
    expect(stepsThrough('####..####')).toBeGreaterThan(0);
    expect(stepsThrough('####.#####')).toBe(BOSS_UNREACHABLE);
  });

  it('walks over furniture (it crushes it) but never over a weapon case', () => {
    expect(stepsThrough('####PP####')).toBeGreaterThan(0);
    expect(stepsThrough('####CC####')).toBe(BOSS_UNREACHABLE);
    expect(stepsThrough('####C.####')).toBe(BOSS_UNREACHABLE);
  });

  it('fits its footprint only where none of its cells is blocked', () => {
    const map = asciiMap(['#####', '#...#', '#...#', '#####']);
    const nav = createBossNav(map, 2);
    updateBossBlocking(nav, map, openState);
    expect(footprintFits(nav, 1, 1)).toBe(true);
    expect(footprintFits(nav, 2, 1)).toBe(true);
    expect(footprintFits(nav, 3, 1)).toBe(false);
    expect(footprintFits(nav, 1, 2)).toBe(false);
  });

  it('stops its box against a wall, sliding along it', () => {
    const map = asciiMap(['########', '#......#', '#......#', '#......#', '########']);
    const nav = createBossNav(map, 2);
    updateBossBlocking(nav, map, openState);
    const pos = { x: 3 * TS, y: 2.5 * TS };
    const hit = moveBossBox(nav, pos, 200, 10, 30, 8);
    expect(hit).toBe(true);
    // Against the east wall (x = 7 tiles), and it went on down by the 10 px.
    expect(pos.x + 30).toBeLessThanOrEqual(7 * TS);
    expect(pos.x + 30).toBeGreaterThan(7 * TS - 1);
    expect(pos.y).toBeCloseTo(2.5 * TS + 10 - 0, 0);
  });
});
