import { buildRoom01Map } from '../../scripts/gen-placeholder-map';
import { EventBus } from '../core/EventBus';
import { createGameState } from '../core/GameState';
import { createInputCommand } from '../core/InputCommand';
import { buildCollisionGrid } from '../game/map/CollisionGrid';
import { parseMap } from '../game/map/MapLoader';
import type { SimContext } from '../game/systems/SimContext';

/** A fresh simulation on the placeholder map, for system tests. */
export function createTestContext(seed = 1): SimContext {
  const map = parseMap(buildRoom01Map());
  const state = createGameState(map, seed);
  return {
    state,
    map,
    grid: buildCollisionGrid(map, state.doorsOpen),
    commands: state.players.map(() => createInputCommand()),
    events: new EventBus(),
  };
}

export function runTicks(ctx: SimContext, ticks: number, step: (ctx: SimContext, dt: number) => void): void {
  for (let i = 0; i < ticks; i++) step(ctx, 1 / 60);
}
