import { LOADOUT, MELEE, PLAYER, WEAPONS } from '../../config/balance';
import type { BulletState, GameState, PlayerState, WeaponSlotState } from '../../core/GameState';
import type { InputCommand } from '../../core/InputCommand';
import { degToRad } from '../../core/math';
import { randomRange } from '../../core/Rng';
import { BLOCK_BULLET, segmentClear } from '../map/CollisionGrid';
import { damageZombie, findAutoAimTarget, findMeleeTarget, isZombieAlive } from './Combat';
import { bodyCentre, bodyEntry, muzzleFor, type Vec2 } from './shotGeometry';
import type { SimContext } from './SimContext';

const centre: Vec2 = { x: 0, y: 0 };
/** Closer than this (px from the muzzle to the body centre), auto-aim points from the feet. */
const AUTO_AIM_MIN_REACH = 20;

/**
 * Weapons (spec 01 §4.2): switching, automatic reload, aiming (manual drag
 * or auto-aim), automatic fire at the weapon's rate, and melee when every
 * weapon is out of ammo.
 */
export function updateWeapons(ctx: SimContext, dt: number): void {
  const { state, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const cmd = commands[i];
    if (!p || !cmd || p.hp <= 0) continue;
    tickTimers(p, cmd, dt);
    handleSwitch(p, cmd);
    handleReload(p, dt);
    updateAim(ctx, p, cmd);
    if (cmd.fire) handleFire(ctx, p);
  }
}

function tickTimers(p: PlayerState, cmd: InputCommand, dt: number): void {
  if (p.switchTimer > 0) p.switchTimer = Math.max(0, p.switchTimer - dt);
  if (p.meleeCooldown > 0) p.meleeCooldown = Math.max(0, p.meleeCooldown - dt);
  p.fireCooldown -= dt;
  // Keep the sub-tick remainder only while the trigger is held, so the
  // average fire rate is exact but a fresh press never gets a free shot.
  if (!cmd.fire && p.fireCooldown < 0) p.fireCooldown = 0;
}

function handleSwitch(p: PlayerState, cmd: InputCommand): void {
  if (!cmd.switchWeapon || p.weapons.length < 2) return;
  p.activeSlot = (p.activeSlot + 1) % p.weapons.length;
  p.switchTimer = LOADOUT.switchTime;
  p.reloadTimer = 0; // switching cancels a reload in progress
  p.fireCooldown = Math.max(p.fireCooldown, 0);
}

function handleReload(p: PlayerState, dt: number): void {
  const slot = p.weapons[p.activeSlot];
  if (!slot) return;
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.reloadTimer = 0;
      const needed = WEAPONS[slot.id].magazine - slot.magazine;
      const taken = Math.min(needed, slot.reserve);
      slot.magazine += taken;
      slot.reserve -= taken;
    }
    return;
  }
  // Automatic reload as soon as the magazine is empty (not during a switch).
  if (slot.magazine === 0 && slot.reserve > 0 && p.switchTimer <= 0) {
    p.reloadTimer = WEAPONS[slot.id].reloadTime;
  }
}

function updateAim(ctx: SimContext, p: PlayerState, cmd: InputCommand): void {
  p.firing = cmd.fire;
  p.aimManual = cmd.fire && cmd.aimManual;
  if (!cmd.fire) return;

  if (cmd.aimManual) {
    p.aimX = cmd.aimX;
    p.aimY = cmd.aimY;
  } else {
    const slot = p.weapons[p.activeSlot];
    const range = slot ? WEAPONS[slot.id].range : MELEE.range;
    const target = findAutoAimTarget(ctx, p.x, p.y, range);
    const z = target >= 0 ? ctx.state.zombies[target] : undefined;
    if (z) aimAtBody(ctx, p, z.x, z.y);
    else {
      p.aimX = Math.cos(p.facing);
      p.aimY = Math.sin(p.facing);
    }
  }
  // While shooting the player faces the aim, not the movement.
  p.facing = Math.atan2(p.aimY, p.aimX);
}

/**
 * Aims so the bullet, drawn from the gun's muzzle, crosses the middle of the
 * zombie's drawn body. The muzzle depends on the direction, which depends on
 * the aim, so the direction is settled in two passes.
 */
export function aimAtBody(ctx: SimContext, p: PlayerState, zx: number, zy: number): void {
  bodyCentre(zx, zy, centre);
  let ax = centre.x - p.x;
  let ay = centre.y - p.y;
  for (let pass = 0; pass < 2; pass++) {
    const m = muzzleFor(ctx.muzzles, Math.atan2(ay, ax));
    const mx = centre.x - (p.x + m.x);
    const my = centre.y - (p.y + m.y);
    // Too close (or the muzzle already past the body): aim from the feet.
    if (Math.hypot(mx, my) < AUTO_AIM_MIN_REACH || mx * ax + my * ay <= 0) break;
    ax = mx;
    ay = my;
  }
  const len = Math.hypot(ax, ay) || 1;
  p.aimX = ax / len;
  p.aimY = ay / len;
}

