import { LOADOUT, MELEE, PLAYER, POINTS, ZOMBIES } from '../../config/balance';
import { WEAPON_SPECIALS, WEAPONS } from '../../config/weapons';
import type { BulletState, GameState, PlayerState, WeaponSlotState } from '../../core/GameState';
import type { InputCommand } from '../../core/InputCommand';
import { degToRad } from '../../core/math';
import { randomRange } from '../../core/Rng';
import { BLOCK_BULLET, segmentClearShaped } from '../map/CollisionGrid';
import { damageFactor } from './BoostSystem';
import { bodyHitPoint, damageZombie, findAutoAimTarget, findMeleeTarget, isZombieAlive, knockZombie } from './Combat';
import { bodyCentre, bodyEntry, hurtboxOf, muzzleFor, type Hurtbox, type Vec2 } from './shotGeometry';
import type { SimContext } from './SimContext';
import { fireBeam, updateBatteries } from './BeamSystem';
import { fireCone } from './ConeSystem';
import { bulletHitsZombie } from './BulletSystem';
import { ammoKind, bulletDamage, bulletLook, fireRate, magazineSize, reloadTime } from './weaponStats';

const centre: Vec2 = { x: 0, y: 0 };
/** Closer than this (px from the muzzle to the body centre), auto-aim points from the feet. */
const AUTO_AIM_MIN_REACH = 20;

