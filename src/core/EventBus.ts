import type { PickupKind, WeaponId, ZombieKind } from '../config/balance';

/**
 * Game -> HUD events. The HUD only ever sees these payloads; it never
 * imports or queries Phaser (CLAUDE.md rule 4).
 */
export interface GameEvents {
  'player:health': { hp: number; maxHp: number; low: boolean };
  /** A player took a hit (red border, haptics). */
  'player:damaged': { playerId: number; hp: number; maxHp: number };
  'player:died': { playerId: number };
  'zombie:killed': { x: number; y: number; kind: ZombieKind };
  'pickup:collected': { playerId: number; kind: PickupKind };
  /** A door was bought (medium haptic in phase 9). */
  'door:opened': { doorId: string; playerId: number };
  /** A portal (stairs, ladder, hatch) was bought. */
  'portal:opened': { portalId: string; playerId: number };
  'weapon:state': {
    weapon: WeaponId;
    magazine: number;
    reserve: number;
    /** 0..1 while reloading, null otherwise. */
    reloadProgress: number | null;
    switching: boolean;
  };
  /** The weapons the player carries (at most LOADOUT.maxWeapons), for the slots at the bottom of the HUD. */
  'weapons:loadout': { slots: { weapon: WeaponId; magazine: number; reserve: number }[]; active: number };
  'special:cooldown': { remaining: number; total: number };
  'points:changed': { points: number };
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
    kind: 'repair' | 'door' | 'portal' | null;
    amount: number;
    enabled: boolean;
    portal?: 'stairs' | 'hatch';
    locked?: boolean;
  };
  'round:changed': { round: number };
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
