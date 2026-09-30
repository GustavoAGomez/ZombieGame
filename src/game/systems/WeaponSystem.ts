import { LOADOUT, MELEE, PLAYER, WEAPONS } from '../../config/balance';
import type { BulletState, GameState, PlayerState, WeaponSlotState } from '../../core/GameState';
import type { InputCommand } from '../../core/InputCommand';
import { degToRad } from '../../core/math';
import { randomRange } from '../../core/Rng';
import { damageZombie, findAutoAimTarget, findMeleeTarget } from './Combat';
import type { SimContext } from './SimContext';

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
    if (!p || !cmd) continue;
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
    const dx = z ? z.x - p.x : Math.cos(p.facing);
    const dy = z ? z.y - p.y : Math.sin(p.facing);
    const len = Math.hypot(dx, dy) || 1;
    p.aimX = dx / len;
    p.aimY = dy / len;
  }
  // While shooting the player faces the aim, not the movement.
  p.facing = Math.atan2(p.aimY, p.aimX);
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
  shoot(ctx.state, p, slot);
}

function shoot(state: GameState, p: PlayerState, slot: WeaponSlotState): void {
  const stats = WEAPONS[slot.id];
  const bullet = freeBullet(state);
  slot.magazine--;
  p.fireCooldown += 1 / stats.fireRate;
  p.lastAttackTick = state.tick;
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
}

function handleMelee(ctx: SimContext, p: PlayerState): void {
  if (p.meleeCooldown > 0) return;
  p.meleeCooldown = MELEE.cooldown;
  p.lastAttackTick = ctx.state.tick;
  const target = findMeleeTarget(ctx, p.x, p.y, p.aimX, p.aimY, MELEE.range, degToRad(MELEE.coneHalfAngle));
  const z = target >= 0 ? ctx.state.zombies[target] : undefined;
  if (z) damageZombie(ctx, z, MELEE.damage);
}

/** 0..1 progress of the current reload, or null when not reloading. */
export function reloadProgress(p: PlayerState): number | null {
  const slot = p.weapons[p.activeSlot];
  if (!slot || p.reloadTimer <= 0) return null;
  const total = WEAPONS[slot.id].reloadTime;
  return 1 - p.reloadTimer / total;
}
