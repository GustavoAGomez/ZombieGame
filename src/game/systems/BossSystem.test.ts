import { describe, expect, it } from 'vitest';
import { BOSS, PLAYER, POINTS, ZOMBIES } from '../../config/balance';
import { BOSSES } from '../../config/bosses';
import { WEAPONS } from '../../config/weapons';
import { createMansionContext, createTestContext, holdFire, placeZombie, player, runTicks, tileCenter, unlockZones } from '../../test/fixtures';
import { BLOCK_PROP } from '../map/CollisionGrid';
import { bossHalf, damageBoss, distanceToBoss } from './BossCombat';
import { spawnBoss } from './BossSystem';
import { stepSimulation } from './Simulation';
import type { SimContext } from './SimContext';

const TS = 32;

function bossAt(ctx: SimContext, x: number, y: number) {
  const b = spawnBoss(ctx, 0, 'butcher', 'base', x, y);
  if (!b) throw new Error('no boss slot');
  return b;
}

/** Every room open and every door open, for walks across the mansion. */
function openMansion(ctx: SimContext): void {
  unlockZones(ctx, ...ctx.map.zones.map((z) => z.id));
  ctx.state.doorsOpen.fill(true);
  ctx.map.doors.forEach((door) => {
    for (const t of door.tiles) ctx.grid.cells[t.y * ctx.map.width + t.x] = 0;
  });
}

describe('BossSystem (spec 07 §2)', () => {
  it('walks to its target and stops right next to it', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const b = bossAt(ctx, p.x + 150, p.y);
    runTicks(ctx, 60, stepSimulation);
    expect(b.x).toBeLessThan(p.x + 150);
    expect(b.x - b.prevX).toBeLessThan(0);
    runTicks(ctx, 600, stepSimulation);
    expect(distanceToBoss(b, TS, p.x, p.y)).toBeLessThanOrEqual(TS + PLAYER.hitboxRadius);
    expect(b.moving).toBe(false);
  });

  it('walks at its own speed', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const b = bossAt(ctx, p.x + 150, p.y);
    runTicks(ctx, 30, stepSimulation);
    const x0 = b.x;
    runTicks(ctx, 60, stepSimulation);
    expect(x0 - b.x).toBeCloseTo(BOSSES.butcher.speed, -1);
  });

  it('crosses the mansion through its 2-tile doors to reach the player', () => {
    const ctx = createMansionContext();
    openMansion(ctx);
    const p = player(ctx);
    // The player in the dining room, the boss in the hall.
    const dining = ctx.map.zones.findIndex((z) => z.id === 'comedor');
    const cell = ctx.map.cellZone.findIndex((z, i) => z === dining && ctx.grid.cells[i] === 0 && ctx.grid.cells[i + 1] === 0 && ctx.grid.cells[i + ctx.map.width] === 0);
    const c = tileCenter(ctx, cell % ctx.map.width, Math.floor(cell / ctx.map.width));
    p.x = p.prevX = c.x;
    p.y = p.prevY = c.y;
    const b = bossAt(ctx, 36 * TS, 31 * TS);
    const start = distanceToBoss(b, TS, p.x, p.y);
    runTicks(ctx, 60 * 60, stepSimulation);
    expect(start).toBeGreaterThan(300);
    expect(distanceToBoss(b, TS, p.x, p.y)).toBeLessThanOrEqual(TS + PLAYER.hitboxRadius);
  });

  it('crushes the furniture its footprint touches: no collision for anyone, for good', () => {
    const ctx = createMansionContext();
    const p = player(ctx);
    // The hall's bench (43–44, 30) lies between the boss and the player.
    const bench = ctx.map.props.findIndex((prop) => prop.key === 'prop_banco');
    expect(bench).toBeGreaterThanOrEqual(0);
    const target = tileCenter(ctx, 46, 30);
    p.x = p.prevX = target.x;
    p.y = p.prevY = target.y;
    bossAt(ctx, 36 * TS, 31 * TS);
    runTicks(ctx, 60 * 15, stepSimulation);
    expect(ctx.state.propsDestroyed[bench]).toBe(true);
    for (const t of ctx.map.props[bench]?.tiles ?? []) expect((ctx.grid.cells[t.y * ctx.map.width + t.x] ?? 0) & BLOCK_PROP).toBe(0);
    // Untouched furniture keeps its collision.
    const boxes = ctx.map.props.findIndex((prop) => prop.key === 'prop_cajas');
    expect(ctx.state.propsDestroyed[boxes]).toBe(false);
  });

  it('takes the damage of the bullets that hit it, which score as hits', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const b = bossAt(ctx, p.x + 120, p.y);
    b.phase = 'walking';
    const money = p.money;
    const cmd = holdFire(ctx);
    cmd.aimManual = true;
    cmd.aimX = 1;
    cmd.aimY = 0;
    stepSimulation(ctx, 1 / 60);
    cmd.fire = false;
    runTicks(ctx, 20, stepSimulation);
    expect(b.hp).toBe(BOSSES.butcher.hp - WEAPONS.pistol.damage);
    expect(p.money).toBe(money + POINTS.hit);
  });

  it('dies at 0 health: a corpse for a moment, then off the map', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const b = bossAt(ctx, p.x + 120, p.y);
    const killed: string[] = [];
    ctx.events.on('boss:killed', (e) => killed.push(`${e.boss}:${e.variant}`));
    expect(damageBoss(ctx, b, 40, p.id)).toBe(false);
    expect(damageBoss(ctx, b, 60, p.id)).toBe(true);
    expect(b.phase).toBe('dead');
    expect(killed).toEqual(['butcher:base']);
    // A corpse takes no more damage.
    expect(damageBoss(ctx, b, 10, p.id)).toBe(false);
    runTicks(ctx, Math.ceil(BOSS.corpseTime * 60) + 2, stepSimulation);
    expect(b.active).toBe(false);
  });

  it('is solid for the player, who is pushed out unhurt; a dash goes through', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const b = bossAt(ctx, p.x + 20, p.y);
    const hp = p.hp;
    stepSimulation(ctx, 1 / 60);
    expect(distanceToBoss(b, TS, p.x, p.y)).toBeGreaterThanOrEqual(PLAYER.hitboxRadius - 1e-6);
    expect(p.hp).toBe(hp);
    // Dashing, the player can be inside it.
    p.x = b.x - 10;
    p.y = b.y;
    p.dashTimer = 1;
    const x = p.x;
    stepSimulation(ctx, 1 / 60);
    expect(Math.abs(p.x - x)).toBeLessThan(bossHalf(b, TS));
  });

  it('never stands on another boss', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const a = bossAt(ctx, p.x + 150, p.y);
    const b = spawnBoss(ctx, 1, 'butcher', 'base', p.x + 150, p.y);
    if (!b) throw new Error('no second slot');
    runTicks(ctx, 30, stepSimulation);
    const reach = bossHalf(a, TS) + bossHalf(b, TS);
    expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBeGreaterThanOrEqual(reach - 1);
  });

  it('shoves the zombies in its way aside', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const b = bossAt(ctx, p.x + 150, p.y);
    const z = placeZombie(ctx, 0, b.x - 10, b.y + 4, 100, 'idle');
    stepSimulation(ctx, 1 / 60);
    expect(Math.abs(z.y - b.y)).toBeGreaterThanOrEqual(bossHalf(b, TS) + ZOMBIES.hitboxRadius - 1);
    expect(z.hp).toBe(100);
  });
});
