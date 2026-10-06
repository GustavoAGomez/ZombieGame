/**
 * The dungeon's kinds (spec 09 §5.2): what the spitter, the exploder and
 * the brute do beyond a zombie's walk and claw. ZombieSystem calls the
 * hooks from its chase; DungeonSystem ticks the fuses, the bursts and the
 * shots. Nothing of this runs in Survival, where these kinds never appear.
 */
import { PLAYER, ZOMBIES } from '../../config/balance';
import { DUNGEON } from '../../config/dungeon';
import type { PlayerState, ZombieState } from '../../core/GameState';
import { BLOCK_BULLET, BLOCK_SIGHT, cellBlocks, segmentClear } from '../map/CollisionGrid';
import { leavePuddle } from './BossAttacks';
import { damageZombie, isZombieAlive } from './Combat';
import { damagePlayer, isPlayerAlive } from './HealthSystem';
import type { SimContext } from './SimContext';

/**
 * The spitter holds its ground `keepDistance` px or nearer from the player
 * while it sees them, and spits every `spitEvery` s after a swell. True
 * when it held (the chase stops here); false when it walks on, or claws.
 */
export function holdAndSpit(ctx: SimContext, z: ZombieState, target: PlayerState, dist: number, dt: number): boolean {
  const k = DUNGEON.kinds.spitter;
  const sees = segmentClear(ctx.grid, z.x, z.y, target.x, target.y, BLOCK_SIGHT);
  // Near enough to claw: the chase handles it.
  if (dist - PLAYER.hitboxRadius <= k.meleeRange) {
    z.spitWindup = 0;
    return false;
  }
  if (dist > k.keepDistance || !sees) {
    z.spitWindup = 0;
    return false;
  }
  z.facing = Math.atan2(target.y - z.y, target.x - z.x);
  if (z.spitWindup > 0) {
    z.spitWindup -= dt;
    if (z.spitWindup <= 0) {
      z.spitWindup = 0;
      spit(ctx, z, target);
    }
    return true;
  }
  z.spitTimer -= dt;
  if (z.spitTimer <= 0) {
    z.spitTimer = k.spitEvery;
    z.spitWindup = k.windup;
    z.actionTick = ctx.state.tick;
    ctx.events.emit('enemy:spitWindup', { x: z.x, y: z.y });
  }
  return true;
}

/** A slow shot from the spitter's mouth towards where the player stands. */
function spit(ctx: SimContext, z: ZombieState, target: PlayerState): void {
  const k = DUNGEON.kinds.spitter;
  const shot = ctx.state.enemyShots.find((s) => !s.active);
  if (!shot) return;
  // From its mouth, straight at where the player stands.
  const sx = z.x;
  const sy = z.y - ZOMBIES.hurtbox.height / 2;
  const dx = target.x - sx;
  const dy = target.y - sy;
  const len = Math.hypot(dx, dy) || 1;
  Object.assign(shot, { active: true, x: sx, y: sy, vx: (dx / len) * k.shotSpeed, vy: (dy / len) * k.shotSpeed, travelled: 0 });
  ctx.events.emit('enemy:spit', { x: z.x, y: z.y });
}

/** The exploder's fuse lights (on reaching the player, or dead): it stands still and swells until it bursts. */
export function lightFuse(ctx: SimContext, z: ZombieState): void {
  if (z.fuse !== -1) return;
  z.fuse = DUNGEON.kinds.exploder.fuse;
  z.ai = 'idle';
  z.actionTick = ctx.state.tick;
  ctx.events.emit('enemy:fuse', { x: z.x, y: z.y });
}

/** The burst (§5.2): `damage` to the players and `enemyDamage` to the other enemies within `radius` px; a dead exploder in it bursts too. */
function explode(ctx: SimContext, z: ZombieState): void {
  const k = DUNGEON.kinds.exploder;
  const run = ctx.state.run;
  z.fuse = -2;
  for (const p of ctx.state.players) {
    if (isPlayerAlive(p) && Math.hypot(p.x - z.x, p.y - z.y) <= k.radius + PLAYER.hitboxRadius) damagePlayer(ctx, p, k.damage, z.x, z.y);
  }
  for (const o of ctx.state.zombies) {
    if (o === z || !isZombieAlive(o) || Math.hypot(o.x - z.x, o.y - z.y) - ZOMBIES.hitboxRadius > k.radius) continue;
    damageZombie(ctx, o, k.enemyDamage, -1);
  }
  if (run) run.explosions.push({ x: z.x, y: z.y, radius: k.radius, age: 0 });
  ctx.events.emit('enemy:exploded', { x: z.x, y: z.y, radius: k.radius });
  // Alive at the burst (it reached the player): it dies in it, with no kill to anyone.
  if (isZombieAlive(z)) damageZombie(ctx, z, 1e9, -1);
}

/** Each tick: the fuses burn down and burst, the shots fly, the burst rings fade. */
export function updateEnemyKinds(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (const z of state.zombies) {
    if (!z.active || z.fuse <= 0) continue;
    z.fuse -= dt;
    if (z.fuse <= 0) explode(ctx, z);
  }
  updateShots(ctx, dt);
  const run = state.run;
  if (run) {
    for (const e of run.explosions) e.age += dt;
    run.explosions = run.explosions.filter((e) => e.age < DUNGEON.explosionFade);
  }
}

/** The spitters' shots: walls and furniture with collision stop them, a player not dashing takes the hit; where one lands, a puddle. */
function updateShots(ctx: SimContext, dt: number): void {
  const { state, map, grid } = ctx;
  const k = DUNGEON.kinds.spitter;
  for (const s of state.enemyShots) {
    if (!s.active) continue;
    const step = Math.hypot(s.vx, s.vy) * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.travelled += step;
    const tx = Math.floor(s.x / map.tileSize);
    const ty = Math.floor(s.y / map.tileSize);
    let hit = false;
    let player = false;
    if (cellBlocks(grid, tx, ty, BLOCK_BULLET) || s.travelled >= k.shotRange) hit = true;
    else {
      for (const p of state.players) {
        // The dash goes through them (§5.2).
        if (!isPlayerAlive(p) || p.dashTimer > 0 || Math.hypot(p.x - s.x, p.y - s.y) > PLAYER.hitboxRadius + k.shotRadius) continue;
        damagePlayer(ctx, p, k.damage, s.x - s.vx, s.y - s.vy);
        hit = true;
        player = true;
        break;
      }
    }
    if (!hit) continue;
    s.active = false;
    // The puddle lands a step back when a wall stopped it, so it lies on the floor.
    const px = cellBlocks(grid, tx, ty, BLOCK_BULLET) ? s.x - s.vx * dt * 2 : s.x;
    const py = cellBlocks(grid, tx, ty, BLOCK_BULLET) ? s.y - s.vy * dt * 2 : s.y;
    leavePuddle(ctx, px, py, k.puddleRadius, k.puddleTime);
    ctx.events.emit('enemy:spitHit', { x: px, y: py, player });
  }
}
