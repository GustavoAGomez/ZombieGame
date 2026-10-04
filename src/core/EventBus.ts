import type { BoostKind, PickupKind, ZombieKind } from '../config/balance';
import type { AmmoKind, UpgradeKind, WeaponId } from '../config/weapons';
import type { MerchantId, MerchantItemId } from '../config/merchants';
import type { ActivationEffect, ActivationId } from '../config/activations';
import type { ItemId } from '../config/items';
import type { BossId, BossVariantId } from '../config/bosses';
import type { ShopItemStatus } from './shop';

/**
 * Game -> HUD events. The HUD only ever sees these payloads; it never
 * imports or queries Phaser (CLAUDE.md rule 4).
 */
export interface GameEvents {
  'player:health': { hp: number; maxHp: number; low: boolean };
  /** A player took a hit (red border, haptics). */
  /** `x, y`: the player's feet; `fromX, fromY`: where the blow came from (blood sprays away from it). */
  'player:damaged': { playerId: number; hp: number; maxHp: number; x: number; y: number; fromX: number; fromY: number };
  'player:died': { playerId: number };
  'zombie:killed': { x: number; y: number; kind: ZombieKind };
  /** A crack opens where a boss is about to come out (spec 07 §3): the floor shakes, vibration. */
  'boss:warning': { x: number; y: number };
  /** A boss roars (spec 07 §3, §5): out of the floor, and when its fury starts. */
  'boss:roar': { x: number; y: number };
  /** A blow of a boss's slam fell there (spec 07 §4.2). */
  'boss:slam': { x: number; y: number };
  /** A boss landed from a leap (spec 07 §4.3): the screen shakes, vibration. */
  'boss:landed': { x: number; y: number };
  /** A charging boss ran into a wall and is stunned (spec 07 §4.1): the floor jolts. */
  'boss:stunned': { x: number; y: number };
  /** A boss died (spec 07 §6), at the centre of its footprint. */
  'boss:killed': { x: number; y: number; boss: BossId; variant: BossVariantId };
  /**
   * The bosses' health bars at the top of the HUD (spec 07 §6), one per
   * boss on the map with its bar showing: health 0..1 in BOSS.barSteps
   * steps, and whether it is enraged. Empty: no bar.
   */
  'boss:bars': { bars: { boss: BossId; variant: BossVariantId; hp: number; enraged: boolean }[] };
  /**
   * A bullet or the knife hit a zombie (or a boss): blood sprays from (x, y), where the
   * hit is drawn, along (dirX, dirY); it falls to the zombie's feet (groundY).
   */
  'zombie:hit': { x: number; y: number; groundY: number; dirX: number; dirY: number; killed: boolean };
  'pickup:collected': { playerId: number; kind: PickupKind };
  /** A door was bought (medium haptic in phase 9). */
  'door:opened': { doorId: string; playerId: number };
  /** A portal (stairs, ladder, hatch) was bought. */
  'portal:opened': { portalId: string; playerId: number };
  /** Someone paid the Demon's Hand (spec 06 §3.3), with money or with blood. */
  'hand:paid': { playerId: number; blood: boolean };
  /** The hand opened with a weapon (spec 06 §3.4): a special one flashes and is named on the HUD. */
  'hand:offer': { weapon: WeaponId; special: boolean };
  /** The one who paid took the hand's weapon. */
  'hand:taken': { playerId: number; weapon: WeaponId };
  /** The tired hand mocked the payer and gave the payment back (spec 06 §3.6): money, or the blood pact's health. */
  'hand:refunded': { playerId: number; blood: boolean; amount: number };
  /** The tired hand came up in another zone (spec 06 §3.6): «LA MANO SE HA MOVIDO». */
  'hand:moved': { zone: string };
  /**
   * A weapon broke: the katana out of uses (it stays in its slot, useless,
   * until repaired) or the laser at its last overheat (`lost`: it is gone).
   */
  'weapon:broken': { playerId: number; weapon: WeaponId; lost: boolean };
  /** A hellfire burst went off (spec 06 §2.3): the flamethrower's flames burst out there. */
  'fire:blast': { x: number; y: number };
  /** A room was unlocked (its zone id): only now does the HUD say which one, «COCINA DESBLOQUEADA». */
  'zone:unlocked': { zone: string };
  'weapon:state': {
    weapon: WeaponId;
    /**
     * Upgrade levels bought of each kind and how many the weapon takes (the
     * HUD's marks: a box per level, filled when bought), and whether it has
     * its special (name in amber).
     */
    levels: Record<UpgradeKind, number>;
    maxLevels: Record<UpgradeKind, number>;
    special: boolean;
    /** What it spends: rounds (magazine and reserve shown), its battery, or nothing (∞, spec 06 §2.2). */
    ammo: AmmoKind;
    magazine: number;
    /** Magazine size with its ammo level: whether a reload has room. */
    capacity: number;
    reserve: number;
    /** 0..1 while reloading, null otherwise. */
    reloadProgress: number | null;
    switching: boolean;
    /** A beam weapon's battery, 0..1 in steps (1 for the others), and whether it is overheated (spec 06 §2.1). */
    battery: number;
    overheated: boolean;
    /** 0..1 of a melee weapon's cooldown still to run, in steps (0: ready to sweep). */
    cooldown: number;
    /** Uses left of a weapon that wears out (the katana; 0: broken), null for the rest. */
    uses: number | null;
    /** Overheats a beam weapon can still take before it breaks for good (the laser), null for the rest. */
    overheatsLeft: number | null;
  };
  /**
   * The weapons the player carries (at most LOADOUT.maxWeapons), for the
   * slots at the bottom of the HUD; `uses` for one that wears out (the katana).
   */
  'weapons:loadout': { slots: { weapon: WeaponId; ammo: AmmoKind; magazine: number; reserve: number; uses: number | null }[]; active: number };
  'special:cooldown': { remaining: number; total: number };
  /** `points`: everything earned this match (the score); `money`: what is left to spend ($). */
  'points:changed': { points: number; money: number };
  /**
   * Points added to a player. With a world position (x, y) the "+N" floats
   * up from there (repaired window); otherwise it floats in the HUD.
   */
  'points:gained': { playerId: number; amount: number; reason: 'repair' | 'hit' | 'kill'; x?: number; y?: number };
  /**
   * Contextual action chip. kind null hides it. For 'repair', amount is the
   * points per plank (0 once the round's repair limit is reached). For
   * 'door' and 'portal', the cost when affordable, otherwise the points
   * missing. A `locked` portal is a second entrance not yet buyable.
   */
  'action:context': {
    kind: 'repair' | 'door' | 'portal' | 'merchant' | 'weaponCase' | 'hand' | 'pickup' | null;
    amount: number;
    enabled: boolean;
    portal?: 'stairs' | 'hatch';
    locked?: boolean;
    /** With kind 'merchant': whose shop the button opens. */
    merchant?: MerchantId;
    /**
     * With kind 'weaponCase' (spec 04 §3): the weapon sold; `mode` buy, ammo
     * (already carried; `full` when there is nothing to buy) or confirm (the
     * second tap replaces `replaces`, with its `replacesLevel` stars).
     * `amount` is the price, or what is missing when not enabled.
     */
    weaponCase?: { weapon: WeaponId; mode: 'buy' | 'ammo' | 'confirm'; full: boolean; replaces?: WeaponId; replacesLevel?: number };
    /**
     * With kind 'hand' (spec 06 §3.3): what a tap does at the Demon's Hand (HandOffer's modes), the
     * weapon on offer, and the upgraded weapon it would replace (`amount`: the price, the health or what
     * is missing).
     */
    hand?: { mode: 'pay' | 'blood' | 'short' | 'take' | 'confirm'; weapon?: WeaponId; replaces?: WeaponId; replacesLevel?: number };
    /**
     * With kind 'pickup' (spec 05 §3): the special item on the floor; not enabled with the inventory full.
     * Doors and portals never say which room they unlock (`amount` is its price, or what is missing):
     * it is only told once unlocked ('zone:unlocked').
     */
    item?: ItemId;
  };
  /** A special item picked up (spec 05 §3): light vibration and its name on the HUD. */
  'item:picked': { playerId: number; item: ItemId };
  /** The local player's special items, in inventory order (spec 05 §4). */
  'items:inventory': { items: ItemId[] };
  /** An item tapped where it does nothing (spec 05 §5): "AQUÍ NO SE USA", the slot shakes, light vibration. */
  'item:cantUse': { playerId: number; slot: number };
  /**
   * An item thrown at an activation site (spec 05 §6): it flies in an arc
   * from the player to the site's nearest point, from simulated time `time`
   * (s), and lands with a splash ITEMS.throwTime later.
   */
  'item:thrown': { playerId: number; item: ItemId; activation: ActivationId; fromX: number; fromY: number; toX: number; toY: number; time: number };
  /** An activation got its last item, which has landed: its effect has happened. Strong vibration. */
  'activation:completed': { playerId: number; activation: ActivationId; effect: ActivationEffect };
  'round:changed': { round: number };
  /** A merchant appeared (`first`) or teleported to another spot at the start of a round (spec 03 §2). */
  'merchant:moved': { merchant: MerchantId; first: boolean };
  /** Money spent in a shop: "-750$" in red next to the money (spec 03 §3). */
  'money:spent': { playerId: number; amount: number };
  /** Bought at a weapon case: the weapon itself or its ammo (spec 04 §3). Medium vibration. */
  'weaponCase:purchase': { playerId: number; weapon: WeaponId; ammo: boolean };
  /** Something was bought from a merchant (medium haptic). */
  'merchant:purchase': { playerId: number; merchant: MerchantId; item: MerchantItemId };
  /** The local player's shop panel: closed, or open with one row per item still sold. */
  'shop:state': {
    merchant: MerchantId | null;
    /**
     * `boost`: what the round boost row sells this visit. `weapon` and
     * `level`: the weapon an upgrade row upgrades and its level of that
     * kind; `slot` and `weapon`: the weapon of a row sold per weapon (the
     * special). `price` is what the row costs this player now (an upgrade's,
     * by the level it buys).
     */
    rows: {
      index: number;
      item: MerchantItemId;
      price: number;
      status: ShopItemStatus;
      boost?: BoostKind;
      weapon?: WeaponId;
      level?: number;
      slot?: number;
      /** A repair row: the weapon's uses left (0: broken) and all it has when new. */
      uses?: number;
      maxUses?: number;
    }[];
  };
  /**
   * The local player's boost slot (spec 03 §5): a stored boost shows its
   * button; a running one shows the ring (`progress` 1 → 0) and `seconds` left.
   */
  'boost:state': { stored: BoostKind | null; active: BoostKind | null; progress: number; seconds: number };
  /** A stored boost was started (HUD notice, light haptic). */
  'boost:activated': { playerId: number; boost: BoostKind };
  /** Every zombie of the round is dead: the rest before the next round begins. */
  'round:cleared': { round: number };
  /** Every player is dead. `round` is the round reached; `score` every point earned. */
  'game:over': { round: number; score: number };
}

type Handler<P> = (payload: P) => void;

export class EventBus<E extends object = GameEvents> {
  private readonly handlers = new Map<keyof E, Handler<never>[]>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let list = this.handlers.get(type);
    if (!list) {
      list = [];
      this.handlers.set(type, list);
    }
    list.push(handler);
    return () => this.off(type, handler);
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    const list = this.handlers.get(type);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index >= 0) list.splice(index, 1);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    const list = this.handlers.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      (list[i] as Handler<E[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
