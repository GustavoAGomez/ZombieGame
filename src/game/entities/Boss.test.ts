import { describe, expect, it } from 'vitest';
import { BOSS } from '../../config/balance';
import { BOSSES } from '../../config/bosses';
import { createTestContext, player, runTicks } from '../../test/fixtures';
import type { AnimationDef, BossAnimation } from '../assets/manifest';
import { chargeWindup, leapAirTime, slamWindup, startAttack } from '../systems/BossAttacks';
import { damageBoss } from '../systems/BossCombat';
import { spawnBoss } from '../systems/BossSystem';
import type { SimContext } from '../systems/SimContext';
import { stepSimulation } from '../systems/Simulation';
import { bossFrame, waveReach, type BossArt } from './Boss';

/** Spec 07 §8: which frame of its art a boss shows, from its state. */

const anim = (frames: number, fps: number, marks?: Record<string, number>): AnimationDef => ({
  file: '',
  frames,
  fps,
  loop: false,
  ...(marks ? { marks } : {}),
});
const SHEETS: Record<BossAnimation, AnimationDef> = {
  idle: anim(1, 6),
  walk: anim(8, 8),
  charge_windup: anim(7, 8),
  charge: anim(6, 12),
  stunned: anim(6, 6),
  slam: anim(9, 12, { hit: 7 }),
  leap: anim(9, 10, { air: 2, land: 6 }),
  roar: anim(9, 9),
  death: anim(9, 8),
};
const art: BossArt = (a) => SHEETS[a];

function setup(): { ctx: SimContext; frame: () => ReturnType<typeof bossFrame> } {
  const ctx = createTestContext();
  const p = player(ctx);
  p.godMode = true;
  p.x = p.prevX = 330;
  p.y = p.prevY = 272;
  const b = spawnBoss(ctx, 0, 'butcher', 'base', 240, 272);
  if (!b) throw new Error('no boss slot');
  b.walkTimer = Number.POSITIVE_INFINITY;
  return { ctx, frame: () => bossFrame(b, ctx.state.time, ctx.state.tick, art) };
}

const boss = (ctx: SimContext) => ctx.state.bosses[0]!;

describe('bossFrame (spec 07 §8)', () => {
  it('stands still on its idle frame and walks its loop while it moves', () => {
    const { ctx, frame } = setup();
    expect(frame()).toEqual({ animation: 'idle', frame: 0 });
    boss(ctx).moving = true;
    ctx.state.time = 0.3;
    expect(frame()).toEqual({ animation: 'walk', frame: 2 });
  });

  it('winds its charge up over the whole windup, then runs its loop', () => {
    const { ctx, frame } = setup();
    startAttack(ctx, boss(ctx), 'charge', player(ctx));
    expect(frame()).toEqual({ animation: 'charge_windup', frame: 0 });
    runTicks(ctx, Math.floor(chargeWindup(boss(ctx)) * 60) - 2, stepSimulation);
    expect(frame()).toEqual({ animation: 'charge_windup', frame: 6 });
    runTicks(ctx, 4, stepSimulation);
    expect(frame().animation).toBe('charge');
  });

  it('raises the mallet until the blow and brings it down on the frames from its hit mark', () => {
    const { ctx, frame } = setup();
    startAttack(ctx, boss(ctx), 'slam', player(ctx));
    expect(frame()).toEqual({ animation: 'slam', frame: 0 });
    runTicks(ctx, Math.floor(slamWindup(boss(ctx)) * 60) - 1, stepSimulation);
    expect(frame()).toEqual({ animation: 'slam', frame: 6 });
    runTicks(ctx, 2, stepSimulation);
    expect(boss(ctx).count).toBe(1);
    expect(frame()).toEqual({ animation: 'slam', frame: 7 });
    // Once the blow's frames are over, the next blow winds up again.
    runTicks(ctx, Math.ceil((2 / 12) * 60) + 1, stepSimulation);
    expect(frame().frame).toBeLessThan(7);
  });

  it('is in the air from its air mark up to its land mark, and lands on the frames after it', () => {
    const { ctx, frame } = setup();
    startAttack(ctx, boss(ctx), 'leap', player(ctx));
    expect(frame()).toEqual({ animation: 'leap', frame: 2 });
    runTicks(ctx, Math.floor(leapAirTime(boss(ctx)) * 60) - 1, stepSimulation);
    expect(frame()).toEqual({ animation: 'leap', frame: 5 });
    runTicks(ctx, 2, stepSimulation);
    expect(frame()).toEqual({ animation: 'leap', frame: 6 });
    runTicks(ctx, Math.ceil((3 / 10) * 60) + 1, stepSimulation);
    expect(frame()).toEqual({ animation: 'idle', frame: 0 });
  });

  it('roars over the whole roar and falls once when it dies, holding the last frame', () => {
    const { ctx, frame } = setup();
    const b = boss(ctx);
    b.phase = 'roaring';
    b.phaseTick = ctx.state.tick;
    ctx.state.tick += Math.round(BOSS.roarTime * 60 * 0.5);
    expect(frame()).toEqual({ animation: 'roar', frame: 4 });
    damageBoss(ctx, b, 1e9, 0);
    expect(frame()).toEqual({ animation: 'death', frame: 0 });
    ctx.state.tick += 60;
    expect(frame()).toEqual({ animation: 'death', frame: 8 });
  });
});

describe('waveReach (petición del usuario: the ring was drawn over the walls)', () => {
  it('stops each ray of the ring where its blow stops: short towards a wall, whole into the open room', () => {
    const ctx = createTestContext();
    // room01's first room runs from x 128 to 576: 72 px to its west wall, the whole ring to the east
    // (y 216: no window there, and on the base of its wall cell).
    const radius = BOSSES.butcher.leap.waveRadius;
    const reach = waveReach(ctx.grid, 200, 216, radius, new Float32Array(128));
    const east = reach[0] ?? 0;
    const west = reach[64] ?? 0;
    expect(east).toBe(radius);
    expect(west).toBeLessThan(80);
    expect(west).toBeGreaterThan(40);
  });
});
