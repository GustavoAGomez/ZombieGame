import { describe, expect, it, vi } from 'vitest';
import { command, createMansionContext, movePlayerToTile, placeZombie, player, runTicks, tileCenter, unlockZones, zoneIndex } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { UNREACHABLE, computeFlowField, distanceAt } from '../map/FlowField';
import { updateInteractions } from './InteractionSystem';
import { isPortalBuyable, isPortalOpen, openPortal, updateZombiePortals } from './PortalSystem';
import type { SimContext } from './SimContext';
import { stepSimulation } from './Simulation';
import { updateZombies } from './ZombieSystem';

/** Spec 02 Fase M5: portals on the generated mansion. */

const portalIndex = (ctx: SimContext, id: string): number => {
  const i = ctx.map.portals.findIndex((p) => p.id === id);
  if (i < 0) throw new Error(`No portal ${id}`);
  return i;
};

const zoneAtPoint = (ctx: SimContext, x: number, y: number): string | undefined =>
  ctx.map.zones[ctx.map.cellZone[Math.floor(y / 32) * ctx.map.width + Math.floor(x / 32)] ?? -1]?.id;

/** Puts the player on a free floor tile next to portal end `id`, inside its zone. */
function standNextTo(ctx: SimContext, id: string): void {
  const portal = ctx.map.portals[portalIndex(ctx, id)]!;
  const { map, grid } = ctx;
  for (const t of portal.tiles) {
    for (const [dx, dy] of [
      [0, 1],
      [0, -1],
      [1, 0],
      [-1, 0],
    ] as const) {
      const x = t.x + dx;
      const y = t.y + dy;
      const cell = y * map.width + x;
      if (map.cellPortal[cell] !== -1 || map.cellZone[cell] !== portal.zoneIndex || grid.cells[cell] !== 0) continue;
      movePlayerToTile(ctx, x, y);
      return;
    }
  }
  throw new Error(`No free tile next to ${id}`);
}

/** Tile where travellers through `id` come out. */
const arrivalTile = (ctx: SimContext, id: string) => {
  const a = ctx.map.portals[portalIndex(ctx, id)]!.arrival;
  return { x: Math.floor(a.x / 32), y: Math.floor(a.y / 32) };
};

function pressAction(ctx: SimContext): void {
  command(ctx).actionPressed = true;
  updateInteractions(ctx, 1 / 60);
  command(ctx).actionPressed = false;
}

describe('buying portals', () => {
  it('opens the basement with P1 and only then lets you buy the hatch (P3)', () => {
    const ctx = createMansionContext();
    const p = player(ctx);
    p.money = 10_000;
    unlockZones(ctx, 'jardin');
    const events = new HudPresenter(ctx.events, ctx.map);
    const chip = vi.fn();
    ctx.events.on('action:context', chip);

    // Next to the hatch in the garden: the chip says BLOQUEADA and buying does nothing.
    standNextTo(ctx, 'P3a');
    updateInteractions(ctx, 1 / 60);
    expect(p.contextAction).toBe('portal');
    expect(p.contextTarget).toBe(portalIndex(ctx, 'P3a'));
    events.publish(ctx.state);
    expect(chip).toHaveBeenLastCalledWith({ kind: 'portal', amount: 0, enabled: false, portal: 'hatch', locked: true });
    pressAction(ctx);
    expect(isPortalOpen(ctx, portalIndex(ctx, 'P3a'))).toBe(false);
    expect(p.money).toBe(10_000);

    // Kitchen stairs: buying P1 opens both ends and unlocks the basement.
    standNextTo(ctx, 'P1a');
    updateInteractions(ctx, 1 / 60);
    events.publish(ctx.state);
    expect(chip).toHaveBeenLastCalledWith({ kind: 'portal', amount: 1750, enabled: true, portal: 'stairs', locked: false });
    pressAction(ctx);
    expect(isPortalOpen(ctx, portalIndex(ctx, 'P1a'))).toBe(true);
    expect(isPortalOpen(ctx, portalIndex(ctx, 'P1b'))).toBe(true);
    expect(ctx.state.zonesUnlocked[zoneIndex(ctx, 'sotano')]).toBe(true);
    expect(p.money).toBe(10_000 - 1750);

    // Now the hatch can be bought, and it is cheaper.
    expect(isPortalBuyable(ctx.map, ctx.state, portalIndex(ctx, 'P3a'))).toBe(true);
    standNextTo(ctx, 'P3a');
    pressAction(ctx);
    expect(isPortalOpen(ctx, portalIndex(ctx, 'P3b'))).toBe(true);
    expect(p.money).toBe(10_000 - 1750 - 1000);
  });

  it('shows the missing points when the portal is not affordable', () => {
    const ctx = createMansionContext();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const chip = vi.fn();
    ctx.events.on('action:context', chip);
    player(ctx).money = 500;
    standNextTo(ctx, 'P1a');
    updateInteractions(ctx, 1 / 60);
    presenter.publish(ctx.state);
    expect(chip).toHaveBeenLastCalledWith({ kind: 'portal', amount: 1250, enabled: false, portal: 'stairs', locked: false });
  });
});

