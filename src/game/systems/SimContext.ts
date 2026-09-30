import type { EventBus } from '../../core/EventBus';
import type { GameState } from '../../core/GameState';
import type { InputCommand } from '../../core/InputCommand';
import type { CollisionGrid } from '../map/CollisionGrid';
import type { MapData } from '../map/MapLoader';

/** Everything a system may touch during one tick. No Phaser in here. */
export interface SimContext {
  state: GameState;
  map: MapData;
  grid: CollisionGrid;
  /** One command per player, indexed like state.players. */
  commands: InputCommand[];
  events: EventBus;
}
