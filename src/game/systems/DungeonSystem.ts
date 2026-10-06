/**
 * The dungeon's rooms (spec 09 §4): which room the player is in, the doors
 * that shut once they are a tile inside a room with enemies, the warning
 * and the waves that follow, the doors that open again with the last kill,
 * and the end of the match. It runs in place of Survival's rounds
 * (Simulation.ts, through the mode's rules); the plan and the templates
 * are in state.run.
 */
import { type ZombieKind } from '../../config/balance';
import type { MusicState } from '../../config/audio';
import { DUNGEON, ENEMY_ROOM_TYPES, FLOORS, floorConfig, type RoomDifficulty } from '../../config/dungeon';
import type { PlayerState, ZombieState } from '../../core/GameState';
import { random } from '../../core/Rng';
import type { Room, RoomFight, RunState } from '../../core/RunState';
import { setDoorBlocking } from '../map/CollisionGrid';
import { isZombieAlive } from './Combat';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { freeZombieSlot } from './SpawnSystem';

export function updateDungeon(ctx: SimContext, dt: number): void {
  const { state, events } = ctx;
  const run = state.run;
  if (!run) return;
  if (!run.announced) announce(ctx, run);
  if (state.wave.phase === 'over') return;
  // Survival's rounds end the match; here the rooms do.
  if (!state.players.some(isPlayerAlive)) {
    state.wave.phase = 'over';
    state.wave.toSpawn = 0;
    events.emit('game:over', { round: run.floor, score: state.players[0]?.score ?? 0 });
    return;
  }
  const p = state.players[0];
  if (!p) return;
  const room = roomAt(ctx, p.x, p.y);
  if (room >= 0 && room !== run.room) enterRoom(ctx, run, room);
  if (run.fight) tickFight(ctx, run, run.fight, dt);
  else if (room >= 0 && canFight(run, room) && insideRoom(ctx, p, room)) startFight(ctx, run, room);
}

/** The music of the moment (§11): the fight, or the calm between rooms. */
export function dungeonMusic(run: RunState): MusicState {
  return run.fight ? 'round' : 'calm';
}

/** The room (zone) under a world point, -1 on a door or a wall. Zones and rooms share their indices (assembleFloor). */
export function roomAt(ctx: SimContext, x: number, y: number): number {
  const { map } = ctx;
  const tx = Math.floor(x / map.tileSize);
  const ty = Math.floor(y / map.tileSize);
  return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height ? (map.cellZone[ty * map.width + tx] ?? -1) : -1;
}

/** The doors of a room, as indices into map.doors. */
export function roomDoors(ctx: SimContext, room: number): number[] {
  return ctx.map.doors.flatMap((d, i) => (d.fromZoneIndex === room || d.toZoneIndex === room ? [i] : []));
}

/**
 * «Una casilla dentro» (§4): the player's tile is the room's and touches
 * none of its door tiles, so the doors never shut on someone still in the
 * doorway.
 */
export function insideRoom(ctx: SimContext, p: PlayerState, room: number): boolean {
  if (roomAt(ctx, p.x, p.y) !== room) return false;
  const ts = ctx.map.tileSize;
  const tx = Math.floor(p.x / ts);
  const ty = Math.floor(p.y / ts);
  for (const i of roomDoors(ctx, room)) {
    for (const t of ctx.map.doors[i]?.tiles ?? []) if (Math.abs(t.x - tx) + Math.abs(t.y - ty) <= 1) return false;
  }
  return true;
}

function canFight(run: RunState, room: number): boolean {
  const def = run.plan.rooms[room];
  return def !== undefined && ENEMY_ROOM_TYPES.includes(def.type) && run.cleared[room] !== true;
}

function announce(ctx: SimContext, run: RunState): void {
  run.announced = true;
  const { plan } = run;
  ctx.events.emit('dungeon:floor', {
    floor: run.floor,
    ambient: plan.ambient,
    width: plan.width,
    height: plan.height,
    rooms: plan.rooms.map((r) => ({ type: r.type, cells: r.cells, neighbours: r.doors.map((d) => d.room) })),
    start: plan.start,
  });
  emitRooms(ctx, run);
}