describe('travelling', () => {
  it('takes the player to the other end without bouncing back', () => {
    const ctx = createMansionContext();
    openPortal(ctx, portalIndex(ctx, 'P1a'));
    const p = player(ctx);
    const kitchenEnd = ctx.map.portals[portalIndex(ctx, 'P1a')]!;
    const basementEnd = ctx.map.portals[portalIndex(ctx, 'P1b')]!;
    p.x = p.prevX = kitchenEnd.center.x;
    p.y = p.prevY = kitchenEnd.center.y;
    stepSimulation(ctx, 1 / 60);
    expect({ x: p.x, y: p.y }).toEqual(basementEnd.center);
    expect({ x: p.prevX, y: p.prevY }).toEqual(basementEnd.center);
    expect(p.teleports).toBe(1);

    runTicks(ctx, 30, stepSimulation);
    expect(zoneAtPoint(ctx, p.x, p.y)).toBe('sotano');
    expect(p.teleports).toBe(1);

    // Step off and back on: back to the kitchen.
    standNextTo(ctx, 'P1b');
    stepSimulation(ctx, 1 / 60);
    p.x = p.prevX = basementEnd.center.x;
    p.y = p.prevY = basementEnd.center.y;
    stepSimulation(ctx, 1 / 60);
    expect({ x: p.x, y: p.y }).toEqual(kitchenEnd.center);
    expect(p.teleports).toBe(2);
  });

  it('does nothing on a closed portal', () => {
    const ctx = createMansionContext();
    const p = player(ctx);
    const end = ctx.map.portals[portalIndex(ctx, 'P1a')]!;
    p.x = p.prevX = end.center.x;
    p.y = p.prevY = end.center.y;
    stepSimulation(ctx, 1 / 60);
    expect(zoneAtPoint(ctx, p.x, p.y)).toBe('cocina');
    expect(p.teleports).toBe(0);
  });
});

describe('zombies and portals', () => {
  const chaseStep = (ctx: SimContext, dt: number): void => {
    updateZombies(ctx, dt);
    updateZombiePortals(ctx);
  };

  /** Runs until the zombie reaches `zone`; returns the tile where it came out of a portal. */
  function followUntil(ctx: SimContext, zone: string, maxTicks: number): { x: number; y: number } | undefined {
    const z = ctx.state.zombies[0]!;
    let exit: { x: number; y: number } | undefined;
    for (let i = 0; i < maxTicks && zoneAtPoint(ctx, z.x, z.y) !== zone; i++) {
      const before = { x: z.x, y: z.y };
      chaseStep(ctx, 1 / 60);
      if (Math.hypot(z.x - before.x, z.y - before.y) > 5 * 32) exit = { x: Math.floor(z.x / 32), y: Math.floor(z.y / 32) };
    }
    return exit;
  }

  it('links both ends in the flow field', () => {
    const ctx = createMansionContext();
    unlockZones(ctx, 'cocina', 'sotano');
    movePlayerToTile(ctx, 96, 30);
    const p = player(ctx);
    const source = [Math.floor(p.y / 32) * ctx.map.width + Math.floor(p.x / 32)];
    const kitchen = tileCenter(ctx, 40, 24);
    computeFlowField(ctx.nav, ctx.map, ctx.grid, ctx.state.zonesUnlocked, source, ctx.state.portalsOpen);
    expect(distanceAt(ctx.nav, kitchen.x, kitchen.y)).toBe(UNREACHABLE);
    openPortal(ctx, portalIndex(ctx, 'P1a'));
    computeFlowField(ctx.nav, ctx.map, ctx.grid, ctx.state.zonesUnlocked, source, ctx.state.portalsOpen);
    expect(distanceAt(ctx.nav, kitchen.x, kitchen.y)).toBeGreaterThan(0);
  });

  it('follow you down the kitchen stairs', () => {
    const ctx = createMansionContext();
    openPortal(ctx, portalIndex(ctx, 'P1a'));
    movePlayerToTile(ctx, 98, 33);
    const start = tileCenter(ctx, 44, 24);
    placeZombie(ctx, 0, start.x, start.y, 100, 'chasing');
    const exit = followUntil(ctx, 'sotano', 1200);
    expect(exit).toEqual(arrivalTile(ctx, 'P1a'));
  });

  it('follow you through the hatch when it is the shorter way', () => {
    const ctx = createMansionContext();
    unlockZones(ctx, 'jardin');
    openPortal(ctx, portalIndex(ctx, 'P1a'));
    openPortal(ctx, portalIndex(ctx, 'P3a'));
    movePlayerToTile(ctx, 104, 29);
    const start = tileCenter(ctx, 20, 9);
    placeZombie(ctx, 0, start.x, start.y, 100, 'chasing');
    const exit = followUntil(ctx, 'sotano', 1200);
    expect(exit).toEqual(arrivalTile(ctx, 'P3a'));
  });

  it('stay put on a portal when the player is on their side', () => {
    const ctx = createMansionContext();
    unlockZones(ctx, 'cocina');
    openPortal(ctx, portalIndex(ctx, 'P1a'));
    movePlayerToTile(ctx, 38, 24);
    const end = ctx.map.portals[portalIndex(ctx, 'P1a')]!;
    const z = placeZombie(ctx, 0, end.center.x, end.center.y, 100, 'chasing');
    runTicks(ctx, 5, chaseStep);
    expect(zoneAtPoint(ctx, z.x, z.y)).toBe('cocina');
  });
});
