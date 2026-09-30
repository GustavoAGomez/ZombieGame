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
  'weapon:state': {
    weapon: WeaponId;
    magazine: number;
    reserve: number;
    /** 0..1 while reloading, null otherwise. */
    reloadProgress: number | null;
    switching: boolean;
  };
  'special:cooldown': { remaining: number; total: number };
  'points:changed': { points: number };
  /** Points added to a player (floating "+N" texts arrive in phase 6). */
  'points:gained': { playerId: number; amount: number; reason: 'repair' | 'hit' | 'kill' };
  /**
   * Contextual action chip. kind null hides it. For 'repair', amount is the
   * points per plank (0 once the round's repair limit is reached).
   */
  'action:context': { kind: 'repair' | 'door' | null; amount: number; enabled: boolean };
  'round:changed': { round: number };
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
