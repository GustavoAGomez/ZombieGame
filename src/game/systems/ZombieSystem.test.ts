import { describe, expect, it, vi } from 'vitest';
import { PLAYER, ZOMBIES } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
import type { ZombieState } from '../../core/GameState';
import { createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { setDoorBlocking } from '../map/CollisionGrid';
import { damageZombie } from './Combat';
import { stepSimulation } from './Simulation';
import { spawnZombie } from './SpawnSystem';
import { zombieHp } from './waveFormulas';
import { isCrawling } from './ZombieSystem';

type Ctx = ReturnType<typeof createTestContext>;

/** Spawns a zombie of `kind` at the spawn point of window `windowIndex`. */
function spawnAt(ctx: Ctx, windowIndex: number, kind: ZombieState['kind'] = 'walker', slot = 0): ZombieState {
  const spawn = ctx.map.zombieSpawns.findIndex((s) => s.windowIndex === windowIndex);
  const z = ctx.state.zombies[slot]!;
  spawnZombie(ctx, z, spawn);
  z.kind = kind;
  return z;
}

function ticksUntil(ctx: Ctx, done: () => boolean, maxSeconds: number): number {
  let ticks = 0;
  while (!done() && ticks < maxSeconds * 60) {
    stepSimulation(ctx, 1 / 60);
    ticks++;
  }
  return ticks;
}

describe('ZombieSystem · window cycle', () => {
  it('walks to its window, tears one plank every 1.4 s (walker), climbs in 0.8 s, then chases', () => {
    const ctx = createTestContext();
    const z = spawnAt(ctx, 0, 'walker');
    expect(z.ai).toBe('toWindow');

    ticksUntil(ctx, () => z.ai !== 'toWindow', 10);
    expect(z.ai).toBe('tearing');
    const w = ctx.map.windows[0]!;
    expect(Math.hypot(z.x - w.exterior.x, z.y - w.exterior.y)).toBeLessThanOrEqual(ZOMBIES.windowArriveRadius);

    const t0 = ctx.state.time;
    ticksUntil(ctx, () => ctx.state.windowPlanks[0] === 4, 5);
    expect(ctx.state.time - t0).toBeCloseTo(ZOMBIES.kinds.walker.tearTime, 1);
    ticksUntil(ctx, () => ctx.state.windowPlanks[0] === 0, 10);
    expect(ctx.state.time - t0).toBeCloseTo(5 * ZOMBIES.kinds.walker.tearTime, 1);

    ticksUntil(ctx, () => z.ai === 'climbing', 1);
    const climbStart = ctx.state.time;
    ticksUntil(ctx, () => z.ai !== 'climbing', 2);
    expect(ctx.state.time - climbStart).toBeCloseTo(ZOMBIES.climbTime, 1);
    expect(z.ai).toBe('chasing');
    expect(z.x).toBeCloseTo(w.interior.x);
    expect(z.y).toBeCloseTo(w.interior.y);
  });

  it('runners tear a plank every 1.0 s', () => {
    const ctx = createTestContext();
    const z = spawnAt(ctx, 1, 'runner');
    ticksUntil(ctx, () => z.ai === 'tearing', 10);
    const t0 = ctx.state.time;
    ticksUntil(ctx, () => ctx.state.windowPlanks[1] === 3, 5);
    expect(ctx.state.time - t0).toBeCloseTo(2 * ZOMBIES.kinds.runner.tearTime, 1);
  });

  it('climbs straight in when the window has no planks', () => {
    const ctx = createTestContext();
    ctx.state.windowPlanks[2] = 0;
    const z = spawnAt(ctx, 2);
    ticksUntil(ctx, () => z.ai !== 'toWindow', 10);
    expect(z.ai).toBe('climbing');
  });

  it('cannot be pushed while climbing', () => {
    const ctx = createTestContext();
    ctx.state.windowPlanks[0] = 0;
    const z = spawnAt(ctx, 0);
    ticksUntil(ctx, () => z.ai === 'climbing', 10);
    const other = placeZombie(ctx, 1, z.x, z.y, 100);
    stepSimulation(ctx, 1 / 60);
    const w = ctx.map.windows[0]!;
    // Still exactly on the straight line between exterior and interior.
    expect(z.x).toBeCloseTo(w.center.x, 5);
    expect(other.active).toBe(true);
  });
});

describe('ZombieSystem · chasing', () => {
  it('reaches the player from any window of the starting room', () => {
    for (const windowIndex of [0, 1, 2]) {
      const ctx = createTestContext();
      const z = spawnAt(ctx, windowIndex, 'runner');
      const p = player(ctx);
      ticksUntil(ctx, () => z.ai === 'attacking', 30);
      expect(z.ai, `window ${windowIndex}`).toBe('attacking');
      expect(Math.hypot(p.x - z.x, p.y - z.y) - PLAYER.hitboxRadius).toBeLessThanOrEqual(ZOMBIES.attackRange + 0.5);
    }
  });

  it('goes around obstacles: from the corridor through D1 to the player', () => {
    const ctx = createTestContext();
    const d1 = ctx.map.doors[0]!;
    ctx.state.doorsOpen[0] = true;
    ctx.state.zonesUnlocked[1] = true;
    setDoorBlocking(ctx.grid, d1, false);
    const p = player(ctx);
    // Player in the far top-left corner of inicio; zombie in the corridor's far right.
    const inicio = ctx.map.zones[0]!;
    const pasillo = ctx.map.zones[1]!;
    p.x = inicio.x + 20;
    p.y = inicio.y + 20;
    const z = placeZombie(ctx, 0, pasillo.x + pasillo.width - 20, pasillo.y + pasillo.height - 20, 1000, 'chasing');
    z.kind = 'runner';
    const ticks = ticksUntil(ctx, () => z.ai === 'attacking', 30);
    expect(z.ai).toBe('attacking');
    // Never inside a wall along the way is covered by moveCircle; here check it made it in time.
    expect(ticks / 60).toBeLessThan(20);
  });

  it('never enters a locked zone', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const d1 = ctx.map.doors[0]!;
    p.x = d1.center.x;
    p.y = d1.y - 20;
    const pasillo = ctx.map.zones[1]!;
    const z = placeZombie(ctx, 0, d1.center.x, pasillo.y + 40, 1000, 'chasing');
    runTicks(ctx, 300, stepSimulation);
    expect(z.y).toBeGreaterThan(d1.y + d1.height);
  });
});

