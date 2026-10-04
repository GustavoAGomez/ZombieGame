import { BOSS, PLAYER, ZOMBIES } from '../../config/balance';
import { BOSS_VARIANTS, BOSSES, bossHp, type BossId, type BossVariantId } from '../../config/bosses';
import type { BossState, PlayerState } from '../../core/GameState';
import {
  BOSS_UNREACHABLE,
  bossNextPosition,
  computeBossNav,
  footprintFits,
  moveBossBox,
  positionCentre,
  refreshBossNav,
  updateBossBlocking,
  type BossNav,
} from '../map/BossNav';
import { BLOCK_PLAYER, BLOCK_ZOMBIE, clearPropCells, resolveCircle } from '../map/CollisionGrid';
import { bossHalf, isBossAlive } from './BossCombat';
import { isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';
import { isDashing } from './SpecialSystem';
import { pushable } from './ZombieSystem';

/**
 * Bosses on the map (spec 07). Each one walks after its target (the nearest
 * player alive) on its own way round the map (BossNav), crushing the
 * furniture its footprint touches: the furniture loses its collision for
 * good and turns into rubble. Walking, it shoves the zombies in its way
 * aside and pushes players without hurting them (it is solid for them;
 * the dash goes through). Dead, its corpse stays a moment.
 */

const scratchCentre = { x: 0, y: 0 };

export function updateBosses(ctx: SimContext, dt: number): void {
  const { bosses } = ctx.state;
  for (let i = 0; i < bosses.length; i++) {
    const b = bosses[i];
    if (!b?.active) continue;
    b.prevX = b.x;
    b.prevY = b.y;
    b.moving = false;
    switch (b.phase) {
      case 'walking':
        walk(ctx, b, i, dt);
        break;
      case 'dead':
        b.timer -= dt;
        if (b.timer <= 0) b.active = false;
        break;
    }
  }
  separateBosses(ctx);
  for (const b of bosses) {
    if (!isBossAlive(b)) continue;
    shoveZombies(ctx, b);
    for (const p of ctx.state.players) pushPlayerOut(ctx, b, p);
  }
}

/** Two bosses never stand on each other: overlapping footprints push apart, half each, along the shallower axis. */
function separateBosses(ctx: SimContext): void {
  const { bosses } = ctx.state;
  const ts = ctx.map.tileSize;
  for (let i = 0; i < bosses.length; i++) {
    const a = bosses[i];
    if (!a || !isBossAlive(a)) continue;
    for (let j = i + 1; j < bosses.length; j++) {
      const b = bosses[j];
      if (!b || !isBossAlive(b)) continue;
      const reach = bossHalf(a, ts) + bossHalf(b, ts);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const overlapX = reach - Math.abs(dx);
      const overlapY = reach - Math.abs(dy);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const alongX = overlapX < overlapY;
      const push = (alongX ? overlapX : overlapY) / 2;
      // Perfectly stacked: apart along x, by their slots.
      const sign = (alongX ? dx : dy) === 0 ? 1 : Math.sign(alongX ? dx : dy);
      moveBody(ctx, a, i, alongX ? -sign * push : 0, alongX ? 0 : -sign * push);
      moveBody(ctx, b, j, alongX ? sign * push : 0, alongX ? 0 : sign * push);
    }
  }
}

/** The player a boss goes for: the nearest one alive (spec 07 §9). */
export function nearestPlayer(ctx: SimContext, x: number, y: number): PlayerState | undefined {
  let best: PlayerState | undefined;
  let bestSq = Infinity;
  for (const p of ctx.state.players) {
    if (!isPlayerAlive(p)) continue;
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestSq) {
      bestSq = d;
      best = p;
    }
  }
  return best;
}

function targetOf(ctx: SimContext, b: BossState): PlayerState | undefined {
  const current = ctx.state.players.find((p) => p.id === b.target);
  if (current && isPlayerAlive(current)) return current;
  const p = nearestPlayer(ctx, b.x, b.y);
  b.target = p?.id ?? -1;
  return p;
}

/** Walking speed: its own, a quarter faster enraged (spec 07 §5). */
export function bossSpeed(b: BossState): number {
  return BOSSES[b.boss].speed;
}

/** One step along its way to the target; it stops once next to it. */
function walk(ctx: SimContext, b: BossState, slot: number, dt: number): void {
  const target = targetOf(ctx, b);
  const nav = ctx.bossNavs[slot];
  if (!target || !nav) return;
  refreshBossNav(nav, ctx.map, ctx.state, target.x, target.y, dt);
  const next = bossNextPosition(nav, b.x, b.y);
  if (next < 0) return;
  const to = positionCentre(nav, next, scratchCentre);
  const dx = to.x - b.x;
  const dy = to.y - b.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-3) {
    // Already next to its target: it faces it and waits.
    b.facing = Math.atan2(target.y - b.y, target.x - b.x);
    return;
  }
  const step = Math.min(dist, bossSpeed(b) * dt);
  const mx = (dx / dist) * step;
  const my = (dy / dist) * step;
  const fromX = b.x;
  const fromY = b.y;
  moveBody(ctx, b, slot, mx, my);
  // Stopped on one axis (a corner of a door): the rest of the step goes along the other one, towards the next position.
  const left = step - Math.hypot(b.x - fromX, b.y - fromY);
  if (left > 1e-3) {
    const rx = to.x - b.x;
    const ry = to.y - b.y;
    if (Math.abs(b.x - fromX) < Math.abs(mx) - 1e-6 && Math.abs(ry) > 1e-3) moveBody(ctx, b, slot, 0, Math.sign(ry) * Math.min(left, Math.abs(ry)));
    else if (Math.abs(b.y - fromY) < Math.abs(my) - 1e-6 && Math.abs(rx) > 1e-3) moveBody(ctx, b, slot, Math.sign(rx) * Math.min(left, Math.abs(rx)), 0);
  }
  b.facing = Math.atan2(dy, dx);
  b.moving = true;
}

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

