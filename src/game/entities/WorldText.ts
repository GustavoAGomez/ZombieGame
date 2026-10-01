import type Phaser from 'phaser';
import { POINTS } from '../../config/balance';
import { COLORS, FONTS } from '../../config/theme';
import type { EventBus, GameEvents } from '../../core/EventBus';
import { DEPTH } from '../depth';
import { STRINGS } from '../../ui/strings';

const POOL_SIZE = 8;
/** How far a text rises while it fades, in world px. */
const RISE = 12;

/** A new gain at the same spot within this fraction of the lifetime adds up instead of stacking. */
const MERGE_WINDOW = 0.7;

interface Slot {
  text: Phaser.GameObjects.Text;
  bornAt: number;
  x: number;
  y: number;
  amount: number;
}

/**
 * Floating "+N" texts in the world (e.g. above a repaired window), pooled
 * (CLAUDE.md rule 7). They rise and fade in 600 ms, like the HUD ones.
 */
export class WorldTextPool {
  private readonly slots: Slot[];
  private next = 0;
  private now = 0;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    events: EventBus,
    private readonly localPlayerId = 0,
  ) {
    this.slots = Array.from({ length: POOL_SIZE }, () => ({
      text: scene.add
        .text(0, 0, '', {
          fontFamily: FONTS.display,
          fontSize: '8px',
          color: COLORS.money,
          shadow: { offsetX: 1, offsetY: 1, color: COLORS.ink, fill: true, blur: 0 },
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.aimLine + 1)
        .setVisible(false),
      bornAt: -Infinity,
      x: 0,
      y: 0,
      amount: 0,
    }));
    this.unsubscribe = events.on('points:gained', this.onPoints);
  }

  sync(now: number): void {
    this.now = now;
    for (const slot of this.slots) {
      if (!slot.text.visible) continue;
      const t = (now - slot.bornAt) / POINTS.floatingTextMs;
      if (t >= 1) {
        slot.text.setVisible(false);
        continue;
      }
      // Step the motion in whole pixels so the pixel font stays crisp.
      slot.text.setPosition(Math.round(slot.x), Math.round(slot.y - RISE * t)).setAlpha(1 - t * t);
    }
  }

  destroy(): void {
    this.unsubscribe();
  }

  private readonly onPoints = (e: GameEvents['points:gained']): void => {
    if (e.playerId !== this.localPlayerId || e.x === undefined || e.y === undefined) return;
    const x = e.x;
    const y = e.y - 10;
    // Repeated taps on the same window add up ("+10", "+20"…) instead of overlapping.
    let slot = this.slots.find(
      (s) => s.text.visible && s.x === x && s.y === y && this.now - s.bornAt < POINTS.floatingTextMs * MERGE_WINDOW,
    );
    if (slot) {
      slot.amount += e.amount;
    } else {
      slot = this.slots[this.next];
      if (!slot) return;
      this.next = (this.next + 1) % this.slots.length;
      slot.amount = e.amount;
      slot.x = x;
      slot.y = y;
    }
    slot.bornAt = this.now;
    slot.text.setText(STRINGS.hud.moneyGained(slot.amount)).setAlpha(1).setVisible(true).setPosition(Math.round(x), Math.round(y));
  };
}