describe('ZombieSystem · crawling', () => {
  /** Px a walker covers chasing the player for half a second, starting 4 tiles to its left. */
  function distanceCovered(hp: number): number {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x - 4 * 32, p.y, hp, 'chasing');
    z.kind = 'walker';
    const x0 = z.x;
    runTicks(ctx, 30, stepSimulation);
    return z.x - x0;
  }

  it('drags itself at less than half its speed with 1 damage unit left or less', () => {
    const walking = distanceCovered(3);
    expect(walking).toBeCloseTo(ZOMBIES.kinds.walker.speed / 2, 0);
    expect(distanceCovered(1)).toBeCloseTo(walking * ZOMBIES.crawlSpeedFactor, 0);
    expect(distanceCovered(0.5)).toBeCloseTo(walking * ZOMBIES.crawlSpeedFactor, 0);
    expect(distanceCovered(1.5)).toBeCloseTo(walking, 0);
  });

  it('starts crawling after two pistol shots in round 1 and dies at the third', () => {
    const ctx = createTestContext();
    const z = placeZombie(ctx, 0, 100, 100, zombieHp(1), 'chasing');
    damageZombie(ctx, z, WEAPONS.pistol.damage, 0);
    expect(isCrawling(z)).toBe(false);
    damageZombie(ctx, z, WEAPONS.pistol.damage, 0);
    expect(isCrawling(z)).toBe(true);
    expect(damageZombie(ctx, z, WEAPONS.pistol.damage, 0)).toBe(true);
  });

  it('takes 3 rifle bullets in round 1, crawling after the second', () => {
    const ctx = createTestContext();
    const z = placeZombie(ctx, 0, 100, 100, zombieHp(1), 'chasing');
    const crawling: boolean[] = [];
    let killed = false;
    for (let shot = 1; shot <= 3 && !killed; shot++) {
      killed = damageZombie(ctx, z, WEAPONS.smg.damage, 0);
      crawling.push(isCrawling(z));
    }
    expect(killed).toBe(true);
    expect(crawling).toEqual([false, true, false]);
  });
});

