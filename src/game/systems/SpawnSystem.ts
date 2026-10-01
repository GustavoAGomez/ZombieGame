import { WAVES, ZOMBIES } from '../../config/balance';
import type { ZombieState } from '../../core/GameState';
import { random } from '../../core/Rng';
import { isZombieAlive } from './Combat';
import type { SimContext } from './SimContext';
import { pickZombieKind, spawnInterval, zombieHp } from './waveFormulas';

/**
 * Spawns zombies at the spawn points of unlocked zones (spec 01 §4.8): one
 * every spawnInterval(round) seconds while fewer than 20 are alive, picking
 * the spawn at random, weighted towards the ones closer to a player.
 *
 * Spawn indices cover the window spawns first (map.zombieSpawns) and then
 * the open spawns (map.openSpawns, spec 02 §3.4).
 */
export function updateSpawns(ctx: SimContext, dt: number): void {
  const { wave } = ctx.state;
  if (wave.toSpawn === 0) return;
  wave.spawnTimer -= dt;
  if (wave.spawnTimer > 0) return;
  if (countAlive(ctx) >= WAVES.maxAlive) return; // retry next tick
  const slot = freeZombieSlot(ctx);
  const spawn = pickSpawn(ctx);
  if (!slot || spawn < 0) return;
  spawnZombie(ctx, slot, spawn);
  if (wave.toSpawn > 0) wave.toSpawn--;
  wave.spawnTimer += spawnInterval(wave.round);
  if (wave.spawnTimer < 0) wave.spawnTimer = 0;
}

export function countAlive(ctx: SimContext): number {
  let n = 0;
  for (const z of ctx.state.zombies) if (isZombieAlive(z)) n++;
  return n;
}

function freeZombieSlot(ctx: SimContext): ZombieState | undefined {
  const { zombies } = ctx.state;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (z && !z.active) return z;
  }
  return undefined;
}

export function spawnCount(ctx: SimContext): number {
  return ctx.map.zombieSpawns.length + ctx.map.openSpawns.length;
}

/** Spawn index (window spawns, then open spawns), or -1 when none can be used. */
export function pickSpawn(ctx: SimContext): number {
  const { state } = ctx;
  const count = spawnCount(ctx);
  let total = 0;
  for (let i = 0; i < count; i++) total += spawnWeight(ctx, i);
  if (total <= 0) return -1;
  let roll = random(state) * total;
  for (let i = 0; i < count; i++) {
    const w = spawnWeight(ctx, i);
    if (w <= 0) continue;
    roll -= w;
    if (roll < 0) return i;
  }
  // Floating point leftovers: fall back to the last usable spawn.
  for (let i = count - 1; i >= 0; i--) if (spawnWeight(ctx, i) > 0) return i;
  return -1;
}

/** Index into map.openSpawns, or -1 for a window spawn. */
export function openSpawnIndex(ctx: SimContext, spawnIndex: number): number {
  const i = spawnIndex - ctx.map.zombieSpawns.length;
  return i >= 0 && i < ctx.map.openSpawns.length ? i : -1;
}

/**
 * 0 for spawns of locked zones, and for open spawns with a live player
 * closer than openSpawnMinDistanceTiles; otherwise 1 / (1 + distance / falloff).
 */
export function spawnWeight(ctx: SimContext, spawnIndex: number): number {
  const { map, state } = ctx;
  const open = map.openSpawns[openSpawnIndex(ctx, spawnIndex)];
  const spawn = open ?? map.zombieSpawns[spawnIndex];
  if (!spawn) return 0;
  const zone = open ? open.zoneIndex : (map.windows[map.zombieSpawns[spawnIndex]?.windowIndex ?? -1]?.zoneIndex ?? -1);
  if (!state.zonesUnlocked[zone]) return 0;
  let nearest = Infinity;
  for (const p of state.players) {
    if (p.hp <= 0) continue;
    nearest = Math.min(nearest, Math.hypot(p.x - spawn.x, p.y - spawn.y));
  }
  if (!Number.isFinite(nearest)) nearest = 0;
  if (open && nearest < WAVES.openSpawnMinDistanceTiles * map.tileSize) return 0;
  return 1 / (1 + nearest / WAVES.spawnDistanceFalloff);
}

export function spawnZombie(ctx: SimContext, z: ZombieState, spawnIndex: number): void {
  const { map, state } = ctx;
  const open = map.openSpawns[openSpawnIndex(ctx, spawnIndex)];
  const spawn = open ?? map.zombieSpawns[spawnIndex];
  if (!spawn) return;
  const round = state.wave.round;
  z.active = true;
  z.kind = pickZombieKind(round, random(state));
  z.x = z.prevX = spawn.x;
  z.y = z.prevY = spawn.y;
  z.maxHp = zombieHp(round);
  z.hp = z.maxHp;
  z.attackCooldown = 0;
  z.stateTick = state.tick;
  z.actionTick = -1;
  z.portalLock = -1;
  if (open) {
    z.ai = 'emerging';
    z.window = -1;
    z.timer = ZOMBIES.emergeTime;
    const target = nearestPlayer(ctx, z.x, z.y);
    z.facing = target ? Math.atan2(target.y - z.y, target.x - z.x) : Math.PI / 2;
    return;
  }
  z.ai = 'toWindow';
  z.window = map.zombieSpawns[spawnIndex]?.windowIndex ?? -1;
  z.timer = 0;
  const w = map.windows[z.window];
  z.facing = w ? Math.atan2(w.exterior.y - z.y, w.exterior.x - z.x) : 0;
}

function nearestPlayer(ctx: SimContext, x: number, y: number): { x: number; y: number } | undefined {
  let best: { x: number; y: number } | undefined;
  let bestDistSq = Infinity;
  for (const p of ctx.state.players) {
    if (p.hp <= 0) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestDistSq) {
      best = p;
      bestDistSq = d;
    }
  }
  return best;
}
