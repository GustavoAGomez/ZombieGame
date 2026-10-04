import { BOSS, CONTINUOUS, POINTS, SIM } from '../../config/balance';
import { BOSSES } from '../../config/bosses';
import type { BossState } from '../../core/GameState';
import type { HitPoint } from './Combat';
import { awardPoints } from './PointsSystem';
import { bodyEntry, type Hurtbox } from './shotGeometry';
import type { SimContext } from './SimContext';

/**
 * A boss as a target (spec 07): its footprint, the box bullets hit, and
 * the damage it takes from every weapon. Each hit scores like on a zombie
 * (a bullet POINTS.hit, a melee hit POINTS.meleeHit, a continuous weapon
 * once per CONTINUOUS.scoreInterval); its death has its own rewards.
 */

export function isBossAlive(b: BossState): boolean {
  return b.active && b.hp > 0 && b.phase !== 'dead';
}

/** It can be hurt now. */
export function isBossHittable(b: BossState): boolean {
  return isBossAlive(b);
}

/** Its health bar shows at the top of the HUD (spec 07 §6). */
export function bossBarShows(b: BossState): boolean {
  return isBossAlive(b);
}

/** Half the side of its square footprint (world px). */
export function bossHalf(b: BossState, tileSize: number): number {
  return (BOSSES[b.boss].footprintTiles * tileSize) / 2;
}

/** The bottom edge of its footprint: where its drawn body and its hurtbox stand. */
export function bossFeetY(b: BossState, tileSize: number): number {
  return b.y + bossHalf(b, tileSize);
}

export function bossHurtbox(b: BossState): Hurtbox {
  return BOSSES[b.boss].hurtbox;
}

/** Distance from (x, y) to the edge of its footprint (0 inside it). */
export function distanceToBoss(b: BossState, tileSize: number, x: number, y: number): number {
  const half = bossHalf(b, tileSize);
  const dx = Math.max(0, Math.abs(x - b.x) - half);
  const dy = Math.max(0, Math.abs(y - b.y) - half);
  return Math.hypot(dx, dy);
}

/** The point of its footprint nearest to (x, y). */
export function nearestOnBoss(b: BossState, tileSize: number, x: number, y: number, out: { x: number; y: number }): { x: number; y: number } {
  const half = bossHalf(b, tileSize);
  out.x = Math.max(b.x - half, Math.min(b.x + half, x));
  out.y = Math.max(b.y - half, Math.min(b.y + half, y));
  return out;
}

/** The middle of its hurtbox: where a hit without a drawn point sprays from, and what guns aim at. */
export function bossBodyPoint(b: BossState, tileSize: number, dirX: number, dirY: number): HitPoint {
  return { x: b.x, y: bossFeetY(b, tileSize) - bossHurtbox(b).height / 2, dirX, dirY };
}

/** Where a drawn path from (x, y) along (dirX, dirY) for `length` first touches its hurtbox, or Infinity. */
export function bossBodyEntry(b: BossState, tileSize: number, x: number, y: number, dirX: number, dirY: number, length: number): number {
  return bodyEntry(x, y, dirX, dirY, length, b.x, bossFeetY(b, tileSize), bossHurtbox(b));
}

/**
 * Damage to a boss; returns true if this hit killed it. The attacker (a
 * player id, or -1) gets `hitPoints` for the hit; with `hit`, blood sprays
 * from there. No knockback and no crawling: nothing moves it but itself.
 */
export function damageBoss(ctx: SimContext, b: BossState, amount: number, attacker = -1, hit?: HitPoint, hitPoints: number = POINTS.hit): boolean {
  if (!isBossHittable(b) || amount <= 0) return false;
  b.hp -= amount;
  if (attacker >= 0 && hitPoints > 0) awardPoints(ctx, attacker, hitPoints, 'hit');
  const feet = bossFeetY(b, ctx.map.tileSize);
  if (hit) ctx.events.emit('zombie:hit', { x: hit.x, y: hit.y, groundY: feet, dirX: hit.dirX, dirY: hit.dirY, killed: b.hp <= 0 });
  if (b.hp > 0) return false;
  killBoss(ctx, b);
  return true;
}

/** Its death: the corpse stays BOSS.corpseTime, and the match hears about it (rewards, HUD). */
export function killBoss(ctx: SimContext, b: BossState): void {
  b.hp = 0;
  b.phase = 'dead';
  b.timer = BOSS.corpseTime;
  b.phaseTick = ctx.state.tick;
  b.burn.timer = 0;
  ctx.events.emit('boss:killed', { x: b.x, y: b.y, boss: b.boss, variant: b.variant });
}

const scoreTicks = Math.round(CONTINUOUS.scoreInterval * SIM.hz);

/** One damage tick of a continuous weapon (beam, cone): it scores once per CONTINUOUS.scoreInterval of contact. */
export function hitBossContinuously(ctx: SimContext, b: BossState, damage: number, owner: number, hit: HitPoint): void {
  const scores = ctx.state.tick - b.contactScoreTick >= scoreTicks;
  if (scores) b.contactScoreTick = ctx.state.tick;
  damageBoss(ctx, b, damage, owner, scores || b.hp - damage <= 0 ? hit : undefined, scores ? POINTS.hit : 0);
}
