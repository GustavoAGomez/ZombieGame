import { describe, expect, it } from 'vitest';
import { DUNGEON, ENEMY_ROOM_TYPES, FLOORS, floorConfig } from '../../config/dungeon';
import type { GameEvents } from '../../core/EventBus';
import type { Room } from '../../core/RunState';
import { createTestContext } from '../../test/fixtures';
import { dungeonContext } from '../../test/dungeonFixtures';
import { damageZombie, isZombieAlive } from './Combat';
import { composeWave, dungeonMusic, dungeonOffer, insideRoom, roomAt, roomBudget, roomDoors, tapDungeon } from './DungeonSystem';
import { damageBoss } from './BossCombat';
import { spawnPickup } from './PickupSystem';
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
    fight.later = [
      { kind: 'walker', elite: false },
      { kind: 'runner', elite: false },
    ];
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

  it('opens the normal doors at the start and keeps the treasure\'s and the arena\'s shut until their keys', () => {
    const ctx = dungeonContext(1);
    steps(ctx, 0.1);
    const run = ctx.state.run!;
    ctx.map.doors.forEach((_, i) => {
      const kind = run.doorKinds[i];
      expect(ctx.state.doorsOpen[i]).toBe(kind === 'normal' || kind === 'challenge');
    });
    const keyDoor = run.doorKinds.indexOf('key');
    const bossDoor = run.doorKinds.indexOf('boss');
    expect(keyDoor).toBeGreaterThanOrEqual(0);
    expect(bossDoor).toBeGreaterThanOrEqual(0);
    const p = ctx.state.players[0]!;
    // At the treasure's door with no key: the button says so; with one, it opens and the key is spent.
    const d = ctx.map.doors[keyDoor]!;
    teleport(ctx, d.center.x, d.center.y + ctx.map.tileSize);
    expect(dungeonOffer(ctx.map, ctx.state, p)).toMatchObject({ action: 'needKey', enabled: false });
    run.keys = 1;
    const offer = dungeonOffer(ctx.map, ctx.state, p)!;
    expect(offer).toMatchObject({ action: 'door', target: keyDoor, enabled: true });
    tapDungeon(ctx, p, offer);
    expect(run.keys).toBe(0);
    expect(run.doorsUnlocked[keyDoor]).toBe(true);
    expect(ctx.state.doorsOpen[keyDoor]).toBe(true);
    // The arena's asks for the boss's key.
    const b = ctx.map.doors[bossDoor]!;
    teleport(ctx, b.center.x, b.center.y);
    expect(dungeonOffer(ctx.map, ctx.state, p)).toMatchObject({ action: 'needBossKey', enabled: false });
    run.bossKey = true;
    tapDungeon(ctx, p, dungeonOffer(ctx.map, ctx.state, p)!);
    expect(run.bossKey).toBe(false);
    expect(ctx.state.doorsOpen[bossDoor]).toBe(true);
  });

  it('pays a cleared room, leaves a key or a locked chest or builds up the pity, and the elite room drops the boss key', () => {
    const ctx = dungeonContext(1);
    const run = ctx.state.run!;
    const elite = run.plan.rooms.findIndex((r) => r.type === 'elite');
    const zone = ctx.map.zones[elite]!;
    const gains: GameEvents['points:gained'][] = [];
    ctx.events.on('points:gained', (e) => gains.push(e));
    steps(ctx, 0.1);
    teleport(ctx, zone.x + zone.width / 2, zone.y + zone.height / 2);
    stepSimulation(ctx, DT);
    const fight = run.fight!;
    fight.later = [];
    steps(ctx, DUNGEON.fight.spawnWarning + DT);
    // Two elites among them, with their life.
    const elites = ctx.state.zombies.filter((z) => isZombieAlive(z) && z.elite);
    expect(elites).toHaveLength(DUNGEON.elite.perRoom);
    for (const z of elites) expect(z.maxHp).toBe(Math.round(DUNGEON.floors[0].zombieHp * DUNGEON.elite.hp));
    const money = ctx.state.players[0]!.money;
    for (const z of ctx.state.zombies) if (isZombieAlive(z)) damageZombie(ctx, z, 1e9, 0);
    // An elite's kill pays triple, every other kill its 10$; the hits nothing.
    const kills = gains.filter((g) => g.reason === 'kill');
    expect(kills.filter((g) => g.amount === DUNGEON.loot.kill * DUNGEON.loot.eliteMoney)).toHaveLength(DUNGEON.elite.perRoom);
    expect(gains.some((g) => g.reason === 'hit')).toBe(false);
    stepSimulation(ctx, DT);
    expect(gains.find((g) => g.reason === 'room')?.amount).toBe(DUNGEON.loot.roomClear);
    expect(ctx.state.players[0]!.money).toBeGreaterThan(money);
    const keyDropped = ctx.state.pickups.some((k) => k.active && k.kind === 'key');
    const chest = run.chests.some((c) => c.kind === 'locked' && c.room === elite);
    expect(keyDropped || chest || run.pity === DUNGEON.loot.pityStep).toBe(true);
    expect(ctx.state.pickups.some((k) => k.active && k.kind === 'boss_key')).toBe(true);
  });

  it('picks keys up by walking over them, and they never fade', () => {
    const ctx = dungeonContext(2);
    const p = ctx.state.players[0]!;
    steps(ctx, 0.1);
    const key = spawnPickup(ctx, 'key', p.x + 200, p.y)!;
    const bossKey = spawnPickup(ctx, 'boss_key', p.x + 220, p.y)!;
    steps(ctx, 20);
    expect(key.active).toBe(true);
    expect(key.age).toBe(0);
    // The HUD hears of each key as it is picked up, in the same room.
    const rooms: GameEvents['dungeon:rooms'][] = [];
    ctx.events.on('dungeon:rooms', (e) => rooms.push(e));
    teleport(ctx, key.x, key.y);
    stepSimulation(ctx, DT);
    expect(rooms.at(-1)).toMatchObject({ keys: 1, bossKey: false });
    teleport(ctx, bossKey.x, bossKey.y);
    stepSimulation(ctx, DT);
    expect(rooms.at(-1)).toMatchObject({ keys: 1, bossKey: true });
    expect(ctx.state.run!.keys).toBe(1);
    expect(ctx.state.run!.bossKey).toBe(true);
    expect(key.active).toBe(false);
  });

  it('the treasure: its chest gives money and a medkit, its case a basic weapon the player lacks', () => {
    const ctx = dungeonContext(1);
    const run = ctx.state.run!;
    const p = ctx.state.players[0]!;
    steps(ctx, 0.1);
    const treasure = run.plan.rooms.findIndex((r) => r.type === 'treasure');
    const chests = run.chests.filter((c) => c.room === treasure);
    expect(chests.map((c) => c.kind)).toEqual(['open', 'weapon']);
    expect(['smg', 'shotgun']).toContain(chests[1]!.weapon);
    const money = p.money;
    teleport(ctx, chests[0]!.x, chests[0]!.y);
    const offer = dungeonOffer(ctx.map, ctx.state, p)!;
    expect(offer.action).toBe('chest');
    tapDungeon(ctx, p, offer);
    expect(p.money).toBe(money + DUNGEON.chest.open);
    expect(chests[0]!.opened).toBe(true);
    expect(ctx.state.pickups.some((k) => k.active && k.kind === 'health')).toBe(true);
    expect(run.treasureOpened).toBe(true);
    teleport(ctx, chests[1]!.x, chests[1]!.y);
    const weapon = dungeonOffer(ctx.map, ctx.state, p)!;
    expect(weapon).toMatchObject({ action: 'weapon', weapon: chests[1]!.weapon });
    tapDungeon(ctx, p, weapon);
    expect(p.weapons.some((w) => w.id === chests[1]!.weapon)).toBe(true);
    expect(dungeonOffer(ctx.map, ctx.state, p)).toBeNull();
  });

  it('the arena: the boss falls with the floor\'s life; its death heals, opens the doors and leaves the trapdoor, and wins the last floor', () => {
    const ctx = dungeonContext(5, FLOORS);
    const run = ctx.state.run!;
    const p = ctx.state.players[0]!;
    const trapdoors: GameEvents['dungeon:trapdoor'][] = [];
    ctx.events.on('dungeon:trapdoor', (e) => trapdoors.push(e));
    steps(ctx, 0.1);
    expect(run.plan.ambient).toBe('garden');
    const arena = run.plan.boss;
    // In with the boss's key, through its door.
    const bossDoor = run.doorKinds.indexOf('boss');
    const door = ctx.map.doors[bossDoor]!;
    run.bossKey = true;
    teleport(ctx, door.center.x, door.center.y);
    tapDungeon(ctx, p, dungeonOffer(ctx.map, ctx.state, p)!);
    expect(ctx.state.doorsOpen[bossDoor]).toBe(true);
    const spot = ctx.map.bossSpots.find((s) => s.zoneIndex === arena)!;
    teleport(ctx, spot.x - 160, spot.y);
    stepSimulation(ctx, DT);
    expect(run.fight).toMatchObject({ boss: true, phase: 'warning' });
    for (const i of roomDoors(ctx, arena)) expect(ctx.state.doorsOpen[i]).toBe(false);
    expect(dungeonMusic(run)).toBe('boss');
    steps(ctx, DUNGEON.boss.fallDelay + DT);
    const boss = ctx.state.bosses.find((b) => b.active)!;
    expect(boss).toMatchObject({ phase: 'warning', variant: floorConfig(FLOORS).variant, hp: floorConfig(FLOORS).bossHp, maxHp: floorConfig(FLOORS).bossHp });
    steps(ctx, DUNGEON.boss.shadow + 1);
    expect(boss.phase).not.toBe('warning');
    p.hp = 40;
    const money = p.money;
    while (boss.phase !== 'dead') {
      damageBoss(ctx, boss, 1e9, 0);
      stepSimulation(ctx, DT);
    }
    steps(ctx, 0.1);
    expect(run.fight).toBeNull();
    expect(run.cleared[arena]).toBe(true);
    for (const i of roomDoors(ctx, arena)) expect(ctx.state.doorsOpen[i]).toBe(true);
    expect(p.hp).toBe(40 + DUNGEON.combat.bossHeal);
    // No Survival reward: the money is the hits' nothing.
    expect(p.money).toBe(money);
    expect(run.trapdoor).not.toBeNull();
    expect(run.bossesKilled).toBe(1);
    expect(run.outcome).toBe('won');
    expect(trapdoors).toEqual([{ x: run.trapdoor!.x, y: run.trapdoor!.y, won: true }]);
  });

  it('on an earlier floor the trapdoor takes the player down', () => {
    const ctx = dungeonContext(1);
    const run = ctx.state.run!;
    const p = ctx.state.players[0]!;
    steps(ctx, 0.1);
    run.trapdoor = { x: p.x + 20, y: p.y };
    const offer = dungeonOffer(ctx.map, ctx.state, p)!;
    expect(offer.action).toBe('descend');
    tapDungeon(ctx, p, offer);
    expect(run.descending).toBe(true);
    expect(run.outcome).toBe('playing');
  });
});
