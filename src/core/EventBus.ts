import type { BoostKind, PickupKind, WeaponId, ZombieKind } from '../config/balance';
import type { MerchantId, MerchantItemId } from '../config/merchants';
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
  /**
   * A bullet or the knife hit a zombie: blood sprays from (x, y), where the
   * hit is drawn, along (dirX, dirY); it falls to the zombie's feet (groundY).
   */
  'zombie:hit': { x: number; y: number; groundY: number; dirX: number; dirY: number; killed: boolean };
  'pickup:collected': { playerId: number; kind: PickupKind };
  /** A door was bought (medium haptic in phase 9). */
  'door:opened': { doorId: string; playerId: number };
  /** A portal (stairs, ladder, hatch) was bought. */
  'portal:opened': { portalId: string; playerId: number };
  'weapon:state': {
    weapon: WeaponId;
    /** Upgrade level 0–3 (stars) and whether it has its special (name in amber). */
    level: number;
    special: boolean;
    magazine: number;
    reserve: number;
    /** 0..1 while reloading, null otherwise. */
    reloadProgress: number | null;
    switching: boolean;
  };
  /** The weapons the player carries (at most LOADOUT.maxWeapons), for the slots at the bottom of the HUD. */
  'weapons:loadout': { slots: { weapon: WeaponId; magazine: number; reserve: number }[]; active: number };
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
    kind: 'repair' | 'door' | 'portal' | 'merchant' | null;
    amount: number;
    enabled: boolean;
    portal?: 'stairs' | 'hatch';
    locked?: boolean;
    /** With kind 'merchant': whose shop the button opens. */
    merchant?: MerchantId;
  };
  'round:changed': { round: number };
  /** A merchant appeared (`first`) or teleported to another spot at the start of a round (spec 03 §2). */
  'merchant:moved': { merchant: MerchantId; first: boolean };
  /** Money spent in a shop: "-750$" in red next to the money (spec 03 §3). */
  'money:spent': { playerId: number; amount: number };
  /** Something was bought from a merchant (medium haptic). */
  'merchant:purchase': { playerId: number; merchant: MerchantId; item: MerchantItemId };
  /** The local player's shop panel: closed, or open with one row per item still sold. */
  'shop:state': {
    merchant: MerchantId | null;
    /**
     * `boost`: what the round boost row sells this visit. `weapon` and
     * `level`: the weapon a level-up row upgrades; `slot` and `weapon`: the
     * weapon of a row sold per weapon (the special).
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
