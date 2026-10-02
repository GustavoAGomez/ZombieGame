import type Phaser from 'phaser';
import { ITEMS } from '../../config/balance';
import { COLORS, FONTS } from '../../config/theme';
import type { EventBus, GameEvents } from '../../core/EventBus';
import { STRINGS } from '../../ui/strings';
import { DEPTH } from '../depth';

/** Above the player's feet, in world px: over the head. */
const ABOVE = 34;
/** How far it rises while it shows, in world px. */
const RISE = 6;

/**
 * "AQUÍ NO SE USA" over the player for ITEMS.cantUseTime when a special item
 * is tapped where it does nothing (spec 05 §5). One text, following the
 * player: a new failed use restarts it instead of stacking another. It runs
 * on the scene's clock, so the pause freezes it. Visual only.
 */
export class CantUseText {
  private readonly text: Phaser.GameObjects.Text;
  private shownAt = -Infinity;
  private pending = false;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    events: EventBus,
    private readonly localPlayerId = 0,
  ) {
    this.text = scene.add
      .text(0, 0, STRINGS.items.cantUse, {
        fontFamily: FONTS.display,
        fontSize: '8px',
        color: COLORS.bone,
        shadow: { offsetX: 1, offsetY: 1, color: COLORS.ink, fill: true, blur: 0 },
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.aimLine + 1)
      .setVisible(false);
    this.unsubscribe = events.on('item:cantUse', this.onCantUse);
  }

  /** `at`: where the player is drawn (its sprite's feet), so the text moves with it. */
  sync(at: { x: number; y: number } | undefined, now: number): void {
    if (this.pending) {
      this.pending = false;
      this.shownAt = now;
    }
    const t = (now - this.shownAt) / (ITEMS.cantUseTime * 1000);
    if (!at || t >= 1) {
      if (this.text.visible) this.text.setVisible(false);
      return;
    }
    // Whole pixels so the pixel font stays crisp; it fades out over the last third.
    this.text
      .setVisible(true)
      .setPosition(Math.round(at.x), Math.round(at.y - ABOVE - RISE * t))
      .setAlpha(t < 2 / 3 ? 1 : (1 - t) * 3);
  }

  destroy(): void {
    this.unsubscribe();
  }

  private readonly onCantUse = (e: GameEvents['item:cantUse']): void => {
    if (e.playerId === this.localPlayerId) this.pending = true;
  };
}
