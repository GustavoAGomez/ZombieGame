import { describe, expect, it } from 'vitest';
import { WAVES, WEAPONS, ZOMBIES } from '../../config/balance';
import {
  command,
  createMansionContext,
  movePlayerToTile as movePlayer,
  placeZombie,
  player,
  runTicks,
  tileCenter,
  unlockZones as unlock,
} from '../../test/fixtures';
import { UNREACHABLE, computeFlowField, distanceAt } from '../map/FlowField';
import { isZombieAlive } from './Combat';
import { openDoor } from './DoorSystem';
import type { SimContext } from './SimContext';
import { openPortal } from './PortalSystem';
import { openSpawnIndex, pickSpawn, spawnCount, spawnPathTiles, spawnWeight, spawnZombie } from './SpawnSystem';
import { stepSimulation } from './Simulation';
import { updateZombies } from './ZombieSystem';

/** Spec 02 Fase M4: water, void and open spawns on the generated mansion. */

const openSpawnAt = (ctx: SimContext, x: number, y: number): number =>
  ctx.map.zombieSpawns.length + ctx.map.openSpawns.findIndex((s) => Math.floor(s.x / 32) === x && Math.floor(s.y / 32) === y);

describe('pool', () => {
  it('lets bullets cross the water', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'jardin');
    movePlayer(ctx, 45, 4);
    const target = tileCenter(ctx, 45, 12);
    const z = placeZombie(ctx, 0, target.x, target.y, 100);
    const cmd = command(ctx);
    Object.assign(cmd, { fire: true, aimManual: true, aimX: 0, aimY: 1 });
    stepSimulation(ctx, 1 / 60);
    cmd.fire = false;
    runTicks(ctx, 40, stepSimulation);
    expect(z.hp).toBe(100 - WEAPONS.pistol.damage);
  });

  it('makes zombies walk around it', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'jardin');
    movePlayer(ctx, 45, 4);
    const p = player(ctx);
    computeFlowField(ctx.nav, ctx.map, ctx.grid, ctx.state.zonesUnlocked, [Math.floor(p.y / 32) * ctx.map.width + Math.floor(p.x / 32)]);
    const across = tileCenter(ctx, 45, 12);
    // Straight across would be 8 steps; around the pool it takes far more.
    expect(distanceAt(ctx.nav, across.x, across.y)).toBeGreaterThan(15);
    const water = tileCenter(ctx, 45, 8);
    expect(distanceAt(ctx.nav, water.x, water.y)).toBe(UNREACHABLE);
  });
});

describe('open spawns', () => {
  it('stay off while their zone is locked', () => {
    const ctx = createMansionContext();
    for (let i = ctx.map.zombieSpawns.length; i < spawnCount(ctx); i++) expect(spawnWeight(ctx, i)).toBe(0);
    unlock(ctx, 'calle');
    expect(spawnWeight(ctx, openSpawnAt(ctx, 3, 40))).toBeGreaterThan(0);
    expect(spawnWeight(ctx, openSpawnAt(ctx, 93, 4))).toBe(0); // the roof is still locked
  });

  it('never spawn closer than 8 tiles to a live player', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    movePlayer(ctx, 5, 44);
    expect(spawnWeight(ctx, openSpawnAt(ctx, 3, 40))).toBe(0);
    expect(spawnWeight(ctx, openSpawnAt(ctx, 69, 62))).toBeGreaterThan(0);
    // 11 tiles from the open spawn on the side street: close enough to be picked, never closer than 8.
    movePlayer(ctx, 12, 46);
    const p = player(ctx);
    let open = 0;
    for (let i = 0; i < 400; i++) {
      const spawn = ctx.map.openSpawns[openSpawnIndex(ctx, pickSpawn(ctx))];
      if (!spawn) continue;
      open++;
      expect(Math.hypot(spawn.x - p.x, spawn.y - p.y)).toBeGreaterThanOrEqual(WAVES.openSpawnMinDistanceTiles * 32);
    }
    expect(open).toBeGreaterThan(0);
  });

  it('raise an emerging zombie that waits, can be shot and then chases', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    const z = ctx.state.zombies[0]!;
    spawnZombie(ctx, z, openSpawnAt(ctx, 69, 62));
    expect(z).toMatchObject({ active: true, ai: 'emerging', window: -1 });
    expect(isZombieAlive(z)).toBe(true);
    const start = { x: z.x, y: z.y };
    runTicks(ctx, Math.floor(ZOMBIES.emergeTime * 60) - 2, updateZombies);
    expect(z.ai).toBe('emerging');
    expect({ x: z.x, y: z.y }).toEqual(start);
    runTicks(ctx, 4, updateZombies);
    expect(z.ai).toBe('chasing');
  });
});

