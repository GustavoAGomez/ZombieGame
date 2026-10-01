import { describe, expect, it } from 'vitest';
import { NAVIGATION } from '../../config/balance';
import { createMansionContext, placeZombie, player, zoneIndex } from '../../test/fixtures';
import { distanceAt, UNREACHABLE } from '../map/FlowField';
import { stepSimulation } from './Simulation';

/**
 * The basement's south grating (S2) opens onto the void: zombies come from a
 * spawn in the void, walk straight to the grating, tear it and climb in.
 * With the player standing right inside it they used to get stuck outside.
 */
describe('zombies at a window over the void (basement S2)', () => {
  it.each(['S2', 'S1'])('all get in through %s and reach the player standing right inside it', (id) => {
    const ctx = createMansionContext(3);
    const sotano = zoneIndex(ctx, 'sotano');
    ctx.state.zonesUnlocked[sotano] = true;
    const s2 = ctx.map.windows.findIndex((w) => w.id === id);
    const w = ctx.map.windows[s2]!;
    const spawn = ctx.map.zombieSpawns.find((s) => s.windowIndex === s2)!;
    const p = player(ctx);
    p.godMode = true;
    p.x = p.prevX = w.interior.x;
    p.y = p.prevY = w.interior.y - 4;
    // A crowd coming in through the grating, a few px apart like a real queue.
    const zombies = Array.from({ length: 6 }, (_, i) => {
      const z = placeZombie(ctx, i, spawn.x + (i - 3) * 5, spawn.y + i * 4, 3, 'toWindow');
      z.window = s2;
      z.crossOut = false;
      return z;
    });
    for (let t = 0; t < 40 * 60; t++) stepSimulation(ctx, 1 / 60);
    for (const z of zombies) {
      // Inside the basement (the far side of the grating from the void), on the flow field.
      const inside = (z.x - w.center.x) * w.outward.x + (z.y - w.center.y) * w.outward.y < 0;
      expect(inside, `zombie at ${z.x.toFixed(0)},${z.y.toFixed(0)} (${z.ai})`).toBe(true);
      expect(distanceAt(ctx.nav, z.x, z.y)).not.toBe(UNREACHABLE);
    }
  });

  it('sends a zombie shoved out into the void back in through the nearest window', () => {
    const ctx = createMansionContext(4);
    ctx.state.zonesUnlocked[zoneIndex(ctx, 'sotano')] = true;
    const s2 = ctx.map.windows.findIndex((w) => w.id === 'S2');
    const w = ctx.map.windows[s2]!;
    const p = player(ctx);
    p.godMode = true;
    p.x = p.prevX = w.interior.x;
    p.y = p.prevY = w.interior.y - 20;
    ctx.state.windowPlanks[s2] = 0;
    // Chasing, but outside the grating: off the flow field.
    const z = placeZombie(ctx, 0, w.exterior.x - 10, w.exterior.y + 6, 3, 'chasing');
    stepSimulation(ctx, 1 / 60);
    expect([z.ai, z.window]).toEqual(['toWindow', s2]);
    for (let t = 0; t < 10 * 60; t++) stepSimulation(ctx, 1 / 60);
    expect(z.y).toBeLessThan(w.center.y);
    expect(distanceAt(ctx.nav, z.x, z.y)).not.toBe(UNREACHABLE);
  });

  it('takes a zombie lost far from any window off the map and spawns it again, keeping the round count', () => {
    const ctx = createMansionContext(5);
    ctx.state.zonesUnlocked[zoneIndex(ctx, 'sotano')] = true;
    const p = player(ctx);
    p.godMode = true;
    p.x = p.prevX = 95.5 * 32;
    p.y = p.prevY = 35.5 * 32;
    // Deep in the void south of the basement, 11 tiles from its grating.
    const z = placeZombie(ctx, 0, 100.5 * 32, 55.5 * 32, 3, 'chasing');
    // No new spawn right away, so the freed slot is not reused during the test.
    ctx.state.wave.spawnTimer = 999;
    const toSpawn = ctx.state.wave.toSpawn;
    for (let t = 0; t < (NAVIGATION.lostRespawnTime - 0.5) * 60; t++) stepSimulation(ctx, 1 / 60);
    expect(z.active).toBe(true);
    for (let t = 0; t < 60; t++) stepSimulation(ctx, 1 / 60);
    expect(z.active).toBe(false);
    expect(ctx.state.wave.toSpawn).toBe(toSpawn + 1);
  });
});
