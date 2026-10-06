/**
 * A dungeon run (spec 09 §1, §2): its start, and the floors it goes down
 * (§4). Pure over the run's data; the game scene calls it.
 */
import type { RunState } from '../../core/RunState';
import { generateFloor, type TemplateBank } from './generateFloor';

/** A new run from its seed: the first floor's plan, the player in its start room, nothing in the pockets. */
export function createRunState(seed: number, bank: TemplateBank, floor = 1): RunState {
  const plan = generateFloor(seed, floor, bank);
  const visited = plan.rooms.map((_, i) => i === plan.start);
  return {
    seed,
    floor,
    plan,
    visited,
    cleared: plan.rooms.map(() => false),
    room: plan.start,
    fight: null,
    announced: false,
    keys: 0,
    bossKey: false,
    merchantCounter: 0,
    roomsCleared: 0,
    kills: 0,
    upgrades: [],
    curses: [],
  };
}

/**
 * The next floor (§4): its plan comes from the seed alone, so nothing done
 * on this floor changes it; the keys, the counter and the upgrades carry
 * over, the boss key does not (§6.1).
 */
export function descend(run: RunState, bank: TemplateBank): RunState {
  const next = createRunState(run.seed, bank, run.floor + 1);
  return { ...next, keys: run.keys, merchantCounter: run.merchantCounter, roomsCleared: run.roomsCleared, kills: run.kills, upgrades: [...run.upgrades], curses: [...run.curses] };
}