/**
 * Weapons (spec 01 §4.2): switching, automatic and manual reload, aiming
 * (manual drag or auto-aim), automatic fire at the weapon's rate, and the
 * knife: its own button at any time (turning to the nearest zombie in
 * reach), or the fire button when every weapon is out of ammo.
 *
 * The first shot of each press waits the weapon's firstShotDelay, aiming
 * all the while, so a thumb that lands off the centre of the fire stick can
 * still correct the aim before it fires (docs/DECISIONS.md).
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
    updateTrigger(p, cmd, dt);
    updateAim(ctx, p, cmd);
    p.beamOn = false;
    p.coneOn = false;
    if (cmd.melee) handleMelee(ctx, p, true);
    else if (cmd.fire || p.shotPending) handleFire(ctx, p, cmd.fire, dt);
    updateBatteries(p, dt);
    // A jet that stops spends a fresh round when it starts again.
    if (!p.coneOn) p.fuelTimer = 0;
  }
}

/** A new press starts counting its aiming time; a pending tap keeps counting after the release. */
function updateTrigger(p: PlayerState, cmd: InputCommand, dt: number): void {
  if (cmd.fire && !p.firing) {
    p.aimTime = 0;
    p.shotPending = true;
  }
  if (cmd.fire || p.shotPending) p.aimTime += dt;
  else p.aimTime = 0;
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
    const def = p.weapons[p.activeSlot] ? WEAPONS[p.weapons[p.activeSlot]!.id] : undefined;
    // A melee weapon turns to the nearest zombie in its reach, like the knife: straight at it, no muzzle.
    const melee = def?.attack === 'melee';
    const range = def ? def.range + (melee ? ZOMBIES.hitboxRadius : 0) : MELEE.range;
    const target = findAutoAimTarget(ctx, p.x, p.y, range);
    const z = target >= 0 ? ctx.state.zombies[target] : undefined;
    if (z && melee) {
      const len = Math.hypot(z.x - p.x, z.y - p.y) || 1;
      p.aimX = (z.x - p.x) / len;
      p.aimY = (z.y - p.y) / len;
    } else if (z) aimAtBody(ctx, p, z.x, z.y, hurtboxOf(z));
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

/** Something to attack with: rounds left in any weapon, or a weapon that spends none (the katana) or recharges (the laser). */
export function hasAnyAmmo(p: PlayerState): boolean {
  for (let i = 0; i < p.weapons.length; i++) {
    const w = p.weapons[i];
    if (w && (ammoKind(WEAPONS[w.id]) !== 'rounds' || w.magazine > 0 || w.reserve > 0)) return true;
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

/**
 * The fire button: shots at the weapon's rate once the press has aimed for
 * its firstShotDelay. A tap released before that gets one try when the time
 * is up (where it was last aimed), and none later: never a stray shot after
 * a reload. Out of ammo everywhere, it slashes with the knife at once.
 */
function handleFire(ctx: SimContext, p: PlayerState, held: boolean, dt: number): void {
  if (!hasAnyAmmo(p)) {
    p.shotPending = false;
    if (held && p.switchTimer <= 0) handleMelee(ctx, p, false);
    return;
  }
  const slot = p.weapons[p.activeSlot];
  if (slot && p.aimTime < WEAPONS[slot.id].firstShotDelay) return;
  p.shotPending = false;
  if (!slot || p.switchTimer > 0 || p.reloadTimer > 0) return;
  const attack = WEAPONS[slot.id].attack;
  // A beam or a jet fires only while held (a tap gives no flash of it), damaging at its own pace.
  if (attack === 'beam' || attack === 'cone') {
    if (held && attack === 'beam') fireBeam(ctx, p, slot, dt);
    else if (held) fireCone(ctx, p, slot, dt);
    return;
  }
  if (p.fireCooldown > 0) return;
  if (attack === 'melee') sweep(ctx, p, slot);
  else if (slot.magazine > 0) shoot(ctx, p, slot);
}

/**
 * A melee weapon's sweep (the katana, spec 06 §2.2): every living zombie
 * whose hitbox edge is within the weapon's range and inside its arc around
 * the aim takes its damage (with double damage) and a push away from the
 * player, and scores like a knife hit. A wall in between protects it, as
 * from a bullet; a window does not.
 */
function sweep(ctx: SimContext, p: PlayerState, slot: WeaponSlotState): void {
  const { state } = ctx;
  const def = WEAPONS[slot.id];
  p.fireCooldown += 1 / fireRate(slot);
  p.lastAttackTick = state.tick;
  const minCos = Math.cos(degToRad(def.arc ?? 0) / 2);
  const damage = bulletDamage(slot) * damageFactor(p);
  let kills = 0;
  for (let i = 0; i < state.zombies.length; i++) {
    const z = state.zombies[i];
    if (!z || !isZombieAlive(z)) continue;
    const dx = z.x - p.x;
    const dy = z.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist - ZOMBIES.hitboxRadius > def.range) continue;
    const ux = dist > 0 ? dx / dist : p.aimX;
    const uy = dist > 0 ? dy / dist : p.aimY;
    if (ux * p.aimX + uy * p.aimY < minCos) continue;
    if (!segmentClearShaped(ctx.grid, p.x, p.y, z.x, z.y, BLOCK_BULLET)) continue;
    if (damageZombie(ctx, z, damage, p.id, bodyHitPoint(z, ux, uy), POINTS.meleeHit)) kills++;
    else knockZombie(ctx, z, ux, uy, def.knockback ?? 0);
  }
  // "Filo de sangre" (the katana's special): each kill heals, up to a cap per sweep.
  if (slot.special && def.special === 'blood_edge' && kills > 0) {
    const edge = WEAPON_SPECIALS.blood_edge;
    p.hp = Math.min(p.maxHp, p.hp + Math.min(edge.maxHealPerSweep, kills * edge.healPerKill));
  }
  p.meleeAngle = Math.atan2(p.aimY, p.aimX);
  p.meleeTimer = MELEE.swingTime;
  p.meleeTick = state.tick;
  p.meleeWide = true;
  p.facing = p.meleeAngle;
}

/**
 * One shot: a round of ammo and the fire cooldown of the weapon's level. The
 * `fan` special (pistol) fires WEAPON_SPECIALS.fan.projectiles bullets
 * (centre and ±angle) for that one round, each with the full damage. A
 * weapon with pellets (the shotgun) fires them all for one shell, spread
 * evenly across its cone with a little random variation each.
 */
function shoot(ctx: SimContext, p: PlayerState, slot: WeaponSlotState): void {
  const { state } = ctx;
  const stats = WEAPONS[slot.id];
  slot.magazine--;
  p.fireCooldown += 1 / fireRate(slot);
  p.lastAttackTick = state.tick;
  p.lastShotTick = state.tick;

  const aim = Math.atan2(p.aimY, p.aimX);
  const spread = stats.spread ?? 0;
  const half = degToRad(spread) / 2;
  const pellets = stats.pellets ?? 1;
  const special = slot.special ? (stats.special ?? null) : null;
  // One bullet deviates inside the cone; pellets fill it evenly instead.
  const centre = pellets > 1 ? aim : aim + randomRange(state, -half, half);
  const fan = special === 'fan' ? WEAPON_SPECIALS.fan.projectiles : 1;
  const count = Math.max(fan, pellets);
  const between = pellets > 1 ? degToRad(spread) / (pellets - 1) : degToRad(WEAPON_SPECIALS.fan.angle);
  const jitter = degToRad(stats.pelletJitter ?? 0) / 2;
  // Drawn from the gun's muzzle, along the same direction.
  const muzzle = muzzleFor(ctx.muzzles, aim);
  for (let i = 0; i < count; i++) {
    const bullet = freeBullet(state);
    if (!bullet) return; // pool exhausted: the shot is spent but not simulated
    const angle = centre + (i - (count - 1) / 2) * between + (pellets > 1 ? randomRange(state, -jitter, jitter) : 0);
    bullet.active = true;
    bullet.owner = p.id;
    bullet.x = p.x + p.aimX * PLAYER.muzzleDistance;
    bullet.y = p.y + p.aimY * PLAYER.muzzleDistance;
    bullet.prevX = bullet.x;
    bullet.prevY = bullet.y;
    bullet.dirX = Math.cos(angle);
    bullet.dirY = Math.sin(angle);
    bullet.speed = stats.bulletSpeed ?? 0;
    bullet.damage = bulletDamage(slot) * damageFactor(p);
    bullet.look = bulletLook(slot, p.boostActive === 'double_damage');
    bullet.pierce = special === 'pierce' ? WEAPON_SPECIALS.pierce.hits : 1;
    bullet.hits.fill(-1);
    bullet.remaining = stats.range - PLAYER.muzzleDistance;
    bullet.range = bullet.remaining;
    bullet.falloffFrom = stats.falloff ? Math.max(0, stats.falloff.fullUntil - PLAYER.muzzleDistance) : 0;
    bullet.falloffMin = stats.falloff ? stats.falloff.minFactor : 1;
    bullet.burns = special === 'fire';
    bullet.knockback = stats.knockback ?? 0;
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
  p.meleeWide = false;
  p.facing = p.meleeAngle;
  if (z) damageZombie(ctx, z, MELEE.damage * damageFactor(p), p.id, bodyHitPoint(z, dirX, dirY), POINTS.meleeHit);
}

/** 0..1 progress of the current reload, or null when not reloading. */
export function reloadProgress(p: PlayerState): number | null {
  const slot = p.weapons[p.activeSlot];
  if (!slot || p.reloadTimer <= 0) return null;
  return 1 - p.reloadTimer / reloadTime(slot);
}
