/**
 * Test fixtures of the dungeon (spec 09): the mansion's real room templates
 * and the tilesets, read once from the repository, and a match on an
 * assembled floor.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EventBus } from '../core/EventBus';
import { createGameState } from '../core/GameState';
import { createInputCommand } from '../core/InputCommand';
import { assembleFloor, templatesById } from '../game/dungeon/assembleFloor';
import { createRunState } from '../game/dungeon/run';
import { parseRoomTemplate, type RoomTemplate } from '../game/dungeon/roomTemplate';
import { bankOf } from '../game/dungeon/templates';
import { TILESET_ORDER, type TilesetName } from '../game/map/ascii/asciiMap';
import { buildCollisionGrid } from '../game/map/CollisionGrid';
import type { Tsj } from '../game/map/tsj';
import { createBossNavs, createNav, type SimContext } from '../game/systems/SimContext';
import { defaultMuzzles } from '../game/systems/shotGeometry';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let tilesets: Record<TilesetName, Tsj> | undefined;
const templates = new Map<string, RoomTemplate[]>();

export function testTilesets(): Record<TilesetName, Tsj> {
  if (!tilesets) {
    tilesets = {} as Record<TilesetName, Tsj>;
    for (const name of TILESET_ORDER) tilesets[name] = JSON.parse(readFileSync(resolve(ROOT, 'art-src/tiled/tilesets', `${name}.tsj`), 'utf8')) as Tsj;
  }
  return tilesets;
}

/** The templates of maps/src/rooms/<ambient>/, parsed (not checked: the rooms:build test does that). */
export function testTemplates(ambient = 'mansion'): RoomTemplate[] {
  let list = templates.get(ambient);
  if (!list) {
    const dir = resolve(ROOT, 'maps/src/rooms', ambient);
    list = readdirSync(dir)
      .filter((f) => f.endsWith('.txt'))
      .sort()
      .map((f) => parseRoomTemplate(readFileSync(resolve(dir, f), 'utf8'), `${ambient}/${f.replace(/\.txt$/, '')}`));
    templates.set(ambient, list);
  }
  return list;
}

/** A dungeon match on the first floor of `seed`: its plan, its assembled map and a context to step. */
export function dungeonContext(seed = 1): SimContext {
  const list = testTemplates();
  const run = createRunState(seed, bankOf(list));
  const map = assembleFloor(run.plan, templatesById(list), testTilesets());
  const state = createGameState(map, { seed, mode: 'dungeon', run, waveFlow: false, toSpawn: 0 });
  return {
    state,
    map,
    grid: buildCollisionGrid(map, state.doorsOpen),
    nav: createNav(map),
    bossNavs: createBossNavs(map),
    commands: state.players.map(() => createInputCommand()),
    events: new EventBus(),
    muzzles: defaultMuzzles(),
  };
}
