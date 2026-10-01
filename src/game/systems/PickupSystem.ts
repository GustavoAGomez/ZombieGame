import { PICKUPS, PLAYER, type PickupKind } from '../../config/balance';
import type { PickupState, PlayerState, ZombieState } from '../../core/GameState';
import { random } from '../../core/Rng';
import { isNavWalkable } from '../map/FlowField';
import type { SimContext } from './SimContext';
import { magazineSize, maxReserve } from './weaponStats';

/**
 * Ammo and health dropped by killed zombies. They lie on the floor for a
 * while and are collected by walking over them, but only when useful
 * (a full player leaves them for later).
 */

/** Maps one uniform roll to a drop: ammo, else health, else nothing. */
export function dropKindFor(roll: number): PickupKind | null {
  if (roll < PICKUPS.ammoChance) return 'ammo';
  if (roll < PICKUPS.ammoChance + PICKUPS.healthChance) return 'health';
  return null;
}

/** Called when a zombie dies. */
export function rollZombieDrop(ctx: SimContext, z: ZombieState): PickupState | undefined {
  const kind = dropKindFor(random(ctx.state));
  if (!kind) return undefined;
  const { x, y } = reachableDropPoint(ctx, z);
  return spawnPickup(ctx, kind, x, y);
}

/**
 * Zombies killed outside (at the window, on the way from the spawn) would
 * drop where the player can never go, so their drop lands on the window's
 * interior point instead.
 */
function reachableDropPoint(ctx: SimContext, z: ZombieState): { x: number; y: number } {
  const { map, grid, state } = ctx;
  const tx = Math.floor(z.x / map.tileSize);
  const ty = Math.floor(z.y / map.tileSize);
  const inside = tx >= 0 && ty >= 0 && tx < map.width && ty < map.height;
  if (inside && isNavWalkable(map, grid, state.zonesUnlocked, ty * map.width + tx)) return { x: z.x, y: z.y };
  const w = map.windows[z.window];
  return w ? { x: w.interior.x, y: w.interior.y } : { x: z.x, y: z.y };
}

/** Places a pickup; when the pool is full the oldest one is replaced. */
export function spawnPickup(ctx: SimContext, kind: PickupKind, x: number, y: number): PickupState | undefined {
  const { pickups } = ctx.state;
  let slot: PickupState | undefined;
  let oldest: PickupState | undefined;
  for (let i = 0; i < pickups.length; i++) {
    const p = pickups[i];
    if (!p) continue;
    if (!p.active) {
      slot = p;
      break;
    }
    if (!oldest || p.age > oldest.age) oldest = p;
  }
  slot ??= oldest;
  if (!slot) return undefined;
  slot.active = true;
  slot.kind = kind;
  slot.x = x;
  slot.y = y;
  slot.age = 0;
  return slot;
}

export function updatePickups(ctx: SimContext, dt: number): void {
  const { pickups, players } = ctx.state;
  const reach = PLAYER.hitboxRadius + PICKUPS.radius;
  for (let i = 0; i < pickups.length; i++) {
    const pickup = pickups[i];
    if (!pickup?.active) continue;
    pickup.age += dt;
    if (pickup.age >= PICKUPS.lifetime) {
      pickup.active = false;
      continue;
    }
    for (const p of players) {
      if (p.hp <= 0) continue;
      const dx = p.x - pickup.x;
      const dy = p.y - pickup.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      if (applyPickup(p, pickup.kind)) {
        pickup.active = false;
        ctx.events.emit('pickup:collected', { playerId: p.id, kind: pickup.kind });
        break;
      }
    }
  }
}

/** Applies the pickup's effect. Returns false (and changes nothing) if it would be wasted. */
export function applyPickup(p: PlayerState, kind: PickupKind): boolean {
  if (kind === 'health') {
    if (p.hp >= p.maxHp) return false;
    p.hp = Math.min(p.maxHp, p.hp + PICKUPS.healthAmount);
    return true;
  }
  let gained = false;
  for (const slot of p.weapons) {
    const max = maxReserve(slot);
    if (slot.reserve >= max) continue;
    slot.reserve = Math.min(max, slot.reserve + magazineSize(slot) * PICKUPS.ammoMagazines);
    gained = true;
  }
  return gained;
}
