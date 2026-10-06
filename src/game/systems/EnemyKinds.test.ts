import { describe, expect, it } from 'vitest';
import { PLAYER, ZOMBIES } from '../../config/balance';
import { DUNGEON, floorConfig } from '../../config/dungeon';
import type { GameEvents } from '../../core/EventBus';
import type { ZombieState } from '../../core/GameState';
import { dungeonContext } from '../../test/dungeonFixtures';
import { damageZombie, isZombieAlive, knockZombie } from './Combat';
import { composeWave, placeDungeonZombie } from './DungeonSystem';
import type { SimContext } from './SimContext';
import { stepSimulation } from './Simulation';
import { isCrawling } from './ZombieSystem';

const DT = 1 / 60;

function steps(ctx: SimContext, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepSimulation(ctx, DT);
}

/** A match on `floor`, settled in the start room, with the player standing still in its middle. */
function arena(floor = 2): { ctx: SimContext; x: number; y: number } {
  const ctx = dungeonContext(3, floor);
  steps(ctx, 0.1);
  const p = ctx.state.players[0]!;
  const zone = ctx.map.zones[ctx.state.run!.plan.start]!;
  p.x = p.prevX = zone.x + zone.width / 2;
  p.y = p.prevY = zone.y + zone.height / 2;
  return { ctx, x: p.x, y: p.y };
}

function place(ctx: SimContext, kind: ZombieState['kind'], x: number, y: number, floor: number, elite = false): ZombieState {
  const z = ctx.state.zombies.find((z) => !z.active)!;
  placeDungeonZombie(ctx, z, kind, x, y, floor, elite);
  return z;
}

