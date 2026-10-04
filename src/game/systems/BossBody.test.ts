import { describe, expect, it } from 'vitest';
import { BOSS, PLAYER, ZOMBIES } from '../../config/balance';
import { createMansionContext, placeZombie, player } from '../../test/fixtures';
import { BLOCK_PLAYER, cellBlocks } from '../map/CollisionGrid';
import { bossHalf } from './BossCombat';
import { pushPlayerOut } from './BossBody';
import { spawnBoss, updateBosses } from './BossSystem';
import type { SimContext } from './SimContext';

/**
 * The boss pushes players and zombies out of its body, never through a wall
 * (petición del usuario: it threw the player through the hall's north wall,
 * whose collision is only its 7 px base, into the locked kitchen).
 */

/** The bottom of the collision of the first wall north of (x, y). */
function wallAbove(ctx: SimContext, x: number, y: number): number {
  const ts = ctx.map.tileSize;
  const tx = Math.floor(x / ts);
  let ty = Math.floor(y / ts);
  while (!cellBlocks(ctx.grid, tx, ty, BLOCK_PLAYER)) ty--;
  return (ty + 1) * ts;
}

const zoneAt = (ctx: SimContext, x: number, y: number): string | undefined => {
  const ts = ctx.map.tileSize;
  return ctx.map.zones[ctx.map.cellZone[Math.floor(y / ts) * ctx.map.width + Math.floor(x / ts)] ?? -1]?.id;
};

/** A boss walking east along the hall's north wall, its body over the player standing against the wall. */
function squeezed() {
  const ctx = createMansionContext();
  const p = player(ctx);
  const wall = wallAbove(ctx, p.x, p.y);
  const b = spawnBoss(ctx, 0, 'butcher', 'base', p.x, p.y);
  if (!b) throw new Error('no boss slot');
  // Its body right against the wall, as close as it gets walking (its box is its footprint less the slack).
  b.y = b.prevY = wall + bossHalf(b, ctx.map.tileSize) - BOSS.bodySlack;
  b.facing = 0;
  b.moving = true;
  p.x = p.prevX = b.x - 24;
  p.y = p.prevY = wall + 10;
  return { ctx, p, b, wall };
}

describe('the boss pushes, never through walls (petición del usuario)', () => {
  it('a player squeezed against a wall is pushed out along it, not through it into the locked room', () => {
    const { ctx, p, b, wall } = squeezed();
    expect(zoneAt(ctx, p.x, p.y)).toBe('recibidor');
    pushPlayerOut(ctx, b, p);
    expect(p.y).toBeGreaterThanOrEqual(wall + PLAYER.hitboxRadius - 0.01);
    expect(zoneAt(ctx, p.x, p.y)).toBe('recibidor');
    // Out of its body by the side instead.
    const half = bossHalf(b, ctx.map.tileSize) + PLAYER.hitboxRadius;
    expect(Math.max(Math.abs(p.x - b.x), Math.abs(p.y - b.y))).toBeGreaterThanOrEqual(half - 0.01);
  });

  it('nor a zombie in its way', () => {
    const { ctx, b, wall } = squeezed();
    player(ctx).x += 200;
    const z = placeZombie(ctx, 0, b.x - 24, wall + 10, 100, 'idle');
    updateBosses(ctx, 1 / 60);
    expect(z.y).toBeGreaterThanOrEqual(wall + ZOMBIES.hitboxRadius - 0.01);
    expect(zoneAt(ctx, z.x, z.y)).toBe('recibidor');
  });
});
