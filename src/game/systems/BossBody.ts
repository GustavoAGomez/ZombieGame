import { BOSS, PLAYER } from '../../config/balance';
import type { BossState, PlayerState } from '../../core/GameState';
import { moveBossBox, type BossNav } from '../map/BossNav';
import { BLOCK_PLAYER, clearPropCells, moveCircle, type CollisionGrid } from '../map/CollisionGrid';
import { bossHalf, isBossSolid } from './BossCombat';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { isDashing } from './SpecialSystem';

/**
 * A boss's body (spec 07 §2): it moves sliding along what stops it (its
 * box a little smaller than its footprint), crushes the furniture its
 * footprint touches and pushes players out of it, unhurt.
 */

/** Moves its body (sliding on what stops it) and crushes the furniture its footprint touches. Returns true if stopped. */
export function moveBody(ctx: SimContext, b: BossState, slot: number, dx: number, dy: number): boolean {
  const nav = ctx.bossNavs[slot];
  if (!nav) return false;
  const half = bossHalf(b, ctx.map.tileSize);
  const hit = moveBossBox(nav, b, dx, dy, half - BOSS.bodySlack, BOSS.maxSubstep);
  crushFurniture(ctx, nav, b.x, b.y, half);
  return hit;
}

/** Furniture with collision under the footprint centred at (x, y) is destroyed (spec 07 §2). */
export function crushFurniture(ctx: SimContext, nav: BossNav, x: number, y: number, half: number): void {
  const ts = ctx.map.tileSize;
  const x0 = Math.floor((x - half) / ts);
  const x1 = Math.floor((x + half - 1e-6) / ts);
  const y0 = Math.floor((y - half) / ts);
  const y1 = Math.floor((y + half - 1e-6) / ts);
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || ty < 0 || tx >= nav.width || ty >= nav.height) continue;
      const index = nav.propAt[ty * nav.width + tx] ?? -1;
      if (index >= 0 && !ctx.state.propsDestroyed[index]) destroyProp(ctx, index);
    }
  }
}

/** Furniture `index` is gone for the rest of the match: no collision for anyone, drawn as rubble. */
export function destroyProp(ctx: SimContext, index: number): void {
  const { state } = ctx;
  if (state.propsDestroyed[index] !== false) return;
  state.propsDestroyed[index] = true;
  clearPropCells(ctx.grid, ctx.map, index, state.propsDestroyed);
  // The zombies' way round changes with it.
  ctx.nav.age = Infinity;
}

/** It is solid for players: pushed out of its footprint, unhurt, never through a wall; a dashing player goes through. */
export function pushPlayerOut(ctx: SimContext, b: BossState, p: PlayerState): void {
  if (!isPlayerAlive(p) || isDashing(p) || !isBossSolid(b)) return;
  const half = bossHalf(b, ctx.map.tileSize) + PLAYER.hitboxRadius;
  const alongX = Math.abs(Math.cos(b.facing)) >= Math.abs(Math.sin(b.facing));
  shoveOutOfBox(ctx.grid, p, b.x, b.y, half, b.moving ? alongX : nearestAxisIsY(p, b, half), PLAYER.hitboxRadius, BLOCK_PLAYER);
}

/**
 * Shoves a circle of `radius` out of the square of half-size `half` centred
 * at (cx, cy), moving it with the walls in the way (moveCircle), so it can
 * never be shoved through one, not even a thin wall whose collision is only
 * its base (petición del usuario: it went through into a locked room).
 * Across `acrossY` first; when a wall keeps it in, out by the nearest side
 * along the other axis. Squeezed into a corner, it stays where the walls let it.
 */
export function shoveOutOfBox(
  grid: CollisionGrid,
  pos: { x: number; y: number },
  cx: number,
  cy: number,
  half: number,
  acrossY: boolean,
  radius: number,
  mask: number,
): void {
  for (const alongY of [acrossY, !acrossY]) {
    const to = { x: pos.x, y: pos.y };
    if (!pushOutOfBox(to, cx, cy, half, alongY)) return;
    moveCircle(grid, pos, to.x - pos.x, to.y - pos.y, radius, mask);
  }
}

/** For a body that is not being run over: out by the nearest side (true = along y). */
export function nearestAxisIsY(pos: { x: number; y: number }, b: { x: number; y: number }, half: number): boolean {
  return half - Math.abs(pos.y - b.y) < half - Math.abs(pos.x - b.x);
}

/**
 * Pushes `pos` out of the square of half-size `half` centred at (cx, cy):
 * across x-motion (`acrossY`: out by the top or bottom) or across y-motion.
 * Returns true if it was inside.
 */
export function pushOutOfBox(pos: { x: number; y: number }, cx: number, cy: number, half: number, acrossY: boolean): boolean {
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  if (Math.abs(dx) >= half || Math.abs(dy) >= half) return false;
  if (acrossY) pos.y = cy + (dy >= 0 ? half : -half);
  else pos.x = cx + (dx >= 0 ? half : -half);
  return true;
}

