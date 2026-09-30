import { buildRoom01Map } from '../../scripts/gen-placeholder-map';
import { EventBus } from '../core/EventBus';
import { createGameState, type ZombieState } from '../core/GameState';
import { createInputCommand } from '../core/InputCommand';
import { buildCollisionGrid } from '../game/map/CollisionGrid';
import { parseMap } from '../game/map/MapLoader';
import { createNav, type SimContext } from '../game/systems/SimContext';

/**
 * A fresh simulation on the placeholder map, for system tests. Spawning is
 * off unless `toSpawn` is given (-1 = unlimited).
 */
export function createTestContext(seed = 1, toSpawn = 0): SimContext {
  const map = parseMap(buildRoom01Map());
  const state = createGameState(map, { seed, toSpawn });
  return {
    state,
    map,
    grid: buildCollisionGrid(map, state.doorsOpen),
    nav: createNav(map),
    commands: state.players.map(() => createInputCommand()),
    events: new EventBus(),
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
  Object.assign(z, { active: true, ai, x, y, prevX: x, prevY: y, hp, maxHp: hp, timer: 0, attackCooldown: 0, window: -1 });
  return z;
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
