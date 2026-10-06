import { rules } from './rules';
import { dungeonOffer } from './systems/DungeonSystem';
import { BARRICADES, BOOSTS, BOSS, DASH, PLAYER } from '../config/balance';
import { WEAPONS, type WeaponId } from '../config/weapons';
import { bossesForRound } from '../config/bosses';
import { merchantDef, type MerchantId } from '../config/merchants';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { MapData } from './map/MapLoader';
import { repairPointsAvailable } from './systems/BarricadeSystem';
import { doorTarget } from './systems/DoorSystem';
import { portalTarget } from './systems/PortalSystem';
import { isPerWeapon, itemPrice, shopItemStatus, upgradeKindOf } from './systems/ShopSystem';
import { batteryLevel } from './systems/BeamSystem';
import { handOffer } from './systems/HandSystem';
import { ammoKind, fireRate, magazineSize, maxUpgradeLevel, overheatsLeft, totalLevels, usesLeft } from './systems/weaponStats';
import { caseOffer } from './systems/WeaponCaseSystem';
import { hasItemRoom } from './systems/ItemSystem';
import { reloadProgress } from './systems/WeaponSystem';
import { bossBarShows } from './systems/BossCombat';

/** Steps used to quantise continuous values so the DOM updates rarely. */
const RELOAD_STEPS = 20;
/** The battery bar moves in steps of 1/40 (2.5 %). */
const BATTERY_STEPS = 40;
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
  private levels = '';
  private special = false;
  private battery = -1;
  private overheated = false;
  private cooldown = -1;
  private uses: number | null = -1;
  private overheatsLeft: number | null = -1;
  private cooldownStep = -1;
  private hp = -1;
  private round = -1;
  private money = -1;
  private score = -1;
  private actionKind: GameEvents['action:context']['kind'] | undefined = undefined;
  private actionMerchant: MerchantId | undefined;
  /** The weapon case offer last published, as a comparable string. */
  private actionCase = '';
  /** Last published shop panel, as a comparable string. */
  private shopKey = '';
  /** Last published boost slot, as a comparable string. */
  private boostKey = '';
  private itemsKey: string | null = null;
  private actionAmount = -1;
  private actionEnabled = false;
  private actionLocked = false;
  private actionPortal: 'stairs' | 'hatch' | undefined;
  /** Last published boss health bars, as a comparable string. */
  private bossKey = '';
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
            if (status.kind === 'hidden' || !p) return [];
            const row = { index, item: item.id, price: itemPrice(p, item), status, slot, weapon: weapon.id };
            // A repair row says how worn the weapon is.
            return item.id === 'repair' ? [{ ...row, uses: weapon.uses, maxUses: WEAPONS[weapon.id].durability ?? 0 }] : [row];
          });
        }
        const status = shopItemStatus(state, merchant, playerIndex, index);
        if (status.kind === 'hidden' || !p) return [];
        const row = { index, item: item.id, price: itemPrice(p, item), status };
        if (item.id === 'round_boost') return [{ ...row, boost: m.boost }];
        const active = p.weapons[p.activeSlot];
        const kind = upgradeKindOf(item.id);
        if (kind && active) return [{ ...row, weapon: active.id, level: active.levels[kind] }];
        return [row];
      });
      shop = { merchant: m.id, rows };
    }
    const key = JSON.stringify(shop);
    if (key === this.shopKey) return;
    this.shopKey = key;
    this.events.emit('shop:state', shop);
  }

  /** The bosses' health bars (spec 07 §6), in steps, only when they change. */
  private publishBosses(state: GameState): void {
    const bars: GameEvents['boss:bars']['bars'] = [];
    for (const b of state.bosses) {
      if (!b.active || !bossBarShows(b)) continue;
      const hp = Math.ceil((Math.max(0, b.hp) / Math.max(1e-6, b.maxHp)) * BOSS.barSteps) / BOSS.barSteps;
      bars.push({ boss: b.boss, variant: b.variant, hp, enraged: b.enraged });
    }
    const key = bars.map((b) => `${b.boss}:${b.variant}:${b.hp}:${b.enraged}`).join('|');
    if (key === this.bossKey) return;
    this.bossKey = key;
    this.events.emit('boss:bars', { bars });
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
      // Only the long wait under attack shows: the chip dims (a tap shakes it); ready again, it blinks.
      enabled = p.repairCooldown <= BARRICADES.repairTapCooldown;
    } else if (kind === 'door' || kind === 'portal') {
      // The price of the room it unlocks (never which room: that is a surprise); affordable: the price, otherwise what is missing.
      const portal = kind === 'portal' ? this.map.portals[p.contextTarget] : undefined;
      if (portal) portalKind = portal.kind === 'hatch' ? 'hatch' : 'stairs';
      const target = portal ? portalTarget(this.map, state, p.contextTarget) : doorTarget(this.map, state, p.contextTarget);
      const zone = this.map.zones[target];
      locked = !zone;
      const cost = zone?.cost ?? 0;
      enabled = !locked && p.money >= cost;
      amount = locked ? 0 : enabled ? cost : cost - p.money;
    }
    const merchant = kind === 'merchant' ? state.merchants[p.contextTarget]?.id : undefined;
    let weaponCase: GameEvents['action:context']['weaponCase'];
    if (kind === 'weaponCase') {
      const offer = caseOffer(this.map, p, p.contextTarget);
      if (offer) {
        enabled = offer.enabled;
        amount = offer.full ? 0 : offer.enabled ? offer.price : offer.missing;
        weaponCase = { weapon: offer.weapon, mode: offer.mode, full: offer.full };
        if (offer.mode === 'confirm' && offer.replaces) {
          weaponCase.replaces = offer.replaces.id;
          weaponCase.replacesLevel = totalLevels(offer.replaces);
        }
      }
    }
    // The Demon's Hand (spec 06 §3.3): pay, the blood pact, what is missing, or take its weapon.
    let hand: GameEvents['action:context']['hand'];
    if (kind === 'hand') {
      const offer = handOffer(this.map, state, p);
      if (offer) {
        enabled = offer.enabled;
        amount = offer.amount;
        hand = { mode: offer.mode };
        if (offer.weapon) hand.weapon = offer.weapon;
        if (offer.mode === 'confirm' && offer.replaces) {
          hand.replaces = offer.replaces.id;
          hand.replacesLevel = totalLevels(offer.replaces);
        }
      }
    }
    // A special item on the floor (spec 05 §3): picked up while there is room.
    const item = kind === 'pickup' ? state.groundItems[p.contextTarget]?.item : undefined;
    if (kind === 'pickup') enabled = hasItemRoom(p);
    // The dungeon (spec 09): a chest, a keyed door, the challenge's warning or the way down.
    let dungeon: GameEvents['action:context']['dungeon'];
    if (kind === 'dungeon') {
      const offer = dungeonOffer(this.map, state, p);
      if (offer) {
        enabled = offer.enabled;
        dungeon = offer.weapon === undefined ? { action: offer.action } : { action: offer.action, weapon: offer.weapon };
      }
    }
    const caseKey = weaponCase ? JSON.stringify(weaponCase) : hand ? JSON.stringify(hand) : dungeon ? JSON.stringify(dungeon) : (item ?? '');
    if (
      kind !== this.actionKind ||
      merchant !== this.actionMerchant ||
      caseKey !== this.actionCase ||
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
      this.actionCase = caseKey;
      if (kind === 'portal') this.events.emit('action:context', { kind, amount, enabled, portal: portalKind, locked });
      else if (weaponCase) this.events.emit('action:context', { kind, amount, enabled, weaponCase });
      else if (hand) this.events.emit('action:context', { kind, amount, enabled, hand });
      else if (dungeon) this.events.emit('action:context', { kind, amount, enabled, dungeon });
      else if (merchant) this.events.emit('action:context', { kind, amount, enabled, merchant });
      else if (item) this.events.emit('action:context', { kind, amount, enabled, item });
      else this.events.emit('action:context', { kind, amount, enabled });
    }

    this.publishShop(state, playerIndex);

    // The inventory (spec 05 §4), only when it changes.
    const itemsKey = p.items.join(',');
    if (itemsKey !== this.itemsKey) {
      this.itemsKey = itemsKey;
      this.events.emit('items:inventory', { items: p.items.slice() });
    }

    // The ring empties in COOLDOWN_STEPS steps; the seconds count down whole.
    const progress = p.boostActive ? Math.ceil((p.boostTimer / BOOSTS.duration) * COOLDOWN_STEPS) / COOLDOWN_STEPS : 0;
    const seconds = p.boostActive ? Math.ceil(p.boostTimer) : 0;
    const boostKey = `${p.boostStored}:${p.boostActive}:${progress}:${seconds}`;
    if (boostKey !== this.boostKey) {
      this.boostKey = boostKey;
      this.events.emit('boost:state', { stored: p.boostStored, active: p.boostActive, progress, seconds });
    }

    this.publishBosses(state);

    if (rules(state).waves && state.wave.round !== this.round) {
      this.round = state.wave.round;
      this.events.emit('round:changed', { round: this.round, boss: bossesForRound(this.round).length > 0 });
    }

    const slot = p.weapons[p.activeSlot];
    if (slot) {
      const progress = reloadProgress(p);
      const quantised = progress === null ? null : Math.floor(progress * RELOAD_STEPS) / RELOAD_STEPS;
      const switching = p.switchTimer > 0;
      // A beam weapon's battery, in steps so the bar is not republished every tick (spec 06 §2.1).
      const battery = Math.ceil(batteryLevel(slot) * BATTERY_STEPS) / BATTERY_STEPS;
      const overheated = slot.overheat > 0;
      // A melee weapon's cooldown (the katana), as the part still to run, in the same steps.
      const cooldown = Math.ceil(slot.cooldown * fireRate(slot) * BATTERY_STEPS) / BATTERY_STEPS;
      // Wear: the katana's uses left, the laser's overheats left before it breaks.
      const uses = usesLeft(slot);
      const overheats = overheatsLeft(slot);
      if (
        slot.id !== this.weapon ||
        slot.magazine !== this.magazine ||
        slot.reserve !== this.reserve ||
        quantised !== this.reload ||
        switching !== this.switching ||
        battery !== this.battery ||
        overheated !== this.overheated ||
        cooldown !== this.cooldown ||
        uses !== this.uses ||
        overheats !== this.overheatsLeft ||
        levelsKey(slot) !== this.levels ||
        slot.special !== this.special
      ) {
        this.weapon = slot.id;
        this.levels = levelsKey(slot);
        this.special = slot.special;
        this.magazine = slot.magazine;
        this.reserve = slot.reserve;
        this.reload = quantised;
        this.switching = switching;
        this.battery = battery;
        this.overheated = overheated;
        this.cooldown = cooldown;
        this.uses = uses;
        this.overheatsLeft = overheats;
        this.events.emit('weapon:state', {
          weapon: slot.id,
          levels: { ...slot.levels },
          maxLevels: { ammo: maxUpgradeLevel(WEAPONS[slot.id], 'ammo'), fire_rate: maxUpgradeLevel(WEAPONS[slot.id], 'fire_rate'), damage: maxUpgradeLevel(WEAPONS[slot.id], 'damage') },
          special: slot.special,
          ammo: ammoKind(WEAPONS[slot.id]),
          magazine: slot.magazine,
          capacity: magazineSize(slot),
          reserve: slot.reserve,
          reloadProgress: quantised,
          switching,
          battery,
          overheated,
          cooldown,
          uses,
          overheatsLeft: overheats,
        });
      }
    }

    // Weapon slots: published when a weapon, the active one or any ammo count changes.
    let loadoutChanged = p.activeSlot !== this.loadoutActive || this.loadout.length !== p.weapons.length * 4;
    for (let i = 0; i < p.weapons.length && !loadoutChanged; i++) {
      const w = p.weapons[i];
      loadoutChanged =
        !w || this.loadout[i * 4] !== w.id || this.loadout[i * 4 + 1] !== w.magazine || this.loadout[i * 4 + 2] !== w.reserve || this.loadout[i * 4 + 3] !== w.uses;
    }
    if (loadoutChanged) {
      this.loadoutActive = p.activeSlot;
      this.loadout.length = 0;
      for (const w of p.weapons) this.loadout.push(w.id, w.magazine, w.reserve, w.uses);
      this.events.emit('weapons:loadout', {
        slots: p.weapons.map((w) => ({ weapon: w.id, ammo: ammoKind(WEAPONS[w.id]), magazine: w.magazine, reserve: w.reserve, uses: usesLeft(w) })),
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

/** A weapon's upgrade levels as one comparable value (the HUD's marks change only with them). */
function levelsKey(slot: { levels: Record<string, number> }): string {
  return `${slot.levels.ammo}:${slot.levels.fire_rate}:${slot.levels.damage}`;
}
