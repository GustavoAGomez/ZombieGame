import { WAVES, ZOMBIES } from '../../config/balance';
import type { ZombieState } from '../../core/GameState';
import { random } from '../../core/Rng';
import { UNREACHABLE, distanceAt } from '../map/FlowField';
import { isZombieAlive } from './Combat';
import type { SimContext } from './SimContext';
import { pickZombieKind, spawnInterval, zombieHp } from './waveFormulas';

/**
 * Spawns zombies at the spawn points of unlocked zones (spec 01 §4.8): one
 * every spawnInterval(round) seconds while fewer than 20 are alive, picking
 * the spawn at random, weighted towards the ones closer to a player.
 *
 * Closeness is the walking distance (flow field), not the straight line: a
 * window on the other side of a wall can be far away. On a big map, spawns
 * beyond spawnMaxPathTiles are skipped while any spawn is closer, so the
 * zombies do not spend half a minute crossing the house (spec 02 Fase M7).
 *
 * Spawn indices cover the window spawns first (map.zombieSpawns) and then
 * the open spawns (map.openSpawns, spec 02 §3.4).
 */
export function updateSpawns(ctx: SimContext, dt: number): void {
  const { wave } = ctx.state;
  if (wave.phase !== 'active' || wave.toSpawn === 0) return;
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

let weights = new Float64Array(0);

/** Spawn index (window spawns, then open spawns), or -1 when none can be used. */
export function pickSpawn(ctx: SimContext): number {
  const { state } = ctx;
  const count = spawnCount(ctx);
  if (weights.length < count) weights = new Float64Array(count);
  let anyNear = false;
  for (let i = 0; i < count; i++) {
    weights[i] = spawnWeight(ctx, i);
    if (weights[i]! > 0 && spawnPathTiles(ctx, i) <= WAVES.spawnMaxPathTiles) anyNear = true;
  }
  let total = 0;
  for (let i = 0; i < count; i++) {
    if (anyNear && weights[i]! > 0 && spawnPathTiles(ctx, i) > WAVES.spawnMaxPathTiles) weights[i] = 0;
    total += weights[i]!;
  }
  if (total <= 0) return -1;
  let roll = random(state) * total;
  for (let i = 0; i < count; i++) {
    const w = weights[i]!;
    if (w <= 0) continue;
    roll -= w;
    if (roll < 0) return i;
  }
  // Floating point leftovers: fall back to the last usable spawn.
  for (let i = count - 1; i >= 0; i--) if (weights[i]! > 0) return i;
  return -1;
}

/**
 * Walking distance in tiles from spawn `spawnIndex` to the nearest player,
 * along the flow field. A window spawn outside, in a zone the player can
 * walk to, counts from the spawn itself (that zombie chases at once, spec 02
 * §3.5); otherwise from the window's inner side plus the way to the window.
 * Falls back to the straight line where the field does not reach (not
 * computed yet, or a zone that just unlocked).
 */
export function spawnPathTiles(ctx: SimContext, spawnIndex: number): number {
  const { map, nav } = ctx;
  const ts = map.tileSize;
  const open = map.openSpawns[openSpawnIndex(ctx, spawnIndex)];
  const spawn = open ?? map.zombieSpawns[spawnIndex];
  if (!spawn) return Infinity;
  const direct = distanceAt(nav, spawn.x, spawn.y);
  if (direct !== UNREACHABLE) return direct;
  const window = open ? undefined : map.windows[map.zombieSpawns[spawnIndex]?.windowIndex ?? -1];
  const inside = window ? distanceAt(nav, window.interior.x, window.interior.y) : UNREACHABLE;
  if (!window || inside === UNREACHABLE) return nearestPlayerDistance(ctx, spawn.x, spawn.y) / ts;
  return inside + Math.hypot(window.exterior.x - spawn.x, window.exterior.y - spawn.y) / ts + 1;
}

function nearestPlayerDistance(ctx: SimContext, x: number, y: number): number {
  let nearest = Infinity;
  for (const p of ctx.state.players) {
    if (p.hp <= 0) continue;
    nearest = Math.min(nearest, Math.hypot(p.x - x, p.y - y));
  }
  return Number.isFinite(nearest) ? nearest : 0;
}

/** Index into map.openSpawns, or -1 for a window spawn. */
export function openSpawnIndex(ctx: SimContext, spawnIndex: number): number {
  const i = spawnIndex - ctx.map.zombieSpawns.length;
  return i >= 0 && i < ctx.map.openSpawns.length ? i : -1;
}

/**
 * 0 for spawns of locked zones, and for open spawns with a live player
 * closer than openSpawnMinDistanceTiles (straight line); otherwise
 * 1 / (1 + pathTiles / falloff). The distance cut-off is applied in pickSpawn.
 */
export function spawnWeight(ctx: SimContext, spawnIndex: number): number {
  const { map, state } = ctx;
  const open = map.openSpawns[openSpawnIndex(ctx, spawnIndex)];
  const spawn = open ?? map.zombieSpawns[spawnIndex];
  if (!spawn) return 0;
  const zone = open ? open.zoneIndex : (map.windows[map.zombieSpawns[spawnIndex]?.windowIndex ?? -1]?.zoneIndex ?? -1);
  if (!state.zonesUnlocked[zone]) return 0;
  if (open && nearestPlayerDistance(ctx, spawn.x, spawn.y) < WAVES.openSpawnMinDistanceTiles * map.tileSize) return 0;
  return 1 / (1 + spawnPathTiles(ctx, spawnIndex) / WAVES.spawnFalloffTiles);
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
  z.burn.timer = 0;
  z.burn.perTick = 0;
  if (open) {
    z.ai = 'emerging';
    z.window = -1;
    z.crossOut = false;
    z.timer = ZOMBIES.emergeTime;
    const target = nearestPlayer(ctx, z.x, z.y);
    z.facing = target ? Math.atan2(target.y - z.y, target.x - z.x) : Math.PI / 2;
    return;
  }
  z.ai = 'toWindow';
  z.window = map.zombieSpawns[spawnIndex]?.windowIndex ?? -1;
  z.crossOut = false;
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
