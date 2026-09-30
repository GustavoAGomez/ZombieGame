import { WAVES } from '../../config/balance';
import type { ZombieState } from '../../core/GameState';
import { random } from '../../core/Rng';
import { isZombieAlive } from './Combat';
import type { SimContext } from './SimContext';
import { pickZombieKind, spawnInterval, zombieHp } from './waveFormulas';

/**
 * Spawns zombies at the spawn points of unlocked zones (spec 01 §4.8): one
 * every spawnInterval(round) seconds while fewer than 20 are alive, picking
 * the spawn at random, weighted towards the ones closer to a player.
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

/** Index into map.zombieSpawns, or -1 when no unlocked zone has spawns. */
export function pickSpawn(ctx: SimContext): number {
  const { map, state } = ctx;
  let total = 0;
  for (let i = 0; i < map.zombieSpawns.length; i++) total += spawnWeight(ctx, i);
  if (total <= 0) return -1;
  let roll = random(state) * total;
  for (let i = 0; i < map.zombieSpawns.length; i++) {
    const w = spawnWeight(ctx, i);
    if (w <= 0) continue;
    roll -= w;
    if (roll < 0) return i;
  }
  // Floating point leftovers: fall back to the last usable spawn.
  for (let i = map.zombieSpawns.length - 1; i >= 0; i--) if (spawnWeight(ctx, i) > 0) return i;
  return -1;
}

/** 0 for spawns of locked zones, otherwise 1 / (1 + distance / falloff). */
export function spawnWeight(ctx: SimContext, spawnIndex: number): number {
  const { map, state } = ctx;
  const spawn = map.zombieSpawns[spawnIndex];
  if (!spawn) return 0;
  const window = map.windows[spawn.windowIndex];
  if (!window || !state.zonesUnlocked[window.zoneIndex]) return 0;
  let nearest = Infinity;
  for (const p of state.players) {
    if (p.hp <= 0) continue;
    nearest = Math.min(nearest, Math.hypot(p.x - spawn.x, p.y - spawn.y));
  }
  if (!Number.isFinite(nearest)) nearest = 0;
  return 1 / (1 + nearest / WAVES.spawnDistanceFalloff);
}

export function spawnZombie(ctx: SimContext, z: ZombieState, spawnIndex: number): void {
  const { map, state } = ctx;
  const spawn = map.zombieSpawns[spawnIndex];
  if (!spawn) return;
  const round = state.wave.round;
  z.active = true;
  z.kind = pickZombieKind(round, random(state));
  z.ai = 'toWindow';
  z.window = spawn.windowIndex;
  z.x = z.prevX = spawn.x;
  z.y = z.prevY = spawn.y;
  z.maxHp = zombieHp(round);
  z.hp = z.maxHp;
  z.timer = 0;
  z.attackCooldown = 0;
  z.stateTick = state.tick;
  z.actionTick = -1;
  const w = map.windows[z.window];
  z.facing = w ? Math.atan2(w.exterior.y - z.y, w.exterior.x - z.x) : 0;
}
