import { describe, expect, it } from 'vitest';
import { DUNGEON, ENEMY_ROOM_TYPES } from '../../config/dungeon';
import type { GameEvents } from '../../core/EventBus';
import type { Room } from '../../core/RunState';
import { createTestContext } from '../../test/fixtures';
import { dungeonContext } from '../../test/dungeonFixtures';
import { damageZombie, isZombieAlive } from './Combat';
import { composeWave, dungeonMusic, insideRoom, roomAt, roomBudget, roomDoors } from './DungeonSystem';
import type { SimContext } from './SimContext';
import { stepSimulation } from './Simulation';

const DT = 1 / 60;

function steps(ctx: SimContext, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepSimulation(ctx, DT);
}

function alive(ctx: SimContext): number {
  return ctx.state.zombies.filter(isZombieAlive).length;
}

/** The first combat room next to the start, and a tile well inside it. */
function nextRoom(ctx: SimContext): { room: number; x: number; y: number } {
  const run = ctx.state.run!;
  const start = run.plan.rooms[run.plan.start] as Room;
  const room = start.doors.map((d) => d.room).find((r) => ENEMY_ROOM_TYPES.includes((run.plan.rooms[r] as Room).type));
  if (room === undefined) throw new Error('la semilla no tiene sala de combate junto al inicio');
  const zone = ctx.map.zones[room]!;
  return { room, x: zone.x + zone.width / 2, y: zone.y + zone.height / 2 };
}

function teleport(ctx: SimContext, x: number, y: number): void {
  const p = ctx.state.players[0]!;
  p.x = p.prevX = x;
  p.y = p.prevY = y;
}

