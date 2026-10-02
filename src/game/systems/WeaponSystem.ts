import { LOADOUT, MELEE, PLAYER } from '../../config/balance';
import { WEAPON_SPECIALS, WEAPONS } from '../../config/weapons';
import type { BulletState, GameState, PlayerState, WeaponSlotState } from '../../core/GameState';
import type { InputCommand } from '../../core/InputCommand';
import { degToRad } from '../../core/math';
import { randomRange } from '../../core/Rng';
import { BLOCK_BULLET, segmentClearShaped } from '../map/CollisionGrid';
import { damageFactor } from './BoostSystem';
import { bodyHitPoint, damageZombie, findAutoAimTarget, findMeleeTarget, isZombieAlive } from './Combat';
import { bodyCentre, bodyEntry, hurtboxOf, muzzleFor, type Hurtbox, type Vec2 } from './shotGeometry';
import type { SimContext } from './SimContext';
import { bulletHitsZombie } from './BulletSystem';
import { bulletDamage, bulletLook, fireRate, magazineSize, reloadTime } from './weaponStats';

const centre: Vec2 = { x: 0, y: 0 };
/** Closer than this (px from the muzzle to the body centre), auto-aim points from the feet. */
const AUTO_AIM_MIN_REACH = 20;

/**
 * Weapons (spec 01 §4.2): switching, automatic and manual reload, aiming
 * (manual drag or auto-aim), automatic fire at the weapon's rate, and the
 * knife: its own button at any time (turning to the nearest zombie in
 * reach), or the fire button when every weapon is out of ammo.
 */
export function updateWeapons(ctx: SimContext, dt: number): void {
  const { state, commands } = ctx;
  for (let i = 0; i < state.players.length; i++) {
    const p = state.players[i];
    const cmd = commands[i];
    if (!p || !cmd || p.hp <= 0) continue;
    tickTimers(p, cmd, dt);
    handleSwitch(p, cmd);
    handleReload(p, cmd, dt);
    updateAim(ctx, p, cmd);
    if (cmd.melee) handleMelee(ctx, p, true);
    else if (cmd.fire) handleFire(ctx, p);
  }
}

function tickTimers(p: PlayerState, cmd: InputCommand, dt: number): void {
  if (p.switchTimer > 0) p.switchTimer = Math.max(0, p.switchTimer - dt);
  if (p.meleeCooldown > 0) p.meleeCooldown = Math.max(0, p.meleeCooldown - dt);
  if (p.meleeTimer > 0) p.meleeTimer = Math.max(0, p.meleeTimer - dt);
  // Keep the sub-tick remainder while the trigger is held, so the average
  // fire rate is exact, but never more than one tick of it: holding the
  // trigger while a shot is impossible (reloading, switching, empty) must
  // not pile up shots that would all come out at once afterwards. A fresh
  // press never gets a free shot.
  p.fireCooldown = Math.max(p.fireCooldown - dt, cmd.fire ? -dt : 0);
}

/** Picks the weapon of a HUD slot (or the next one with the keyboard), taking the switch time. */
function handleSwitch(p: PlayerState, cmd: InputCommand): void {
  let slot = -1;
  if (cmd.selectWeapon >= 0 && cmd.selectWeapon < p.weapons.length) slot = cmd.selectWeapon;
  else if (cmd.switchWeapon && p.weapons.length > 1) slot = (p.activeSlot + 1) % p.weapons.length;
  if (slot < 0 || slot === p.activeSlot) return;
  p.activeSlot = slot;
  p.switchTimer = LOADOUT.switchTime;
  p.reloadTimer = 0; // switching cancels a reload in progress
  p.fireCooldown = Math.max(p.fireCooldown, 0);
}