describe('ZombieSystem · attacks', () => {
  function zombieNextToPlayer(ctx: Ctx): ZombieState {
    const p = player(ctx);
    return placeZombie(ctx, 0, p.x + PLAYER.hitboxRadius + 10, p.y, 1000, 'chasing');
  }

  it('winds up for 0.35 s, deals 40 damage, then waits 1.1 s', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = zombieNextToPlayer(ctx);
    stepSimulation(ctx, 1 / 60);
    expect(z.ai).toBe('attacking');
    runTicks(ctx, Math.floor(ZOMBIES.attackWindup * 60) - 2, stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp);
    runTicks(ctx, 3, stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp - ZOMBIES.attackDamage);

    // Put the player back in reach (knockback moved them) and count the gap.
    p.x = z.x - PLAYER.hitboxRadius - 10;
    p.y = z.y;
    const hpAfterFirst = p.hp;
    const ticks = ticksUntil(ctx, () => p.hp < hpAfterFirst, 5);
    expect(ticks / 60).toBeCloseTo(ZOMBIES.attackCooldown + ZOMBIES.attackWindup, 1);
  });

  it('misses if the player walks out of reach during the windup', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    zombieNextToPlayer(ctx);
    stepSimulation(ctx, 1 / 60);
    p.x -= 40;
    runTicks(ctx, 30, stepSimulation);
    expect(p.hp).toBe(PLAYER.maxHp);
  });

  it('does not hurt a dashing player', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = zombieNextToPlayer(ctx);
    z.ai = 'attacking';
    z.timer = 1 / 60;
    p.dashTimer = 1;
    stepSimulation(ctx, 1 / 60);
    expect(p.hp).toBe(PLAYER.maxHp);
  });

  it('does not hurt a player in debug god mode', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = zombieNextToPlayer(ctx);
    z.ai = 'attacking';
    z.timer = 1 / 60;
    p.godMode = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.hp).toBe(PLAYER.maxHp);
  });

  it('knocks the player back 6 px and emits player:damaged', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const onDamaged = vi.fn();
    ctx.events.on('player:damaged', onDamaged);
    const z = zombieNextToPlayer(ctx);
    const x0 = p.x;
    z.ai = 'attacking';
    z.timer = 1 / 60;
    stepSimulation(ctx, 1 / 60);
    expect(x0 - p.x).toBeCloseTo(PLAYER.hitKnockback, 3);
    // With the player's feet (after the knockback) and where the blow came from, for the blood.
    expect(onDamaged).toHaveBeenCalledWith({ playerId: 0, hp: 60, maxHp: 100, x: p.x, y: p.y, fromX: z.x, fromY: z.y });
  });

  it('kills the player at 0 HP and emits player:died once', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    p.hp = 30;
    const onDied = vi.fn();
    ctx.events.on('player:died', onDied);
    const z = zombieNextToPlayer(ctx);
    z.ai = 'attacking';
    z.timer = 1 / 60;
    runTicks(ctx, 200, stepSimulation);
    expect(p.hp).toBe(0);
    expect(onDied).toHaveBeenCalledOnce();
  });
});

