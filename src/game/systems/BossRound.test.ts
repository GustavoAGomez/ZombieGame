import { describe, expect, it, vi } from 'vitest';
import { BOSS } from '../../config/balance';
import { BLOCK_PLAYER } from '../map/CollisionGrid';
import { createMansionContext, player, runTicks, unlockZones } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { damageBoss, isBossAlive } from './BossCombat';
import { spawnBoss } from './BossSystem';
import { countAlive } from './SpawnSystem';
import type { SimContext } from './SimContext';
import { stepSimulation } from './Simulation';
import { startRound } from './WaveSystem';
import { zombiesInRound } from './waveFormulas';

/** Spec 07 §6–7: the boss round, its rewards and the living heart. */

const DT = 1 / 60;

function bossRound(): SimContext {
  const ctx = createMansionContext(7);
  ctx.state.wave.auto = true;
  player(ctx).godMode = true;
  startRound(ctx.state, 6);
  return ctx;
}

/** A boss already out and walking that never attacks, in the hall. */
function quietBoss(ctx: SimContext) {
  const b = spawnBoss(ctx, 0, 'butcher', 'base', 36 * 32, 36 * 32);
  if (!b) throw new Error('no boss slot');
  b.walkTimer = Number.POSITIVE_INFINITY;
  return b;
}

describe('the boss round (spec 07 §6)', () => {
  it('spawns half its zombies and brings its boss out of the floor 5 s after the banner', () => {
    const ctx = bossRound();
    expect(ctx.state.wave.toSpawn).toBe(Math.ceil(zombiesInRound(6) / 2));
    runTicks(ctx, Math.round(BOSS.entryDelay * 60) - 5, stepSimulation);
    expect(ctx.state.bosses.some((b) => b.active)).toBe(false);
    runTicks(ctx, 10, stepSimulation);
    expect(ctx.state.bosses[0]).toMatchObject({ active: true, phase: 'warning', boss: 'butcher', variant: 'base' });
  });

  it('says ALGO GRANDE SE ACERCA under its banner', () => {
    const ctx = bossRound();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const round = vi.fn();
    ctx.events.on('round:changed', round);
    presenter.publish(ctx.state);
    expect(round).toHaveBeenLastCalledWith({ round: 6, boss: true });
    startRound(ctx.state, 7);
    presenter.publish(ctx.state);
    expect(round).toHaveBeenLastCalledWith({ round: 7, boss: false });
  });

  it('does not end while a boss lives: once its zombies are over, one more every 6 s, at most 4 alive and 20 in all', () => {
    const ctx = bossRound();
    unlockZones(ctx, 'salon', 'comedor');
    const b = quietBoss(ctx);
    ctx.state.wave.toSpawn = 0;
    ctx.state.wave.bossDelay = -1;
    runTicks(ctx, Math.round(BOSS.dripInterval * 60) - 10, stepSimulation);
    expect(countAlive(ctx)).toBe(0);
    runTicks(ctx, 20, stepSimulation);
    expect(countAlive(ctx)).toBe(1);
    // Never more than 4 alive.
    runTicks(ctx, Math.round(BOSS.dripInterval * 60) * 6, stepSimulation);
    expect(countAlive(ctx)).toBeLessThanOrEqual(BOSS.dripMaxAlive);
    expect(ctx.state.wave.phase).toBe('active');
    // 20 in all: killed as they come, the drip runs dry.
    for (let i = 0; i < 40 * 6 * 60 && ctx.state.wave.dripLeft > 0; i++) {
      stepSimulation(ctx, DT);
      for (const z of ctx.state.zombies) if (z.active && z.ai !== 'dead') z.hp = 0;
    }
    expect(ctx.state.wave.dripLeft).toBe(0);
    expect(isBossAlive(b)).toBe(true);
    expect(ctx.state.wave.phase).toBe('active');
  });

  it('ends once its bosses and every zombie are dead', () => {
    const ctx = bossRound();
    const b = quietBoss(ctx);
    ctx.state.wave.toSpawn = 0;
    ctx.state.wave.bossDelay = -1;
    stepSimulation(ctx, DT);
    expect(ctx.state.wave.phase).toBe('active');
    damageBoss(ctx, b, 1e9, 0);
    stepSimulation(ctx, DT);
    expect(ctx.state.wave.phase).toBe('rest');
  });
});

describe('boss rewards (spec 07 §6–7)', () => {
  it('500 points and money, a health and an ammo pickup, and the living heart where it falls the first time only', () => {
    const ctx = bossRound();
    const p = player(ctx);
    const first = quietBoss(ctx);
    const money = p.money;
    damageBoss(ctx, first, 1e9, p.id);
    expect(p.money).toBe(money + BOSS.rewardPoints + 5);
    const kinds = ctx.state.pickups.filter((k) => k.active).map((k) => k.kind);
    expect(kinds).toEqual(expect.arrayContaining(['health', 'ammo']));
    const hearts = ctx.state.groundItems.filter((g) => g.item === 'living_heart' && g.active);
    expect(hearts).toHaveLength(1);
    expect(Math.hypot((hearts[0]?.x ?? 0) - first.x, (hearts[0]?.y ?? 0) - first.y)).toBeLessThan(40);
    // A second boss: the rewards again, but no second heart.
    runTicks(ctx, Math.ceil(BOSS.corpseTime * 60) + 2, stepSimulation);
    const second = quietBoss(ctx);
    damageBoss(ctx, second, 1e9, p.id);
    expect(ctx.state.groundItems.filter((g) => g.item === 'living_heart')).toHaveLength(1);
    expect(ctx.state.bossKills).toBe(2);
  });

  it('drops no heart while one is in play, and drops it on walkable floor when the boss dies over a wall', () => {
    const ctx = bossRound();
    const p = player(ctx);
    p.items = ['living_heart'];
    damageBoss(ctx, quietBoss(ctx), 1e9, p.id);
    expect(ctx.state.groundItems.some((g) => g.item === 'living_heart')).toBe(false);

    const other = bossRound();
    const b = quietBoss(other);
    // Its centre over the hall's west wall (column 32).
    b.x = 32.5 * 32;
    b.y = 33.5 * 32;
    damageBoss(other, b, 1e9, 0);
    const heart = other.state.groundItems.find((g) => g.item === 'living_heart');
    if (!heart) throw new Error('no heart');
    const cell = Math.floor(heart.y / 32) * other.map.width + Math.floor(heart.x / 32);
    expect((other.grid.cells[cell] ?? 0) & BLOCK_PLAYER).toBe(0);
  });
});
