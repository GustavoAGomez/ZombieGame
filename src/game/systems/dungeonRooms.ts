import type { RunState } from '../../core/RunState';
import type { SimContext } from './SimContext';

/** The rooms' state for the minimap, the keys in hand and the wizard's room (spec 09 §4.2), to the HUD. */
export function emitRooms(ctx: SimContext, run: RunState): void {
  ctx.events.emit('dungeon:rooms', { current: run.room, visited: [...run.visited], cleared: [...run.cleared], counter: run.merchantCounter, keys: run.keys, bossKey: run.bossKey, wizardRoom: run.shop?.room ?? -1 });
}
