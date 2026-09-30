import { DASH, PLAYER, type WeaponId } from '../config/balance';
import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { MapData } from './map/MapLoader';
import { repairPointsAvailable } from './systems/BarricadeSystem';
import { reloadProgress } from './systems/WeaponSystem';

/** Steps used to quantise continuous values so the DOM updates rarely. */
const RELOAD_STEPS = 20;
const COOLDOWN_STEPS = 64;

/**
 * Game → HUD bridge. After each frame it compares the local player's state
 * with what was last published and emits an event only on change.
 */
export class HudPresenter {
  private weapon: WeaponId | null = null;
  private magazine = -1;
  private reserve = -1;
  private reload: number | null = -1;
  private switching = false;
  private cooldownStep = -1;
  private hp = -1;
  private round = -1;
  private points = -1;
  private actionKind: 'repair' | 'door' | null | undefined = undefined;
  private actionAmount = -1;
  private actionEnabled = false;

  constructor(
    private readonly events: EventBus,
    private readonly map: MapData,
  ) {}

  publish(state: GameState, playerIndex = 0): void {
    const p = state.players[playerIndex];
    if (!p) return;

    const hp = Math.ceil(p.hp);
    if (hp !== this.hp) {
      this.hp = hp;
      this.events.emit('player:health', { hp, maxHp: p.maxHp, low: hp > 0 && hp < PLAYER.lowHpThreshold });
    }

    if (p.points !== this.points) {
      this.points = p.points;
      this.events.emit('points:changed', { points: p.points });
    }

    const kind = p.contextAction === 'none' ? null : p.contextAction;
    let amount = 0;
    let enabled = kind !== null;
    if (kind === 'repair') {
      amount = repairPointsAvailable(p);
    } else if (kind === 'door') {
      // Affordable: show the cost. Otherwise: how many points are missing.
      const cost = this.map.doors[p.contextTarget]?.cost ?? 0;
      enabled = p.points >= cost;
      amount = enabled ? cost : cost - p.points;
    }
    if (kind !== this.actionKind || amount !== this.actionAmount || enabled !== this.actionEnabled) {
      this.actionKind = kind;
      this.actionAmount = amount;
      this.actionEnabled = enabled;
      this.events.emit('action:context', { kind, amount, enabled });
    }

    if (state.wave.round !== this.round) {
      this.round = state.wave.round;
      this.events.emit('round:changed', { round: this.round });
    }

    const slot = p.weapons[p.activeSlot];
    if (slot) {
      const progress = reloadProgress(p);
      const quantised = progress === null ? null : Math.floor(progress * RELOAD_STEPS) / RELOAD_STEPS;
      const switching = p.switchTimer > 0;
      if (
        slot.id !== this.weapon ||
        slot.magazine !== this.magazine ||
        slot.reserve !== this.reserve ||
        quantised !== this.reload ||
        switching !== this.switching
      ) {
        this.weapon = slot.id;
        this.magazine = slot.magazine;
        this.reserve = slot.reserve;
        this.reload = quantised;
        this.switching = switching;
        this.events.emit('weapon:state', {
          weapon: slot.id,
          magazine: slot.magazine,
          reserve: slot.reserve,
          reloadProgress: quantised,
          switching,
        });
      }
    }

    const step = Math.ceil((p.dashCooldown / DASH.cooldown) * COOLDOWN_STEPS);
    if (step !== this.cooldownStep) {
      this.cooldownStep = step;
      this.events.emit('special:cooldown', { remaining: p.dashCooldown, total: DASH.cooldown });
    }
  }
}
