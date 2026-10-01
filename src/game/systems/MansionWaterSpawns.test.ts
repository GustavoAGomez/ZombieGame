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
import { openSpawnIndex, pickSpawn, spawnCount, spawnWeight, spawnZombie } from './SpawnSystem';
import { stepSimulation } from './Simulation';
import { updateZombies } from './ZombieSystem';

/** Spec 02 Fase M4: water, void and open spawns on the generated mansion. */

const openSpawnAt = (ctx: SimContext, x: number, y: number): number =>
  ctx.map.zombieSpawns.length + ctx.map.openSpawns.findIndex((s) => Math.floor(s.x / 32) === x && Math.floor(s.y / 32) === y);

describe('pool', () => {
  it('lets bullets cross the water', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'jardin');
    movePlayer(ctx, 30, 5);
    const target = tileCenter(ctx, 30, 12);
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
    movePlayer(ctx, 30, 5);
    const p = player(ctx);
    computeFlowField(ctx.nav, ctx.map, ctx.grid, ctx.state.zonesUnlocked, [Math.floor(p.y / 32) * ctx.map.width + Math.floor(p.x / 32)]);
    const across = tileCenter(ctx, 30, 12);
    // Straight across would be 7 steps; around the deck it takes far more.
    expect(distanceAt(ctx.nav, across.x, across.y)).toBeGreaterThan(15);
    const water = tileCenter(ctx, 30, 9);
    expect(distanceAt(ctx.nav, water.x, water.y)).toBe(UNREACHABLE);
  });
});

describe('open spawns', () => {
  it('stay off while their zone is locked', () => {
    const ctx = createMansionContext();
    for (let i = ctx.map.zombieSpawns.length; i < spawnCount(ctx); i++) expect(spawnWeight(ctx, i)).toBe(0);
    unlock(ctx, 'calle');
    expect(spawnWeight(ctx, openSpawnAt(ctx, 1, 46))).toBeGreaterThan(0);
    expect(spawnWeight(ctx, openSpawnAt(ctx, 78, 4))).toBe(0); // the roof is still locked
  });

  it('never spawn closer than 8 tiles to a live player', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    movePlayer(ctx, 4, 46);
    expect(spawnWeight(ctx, openSpawnAt(ctx, 1, 46))).toBe(0);
    expect(spawnWeight(ctx, openSpawnAt(ctx, 70, 46))).toBeGreaterThan(0);
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
    spawnZombie(ctx, z, openSpawnAt(ctx, 70, 46));
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
    movePlayer(ctx, 85, 16);
    const cmd = command(ctx);
    cmd.moveY = 1;
    runTicks(ctx, 120, stepSimulation);
    expect(player(ctx).y).toBeLessThan(18 * 32);
  });
});
