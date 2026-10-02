import { buildRoom01Map } from '../../scripts/gen-placeholder-map';
import { embeddedMansion } from '../../scripts/lib/mansion-fixture';
import { EventBus } from '../core/EventBus';
import { createGameState, createWeaponSlot, type ZombieState } from '../core/GameState';
import { createInputCommand } from '../core/InputCommand';
import { buildCollisionGrid } from '../game/map/CollisionGrid';
import { parseMap, type MapData } from '../game/map/MapLoader';
import { defaultMuzzles } from '../game/systems/shotGeometry';
import { createNav, type SimContext } from '../game/systems/SimContext';

/**
 * A fresh simulation on the placeholder map, for system tests. Spawning is
 * off unless `toSpawn` is given (-1 = unlimited).
 */
export function createTestContext(seed = 1, toSpawn = 0): SimContext {
  return contextFor(parseMap(buildRoom01Map()), seed, toSpawn);
}

let mansion: MapData | undefined;

/** Same as createTestContext, on the generated mansion (spec 02). */
export function createMansionContext(seed = 1, toSpawn = 0): SimContext {
  mansion ??= parseMap(embeddedMansion());
  return contextFor(mansion, seed, toSpawn);
}

/** Same as createTestContext, on any parsed map. */
export function contextFor(map: MapData, seed = 1, toSpawn = 0): SimContext {
  // Rounds stay put and the first spawn is not delayed by the banner, unless a test asks for it.
  const state = createGameState(map, { seed, toSpawn, waveFlow: false });
  state.wave.spawnTimer = 0;
  return {
    state,
    map,
    grid: buildCollisionGrid(map, state.doorsOpen),
    nav: createNav(map),
    commands: state.players.map(() => createInputCommand()),
    events: new EventBus(),
    muzzles: defaultMuzzles(),
  };
}

export function runTicks(ctx: SimContext, ticks: number, step: (ctx: SimContext, dt: number) => void): void {
  for (let i = 0; i < ticks; i++) step(ctx, 1 / 60);
}

/** Activates pooled zombie `index` at (x, y). 'idle' zombies stand still. */
export function placeZombie(
  ctx: SimContext,
  index: number,
  x: number,
  y: number,
  hp = 1000,
  ai: ZombieState['ai'] = 'idle',
): ZombieState {
  const z = ctx.state.zombies[index];
  if (!z) throw new Error(`No zombie slot ${index}`);
  Object.assign(z, { active: true, ai, x, y, prevX: x, prevY: y, hp, maxHp: hp, timer: 0, attackCooldown: 0, window: -1, crossOut: false });
  return z;
}

/** Index of zone `id`; throws when the map has no such zone. */
export function zoneIndex(ctx: SimContext, id: string): number {
  const i = ctx.map.zones.findIndex((z) => z.id === id);
  if (i < 0) throw new Error(`No zone ${id}`);
  return i;
}

/** Centre of tile (x, y) in world px. */
export function tileCenter(ctx: SimContext, x: number, y: number): { x: number; y: number } {
  return { x: (x + 0.5) * ctx.map.tileSize, y: (y + 0.5) * ctx.map.tileSize };
}

/** Puts the local player on the centre of tile (x, y), with no interpolation. */
export function movePlayerToTile(ctx: SimContext, x: number, y: number): void {
  const p = player(ctx);
  const c = tileCenter(ctx, x, y);
  p.x = p.prevX = c.x;
  p.y = p.prevY = c.y;
}

/** Unlocks zones by id and forces the flow field to be recomputed. */
export function unlockZones(ctx: SimContext, ...ids: string[]): void {
  for (const id of ids) ctx.state.zonesUnlocked[zoneIndex(ctx, id)] = true;
  ctx.nav.age = Infinity;
}

export function player(ctx: SimContext) {
  const p = ctx.state.players[0];
  if (!p) throw new Error('No player');
  return p;
}

export function command(ctx: SimContext) {
  const c = ctx.commands[0];
  if (!c) throw new Error('No command');
  return c;
}

/**
 * The player as it started before spec 04: pistol in hand and the SMG in
 * the second slot, for tests about switching, the SMG or several weapons.
 */
export function withSmg(ctx: SimContext): SimContext {
  const p = ctx.state.players[0];
  if (p && !p.weapons.some((w) => w.id === 'smg')) p.weapons.push(createWeaponSlot('smg'));
  return ctx;
}
