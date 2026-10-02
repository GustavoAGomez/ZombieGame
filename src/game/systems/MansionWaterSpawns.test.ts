import { describe, expect, it } from 'vitest';
import { WAVES } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
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

/** Spec 02 Fase M4: water, void and open spawns (entrances from off the map) on the generated mansion. */

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
    expect(spawnWeight(ctx, openSpawnAt(ctx, -2, 30))).toBeGreaterThan(0);
    expect(spawnWeight(ctx, openSpawnAt(ctx, 93, 1))).toBe(0); // the roof is still locked
  });

  it('never bring a zombie in closer than 8 tiles to a live player', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    movePlayer(ctx, 2, 30);
    expect(spawnWeight(ctx, openSpawnAt(ctx, -2, 30))).toBe(0);
    expect(spawnWeight(ctx, openSpawnAt(ctx, 83, 56))).toBeGreaterThan(0);
    movePlayer(ctx, 9, 40);
    const p = player(ctx);
    let open = 0;
    for (let i = 0; i < 400; i++) {
      const spawn = ctx.map.openSpawns[openSpawnIndex(ctx, pickSpawn(ctx))];
      if (!spawn) continue;
      open++;
      expect(Math.hypot(spawn.entry.x - p.x, spawn.entry.y - p.y)).toBeGreaterThanOrEqual(WAVES.openSpawnMinDistanceTiles * 32);
    }
    expect(open).toBeGreaterThan(0);
  });

  it('walk a zombie in from off the map, that can be shot, and then chase', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    const z = ctx.state.zombies[0]!;
    const index = openSpawnAt(ctx, 83, 56);
    spawnZombie(ctx, z, index);
    expect(z).toMatchObject({ active: true, ai: 'entering', window: -1 });
    expect(z.x).toBe(83.5 * 32); // past the end of the street, where the camera stops
    expect(isZombieAlive(z)).toBe(true);
    runTicks(ctx, 20, updateZombies);
    expect(z.ai).toBe('entering');
    expect(z.x).toBeLessThan(83.5 * 32);
    expect(z.y).toBe(56.5 * 32); // straight in
    runTicks(ctx, 180, updateZombies);
    expect(z.ai).toBe('chasing');
    expect(z.x).toBeLessThanOrEqual(81.5 * 32);
  });
});

describe('window spawns where players walk', () => {
  const spawnOf = (ctx: SimContext, window: string): number => ctx.map.zombieSpawns.findIndex((s) => s.window === window);

  it('are off once that zone is unlocked: no zombie appears in front of the player', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'cocina');
    // W11's zombies appear in the garden: fine while it is locked, never once players can walk there.
    expect(spawnWeight(ctx, spawnOf(ctx, 'W11'))).toBeGreaterThan(0);
    unlock(ctx, 'jardin');
    expect(spawnWeight(ctx, spawnOf(ctx, 'W11'))).toBe(0);
    // The garden fences' zombies come from off the map: they stay on.
    expect(spawnWeight(ctx, spawnOf(ctx, 'F2'))).toBeGreaterThan(0);
  });

  it('leave zombies to come from off the map with everything unlocked', () => {
    const ctx = createMansionContext();
    for (const z of ctx.map.zones) unlock(ctx, z.id);
    movePlayer(ctx, 40, 57); // in the street
    for (let i = 0; i < 300; i++) {
      const s = pickSpawn(ctx);
      const open = ctx.map.openSpawns[openSpawnIndex(ctx, s)];
      const spawn = open ?? ctx.map.zombieSpawns[s]!;
      expect(open !== undefined || spawn.zoneIndex === -1, `${spawn.x},${spawn.y}`).toBe(true);
    }
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

  it('break in through their window when that is the short way, even with the street and the front door open', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    openDoor(ctx, ctx.map.doors.findIndex((d) => d.id === 'D8'));
    const z = ctx.state.zombies[0]!;
    spawnZombie(ctx, z, w1Spawn(ctx));
    runTicks(ctx, 60, updateZombies);
    expect(['toWindow', 'tearing']).toContain(z.ai);
  });

  it('chase the player who walks out to them', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    const z = ctx.state.zombies[0]!;
    spawnZombie(ctx, z, w1Spawn(ctx));
    movePlayer(ctx, Math.floor(z.x / 32), Math.floor(z.y / 32) + 2); // on the lawn, two tiles from it
    runTicks(ctx, 4, updateZombies);
    expect(z.ai).toBe('chasing');
  });
});

describe('zombies break through the barricades on their way', () => {
  const DT = 1 / 60;
  const w1 = (ctx: SimContext): number => ctx.map.windows.findIndex((w) => w.id === 'W1');

  /** Runs the zombies until `done` (or 20 s) and returns every state the zombie went through. */
  function runUntil(ctx: SimContext, done: () => boolean): Set<string> {
    const seen = new Set<string>();
    for (let t = 0; t < 60 * 20 && !done(); t++) {
      updateZombies(ctx, DT);
      seen.add(ctx.state.zombies[0]!.ai);
    }
    return seen;
  }

  it('a chasing zombie outside tears down the window in its way and climbs in, the front door being closed', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    player(ctx).hp = player(ctx).maxHp = 1e9;
    const porch = tileCenter(ctx, 39, 43);
    const z = placeZombie(ctx, 0, porch.x, porch.y, 1000, 'chasing');
    const seen = runUntil(ctx, () => z.ai === 'chasing' && z.y < 41 * 32);
    expect(seen).toContain('tearing');
    expect(seen).toContain('climbing');
    expect(ctx.state.windowPlanks[w1(ctx)]).toBe(0);
    expect(Math.floor(z.y / 32)).toBeLessThan(41); // in the hall
  });

  it('a zombie inside goes out through a window to reach a player outside', () => {
    const ctx = createMansionContext();
    unlock(ctx, 'calle');
    movePlayer(ctx, 39, 44);
    player(ctx).hp = player(ctx).maxHp = 1e9;
    const hall = tileCenter(ctx, 39, 38);
    const z = placeZombie(ctx, 0, hall.x, hall.y, 1000, 'chasing');
    let wentOut = false;
    const seen = runUntil(ctx, () => {
      wentOut ||= z.crossOut;
      return z.ai === 'chasing' && z.y > 42 * 32;
    });
    expect(wentOut).toBe(true);
    expect(seen).toContain('tearing');
    expect(seen).toContain('climbing');
    expect(Math.floor(z.y / 32)).toBeGreaterThan(41); // on the porch
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

  it('skips far spawns while closer ones exist', () => {
    const ctx = createMansionContext();
    for (const id of ['D1', 'D2', 'D3', 'D4', 'D5', 'D6']) openDoor(ctx, ctx.map.doors.findIndex((d) => d.id === id));
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
