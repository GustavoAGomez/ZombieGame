/**
 * The dungeon's rooms (spec 09 §4, §5.3, §6): which room the player is in,
 * the doors that shut once they are a tile inside a room with enemies, the
 * warning and the waves that follow, the loot and the doors that open again
 * with the last kill, the keyed doors and the chests, the boss on its arena
 * and the trapdoor it leaves, and the end of the match. It runs in place of
 * Survival's rounds (Simulation.ts, through the mode's rules); the plan and
 * the templates are in state.run.
 */
import type { ZombieKind } from '../../config/balance';
import type { MusicState } from '../../config/audio';
import { DUNGEON, ENEMY_ROOM_TYPES, FLOORS, floorConfig, type RoomDifficulty } from '../../config/dungeon';
import { WEAPONS, type WeaponId } from '../../config/weapons';
import type { GameState, PlayerState, ZombieState } from '../../core/GameState';
import { random } from '../../core/Rng';
import type { DoorKind, DungeonAction, Room, RoomFight, RunState, WaveEntry } from '../../core/RunState';
import { setDoorBlocking } from '../map/CollisionGrid';
import type { MapData } from '../map/MapLoader';
import { nearestWalkable } from './BossRewards';
import { dropBossAt, freeBossSlot } from './BossSystem';
import { isZombieAlive } from './Combat';
import { isPlayerAlive } from './HealthSystem';
import { findWeapon, giveWeapon, refillWeapon } from './InventorySystem';
import { spawnPickup } from './PickupSystem';
import { awardPoints } from './PointsSystem';
import type { SimContext } from './SimContext';
import { freeZombieSlot } from './SpawnSystem';

