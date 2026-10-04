import type { EventBus } from '../../core/EventBus';
import type { GameState } from '../../core/GameState';
import type { InputCommand } from '../../core/InputCommand';
import { BOSS } from '../../config/balance';
import { BOSSES } from '../../config/bosses';
import { createBossNav, type BossNav } from '../map/BossNav';
import type { CollisionGrid } from '../map/CollisionGrid';
import { createFlowField, type FlowField } from '../map/FlowField';
import type { MapData } from '../map/MapLoader';
import type { MuzzleTable } from './shotGeometry';

/** Everything a system may touch during one tick. No Phaser in here. */
export interface SimContext {
  state: GameState;
  map: MapData;
  grid: CollisionGrid;
  /** Derived navigation data (rebuilt from state + map, never serialised). */
  nav: FlowField;
  /** Each boss slot's own way round the map (spec 07 §2), derived too. */
  bossNavs: BossNav[];
  /** One command per player, indexed like state.players. */
  commands: InputCommand[];
  events: EventBus;
  /** Drawn muzzle of the players' gun per direction (character art data). */
  muzzles: MuzzleTable;
}

export function createNav(map: MapData): FlowField {
  return createFlowField(map.width, map.height, map.tileSize);
}

/** One BossNav per boss slot (BOSS.maxAlive). */
export function createBossNavs(map: MapData): BossNav[] {
  return Array.from({ length: BOSS.maxAlive }, () => createBossNav(map, BOSSES.butcher.footprintTiles));
}