export function hasAnyAmmo(p: PlayerState): boolean {
  for (let i = 0; i < p.weapons.length; i++) {
    const w = p.weapons[i];
    if (w && (w.magazine > 0 || w.reserve > 0)) return true;
  }
  return false;
}

function freeBullet(state: GameState): BulletState | undefined {
  for (let i = 0; i < state.bullets.length; i++) {
    const b = state.bullets[i];
    if (b && !b.active) return b;
  }
  return undefined;
}

function handleFire(ctx: SimContext, p: PlayerState): void {
  if (p.switchTimer > 0) return;
  if (!hasAnyAmmo(p)) {
    handleMelee(ctx, p);
    return;
  }
  const slot = p.weapons[p.activeSlot];
  if (!slot || p.reloadTimer > 0 || slot.magazine <= 0 || p.fireCooldown > 0) return;
  shoot(ctx, p, slot);
}

function shoot(ctx: SimContext, p: PlayerState, slot: WeaponSlotState): void {
  const { state } = ctx;
  const stats = WEAPONS[slot.id];
  const bullet = freeBullet(state);
  slot.magazine--;
  p.fireCooldown += 1 / stats.fireRate;
  p.lastAttackTick = state.tick;
  p.lastShotTick = state.tick;
  if (!bullet) return; // pool exhausted: the shot is spent but not simulated

  const half = degToRad(stats.spread) / 2;
  const angle = Math.atan2(p.aimY, p.aimX) + randomRange(state, -half, half);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  bullet.active = true;
  bullet.owner = p.id;
  bullet.x = p.x + p.aimX * PLAYER.muzzleDistance;
  bullet.y = p.y + p.aimY * PLAYER.muzzleDistance;
  bullet.prevX = bullet.x;
  bullet.prevY = bullet.y;
  bullet.dirX = dirX;
  bullet.dirY = dirY;
  bullet.speed = stats.bulletSpeed;
  bullet.damage = stats.damage;
  bullet.remaining = stats.range - PLAYER.muzzleDistance;
  // Drawn from the gun's muzzle, along the same direction.
  const muzzle = muzzleFor(ctx.muzzles, Math.atan2(p.aimY, p.aimX));
  bullet.drawX = muzzle.x - p.aimX * PLAYER.muzzleDistance;
  bullet.drawY = muzzle.y - p.aimY * PLAYER.muzzleDistance;
  pointBlank(ctx, p, bullet, muzzle);
}

/**
 * A zombie right against the player can stand between the chest and the
 * drawn muzzle (facing north the gun is drawn above its head): the bullet
 * hits it as it leaves the gun, if no wall is in between.
 */
function pointBlank(ctx: SimContext, p: PlayerState, bullet: BulletState, muzzle: Vec2): void {
  const x0 = p.x;
  const y0 = p.y - PLAYER.chestHeight;
  const dx = p.x + muzzle.x - x0;
  const dy = p.y + muzzle.y - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return;
  let best = Infinity;
  let hit = -1;
  const { zombies } = ctx.state;
  for (let i = 0; i < zombies.length; i++) {
    const z = zombies[i];
    if (!z || !isZombieAlive(z)) continue;
    const t = bodyEntry(x0, y0, dx / len, dy / len, len, z.x, z.y);
    if (t < best && segmentClear(ctx.grid, p.x, p.y, z.x, z.y, BLOCK_BULLET)) {
      best = t;
      hit = i;
    }
  }
  const z = zombies[hit];
  if (!z) return;
  bullet.active = false;
  damageZombie(ctx, z, bullet.damage, p.id);
}

function handleMelee(ctx: SimContext, p: PlayerState): void {
  if (p.meleeCooldown > 0) return;
  p.meleeCooldown = MELEE.cooldown;
  p.lastAttackTick = ctx.state.tick;
  const target = findMeleeTarget(ctx, p.x, p.y, p.aimX, p.aimY, MELEE.range, degToRad(MELEE.coneHalfAngle));
  const z = target >= 0 ? ctx.state.zombies[target] : undefined;
  if (z) damageZombie(ctx, z, MELEE.damage, p.id);
}

/** 0..1 progress of the current reload, or null when not reloading. */
export function reloadProgress(p: PlayerState): number | null {
  const slot = p.weapons[p.activeSlot];
  if (!slot || p.reloadTimer <= 0) return null;
  const total = WEAPONS[slot.id].reloadTime;
  return 1 - p.reloadTimer / total;
}