describe('window zombies with the outside reachable', () => {
  const w1Spawn = (ctx: SimContext): number => ctx.map.zombieSpawns.findIndex((s) => s.window === 'W1');

  it('keep going for the window while the street is locked', () => {
    const ctx = createMansionContext();
    const z = ctx.state.zombies[0]!;
    spawnZombie(ctx, z, w1Spawn(ctx));
    runTicks(ctx, 60, updateZombies);
    expect(['toWindow', 'tearing']).toContain(z.ai);
  });

  it('chase the player once the street is open', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    openDoor(ctx, ctx.map.doors.findIndex((d) => d.id === 'D8'));
    const z = ctx.state.zombies[0]!;
    spawnZombie(ctx, z, w1Spawn(ctx));
    runTicks(ctx, 2, updateZombies);
    expect(z.ai).toBe('chasing');
  });
});

describe('roof void', () => {
  it('stops the player at the edge of the roof', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'azotea');
    movePlayer(ctx, 98, 17);
    const cmd = command(ctx);
    cmd.moveY = 1;
    runTicks(ctx, 120, stepSimulation);
    expect(player(ctx).y).toBeLessThan(20 * 32);
  });
});

describe('spawn distance on the big map (Fase M7)', () => {
  const spawnOf = (ctx: SimContext, window: string): number => ctx.map.zombieSpawns.findIndex((s) => s.window === window);

  function withField(ctx: SimContext): void {
    const p = player(ctx);
    computeFlowField(ctx.nav, ctx.map, ctx.grid, ctx.state.zonesUnlocked, [Math.floor(p.y / 32) * ctx.map.width + Math.floor(p.x / 32)], ctx.state.portalsOpen);
  }

  it('measures windows by walking distance, not through walls', () => {
    const ctx = createMansionContext();
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5']) openDoor(ctx, ctx.map.doors.findIndex((d) => d.id === id));
    movePlayer(ctx, 38, 38);
    withField(ctx);
    // W9 (biblioteca, north wall) is ~18 tiles away in a straight line but much farther on foot.
    const w9 = spawnOf(ctx, 'W9');
    const straight = Math.hypot(ctx.map.zombieSpawns[w9]!.x - player(ctx).x, ctx.map.zombieSpawns[w9]!.y - player(ctx).y) / 32;
    expect(spawnPathTiles(ctx, w9)).toBeGreaterThan(straight + 8);
    expect(spawnWeight(ctx, w9)).toBeLessThan(spawnWeight(ctx, spawnOf(ctx, 'W1')));
  });

  it('counts a window spawn on an open exterior from where it appears', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'jardin');
    movePlayer(ctx, 51, 16);
    withField(ctx);
    // W11's zombies appear in the garden at (51, 20): 4 tiles from the player, who can walk there.
    expect(spawnPathTiles(ctx, spawnOf(ctx, 'W11'))).toBe(4);
  });

  it('skips far spawns while closer ones exist', () => {
    const ctx = createMansionContext();
    for (const door of ctx.map.doors) openDoor(ctx, ctx.map.doors.indexOf(door));
    movePlayer(ctx, 38, 38);
    withField(ctx);
    for (let i = 0; i < 500; i++) expect(spawnPathTiles(ctx, pickSpawn(ctx))).toBeLessThanOrEqual(WAVES.spawnMaxPathTiles);
  });

  it('still spawns when every spawn is far', () => {
    const ctx = createMansionContext();
    openPortal(ctx, ctx.map.portals.findIndex((p) => p.id === 'P1a'));
    movePlayer(ctx, 40, 24); // kitchen: only the basement is open besides it, and its grates are far away
    ctx.state.zonesUnlocked[zoneIndexOf(ctx, 'cocina')] = false;
    ctx.state.zonesUnlocked[zoneIndexOf(ctx, 'recibidor')] = false;
    withField(ctx);
    const s = pickSpawn(ctx);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(spawnPathTiles(ctx, s)).toBeGreaterThan(WAVES.spawnMaxPathTiles);
  });
});

const zoneIndexOf = (ctx: SimContext, id: string): number => ctx.map.zones.findIndex((z) => z.id === id);
