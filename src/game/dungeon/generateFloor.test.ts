import { describe, expect, it } from 'vitest';
import { DUNGEON, FLOORS, KEYED_ROOM_TYPES, floorConfig, floorDifficulties, type RoomType } from '../../config/dungeon';
import type { Cell, FloorPlan, Room } from '../../core/RunState';
import { OPPOSITE, SIDES, generateFloor, planToText, roomAt, subSeed, type TemplateBank } from './generateFloor';
import { createRunState, descend } from './run';
import { placeholderBank } from './templates';

const SEEDS = 1000;
const BANKS = { mansion: placeholderBank('mansion'), basement: placeholderBank('basement'), garden: placeholderBank('garden') } as const;

function bankOf(floor: number): TemplateBank {
  return BANKS[floorConfig(floor).ambient];
}

/** Every plan of `SEEDS` seeds and the three floors, once. */
const PLANS: FloorPlan[] = [];
for (let seed = 1; seed <= SEEDS; seed++) for (let floor = 1; floor <= FLOORS; floor++) PLANS.push(generateFloor(seed, floor, bankOf(floor)));

function count(plan: FloorPlan, type: RoomType): number {
  return plan.rooms.filter((r) => r.type === type).length;
}

function adjacent(a: Cell, b: Cell): boolean {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
}

/** Rooms reached from the start over the doors; with `throughKeyed` off, a keyed room is an end, not a way. */
function reachable(plan: FloorPlan, throughKeyed: boolean): Set<number> {
  const seen = new Set<number>([plan.start]);
  const queue = [plan.start];
  while (queue.length > 0) {
    const i = queue.shift() as number;
    const room = plan.rooms[i] as Room;
    if (i !== plan.start && !throughKeyed && KEYED_ROOM_TYPES.includes(room.type)) continue;
    for (const d of room.doors) {
      if (!seen.has(d.room)) {
        seen.add(d.room);
        queue.push(d.room);
      }
    }
  }
  return seen;
}

/** The grid as it was before the arena grew: every room's cell but the arena's three extra ones. */
function grownCells(plan: FloorPlan): Set<string> {
  const boss = plan.rooms[plan.boss] as Room;
  const door = boss.doors[0]?.cell as Cell;
  const cells = new Set<string>();
  plan.rooms.forEach((r, i) => {
    if (i === plan.boss) cells.add(`${door.x},${door.y}`);
    else for (const c of r.cells) cells.add(`${c.x},${c.y}`);
  });
  return cells;
}

/** Whether a 2×2 block with `seed` in it had room in the grown grid. */
function arenaFits(plan: FloorPlan, grown: Set<string>, seed: Cell): boolean {
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      let ok = true;
      for (let y = 0; y < 2 && ok; y++) {
        for (let x = 0; x < 2; x++) {
          const c = { x: seed.x + dx + x, y: seed.y + dy + y };
          const own = c.x === seed.x && c.y === seed.y;
          if (c.x < 0 || c.y < 0 || c.x >= plan.width || c.y >= plan.height || (!own && grown.has(`${c.x},${c.y}`))) {
            ok = false;
            break;
          }
        }
      }
      if (ok) return true;
    }
  }
  return false;
}