/**
 * Zombies in its way are shoved aside: out of its footprint across the way
 * it is going (sideways when it walks along x, up or down when along y).
 */
function shoveZombies(ctx: SimContext, b: BossState): void {
  const half = bossHalf(b, ctx.map.tileSize) + ZOMBIES.hitboxRadius;
  const alongX = Math.abs(Math.cos(b.facing)) >= Math.abs(Math.sin(b.facing));
  for (const z of ctx.state.zombies) {
    if (!pushable(z)) continue;
    if (!pushOutOfBox(z, b.x, b.y, half, alongX)) continue;
    if (z.ai === 'chasing' || z.ai === 'attacking' || z.ai === 'idle') resolveCircle(ctx.grid, z, ZOMBIES.hitboxRadius, BLOCK_ZOMBIE);
  }
}

/** It is solid for players: pushed out of its footprint, unhurt; a dashing player goes through. */
export function pushPlayerOut(ctx: SimContext, b: BossState, p: PlayerState): void {
  if (!isPlayerAlive(p) || isDashing(p) || !isBossAlive(b)) return;
  const half = bossHalf(b, ctx.map.tileSize) + PLAYER.hitboxRadius;
  const alongX = Math.abs(Math.cos(b.facing)) >= Math.abs(Math.sin(b.facing));
  if (pushOutOfBox(p, b.x, b.y, half, b.moving ? alongX : nearestAxisIsY(p, b, half))) resolveCircle(ctx.grid, p, PLAYER.hitboxRadius, BLOCK_PLAYER);
}

/** For a body that is not being run over: out by the nearest side (true = along y). */
function nearestAxisIsY(pos: { x: number; y: number }, b: { x: number; y: number }, half: number): boolean {
  return half - Math.abs(pos.y - b.y) < half - Math.abs(pos.x - b.x);
}

/**
 * Pushes `pos` out of the square of half-size `half` centred at (cx, cy):
 * across x-motion (`acrossY`: out by the top or bottom) or across y-motion.
 * Returns true if it was inside.
 */
function pushOutOfBox(pos: { x: number; y: number }, cx: number, cy: number, half: number, acrossY: boolean): boolean {
  const dx = pos.x - cx;
  const dy = pos.y - cy;
  if (Math.abs(dx) >= half || Math.abs(dy) >= half) return false;
  if (acrossY) pos.y = cy + (dy >= 0 ? half : -half);
  else pos.x = cx + (dx >= 0 ? half : -half);
  return true;
}

/**
 * Puts boss `slot` on the map, walking, centred at (x, y): `boss` with
 * `variant`, its health × `hpFactor` (the calendar's lap) × the players.
 */
export function spawnBoss(ctx: SimContext, slot: number, boss: BossId, variant: BossVariantId, x: number, y: number, hpFactor = 1): BossState | undefined {
  const b = ctx.state.bosses[slot];
  const nav = ctx.bossNavs[slot];
  if (!b || !nav) return undefined;
  const hp = bossHp(boss, variant, hpFactor, ctx.state.players.length);
  Object.assign(b, {
    active: true,
    boss,
    variant,
    x,
    y,
    prevX: x,
    prevY: y,
    facing: Math.PI / 2,
    moving: false,
    hp,
    maxHp: hp,
    phase: 'walking',
    timer: 0,
    phaseTick: ctx.state.tick,
    enraged: BOSS_VARIANTS[variant].enraged,
    target: -1,
    contactScoreTick: -1000,
  } satisfies Partial<BossState>);
  b.burn.timer = 0;
  b.burn.perTick = 0;
  nav.side = BOSSES[boss].footprintTiles;
  nav.age = Infinity;
  return b;
}

/** A free boss slot, or -1 when BOSS.maxAlive are on the map. */
export function freeBossSlot(ctx: SimContext): number {
  return ctx.state.bosses.findIndex((b) => !b.active);
}

/**
 * Where a boss comes in when there is no boss spot: the position its
 * footprint fits in nearest to the player by walking, among those at least
 * `minSteps` steps away (the farthest when none is that far). Null when it
 * cannot reach the player at all.
 */
export function spawnPositionNear(ctx: SimContext, slot: number, p: PlayerState, minSteps: number): { x: number; y: number } | null {
  const nav = ctx.bossNavs[slot];
  if (!nav) return null;
  updateBossBlocking(nav, ctx.map, ctx.state);
  computeBossNav(nav, p.x, p.y);
  let best = -1;
  let bestSteps = Infinity;
  let far = -1;
  let farSteps = -1;
  const side = nav.side * nav.tileSize;
  for (let pos = 0; pos < nav.dist.length; pos++) {
    const d = nav.dist[pos] ?? BOSS_UNREACHABLE;
    if (d === BOSS_UNREACHABLE) continue;
    const tx = pos % nav.width;
    if (!footprintFits(nav, tx, (pos - tx) / nav.width)) continue;
    // Never on another boss.
    const c = positionCentre(nav, pos, scratchCentre);
    if (ctx.state.bosses.some((o) => isBossAlive(o) && Math.abs(o.x - c.x) < side && Math.abs(o.y - c.y) < side)) continue;
    if (d >= minSteps && d < bestSteps) {
      best = pos;
      bestSteps = d;
    }
    if (d > farSteps) {
      far = pos;
      farSteps = d;
    }
  }
  const pos = best >= 0 ? best : far;
  if (pos < 0) return null;
  const c = positionCentre(nav, pos, { x: 0, y: 0 });
  return { x: c.x, y: c.y };
}