function emitRooms(ctx: SimContext, run: RunState): void {
  ctx.events.emit('dungeon:rooms', { current: run.room, visited: [...run.visited], cleared: [...run.cleared], counter: run.merchantCounter });
}

/** The player came into a room: it is visited, and its darkness lifts (§4). */
function enterRoom(ctx: SimContext, run: RunState, room: number): void {
  run.room = room;
  if (!run.visited[room]) {
    run.visited[room] = true;
    ctx.state.zonesUnlocked[room] = true;
  }
  emitRooms(ctx, run);
}

function setDoors(ctx: SimContext, room: number, open: boolean): void {
  for (const i of roomDoors(ctx, room)) {
    const door = ctx.map.doors[i];
    if (!door) continue;
    ctx.state.doorsOpen[i] = open;
    setDoorBlocking(ctx.grid, door, !open);
  }
  // The zombies learn the new ways at once.
  ctx.nav.age = Infinity;
}

/** The budget a room's difficulty gives on a floor (§5.2); the endless floors scale it (§12). */
export function roomBudget(def: Room, floor: number): number {
  const difficulty: RoomDifficulty = def.type === 'elite' || def.type === 'challenge' ? 'hard' : (def.difficulty ?? 'medium');
  const table = DUNGEON.budget[difficulty];
  const base = table[Math.min(floor, FLOORS) - 1] as number;
  const scale = floor > FLOORS ? DUNGEON.endless.scalePerFloor ** (floor - FLOORS) : 1;
  return Math.round(base * scale);
}

/** Spends a budget on kinds at random (§5.2), among those the floor allows. */
export function composeWave(ctx: SimContext, budget: number, floor: number): ZombieKind[] {
  const kinds = (Object.keys(DUNGEON.enemies) as ZombieKind[]).filter((k) => DUNGEON.enemies[k].fromFloor <= floor);
  const wave: ZombieKind[] = [];
  let left = budget;
  for (;;) {
    const affordable = kinds.filter((k) => DUNGEON.enemies[k].cost <= left);
    if (affordable.length === 0) break;
    const kind = affordable[Math.floor(random(ctx.state) * affordable.length)] as ZombieKind;
    wave.push(kind);
    left -= DUNGEON.enemies[kind].cost;
  }
  return wave;
}

/**
 * Where a wave appears (§4): the room's points four tiles or more from the
 * player (the farthest ones first; the farthest alone when none is that
 * far), one enemy per point and round again, a little apart.
 */
function pickSpots(ctx: SimContext, room: number, count: number): { x: number; y: number }[] {
  const { map, state } = ctx;
  const p = state.players[0];
  const points = map.enemySpawns.filter((s) => s.zoneIndex === room);
  if (points.length === 0 || !p) return [];
  const clear = DUNGEON.room.spawnClearTiles * map.tileSize;
  const byDistance = [...points].sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y));
  const far = byDistance.filter((s) => Math.hypot(s.x - p.x, s.y - p.y) >= clear);
  const pool = far.length > 0 ? far : byDistance.slice(0, 1);
  const jitter = DUNGEON.fight.spawnJitter;
  return Array.from({ length: count }, (_, i) => {
    const s = pool[i % pool.length] as { x: number; y: number };
    return { x: s.x + (random(state) * 2 - 1) * jitter, y: s.y + (random(state) * 2 - 1) * jitter };
  });
}

/** The warning before a wave (§4): its points are chosen now, a shadow on each. */
function prepareWave(ctx: SimContext, fight: RoomFight, kinds: ZombieKind[]): void {
  fight.phase = 'warning';
  fight.timer = DUNGEON.fight.spawnWarning;
  fight.pending = kinds;
  fight.spots = pickSpots(ctx, fight.room, kinds.length);
  ctx.events.emit('dungeon:spawnWarning', { room: fight.room, points: fight.spots.map((s) => ({ ...s })), seconds: DUNGEON.fight.spawnWarning });
}

