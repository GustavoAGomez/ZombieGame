import { describe, expect, it, vi } from 'vitest';
import { DOORS, POINTS } from '../../config/balance';
import { command, createTestContext, player, runTicks } from '../../test/fixtures';
import { BLOCK_PLAYER, cellBlocks } from '../map/CollisionGrid';
import { distanceAt, UNREACHABLE } from '../map/FlowField';
import { pickSpawn, spawnWeight } from './SpawnSystem';
import { stepSimulation } from './Simulation';

type Ctx = ReturnType<typeof createTestContext>;

/** Puts the player in front of D1 (inicio side). */
function atD1(ctx: Ctx) {
  const d1 = ctx.map.doors[0]!;
  const p = player(ctx);
  p.x = p.prevX = d1.center.x;
  p.y = p.prevY = d1.y - 10;
  return { d1, p };
}

function tap(ctx: Ctx): void {
  const cmd = command(ctx);
  cmd.actionPressed = true;
  stepSimulation(ctx, 1 / 60);
  cmd.actionPressed = false;
}

describe('DoorSystem · context', () => {
  it('offers a closed door within 48 px', () => {
    const ctx = createTestContext();
    const { p } = atD1(ctx);
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('door');
    expect(p.contextTarget).toBe(0);
  });

  it('offers nothing beyond 48 px or once the door is open', () => {
    const ctx = createTestContext();
    const { d1, p } = atD1(ctx);
    p.y = d1.center.y - DOORS.interactRange - 2;
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('none');
    p.y = d1.y - 10;
    ctx.state.doorsOpen[0] = true;
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('none');
  });
});

describe('DoorSystem · buying', () => {
  it('does nothing without enough points, but says no (spec 08 §5.2)', () => {
    const ctx = createTestContext();
    const { p } = atD1(ctx);
    const denied = vi.fn();
    ctx.events.on('action:denied', denied);
    tap(ctx);
    expect(ctx.state.doorsOpen[0]).toBe(false);
    expect(p.money).toBe(POINTS.startMoney);
    expect(denied).toHaveBeenCalledWith({ playerId: 0 });
  });

  it('opens D1 for 750: floor, corridor unlocked, spawns W4 and W5 active', () => {
    const ctx = createTestContext();
    const { d1, p } = atD1(ctx);
    p.money = 1000;
    const opened = vi.fn();
    ctx.events.on('door:opened', opened);
    const w4 = ctx.map.zombieSpawns.findIndex((s) => s.window === 'W4');
    const w5 = ctx.map.zombieSpawns.findIndex((s) => s.window === 'W5');
    expect(spawnWeight(ctx, w4)).toBe(0);

    tap(ctx);
    expect(ctx.state.doorsOpen[0]).toBe(true);
    expect(p.money).toBe(250);
    expect(ctx.state.zonesUnlocked).toEqual([true, true, false]);
    for (const t of d1.tiles) expect(cellBlocks(ctx.grid, t.x, t.y, BLOCK_PLAYER)).toBe(false);
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ doorId: 'D1', playerId: 0 }));

    expect(spawnWeight(ctx, w4)).toBeGreaterThan(0);
    expect(spawnWeight(ctx, w5)).toBeGreaterThan(0);
    const used = new Set<string>();
    for (let i = 0; i < 400; i++) used.add(ctx.map.zombieSpawns[pickSpawn(ctx)]!.window);
    expect(used.has('W4')).toBe(true);
    expect(used.has('W5')).toBe(true);
    expect(used.has('W6')).toBe(false);
  });

  it('lets the player walk through and zombies path through it right away', () => {
    const ctx = createTestContext();
    const { d1, p } = atD1(ctx);
    p.money = 1000;
    tap(ctx);
    const pasillo = ctx.map.zones[1]!;
    expect(distanceAt(ctx.nav, pasillo.x + 40, pasillo.y + 40)).not.toBe(UNREACHABLE);
    command(ctx).moveY = 1;
    runTicks(ctx, 60, stepSimulation);
    expect(p.y).toBeGreaterThan(d1.y + d1.height);
  });

  it('cannot be bought twice', () => {
    const ctx = createTestContext();
    const { p } = atD1(ctx);
    p.money = 2000;
    tap(ctx);
    tap(ctx);
    expect(p.money).toBe(1250);
  });

  it('holding the chip buys once (tap = press edge only)', () => {
    const ctx = createTestContext();
    const { p } = atD1(ctx);
    p.money = 2000;
    command(ctx).action = true;
    runTicks(ctx, 60, stepSimulation);
    expect(ctx.state.doorsOpen[0]).toBe(false);
    expect(p.money).toBe(2000);
  });
});

describe('InteractionSystem · priority', () => {
  it('picks the nearest of a repairable window and a closed door', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const w1 = ctx.map.windows[0]!;
    ctx.state.windowPlanks[0] = 2;
    p.x = w1.interior.x;
    p.y = w1.interior.y;
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('repair');
    atD1(ctx);
    stepSimulation(ctx, 1 / 60);
    expect(p.contextAction).toBe('door');
  });
});
