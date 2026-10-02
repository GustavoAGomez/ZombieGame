import { BOOSTS, DASH, PLAYER } from '../config/balance';
import { type WeaponId } from '../config/weapons';
import { merchantDef, type MerchantId } from '../config/merchants';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { MapData } from './map/MapLoader';
import { repairPointsAvailable } from './systems/BarricadeSystem';
import { isPortalBuyable } from './systems/PortalSystem';
import { isPerWeapon, shopItemStatus } from './systems/ShopSystem';
import { magazineSize } from './systems/weaponStats';
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
  private level = -1;
  private special = false;
  private cooldownStep = -1;
  private hp = -1;
  private round = -1;
  private money = -1;
  private score = -1;
  private actionKind: GameEvents['action:context']['kind'] | undefined = undefined;
  private actionMerchant: MerchantId | undefined;
  /** Last published shop panel, as a comparable string. */
  private shopKey = '';
  /** Last published boost slot, as a comparable string. */
  private boostKey = '';
  private actionAmount = -1;
  private actionEnabled = false;
  private actionLocked = false;
  private actionPortal: 'stairs' | 'hatch' | undefined;
  /** Last published weapon slots: active slot, then weapon / magazine / reserve per slot. */
  private loadoutActive = -1;
  private readonly loadout: (WeaponId | number)[] = [];

  constructor(
    private readonly events: EventBus,
    private readonly map: MapData,
  ) {}

  /** The shop panel: closed, or one row per item still sold with its button state. */
  private publishShop(state: GameState, playerIndex: number): void {
    const p = state.players[playerIndex];
    const m = p ? state.merchants[p.shopMerchant] : undefined;
    let shop: GameEvents['shop:state'] = { merchant: null, rows: [] };
    if (m) {
      const merchant = p?.shopMerchant ?? -1;
      const rows = merchantDef(m.id).items.flatMap((item, index): GameEvents['shop:state']['rows'] => {
        if (isPerWeapon(item.id)) {
          return (p?.weapons ?? []).flatMap((weapon, slot) => {
            const status = shopItemStatus(state, merchant, playerIndex, index, slot);
            return status.kind === 'hidden' ? [] : [{ index, item: item.id, price: item.price, status, slot, weapon: weapon.id }];
          });
        }
        const status = shopItemStatus(state, merchant, playerIndex, index);
        if (status.kind === 'hidden') return [];
        const row = { index, item: item.id, price: item.price, status };
        if (item.id === 'round_boost') return [{ ...row, boost: m.boost }];
        const active = p?.weapons[p.activeSlot];
        if (item.id === 'weapon_level' && active) return [{ ...row, weapon: active.id, level: active.level }];
        return [row];
      });
      shop = { merchant: m.id, rows };
    }
    const key = JSON.stringify(shop);
    if (key === this.shopKey) return;
    this.shopKey = key;
    this.events.emit('shop:state', shop);
  }

  publish(state: GameState, playerIndex = 0): void {
    const p = state.players[playerIndex];
    if (!p) return;

    const hp = Math.ceil(p.hp);
    if (hp !== this.hp) {
      this.hp = hp;
      this.events.emit('player:health', { hp, maxHp: p.maxHp, low: hp > 0 && hp < PLAYER.lowHpThreshold });
    }

    if (p.money !== this.money || p.score !== this.score) {
      this.money = p.money;
      this.score = p.score;
      this.events.emit('points:changed', { points: p.score, money: p.money });
    }

    const kind = p.contextAction === 'none' ? null : p.contextAction;
    let amount = 0;
    let enabled = kind !== null;
    let locked = false;
    let portalKind: 'stairs' | 'hatch' | undefined;
    if (kind === 'repair') {
      amount = repairPointsAvailable(p);
    } else if (kind === 'door' || kind === 'portal') {
      // Affordable: show the cost. Otherwise: how many points are missing.
      const portal = kind === 'portal' ? this.map.portals[p.contextTarget] : undefined;
      const cost = (portal ?? this.map.doors[p.contextTarget])?.cost ?? 0;
      if (portal) {
        portalKind = portal.kind === 'hatch' ? 'hatch' : 'stairs';
        locked = !isPortalBuyable(this.map, state, p.contextTarget);
      }
      enabled = !locked && p.money >= cost;
      amount = locked ? 0 : enabled ? cost : cost - p.money;
    }
    const merchant = kind === 'merchant' ? state.merchants[p.contextTarget]?.id : undefined;
    if (
      kind !== this.actionKind ||
      merchant !== this.actionMerchant ||
      amount !== this.actionAmount ||
      enabled !== this.actionEnabled ||
      locked !== this.actionLocked ||
      portalKind !== this.actionPortal
    ) {
      this.actionKind = kind;
      this.actionAmount = amount;
      this.actionEnabled = enabled;
      this.actionLocked = locked;
      this.actionPortal = portalKind;
      this.actionMerchant = merchant;
      if (kind === 'portal') this.events.emit('action:context', { kind, amount, enabled, portal: portalKind, locked });
      else if (merchant) this.events.emit('action:context', { kind, amount, enabled, merchant });
      else this.events.emit('action:context', { kind, amount, enabled });
    }

    this.publishShop(state, playerIndex);

    // The ring empties in COOLDOWN_STEPS steps; the seconds count down whole.
    const progress = p.boostActive ? Math.ceil((p.boostTimer / BOOSTS.duration) * COOLDOWN_STEPS) / COOLDOWN_STEPS : 0;
    const seconds = p.boostActive ? Math.ceil(p.boostTimer) : 0;
    const boostKey = `${p.boostStored}:${p.boostActive}:${progress}:${seconds}`;
    if (boostKey !== this.boostKey) {
      this.boostKey = boostKey;
      this.events.emit('boost:state', { stored: p.boostStored, active: p.boostActive, progress, seconds });
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
        switching !== this.switching ||
        slot.level !== this.level ||
        slot.special !== this.special
      ) {
        this.weapon = slot.id;
        this.level = slot.level;
        this.special = slot.special;
        this.magazine = slot.magazine;
        this.reserve = slot.reserve;
        this.reload = quantised;
        this.switching = switching;
        this.events.emit('weapon:state', {
          weapon: slot.id,
          level: slot.level,
          special: slot.special,
          magazine: slot.magazine,
          capacity: magazineSize(slot),
          reserve: slot.reserve,
          reloadProgress: quantised,
          switching,
        });
      }
    }

    // Weapon slots: published when a weapon, the active one or any ammo count changes.
    let loadoutChanged = p.activeSlot !== this.loadoutActive || this.loadout.length !== p.weapons.length * 3;
    for (let i = 0; i < p.weapons.length && !loadoutChanged; i++) {
      const w = p.weapons[i];
      loadoutChanged = !w || this.loadout[i * 3] !== w.id || this.loadout[i * 3 + 1] !== w.magazine || this.loadout[i * 3 + 2] !== w.reserve;
    }
    if (loadoutChanged) {
      this.loadoutActive = p.activeSlot;
      this.loadout.length = 0;
      for (const w of p.weapons) this.loadout.push(w.id, w.magazine, w.reserve);
      this.events.emit('weapons:loadout', {
        slots: p.weapons.map((w) => ({ weapon: w.id, magazine: w.magazine, reserve: w.reserve })),
        active: p.activeSlot,
      });
    }

    const step = Math.ceil((p.dashCooldown / DASH.cooldown) * COOLDOWN_STEPS);
    if (step !== this.cooldownStep) {
      this.cooldownStep = step;
      this.events.emit('special:cooldown', { remaining: p.dashCooldown, total: DASH.cooldown });
    }
  }
}