describe('generateFloor (spec 09 §3.1), over 1000 seeds and the 3 floors', () => {
  it('has the exact number of rooms of each type', () => {
    for (const plan of PLANS) {
      const enemyRooms = floorConfig(plan.floor).enemyRooms;
      expect(count(plan, 'start')).toBe(1);
      expect(count(plan, 'boss')).toBe(1);
      expect(count(plan, 'treasure')).toBe(1);
      expect(count(plan, 'hand')).toBe(1);
      expect(count(plan, 'elite')).toBe(1);
      expect(count(plan, 'combat')).toBe(enemyRooms - 1);
      expect([0, 1]).toContain(count(plan, 'challenge'));
    }
    // The challenge room comes 60 % of the time: not always, not never.
    const withChallenge = PLANS.filter((p) => count(p, 'challenge') === 1).length / PLANS.length;
    expect(withChallenge).toBeGreaterThan(0.5);
    expect(withChallenge).toBeLessThan(0.7);
  });

  it('connects every room with the start, with doors that match on both sides', () => {
    for (const plan of PLANS) {
      expect(reachable(plan, true).size).toBe(plan.rooms.length);
      plan.rooms.forEach((room, i) => {
        for (const d of room.doors) {
          const other = plan.rooms[d.room] as Room;
          const back = other.doors.find((o) => o.room === i);
          expect(back?.side).toBe(OPPOSITE[d.side]);
          expect(adjacent(d.cell, back?.cell as Cell)).toBe(true);
          expect(room.cells).toContainEqual(d.cell);
        }
      });
    }
  });

  it('lays every cell inside the grid, each one with one room, the start in the middle', () => {
    for (const plan of PLANS) {
      expect(plan.width).toBe(DUNGEON.grid.width);
      expect(plan.height).toBe(DUNGEON.grid.height);
      const seen = new Set<string>();
      plan.rooms.forEach((room, i) => {
        for (const c of room.cells) {
          expect(c.x).toBeGreaterThanOrEqual(0);
          expect(c.y).toBeGreaterThanOrEqual(0);
          expect(c.x).toBeLessThan(plan.width);
          expect(c.y).toBeLessThan(plan.height);
          expect(seen.has(`${c.x},${c.y}`)).toBe(false);
          seen.add(`${c.x},${c.y}`);
          expect(roomAt(plan, c)).toBe(i);
        }
      });
      expect(plan.cellRoom.filter((r) => r !== -1)).toHaveLength(seen.size);
      expect((plan.rooms[plan.start] as Room).cells[0]).toEqual({ x: 4, y: 3 });
    }
  });

  it('puts the boss in the farthest dead end with room for its 2×2 arena, away from the start', () => {
    for (const plan of PLANS) {
      const boss = plan.rooms[plan.boss] as Room;
      expect(boss.type).toBe('boss');
      expect(boss.cells).toHaveLength(4);
      const [tl] = boss.cells as [Cell];
      expect(boss.cells).toEqual([tl, { x: tl.x + 1, y: tl.y }, { x: tl.x, y: tl.y + 1 }, { x: tl.x + 1, y: tl.y + 1 }]);
      expect(boss.doors).toHaveLength(1);
      const start = (plan.rooms[plan.start] as Room).cells[0] as Cell;
      for (const c of boss.cells) expect(adjacent(c, start)).toBe(false);
      expect(boss.depth).toBeGreaterThanOrEqual(DUNGEON.minBossDepth);
      // No dead end farther away had room for the arena.
      const grown = grownCells(plan);
      for (const room of plan.rooms) {
        if (room.type === 'start' || room.type === 'boss' || room.doors.length !== 1) continue;
        if (room.depth > boss.depth) expect(arenaFits(plan, grown, room.cells[0] as Cell)).toBe(false);
      }
    }
  });

  it('keeps the treasure, the hand and the challenge in dead ends, and the elite as the farthest enemy room', () => {
    for (const plan of PLANS) {
      for (const room of plan.rooms) if (room.type === 'treasure' || room.type === 'hand' || room.type === 'challenge') expect(room.doors).toHaveLength(1);
      const elite = plan.rooms.find((r) => r.type === 'elite') as Room;
      for (const room of plan.rooms) if (room.type === 'combat') expect(room.depth).toBeLessThanOrEqual(elite.depth);
    }
  });

  it('reaches the elite without passing a keyed door', () => {
    for (const plan of PLANS) {
      const elite = plan.rooms.findIndex((r) => r.type === 'elite');
      expect(reachable(plan, false).has(elite)).toBe(true);
    }
  });

  it('draws the templates from the bank without repeating while others remain, with the floor\'s difficulties', () => {
    for (const plan of PLANS) {
      const bank = bankOf(plan.floor);
      const allowed = floorDifficulties(plan.floor);
      const byType = new Map<RoomType, string[]>();
      for (const room of plan.rooms) {
        expect(room.template.startsWith(`${plan.ambient}/${room.type}_`)).toBe(true);
        byType.set(room.type, [...(byType.get(room.type) ?? []), room.template]);
        if (room.type === 'combat' || room.type === 'elite' || room.type === 'challenge') expect(allowed).toContain(room.difficulty);
        else expect(room.difficulty).toBeNull();
      }
      for (const [type, ids] of byType) {
        const distinct = new Set(ids).size;
        // A repeat only once every template of the type was used.
        expect(distinct).toBe(Math.min(ids.length, bank[type].length));
      }
    }
    const mirrored = PLANS.flatMap((p) => p.rooms).filter((r) => r.mirrored).length / PLANS.flatMap((p) => p.rooms).length;
    expect(mirrored).toBeGreaterThan(0.4);
    expect(mirrored).toBeLessThan(0.6);
  });

  it('gives the same plan for the same seed, and other plans for other seeds', () => {
    for (let seed = 1; seed <= 20; seed++) expect(generateFloor(seed, 2, bankOf(2))).toEqual(generateFloor(seed, 2, bankOf(2)));
    const shapes = new Set(PLANS.filter((p) => p.floor === 1).map((p) => p.cellRoom.map((r) => (r === -1 ? '.' : (p.rooms[r] as Room).type[0])).join('')));
    expect(shapes.size).toBeGreaterThan(SEEDS * 0.95);
    expect(subSeed(7, 1)).not.toBe(subSeed(7, 2));
    expect(subSeed(7, 1)).toBe(subSeed(7, 1));
  });

  it('does not let what happens on a floor change the next one', () => {
    const run = createRunState(42, BANKS.mansion);
    expect(run.floor).toBe(1);
    expect(run.room).toBe(run.plan.start);
    expect(run.visited.filter(Boolean)).toHaveLength(1);
    // The run went on: keys, rooms, a dirty match RNG… the second floor is the one its seed says.
    const busy = { ...run, keys: 3, roomsCleared: 6, merchantCounter: 1, kills: 50, upgrades: ['vitality'], bossKey: true };
    const next = descend(busy, BANKS.basement);
    expect(next.plan).toEqual(generateFloor(42, 2, BANKS.basement));
    expect(next.plan.ambient).toBe('basement');
    expect(next).toMatchObject({ floor: 2, keys: 3, roomsCleared: 6, merchantCounter: 1, kills: 50, upgrades: ['vitality'], bossKey: false });
    expect(next.room).toBe(next.plan.start);
  });

  it('draws the plan as text, one cell per room', () => {
    const plan = generateFloor(3, 1, BANKS.mansion);
    const text = planToText(plan);
    const letters = (text.match(/\[[A-Z]\]/g) ?? []).map((m) => m[1]);
    expect(letters.filter((l) => l === 'S')).toHaveLength(1);
    expect(letters.filter((l) => l === 'B')).toHaveLength(4);
    expect(letters.filter((l) => l === 'C')).toHaveLength(count(plan, 'combat'));
    expect(text).toMatch(/K/);
    expect(text).toMatch(/k/);
    expect(text.split('\n')).toHaveLength(plan.height * 2 - 1);
  });

  it('scales the endless floors: the ambients rotate and the life grows', () => {
    expect(floorConfig(4)).toMatchObject({ ambient: 'mansion', enemyRooms: 10, bossHp: 75, zombieHp: 4 });
    expect(floorConfig(6).ambient).toBe('garden');
    expect(floorConfig(6).bossHp).toBe(Math.round(180 * 1.25 ** 3));
    const plan = generateFloor(5, 5, BANKS.basement);
    expect(count(plan, 'combat')).toBe(9);
  });

  it('never grows into a block: no cell touches more than one room before the arena', () => {
    for (const plan of PLANS.slice(0, 300)) {
      const grown = grownCells(plan);
      for (const key of grown) {
        const [x, y] = key.split(',').map(Number) as [number, number];
        const neighbours = SIDES.filter((side) => {
          const c = { x: x + (side === 'e' ? 1 : side === 'w' ? -1 : 0), y: y + (side === 's' ? 1 : side === 'n' ? -1 : 0) };
          return grown.has(`${c.x},${c.y}`);
        }).length;
        // A tree: every cell's occupied neighbours are its doors.
        const room = plan.rooms[roomAt(plan, { x, y })] as Room;
        expect(neighbours).toBe(room.doors.filter((d) => d.cell.x === x && d.cell.y === y).length);
      }
    }
  });
});
