import { describe, expect, it } from 'vitest';
import { BOSS_SCHEDULE } from '../../config/bosses';
import { DUNGEON, FLOORS, floorConfig } from '../../config/dungeon';
import type { GameEvents } from '../../core/EventBus';
import { dungeonContext } from '../../test/dungeonFixtures';
import { damageBoss } from '../systems/BossCombat';
import { isZombieAlive } from '../systems/Combat';
import { debugCallWizard, debugClearRoom, debugDescend, debugGiveKey, debugGoToBoss, debugRevealMap, roomAt, roomDoors } from '../systems/DungeonSystem';
import type { SimContext } from '../systems/SimContext';
import { stepSimulation } from '../systems/Simulation';

const DT = 1 / 60;

function steps(ctx: SimContext, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepSimulation(ctx, DT);
}

describe('the endless floors (spec 09 §12)', () => {
  it('rotate the ambients, keep ten enemy rooms and grow life and bosses by a quarter per floor', () => {
    expect(floorConfig(4).ambient).toBe('mansion');
    expect(floorConfig(5).ambient).toBe('basement');
    expect(floorConfig(6).ambient).toBe('garden');
    expect(floorConfig(7).ambient).toBe('mansion');
    for (let n = FLOORS + 1; n <= FLOORS + 4; n++) {
      const c = floorConfig(n);
      const base = floorConfig((n - 1) % FLOORS + 1);
      expect(c.enemyRooms).toBe(DUNGEON.endless.enemyRooms);
      expect(c.zombieHp).toBe(Math.round(base.zombieHp * DUNGEON.endless.scalePerFloor ** (n - FLOORS)));
      expect(c.bossHp).toBe(Math.round(base.bossHp * DUNGEON.endless.scalePerFloor ** (n - FLOORS)));
    }
  });

  it('run through the calendar of boss rounds, pairs included; the first three floors keep their one boss', () => {
    for (let n = 1; n <= FLOORS; n++) expect(floorConfig(n).bosses).toEqual([{ boss: floorConfig(n).boss, variant: floorConfig(n).variant }]);
    const rounds = BOSS_SCHEDULE.rounds;
    for (let k = 0; k < rounds.length + 2; k++) {
      const c = floorConfig(FLOORS + 1 + k);
      const entry = rounds[k % rounds.length] as (typeof rounds)[number];
      expect(c.bosses).toEqual(entry.bosses);
      expect(c.boss).toBe(entry.bosses[0].boss);
      expect(c.variant).toBe(entry.bosses[0].variant);
    }
    expect(floorConfig(FLOORS + 3).bosses).toHaveLength(2);
  });

  it('drops a pair of bosses on the arena\'s two spots, and the trapdoor needs both dead', () => {
    const floor = FLOORS + 3;
    const ctx = dungeonContext(5, floor);
    const run = ctx.state.run!;
    const p = ctx.state.players[0]!;
    steps(ctx, 0.1);
    debugGoToBoss(ctx);
    expect(roomAt(ctx, p.x, p.y)).toBe(run.plan.boss);
    stepSimulation(ctx, DT);
    expect(run.fight).toMatchObject({ boss: true });
    steps(ctx, DUNGEON.boss.fallDelay + DUNGEON.boss.shadow + 1);
    const bosses = ctx.state.bosses.filter((b) => b.active);
    expect(bosses).toHaveLength(2);
    expect(bosses.map((b) => b.variant)).toEqual(floorConfig(floor).bosses.map((b) => b.variant));
    expect(new Set(bosses.map((b) => Math.round(b.x))).size).toBe(2);
    for (const b of bosses) expect(b.maxHp).toBe(floorConfig(floor).bossHp);
    // One down: the fight goes on.
    while (bosses[0]!.phase !== 'dead') {
      damageBoss(ctx, bosses[0]!, 1e9, 0);
      stepSimulation(ctx, DT);
    }
    steps(ctx, 0.1);
    expect(run.fight).not.toBeNull();
    expect(run.trapdoor).toBeNull();
    while (bosses[1]!.phase !== 'dead') {
      damageBoss(ctx, bosses[1]!, 1e9, 0);
      stepSimulation(ctx, DT);
    }
    steps(ctx, 0.1);
    expect(run.fight).toBeNull();
    expect(run.trapdoor).not.toBeNull();
    // Past the third floor nothing is won: the trapdoor goes on down.
    expect(run.outcome).toBe('playing');
  });
});

describe('the debug panel\'s dungeon buttons (spec 09 §13)', () => {
  it('reveals the map, gives keys, clears the room, calls the wizard and goes down', () => {
    const ctx = dungeonContext(1);
    const run = ctx.state.run!;
    const rooms: GameEvents['dungeon:rooms'][] = [];
    const descents: GameEvents['dungeon:descend'][] = [];
    ctx.events.on('dungeon:rooms', (e) => rooms.push(e));
    ctx.events.on('dungeon:descend', (e) => descents.push(e));
    steps(ctx, 0.1);
    debugRevealMap(ctx);
    expect(run.visited.every(Boolean)).toBe(true);
    expect(rooms.at(-1)?.visited.every(Boolean)).toBe(true);
    debugGiveKey(ctx, false);
    debugGiveKey(ctx, true);
    expect(run.keys).toBe(1);
    expect(run.bossKey).toBe(true);
    expect(rooms.at(-1)).toMatchObject({ keys: 1, bossKey: true });
    // The wizard, here and now.
    debugCallWizard(ctx);
    expect(run.shop?.room).toBe(run.room);
    expect(ctx.state.merchants[run.shop!.merchant]!.active).toBe(true);
    // In the arena: its doors open, the fight starts, LIMPIAR SALA ends it.
    debugGoToBoss(ctx);
    for (const i of roomDoors(ctx, run.plan.boss)) expect(run.doorsUnlocked[i]).toBe(true);
    stepSimulation(ctx, DT);
    steps(ctx, DUNGEON.boss.fallDelay + DUNGEON.boss.shadow + 1);
    expect(ctx.state.bosses.some((b) => b.active)).toBe(true);
    debugClearRoom(ctx);
    steps(ctx, 0.2);
    expect(run.fight).toBeNull();
    expect(run.cleared[run.plan.boss]).toBe(true);
    expect(ctx.state.zombies.some(isZombieAlive)).toBe(false);
    debugDescend(ctx);
    expect(run.descending).toBe(true);
    expect(descents).toEqual([{ floor: 1 }]);
  });
});