function handleReload(p: PlayerState, cmd: InputCommand, dt: number): void {
  const slot = p.weapons[p.activeSlot];
  if (!slot) return;
  // Manual reload: only with room in the magazine and bullets in reserve.
  if (cmd.reload && p.reloadTimer <= 0 && p.switchTimer <= 0 && slot.magazine < magazineSize(slot) && slot.reserve > 0) {
    p.reloadTimer = reloadTime(slot);
    return;
  }
  if (p.reloadTimer > 0) {
    p.reloadTimer -= dt;
    if (p.reloadTimer <= 0) {
      p.reloadTimer = 0;
      const needed = magazineSize(slot) - slot.magazine;
      const taken = Math.min(needed, slot.reserve);
      slot.magazine += taken;
      slot.reserve -= taken;
    }
    return;
  }
  // Automatic reload as soon as the magazine is empty (not during a switch).
  if (slot.magazine === 0 && slot.reserve > 0 && p.switchTimer <= 0) {
    p.reloadTimer = reloadTime(slot);
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
    if (z) aimAtBody(ctx, p, z.x, z.y, hurtboxOf(z));
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
export function aimAtBody(ctx: SimContext, p: PlayerState, zx: number, zy: number, box?: Hurtbox): void {
  bodyCentre(zx, zy, centre, box);
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
    handleMelee(ctx, p, false);
    return;
  }
  const slot = p.weapons[p.activeSlot];
  if (!slot || p.reloadTimer > 0 || slot.magazine <= 0 || p.fireCooldown > 0) return;
  shoot(ctx, p, slot);
}

/**
 * One shot: a round of ammo and the fire cooldown of the weapon's level. The
 * `fan` special (pistol) fires WEAPON_SPECIALS.fan.projectiles bullets
 * (centre and ±angle) for that one round, each with the full damage.
 */
function shoot(ctx: SimContext, p: PlayerState, slot: WeaponSlotState): void {
  const { state } = ctx;
  const stats = WEAPONS[slot.id];
  slot.magazine--;
  p.fireCooldown += 1 / fireRate(slot);
  p.lastAttackTick = state.tick;
  p.lastShotTick = state.tick;

  const aim = Math.atan2(p.aimY, p.aimX);
  const half = degToRad(stats.spread) / 2;
  const centre = aim + randomRange(state, -half, half);
  const special = slot.special ? (stats.special ?? null) : null;
  const count = special === 'fan' ? WEAPON_SPECIALS.fan.projectiles : 1;
  const between = degToRad(WEAPON_SPECIALS.fan.angle);
  // Drawn from the gun's muzzle, along the same direction.
  const muzzle = muzzleFor(ctx.muzzles, aim);
  for (let i = 0; i < count; i++) {
    const bullet = freeBullet(state);
    if (!bullet) return; // pool exhausted: the shot is spent but not simulated
    const angle = centre + (i - (count - 1) / 2) * between;
    bullet.active = true;
    bullet.owner = p.id;
    bullet.x = p.x + p.aimX * PLAYER.muzzleDistance;
    bullet.y = p.y + p.aimY * PLAYER.muzzleDistance;
    bullet.prevX = bullet.x;
    bullet.prevY = bullet.y;
    bullet.dirX = Math.cos(angle);
    bullet.dirY = Math.sin(angle);
    bullet.speed = stats.bulletSpeed;
    bullet.damage = bulletDamage(slot) * damageFactor(p);
    bullet.look = bulletLook(slot, p.boostActive === 'double_damage');
    bullet.pierce = special === 'pierce' ? WEAPON_SPECIALS.pierce.hits : 1;
    bullet.hits.fill(-1);
    bullet.remaining = stats.range - PLAYER.muzzleDistance;
    bullet.drawX = muzzle.x - p.aimX * PLAYER.muzzleDistance;
    bullet.drawY = muzzle.y - p.aimY * PLAYER.muzzleDistance;
    pointBlank(ctx, p, bullet, muzzle);
  }
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
    const t = bodyEntry(x0, y0, dx / len, dy / len, len, z.x, z.y, hurtboxOf(z));
    if (t < best && segmentClearShaped(ctx.grid, p.x, p.y, z.x, z.y, BLOCK_BULLET)) {
      best = t;
      hit = i;
    }
  }
  const z = zombies[hit];
  if (!z) return;
  bulletHitsZombie(ctx, bullet, hit, bodyHitPoint(z, bullet.dirX, bullet.dirY));
}

/**
 * A knife slash. From the knife button (`turn`) the player turns to the
 * nearest zombie within reach in any direction, or slashes where it faces;
 * from the fire button (out of ammo) it hits in a cone along the aim.
 */
function handleMelee(ctx: SimContext, p: PlayerState, turn: boolean): void {
  if (p.meleeCooldown > 0) return;
  p.meleeCooldown = MELEE.cooldown;
  p.lastAttackTick = ctx.state.tick;
  let dirX = turn ? Math.cos(p.facing) : p.aimX;
  let dirY = turn ? Math.sin(p.facing) : p.aimY;
  const cone = turn ? Math.PI : degToRad(MELEE.coneHalfAngle);
  const target = findMeleeTarget(ctx, p.x, p.y, dirX, dirY, MELEE.range, cone);
  const z = target >= 0 ? ctx.state.zombies[target] : undefined;
  if (z && turn) {
    const len = Math.hypot(z.x - p.x, z.y - p.y) || 1;
    dirX = (z.x - p.x) / len;
    dirY = (z.y - p.y) / len;
  }
  p.meleeAngle = Math.atan2(dirY, dirX);
  p.meleeTimer = MELEE.swingTime;
  p.meleeTick = ctx.state.tick;
  p.facing = p.meleeAngle;
  if (z) damageZombie(ctx, z, MELEE.damage * damageFactor(p), p.id, bodyHitPoint(z, dirX, dirY));
}

/** 0..1 progress of the current reload, or null when not reloading. */
export function reloadProgress(p: PlayerState): number | null {
  const slot = p.weapons[p.activeSlot];
  if (!slot || p.reloadTimer <= 0) return null;
  return 1 - p.reloadTimer / reloadTime(slot);
}