function startFight(ctx: SimContext, run: RunState, room: number): void {
  const def = run.plan.rooms[room] as Room;
  setDoors(ctx, room, false);
  ctx.events.emit('dungeon:roomLocked', { room });
  const budget = roomBudget(def, run.floor);
  const difficulty = def.difficulty ?? 'hard';
  // A challenge always comes in two waves (§6.4); a medium or hard room sometimes (§4).
  const twoWaves = def.type === 'challenge' || (difficulty !== 'easy' && random(ctx.state) < DUNGEON.fight.secondWaveChance);
  const second = twoWaves ? Math.round(budget * DUNGEON.fight.secondWaveShare) : 0;
  const fight: RoomFight = { room, phase: 'warning', timer: 0, wave: 1, waves: twoWaves ? 2 : 1, pending: [], spots: [], later: second > 0 ? composeWave(ctx, second, run.floor) : [], spawned: 0 };
  prepareWave(ctx, fight, composeWave(ctx, budget - second, run.floor));
  run.fight = fight;
}

/** A zombie of the dungeon: on its point, chasing from the start (no windows here), with the floor's life (§5.1). */
export function placeDungeonZombie(ctx: SimContext, z: ZombieState, kind: ZombieKind, x: number, y: number, floor: number): void {
  const { state } = ctx;
  const p = state.players[0];
  z.active = true;
  z.kind = kind;
  z.x = z.prevX = x;
  z.y = z.prevY = y;
  z.maxHp = floorConfig(floor).zombieHp;
  z.hp = z.maxHp;
  z.attackCooldown = 0;
  z.stateTick = state.tick;
  z.actionTick = -1;
  z.tearRate = 1;
  z.portalLock = -1;
  z.burn.timer = 0;
  z.burn.perTick = 0;
  z.burn.hellfire = false;
  z.contactScoreTick = -1000;
  z.waveHits = 0;
  z.ai = 'chasing';
  z.entry = -1;
  z.window = -1;
  z.crossOut = false;
  z.timer = 0;
  z.facing = p ? Math.atan2(p.y - y, p.x - x) : 0;
}

function spawnWave(ctx: SimContext, run: RunState, fight: RoomFight): void {
  fight.pending.forEach((kind, i) => {
    const z = freeZombieSlot(ctx);
    const spot = fight.spots[i];
    if (!z || !spot) return;
    placeDungeonZombie(ctx, z, kind, spot.x, spot.y, run.floor);
    fight.spawned++;
  });
  fight.pending = [];
  fight.spots = [];
  fight.phase = 'fighting';
}

function tickFight(ctx: SimContext, run: RunState, fight: RoomFight, dt: number): void {
  if (fight.phase === 'warning') {
    fight.timer -= dt;
    if (fight.timer <= 0) spawnWave(ctx, run, fight);
    return;
  }
  let alive = 0;
  for (const z of ctx.state.zombies) if (isZombieAlive(z)) alive++;
  // The second wave comes with two enemies or fewer left (§4).
  if (fight.later.length > 0 && alive <= DUNGEON.fight.secondWaveAt) {
    fight.wave++;
    prepareWave(ctx, fight, fight.later);
    fight.later = [];
    return;
  }
  if (alive === 0) clearRoom(ctx, run, fight);
}

/** The last enemy fell (§4): the doors open, the room is clear, and it counts towards the wizard (§7.1). */
function clearRoom(ctx: SimContext, run: RunState, fight: RoomFight): void {
  run.cleared[fight.room] = true;
  setDoors(ctx, fight.room, true);
  run.roomsCleared++;
  run.merchantCounter++;
  run.kills += fight.spawned;
  run.fight = null;
  ctx.events.emit('dungeon:roomCleared', { room: fight.room, counter: run.merchantCounter });
  emitRooms(ctx, run);
}