describe('ZombieSystem · death, blood and crowding', () => {
  it('plays a corpse for 0.6 s, frees the slot and leaves blood that fades after 20 s', () => {
    const ctx = createTestContext();
    const z = placeZombie(ctx, 0, 300, 300, 10);
    expect(damageZombie(ctx, z, 20)).toBe(true);
    expect(z.ai).toBe('dead');
    expect(ctx.state.blood.filter((b) => b.active)).toHaveLength(1);
    runTicks(ctx, Math.ceil(ZOMBIES.corpseTime * 60) + 1, stepSimulation);
    expect(z.active).toBe(false);
    runTicks(ctx, ZOMBIES.bloodFadeTime * 60, stepSimulation);
    expect(ctx.state.blood.some((b) => b.active)).toBe(false);
  });

  it('keeps at most 40 blood decals, reusing the oldest', () => {
    const ctx = createTestContext();
    for (let i = 0; i < 45; i++) {
      const z = placeZombie(ctx, 0, 200 + i, 300, 1);
      damageZombie(ctx, z, 5);
      stepSimulation(ctx, 1 / 60);
    }
    expect(ctx.state.blood.filter((b) => b.active)).toHaveLength(ZOMBIES.maxBloodDecals);
    expect(ctx.state.blood.some((b) => b.x === 244)).toBe(true);
    expect(ctx.state.blood.some((b) => b.x === 200)).toBe(false);
  });

  it('pushes stacked zombies apart', () => {
    const ctx = createTestContext();
    const a = placeZombie(ctx, 0, 300, 300, 100, 'chasing');
    const b = placeZombie(ctx, 1, 300, 300, 100, 'chasing');
    player(ctx).hp = 0; // nobody to chase: only separation moves them
    runTicks(ctx, 60, stepSimulation);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(ZOMBIES.hitboxRadius * 2);
  });

  it('surrounds a player who holds position (several attackers at once)', () => {
    const ctx = createTestContext(7, -1);
    ctx.state.wave.round = 30;
    const p = player(ctx);
    p.hp = p.maxHp = 1e9;
    const x0 = p.x;
    const y0 = p.y;
    for (let i = 0; i < 60 * 25; i++) {
      stepSimulation(ctx, 1 / 60);
      // Undo the knockback of the hits so the player "holds" the spot.
      p.x = x0;
      p.y = y0;
    }
    const inReach = ctx.state.zombies.filter(
      (z) => z.active && z.hp > 0 && Math.hypot(z.x - p.x, z.y - p.y) - PLAYER.hitboxRadius <= ZOMBIES.attackRange + 0.5,
    ).length;
    expect(inReach).toBeGreaterThanOrEqual(6);
  });

  it('never pushes the player when crowding (only hits knock back)', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const x0 = p.x;
    // A zombie shoved onto the player by separation moves out itself.
    placeZombie(ctx, 0, p.x + 13, p.y, 1000, 'idle');
    placeZombie(ctx, 1, p.x + 16, p.y, 1000, 'idle');
    runTicks(ctx, 30, stepSimulation);
    expect(p.x).toBe(x0);
  });

  it('is solid for the player, except while dashing', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    placeZombie(ctx, 0, p.x + 20, p.y, 1000);
    ctx.commands[0]!.moveX = 1;
    runTicks(ctx, 60, stepSimulation);
    expect(p.x).toBeLessThanOrEqual(ctx.map.playerSpawn.x + 20 - PLAYER.hitboxRadius - ZOMBIES.hitboxRadius + 0.01);

    const ctx2 = createTestContext();
    const p2 = player(ctx2);
    placeZombie(ctx2, 0, p2.x + 20, p2.y, 1000);
    ctx2.commands[0]!.moveX = 1;
    ctx2.commands[0]!.special = true;
    runTicks(ctx2, 12, stepSimulation);
    expect(p2.x).toBeGreaterThan(ctx2.map.playerSpawn.x + 20);
  });
});