describe('DungeonSystem (spec 09 §4)', () => {
  it('announces the floor and lifts the darkness of the start room; nothing of Survival runs', () => {
    const ctx = dungeonContext(1);
    const floors: GameEvents['dungeon:floor'][] = [];
    const rooms: GameEvents['dungeon:rooms'][] = [];
    ctx.events.on('dungeon:floor', (e) => floors.push(e));
    ctx.events.on('dungeon:rooms', (e) => rooms.push(e));
    ctx.events.on('round:changed', () => {
      throw new Error('el cartel de ronda es de Supervivencia');
    });
    steps(ctx, 2);
    expect(floors).toHaveLength(1);
    expect(floors[0]?.rooms).toHaveLength(ctx.state.run!.plan.rooms.length);
    expect(rooms[0]?.current).toBe(ctx.state.run!.plan.start);
    expect(ctx.state.zonesUnlocked.filter(Boolean)).toHaveLength(1);
    expect(alive(ctx)).toBe(0);
    expect(ctx.state.wave.round).toBe(1);
    expect(dungeonMusic(ctx.state.run!)).toBe('calm');
  });

  it('shuts the doors a tile inside a room with enemies, warns, then spawns the wave four tiles or more from the player', () => {
    const ctx = dungeonContext(1);
    const { room, x, y } = nextRoom(ctx);
    const locked: number[] = [];
    const warnings: GameEvents['dungeon:spawnWarning'][] = [];
    ctx.events.on('dungeon:roomLocked', (e) => locked.push(e.room));
    ctx.events.on('dungeon:spawnWarning', (e) => warnings.push(e));
    steps(ctx, 0.1);
    // In the doorway nothing happens.
    const door = ctx.map.doors[roomDoors(ctx, room)[0]!]!;
    const inward = door.axis === 'horizontal' ? { x: door.center.x, y: door.center.y + (door.toZoneIndex === room ? 1 : -1) * ctx.map.tileSize } : { x: door.center.x + (door.toZoneIndex === room ? 1 : -1) * ctx.map.tileSize, y: door.center.y };
    teleport(ctx, inward.x, inward.y);
    steps(ctx, 0.1);
    expect(insideRoom(ctx, ctx.state.players[0]!, room)).toBe(false);
    expect(ctx.state.run!.fight).toBeNull();
    // A tile inside: the doors shut, the warning starts, the room is visited and lit.
    teleport(ctx, x, y);
    stepSimulation(ctx, DT);
    expect(roomAt(ctx, x, y)).toBe(room);
    expect(ctx.state.run!.room).toBe(room);
    expect(ctx.state.zonesUnlocked[room]).toBe(true);
    expect(locked).toEqual([room]);
    for (const i of roomDoors(ctx, room)) expect(ctx.state.doorsOpen[i]).toBe(false);
    const fight = ctx.state.run!.fight!;
    expect(fight.phase).toBe('warning');
    expect(fight.pending.length).toBeGreaterThan(0);
    expect(warnings[0]?.points).toHaveLength(fight.pending.length);
    expect(dungeonMusic(ctx.state.run!)).toBe('round');
    const expected = fight.pending.length;
    steps(ctx, DUNGEON.fight.spawnWarning + DT);
    expect(fight.phase).toBe('fighting');
    expect(alive(ctx)).toBe(expected);
    const clear = DUNGEON.room.spawnClearTiles * ctx.map.tileSize;
    for (const z of ctx.state.zombies) {
      if (!isZombieAlive(z)) continue;
      expect(Math.hypot(z.x - x, z.y - y)).toBeGreaterThanOrEqual(clear - DUNGEON.fight.spawnJitter * 2);
      expect(roomAt(ctx, z.x, z.y)).toBe(room);
      expect(z.ai).toBe('chasing');
      expect(z.maxHp).toBe(DUNGEON.floors[0].zombieHp);
    }
  });

  it('brings the second wave with two enemies left, and opens the doors with the last one dead', () => {
    const ctx = dungeonContext(1);
    const { room, x, y } = nextRoom(ctx);
    const cleared: GameEvents['dungeon:roomCleared'][] = [];
    ctx.events.on('dungeon:roomCleared', (e) => cleared.push(e));
    steps(ctx, 0.1);
    teleport(ctx, x, y);
    stepSimulation(ctx, DT);
    const fight = ctx.state.run!.fight!;
    // Whatever the room drew, make it a two-wave fight.
    fight.later = ['walker', 'runner'];
    fight.waves = 2;
    steps(ctx, DUNGEON.fight.spawnWarning + DT);
    const first = alive(ctx);
    // Kill all but two: the second wave is announced.
    let left = first;
    for (const z of ctx.state.zombies) {
      if (!isZombieAlive(z) || left <= DUNGEON.fight.secondWaveAt) continue;
      damageZombie(ctx, z, 1e9, 0);
      left--;
    }
    stepSimulation(ctx, DT);
    expect(fight.wave).toBe(2);
    expect(fight.phase).toBe('warning');
    expect(fight.later).toEqual([]);
    steps(ctx, DUNGEON.fight.spawnWarning + DT);
    expect(alive(ctx)).toBe(DUNGEON.fight.secondWaveAt + 2);
    for (const i of roomDoors(ctx, room)) expect(ctx.state.doorsOpen[i]).toBe(false);
    // The last one: the room is clear, the doors open, the wizard's counter moves.
    for (const z of ctx.state.zombies) if (isZombieAlive(z)) damageZombie(ctx, z, 1e9, 0);
    stepSimulation(ctx, DT);
    const run = ctx.state.run!;
    expect(run.fight).toBeNull();
    expect(run.cleared[room]).toBe(true);
    for (const i of roomDoors(ctx, room)) expect(ctx.state.doorsOpen[i]).toBe(true);
    expect(run).toMatchObject({ roomsCleared: 1, merchantCounter: 1, kills: first + 2 });
    expect(cleared).toEqual([{ room, counter: 1 }]);
    // Back in, nothing starts again.
    steps(ctx, 0.5);
    expect(run.fight).toBeNull();
  });

  it('ends the match when the player dies, as the rounds would', () => {
    const ctx = dungeonContext(2);
    const over: GameEvents['game:over'][] = [];
    ctx.events.on('game:over', (e) => over.push(e));
    steps(ctx, 0.1);
    ctx.state.players[0]!.hp = 0;
    stepSimulation(ctx, DT);
    expect(ctx.state.wave.phase).toBe('over');
    expect(over).toEqual([{ round: 1, score: 0 }]);
  });

  it('spends each room\'s budget on the kinds its floor allows', () => {
    const ctx = dungeonContext(3);
    const combat = ctx.state.run!.plan.rooms.find((r) => r.type === 'combat' && r.difficulty === 'easy');
    const elite = ctx.state.run!.plan.rooms.find((r) => r.type === 'elite') as Room;
    if (combat) expect(roomBudget(combat, 1)).toBe(DUNGEON.budget.easy[0]);
    expect(roomBudget(elite, 1)).toBe(DUNGEON.budget.hard[0]);
    expect(roomBudget(elite, 3)).toBe(DUNGEON.budget.hard[2]);
    // Past the third floor the third floor's budget grows (§12).
    expect(roomBudget(elite, 4)).toBe(Math.round(DUNGEON.budget.hard[2] * DUNGEON.endless.scalePerFloor));
    for (let i = 0; i < 20; i++) {
      const wave = composeWave(ctx, 9, 1);
      const cost = wave.reduce((n, k) => n + DUNGEON.enemies[k].cost, 0);
      expect(cost).toBeLessThanOrEqual(9);
      expect(cost).toBeGreaterThanOrEqual(8);
      expect(wave).not.toContain('sprinter');
    }
    expect(Array.from({ length: 40 }, () => composeWave(ctx, 12, 2)).some((w) => w.includes('sprinter'))).toBe(true);
  });

  it('does nothing in Survival', () => {
    const ctx = createTestContext();
    ctx.events.on('dungeon:floor', () => {
      throw new Error('la mazmorra no corre en Supervivencia');
    });
    steps(ctx, 0.5);
    expect(ctx.state.run).toBeNull();
    expect(ctx.state.mode).toBe('survival');
  });
});