export function updateDungeon(ctx: SimContext, dt: number): void {
  const { state, events } = ctx;
  const run = state.run;
  if (!run) return;
  if (!run.announced) startFloor(ctx, run);
  if (state.wave.phase === 'over' || run.outcome !== 'playing') return;
  run.time += dt;
  // Survival's rounds end the match; here the rooms do.
  if (!state.players.some(isPlayerAlive)) {
    run.outcome = 'dead';
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

/** The music of the moment (§11): the boss, the fight, or the calm between rooms. */
export function dungeonMusic(run: RunState): MusicState {
  if (!run.fight) return 'calm';
  return run.fight.boss ? 'boss' : 'round';
}

/** The room (zone) under a world point, -1 on a door or a wall. Zones and rooms share their indices (assembleFloor). */
export function roomAt(ctx: { map: MapData }, x: number, y: number): number {
  const { map } = ctx;
  const tx = Math.floor(x / map.tileSize);
  const ty = Math.floor(y / map.tileSize);
  return tx >= 0 && ty >= 0 && tx < map.width && ty < map.height ? (map.cellZone[ty * map.width + tx] ?? -1) : -1;
}

/** The doors of a room, as indices into map.doors. */
export function roomDoors(ctx: { map: MapData }, room: number): number[] {
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
  return def !== undefined && (ENEMY_ROOM_TYPES.includes(def.type) || def.type === 'boss') && run.cleared[room] !== true;
}

/** What a door is (§4.1), from the rooms it joins: the treasure's asks for a key, the arena's for the boss's, the challenge's warns. */
export function doorKindOf(run: RunState, map: MapData, door: number): DoorKind {
  const d = map.doors[door];
  if (!d) return 'normal';
  const types = [run.plan.rooms[d.fromZoneIndex]?.type, run.plan.rooms[d.toZoneIndex]?.type];
  if (types.includes('boss')) return 'boss';
  if (types.includes('treasure')) return 'key';
  if (types.includes('challenge')) return 'challenge';
  return 'normal';
}

/**
 * The floor begins (§4, §6.3): the HUD learns the plan, the doors are set
 * (normal ones open, keyed ones shut until their key), the treasure's
 * chest and case stand in their room.
 */
function startFloor(ctx: SimContext, run: RunState): void {
  const { map, state } = ctx;
  run.announced = true;
  run.doorKinds = map.doors.map((_, i) => doorKindOf(run, map, i));
  run.doorsUnlocked = map.doors.map(() => false);
  map.doors.forEach((door, i) => {
    const open = run.doorKinds[i] === 'normal' || run.doorKinds[i] === 'challenge';
    state.doorsOpen[i] = open;
    setDoorBlocking(ctx.grid, door, !open);
  });
  ctx.nav.age = Infinity;
  run.chests = [];
  run.trapdoor = null;
  const treasure = run.plan.rooms.findIndex((r) => r.type === 'treasure');
  if (treasure >= 0) {
    const spots = map.chestSpots.filter((s) => s.zoneIndex === treasure);
    const [chest, weaponCase] = spots;
    if (chest) run.chests.push({ x: chest.x, y: chest.y, room: treasure, kind: 'open', weapon: null, opened: false });
    if (weaponCase) run.chests.push({ x: weaponCase.x, y: weaponCase.y, room: treasure, kind: 'weapon', weapon: treasureWeapon(ctx), opened: false });
  }
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

/** The treasure's weapon (§6.3): a basic one the player lacks, at random; null with both in hand. */
function treasureWeapon(ctx: SimContext): WeaponId | null {
  const p = ctx.state.players[0];
  const basics = (Object.keys(WEAPONS) as WeaponId[]).filter((id) => WEAPONS[id].category === 'basic' && id !== 'pistol');
  const missing = p ? basics.filter((id) => findWeapon(p, id) < 0) : basics;
  if (missing.length === 0) return null;
  return missing[Math.floor(random(ctx.state) * missing.length)] as WeaponId;
}

function emitRooms(ctx: SimContext, run: RunState): void {
  ctx.events.emit('dungeon:rooms', { current: run.room, visited: [...run.visited], cleared: [...run.cleared], counter: run.merchantCounter, keys: run.keys, bossKey: run.bossKey });
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

function setDoor(ctx: SimContext, index: number, open: boolean): void {
  const door = ctx.map.doors[index];
  if (!door) return;
  ctx.state.doorsOpen[index] = open;
  setDoorBlocking(ctx.grid, door, !open);
  // The zombies learn the new ways at once.
  ctx.nav.age = Infinity;
}

/** A room's doors, all at once; a keyed one still shut by its lock stays shut. */
function setDoors(ctx: SimContext, run: RunState, room: number, open: boolean): void {
  for (const i of roomDoors(ctx, room)) {
    const keyed = run.doorKinds[i] === 'key' || run.doorKinds[i] === 'boss';
    if (open && keyed && !run.doorsUnlocked[i]) continue;
    setDoor(ctx, i, open);
  }
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
function prepareWave(ctx: SimContext, fight: RoomFight, entries: WaveEntry[]): void {
  fight.phase = 'warning';
  fight.timer = DUNGEON.fight.spawnWarning;
  fight.pending = entries;
  fight.spots = pickSpots(ctx, fight.room, entries.length);
  ctx.events.emit('dungeon:spawnWarning', { room: fight.room, points: fight.spots.map((s) => ({ ...s })), seconds: DUNGEON.fight.spawnWarning });
}

function startFight(ctx: SimContext, run: RunState, room: number): void {
  const def = run.plan.rooms[room] as Room;
  setDoors(ctx, run, room, false);
  ctx.events.emit('dungeon:roomLocked', { room });
  if (def.type === 'boss') {
    // The arena (§5.3): the boss falls on its spot once the doors have shut for a moment.
    run.fight = { room, phase: 'warning', timer: DUNGEON.boss.fallDelay, wave: 1, waves: 1, pending: [], spots: [], later: [], spawned: 0, boss: true };
    return;
  }
  const budget = roomBudget(def, run.floor);
  const difficulty = def.difficulty ?? 'hard';
  // A challenge always comes in two waves (§6.4); a medium or hard room sometimes (§4).
  const twoWaves = def.type === 'challenge' || (difficulty !== 'easy' && random(ctx.state) < DUNGEON.fight.secondWaveChance);
  const second = twoWaves ? Math.round(budget * DUNGEON.fight.secondWaveShare) : 0;
  const entries = (kinds: ZombieKind[]): WaveEntry[] => kinds.map((kind) => ({ kind, elite: false }));
  const first = entries(composeWave(ctx, budget - second, run.floor));
  // The elite room (§5.2): its first few enemies are elite.
  if (def.type === 'elite') first.slice(0, DUNGEON.elite.perRoom).forEach((e) => (e.elite = true));
  const fight: RoomFight = { room, phase: 'warning', timer: 0, wave: 1, waves: twoWaves ? 2 : 1, pending: [], spots: [], later: second > 0 ? entries(composeWave(ctx, second, run.floor)) : [], spawned: 0, boss: false };
  prepareWave(ctx, fight, first);
  run.fight = fight;
}

/** A zombie of the dungeon: on its point, chasing from the start (no windows here), with the floor's life (§5.1); an elite's ×2.5 (§5.2). */
export function placeDungeonZombie(ctx: SimContext, z: ZombieState, kind: ZombieKind, x: number, y: number, floor: number, elite = false): void {
  const { state } = ctx;
  const p = state.players[0];
  z.active = true;
  z.kind = kind;
  z.elite = elite;
  z.x = z.prevX = x;
  z.y = z.prevY = y;
  z.maxHp = Math.round(floorConfig(floor).zombieHp * (elite ? DUNGEON.elite.hp : 1));
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
  fight.pending.forEach((entry, i) => {
    const z = freeZombieSlot(ctx);
    const spot = fight.spots[i];
    if (!z || !spot) return;
    placeDungeonZombie(ctx, z, entry.kind, spot.x, spot.y, run.floor, entry.elite);
    fight.spawned++;
  });
  fight.pending = [];
  fight.spots = [];
  fight.phase = 'fighting';
}

/** The boss comes (§5.3): the floor's boss and variant on the arena's spot, with the floor's life. */
function dropBoss(ctx: SimContext, run: RunState, fight: RoomFight): void {
  const config = floorConfig(run.floor);
  const spot = ctx.map.bossSpots.findIndex((s) => s.zoneIndex === fight.room);
  const slot = freeBossSlot(ctx);
  if (spot >= 0 && slot >= 0) dropBossAt(ctx, slot, config.boss, config.variant, spot, DUNGEON.boss.shadow, config.bossHp);
  fight.phase = 'fighting';
  fight.spawned = 1;
}

function tickFight(ctx: SimContext, run: RunState, fight: RoomFight, dt: number): void {
  if (fight.phase === 'warning') {
    fight.timer -= dt;
    if (fight.timer <= 0) {
      if (fight.boss) dropBoss(ctx, run, fight);
      else spawnWave(ctx, run, fight);
    }
    return;
  }
  if (fight.boss) {
    if (!ctx.state.bosses.some((b) => b.active && b.phase !== 'dead')) bossDefeated(ctx, run, fight);
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

/** Where a room's prize lands: its enemy point nearest to its middle (always free floor), or the middle itself. */
function lootSpot(ctx: SimContext, room: number): { x: number; y: number } {
  const zone = ctx.map.zones[room];
  const cx = zone ? zone.x + zone.width / 2 : 0;
  const cy = zone ? zone.y + zone.height / 2 : 0;
  let best: { x: number; y: number } | null = null;
  for (const s of ctx.map.enemySpawns) {
    if (s.zoneIndex !== room) continue;
    if (!best || Math.hypot(s.x - cx, s.y - cy) < Math.hypot(best.x - cx, best.y - cy)) best = { x: s.x, y: s.y };
  }
  return best ?? nearestWalkable(ctx, cx, cy) ?? { x: cx, y: cy };
}

/**
 * The last enemy fell (§4, §6.2): the doors open, the room is clear and
 * counts towards the wizard (§7.1); its money, and a roll for a key or a
 * locked chest, likelier each room without one while no key is in hand and
 * the floor's treasure is shut. The elite room leaves the boss's key (§6.1).
 */
function clearRoom(ctx: SimContext, run: RunState, fight: RoomFight): void {
  const { state } = ctx;
  const room = fight.room;
  const def = run.plan.rooms[room] as Room;
  run.cleared[room] = true;
  setDoors(ctx, run, room, true);
  run.roomsCleared++;
  run.merchantCounter++;
  run.kills += fight.spawned;
  run.fight = null;
  const p = state.players.find(isPlayerAlive) ?? state.players[0];
  const at = lootSpot(ctx, room);
  if (p) awardPoints(ctx, p.id, DUNGEON.loot.roomClear, 'room', at.x, at.y);
  const roll = random(state);
  const keyChance = DUNGEON.loot.keyChance + run.pity;
  if (roll < keyChance) {
    spawnPickup(ctx, 'key', at.x, at.y);
    run.pity = 0;
  } else if (roll < keyChance + DUNGEON.loot.chestChance) {
    run.chests.push({ x: at.x, y: at.y, room, kind: 'locked', weapon: null, opened: false });
    run.pity = 0;
  } else if (run.keys === 0 && !run.treasureOpened) {
    run.pity += DUNGEON.loot.pityStep;
  }
  if (def.type === 'elite') spawnPickup(ctx, 'boss_key', at.x + ctx.map.tileSize / 2, at.y);
  ctx.events.emit('dungeon:roomCleared', { room, counter: run.merchantCounter });
  emitRooms(ctx, run);
}

/** The boss is dead (§5.3): the doors open, the players heal, the trapdoor appears; on the last floor the run is won. */
function bossDefeated(ctx: SimContext, run: RunState, fight: RoomFight): void {
  const { state } = ctx;
  run.cleared[fight.room] = true;
  setDoors(ctx, run, fight.room, true);
  run.bossesKilled++;
  run.kills += fight.spawned;
  run.fight = null;
  for (const p of state.players) if (isPlayerAlive(p)) p.hp = Math.min(p.maxHp, p.hp + DUNGEON.combat.bossHeal);
  const spot = ctx.map.bossSpots.find((s) => s.zoneIndex === fight.room);
  const at = spot ? (nearestWalkable(ctx, spot.x, spot.y) ?? { x: spot.x, y: spot.y }) : lootSpot(ctx, fight.room);
  run.trapdoor = { x: at.x, y: at.y };
  const won = run.floor === FLOORS;
  if (won) run.outcome = 'won';
  ctx.events.emit('dungeon:trapdoor', { x: at.x, y: at.y, won });
  emitRooms(ctx, run);
}

export interface DungeonOffer {
  action: DungeonAction;
  /** A chest's index in run.chests, a door's in map.doors, 0 for the trapdoor. */
  target: number;
  enabled: boolean;
  /** With `weapon`: the treasure case's weapon, or null for ammo and money. */
  weapon?: WeaponId | null;
}

/**
 * What the action button offers in the dungeon (§4.1, §6): the nearest of a
 * chest, the trapdoor, a shut keyed door or the challenge's door within
 * DUNGEON.interactRange px, or null. Pure over the map and the state, for
 * the HUD too.
 */
export function dungeonOffer(map: MapData, state: GameState, p: PlayerState): DungeonOffer | null {
  const run = state.run;
  if (!run || run.outcome !== 'playing') return null;
  const range = DUNGEON.interactRange;
  let best: { distSq: number; offer: DungeonOffer } | null = null;
  const consider = (x: number, y: number, offer: DungeonOffer): void => {
    const distSq = (x - p.x) ** 2 + (y - p.y) ** 2;
    if (distSq > range * range || (best && distSq >= best.distSq)) return;
    best = { distSq, offer };
  };
  run.chests.forEach((c, i) => {
    if (c.opened) return;
    if (c.kind === 'weapon') consider(c.x, c.y, { action: 'weapon', target: i, enabled: true, weapon: c.weapon });
    else if (c.kind === 'open' || c.kind === 'boss') consider(c.x, c.y, { action: 'chest', target: i, enabled: true });
    else consider(c.x, c.y, run.keys > 0 ? { action: 'chestKey', target: i, enabled: true } : { action: 'needKey', target: i, enabled: false });
  });
  if (run.trapdoor) consider(run.trapdoor.x, run.trapdoor.y, { action: 'descend', target: 0, enabled: true });
  map.doors.forEach((d, i) => {
    const kind = run.doorKinds[i];
    if (kind === 'key' && !run.doorsUnlocked[i]) consider(d.center.x, d.center.y, run.keys > 0 ? { action: 'door', target: i, enabled: true } : { action: 'needKey', target: i, enabled: false });
    else if (kind === 'boss' && !run.doorsUnlocked[i]) consider(d.center.x, d.center.y, run.bossKey ? { action: 'bossDoor', target: i, enabled: true } : { action: 'needBossKey', target: i, enabled: false });
    else if (kind === 'challenge') {
      // The warning (§4.1): from outside, while the challenge waits.
      const challenge = run.plan.rooms[d.fromZoneIndex]?.type === 'challenge' ? d.fromZoneIndex : d.toZoneIndex;
      if (!run.cleared[challenge] && run.room !== challenge) consider(d.center.x, d.center.y, { action: 'challenge', target: i, enabled: false });
    }
  });
  return best ? (best as { offer: DungeonOffer }).offer : null;
}

/** A tap on the action button at what `offer` found (§4.1, §6). */
export function tapDungeon(ctx: SimContext, p: PlayerState, offer: DungeonOffer): void {
  const { state } = ctx;
  const run = state.run;
  if (!run) return;
  if (!offer.enabled) {
    ctx.events.emit('action:denied', { playerId: p.id });
    return;
  }
  switch (offer.action) {
    case 'chest':
    case 'chestKey':
    case 'weapon':
      openChest(ctx, run, p, offer.target);
      return;
    case 'door':
    case 'bossDoor': {
      if (offer.action === 'door') run.keys--;
      else run.bossKey = false;
      run.doorsUnlocked[offer.target] = true;
      setDoor(ctx, offer.target, true);
      const d = ctx.map.doors[offer.target];
      ctx.events.emit('dungeon:doorUnlocked', { kind: run.doorKinds[offer.target] ?? 'normal', x: d?.center.x ?? p.x, y: d?.center.y ?? p.y });
      emitRooms(ctx, run);
      return;
    }
    case 'descend':
      run.descending = true;
      ctx.events.emit('dungeon:descend', { floor: run.floor });
      return;
    default:
      ctx.events.emit('action:denied', { playerId: p.id });
  }
}

/**
 * A chest opens (§6.2, §6.3): money beside the player's feet and a medkit
 * or ammo on the floor; the locked ones take a key; the treasure's case
 * gives its weapon, or full ammo and money when both are owned.
 */
function openChest(ctx: SimContext, run: RunState, p: PlayerState, index: number): void {
  const chest = run.chests[index];
  if (!chest || chest.opened) return;
  const ts = ctx.map.tileSize;
  chest.opened = true;
  if (run.plan.rooms[chest.room]?.type === 'treasure') run.treasureOpened = true;
  if (chest.kind === 'weapon') {
    if (chest.weapon) {
      giveWeapon(p, chest.weapon);
      const slot = p.weapons[findWeapon(p, chest.weapon)];
      if (slot) refillWeapon(slot);
    } else {
      for (const slot of p.weapons) refillWeapon(slot);
      awardPoints(ctx, p.id, DUNGEON.treasure.bothOwnedMoney, 'chest', chest.x, chest.y);
    }
    ctx.events.emit('dungeon:chestOpened', { kind: chest.kind, x: chest.x, y: chest.y });
    return;
  }
  if (chest.kind === 'locked' || chest.kind === 'big') run.keys = Math.max(0, run.keys - 1);
  const money = chest.kind === 'big' ? DUNGEON.chest.big : chest.kind === 'locked' ? DUNGEON.chest.locked : DUNGEON.chest.open;
  awardPoints(ctx, p.id, money, 'chest', chest.x, chest.y);
  // The treasure's and the challenge's give a medkit; a locked one, ammo or a medkit.
  const kind = chest.kind === 'locked' && random(ctx.state) < 0.5 ? 'ammo' : 'health';
  const at = nearestWalkable(ctx, chest.x + ts / 2, chest.y + ts / 2) ?? { x: chest.x, y: chest.y };
  spawnPickup(ctx, kind, at.x, at.y);
  ctx.events.emit('dungeon:chestOpened', { kind: chest.kind, x: chest.x, y: chest.y });
  emitRooms(ctx, run);
}