describe('the dungeon\'s kinds (spec 09 §5.2)', () => {
  it('composes waves within each kind\'s limit, and only with the kinds the floor allows', () => {
    const { ctx } = arena(1);
    for (let i = 0; i < 30; i++) {
      const wave = composeWave(ctx, 20, 1);
      expect(wave).not.toContain('spitter');
      expect(wave).not.toContain('brute');
      expect(wave).not.toContain('sprinter');
    }
    let spitters = 0;
    let brutes = 0;
    for (let i = 0; i < 40; i++) {
      const wave = composeWave(ctx, 20, 3);
      expect(wave.filter((k) => k === 'spitter').length).toBeLessThanOrEqual(DUNGEON.waveLimits.spitter!);
      expect(wave.filter((k) => k === 'brute').length).toBeLessThanOrEqual(DUNGEON.waveLimits.brute!);
      spitters += wave.filter((k) => k === 'spitter').length;
      brutes += wave.filter((k) => k === 'brute').length;
      expect(wave.reduce((n, k) => n + DUNGEON.enemies[k].cost, 0)).toBeLessThanOrEqual(20);
    }
    expect(spitters).toBeGreaterThan(0);
    expect(brutes).toBeGreaterThan(0);
  });

  it('gives each kind its life: the spitter a hit less, the brute five times, an elite two and a half', () => {
    const { ctx } = arena(2);
    const hp = floorConfig(2).zombieHp;
    expect(place(ctx, 'spitter', 100, 100, 2).maxHp).toBe(hp + DUNGEON.kinds.spitter.hpDelta);
    expect(place(ctx, 'brute', 100, 100, 2).maxHp).toBe(hp * DUNGEON.kinds.brute.hp);
    expect(place(ctx, 'exploder', 100, 100, 2, true).maxHp).toBe(Math.round(hp * DUNGEON.elite.hp));
  });

  it('the spitter keeps its distance, swells and spits a slow shot that hurts and leaves a puddle', () => {
    const { ctx, x, y } = arena(2);
    const p = ctx.state.players[0]!;
    const spits: GameEvents['enemy:spit'][] = [];
    const hits: GameEvents['enemy:spitHit'][] = [];
    ctx.events.on('enemy:spit', (e) => spits.push(e));
    ctx.events.on('enemy:spitHit', (e) => hits.push(e));
    const z = place(ctx, 'spitter', x + 120, y, 2);
    const from = z.x;
    // Within reach of its sight: it does not walk in.
    steps(ctx, 1);
    expect(Math.abs(z.x - from)).toBeLessThan(2);
    expect(z.ai).toBe('chasing');
    // Its first spit comes after half its cadence and its swell: within the next second.
    let guard = 0;
    while (spits.length === 0 && guard++ < 120) stepSimulation(ctx, DT);
    expect(spits).toHaveLength(1);
    expect(guard).toBeLessThan(120);
    const shot = ctx.state.enemyShots.find((s) => s.active)!;
    expect(shot).toBeDefined();
    expect(Math.hypot(shot.vx, shot.vy)).toBeCloseTo(DUNGEON.kinds.spitter.shotSpeed);
    const hp = p.hp;
    // The shot takes 120 px at 140 px/s to arrive; the moment it lands, its damage (the puddle's comes later).
    guard = 0;
    while (hits.length === 0 && guard++ < 120) stepSimulation(ctx, DT);
    expect(guard).toBeGreaterThan(40);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.player).toBe(true);
    expect(p.hp).toBe(hp - DUNGEON.kinds.spitter.damage);
    const puddle = ctx.state.puddles.find((q) => q.active)!;
    expect(puddle).toBeDefined();
    expect(puddle.timer).toBeLessThanOrEqual(DUNGEON.kinds.spitter.puddleTime);
    expect(puddle.radius).toBe(DUNGEON.kinds.spitter.puddleRadius);
  });

  it('the dash goes through a spit', () => {
    const { ctx, x, y } = arena(2);
    const p = ctx.state.players[0]!;
    const shot = ctx.state.enemyShots[0]!;
    Object.assign(shot, { active: true, x: x - 30, y, vx: DUNGEON.kinds.spitter.shotSpeed, vy: 0, travelled: 0 });
    p.dashTimer = 10;
    const hp = p.hp;
    steps(ctx, 0.6);
    expect(p.hp).toBe(hp);
    expect(shot.travelled).toBeGreaterThan(60);
  });

  it('a wall stops the spit, which leaves its puddle before it', () => {
    const { ctx, x, y } = arena(2);
    const zone = ctx.map.zones[ctx.state.run!.plan.start]!;
    const shot = ctx.state.enemyShots[0]!;
    // Towards the room's east wall.
    Object.assign(shot, { active: true, x: zone.x + zone.width - 40, y, vx: DUNGEON.kinds.spitter.shotSpeed, vy: 0, travelled: 0 });
    steps(ctx, 1);
    expect(shot.active).toBe(false);
    const puddle = ctx.state.puddles.find((q) => q.active)!;
    expect(puddle.x).toBeLessThan(zone.x + zone.width);
    expect(x).toBeGreaterThan(0);
  });

  it('the exploder bursts when killed: the player and the enemies around take it, and the bursts chain', () => {
    const { ctx, x, y } = arena(1);
    const p = ctx.state.players[0]!;
    const bursts: GameEvents['enemy:exploded'][] = [];
    ctx.events.on('enemy:exploded', (e) => bursts.push(e));
    const a = place(ctx, 'exploder', x + 30, y, 1);
    const b = place(ctx, 'exploder', x + 70, y, 1);
    const far = place(ctx, 'walker', x + 300, y, 1);
    const near = place(ctx, 'walker', x + 50, y + 20, 1);
    const hp = p.hp;
    damageZombie(ctx, a, 1e9, 0);
    expect(a.fuse).toBeCloseTo(DUNGEON.kinds.exploder.fuse);
    expect(bursts).toHaveLength(0);
    steps(ctx, DUNGEON.kinds.exploder.fuse + DT);
    expect(bursts).toHaveLength(1);
    expect(p.hp).toBe(hp - DUNGEON.kinds.exploder.damage);
    // The walker near lost 3; the one far nothing; the other exploder died and lit its own fuse.
    expect(near.hp).toBe(near.maxHp - DUNGEON.kinds.exploder.enemyDamage);
    expect(far.hp).toBe(far.maxHp);
    expect(isZombieAlive(b)).toBe(false);
    expect(b.fuse).toBeGreaterThan(0);
    steps(ctx, DUNGEON.kinds.exploder.fuse + DT);
    expect(bursts).toHaveLength(2);
    expect(ctx.state.run!.explosions.length).toBeGreaterThan(0);
    steps(ctx, DUNGEON.explosionFade + DT);
    expect(ctx.state.run!.explosions).toHaveLength(0);
  });

  it('the exploder that reaches the player lights its fuse instead of clawing, and dies in its own burst', () => {
    const { ctx, x, y } = arena(1);
    const p = ctx.state.players[0]!;
    const z = place(ctx, 'exploder', x + 40, y, 1);
    const fuses: GameEvents['enemy:fuse'][] = [];
    ctx.events.on('enemy:fuse', (e) => fuses.push(e));
    const money = p.money;
    steps(ctx, 2);
    expect(fuses).toHaveLength(1);
    expect(isZombieAlive(z)).toBe(false);
    expect(p.hp).toBe(PLAYER.maxHp - DUNGEON.kinds.exploder.damage);
    // Nobody is paid for its death.
    expect(p.money).toBe(money);
  });

  it('the brute is slow, hits hard, is never pushed and never crawls', () => {
    const { ctx, x, y } = arena(2);
    const p = ctx.state.players[0]!;
    const z = place(ctx, 'brute', x + 200, y, 2);
    const from = z.x;
    steps(ctx, 1);
    const moved = from - z.x;
    expect(moved).toBeGreaterThan(ZOMBIES.kinds.brute.speed * 0.7);
    expect(moved).toBeLessThan(ZOMBIES.kinds.walker.speed);
    knockZombie(ctx, z, 1, 0, 30);
    expect(z.x).toBeCloseTo(from - moved, 5);
    z.hp = 1;
    expect(isCrawling(z)).toBe(false);
    // Up close: its claw.
    z.x = z.prevX = x + 20;
    z.hp = z.maxHp;
    const hp = p.hp;
    steps(ctx, ZOMBIES.attackWindup + 0.2);
    expect(p.hp).toBe(hp - DUNGEON.kinds.brute.damage);
  });
});
