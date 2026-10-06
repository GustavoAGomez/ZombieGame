import { playerStats } from '../dungeon/stats';
import { rules } from '../rules';
import { PICKUPS, PLAYER, type PickupKind } from '../../config/balance';
import type { PickupState, PlayerState, ZombieState } from '../../core/GameState';
import type { RunState } from '../../core/RunState';
import { random } from '../../core/Rng';
import { isNavWalkable } from '../map/FlowField';
import type { SimContext } from './SimContext';
import { magazineSize, maxReserve } from './weaponStats';

/**
 * Ammo and health dropped by killed zombies. They lie on the floor for a
 * while and are collected by walking over them, but only when useful
 * (a full player leaves them for later).
 */

/** Maps one uniform roll to a drop: ammo, else health, else nothing (the mode's chances). */
export function dropKindFor(roll: number, chances: { ammoChance: number; healthChance: number } = PICKUPS): PickupKind | null {
  if (roll < chances.ammoChance) return 'ammo';
  if (roll < chances.ammoChance + chances.healthChance) return 'health';
  return null;
}

/** A key (spec 09 §6.1): always worth taking, and it never goes away. */
export function isKey(kind: PickupKind): boolean {
  return kind === 'key' || kind === 'boss_key';
}

/** Called when a zombie dies. */
export function rollZombieDrop(ctx: SimContext, z: ZombieState): PickupState | undefined {
  const kind = dropKindFor(random(ctx.state), rules(ctx.state).drops);
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
  // Imán (spec 09 §7.2): taken from farther, and nothing fades.
  const perks = playerStats(ctx.state.run);
  const reach = (PLAYER.hitboxRadius + PICKUPS.radius) * perks.pickupRange;
  for (let i = 0; i < pickups.length; i++) {
    const pickup = pickups[i];
    if (!pickup?.active) continue;
    if (!isKey(pickup.kind) && perks.pickupsExpire) {
      pickup.age += dt;
      if (pickup.age >= PICKUPS.lifetime) {
        pickup.active = false;
        continue;
      }
    }
    for (const p of players) {
      if (p.hp <= 0) continue;
      const dx = p.x - pickup.x;
      const dy = p.y - pickup.y;
      if (dx * dx + dy * dy > reach * reach) continue;
      if (applyPickup(p, pickup.kind, rules(ctx.state).medkitHeal, ctx.state.run)) {
        pickup.active = false;
        ctx.events.emit('pickup:collected', { playerId: p.id, kind: pickup.kind });
        break;
      }
    }
  }
}

/** Applies the pickup's effect (a medkit heals `heal`, the mode's; a key goes to the run). Returns false (and changes nothing) if it would be wasted. */
export function applyPickup(p: PlayerState, kind: PickupKind, heal: number = PICKUPS.healthAmount, run: RunState | null = null): boolean {
  if (kind === 'key' || kind === 'boss_key') {
    if (!run) return false;
    if (kind === 'key') run.keys++;
    else run.bossKey = true;
    return true;
  }
  if (kind === 'health') {
    if (p.hp >= p.maxHp) return false;
    p.hp = Math.min(p.maxHp, p.hp + heal);
    return true;
  }
  let gained = false;
  const reserveFactor = playerStats(run).reserve;
  for (const slot of p.weapons) {
    const max = maxReserve(slot, reserveFactor);
    if (slot.reserve >= max) continue;
    slot.reserve = Math.min(max, slot.reserve + magazineSize(slot) * PICKUPS.ammoMagazines);
    gained = true;
  }
  return gained;
}
