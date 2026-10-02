import Phaser from 'phaser';
import { ITEMS } from '../../config/balance';
import { ITEM_IDS } from '../../config/items';
import { COLORS } from '../../config/theme';
import type { GroundItemState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey } from '../assets/manifest';
import { DEPTH } from '../depth';

/** The glow's alpha swings between these as it pulses: light, added to the floor, so it shows on any of them. */
const GLOW_MIN = 0.12;
const GLOW_MAX = 0.5;
const GLOW_RADIUS = 8;
const GLOW_COLOR = Number.parseInt(COLORS.bone.slice(1), 16);
/** The icon rests on the floor: its bottom edge a little below the spot's centre. */
const GROUND_OFFSET = 5;

interface View {
  shadow: Phaser.GameObjects.Ellipse;
  glow: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image;
}

/**
 * Special items on the floor (spec 05 §3): the item's icon with a small
 * shadow under it and a light glow added to the floor that pulses every
 * ITEMS.glowPeriod seconds, so it shows on any floor. Drawn with the pickups,
 * under the darkness of locked zones: there it looks like the rest of the
 * room's things, with no marker. One view per item placed this match,
 * created once. Visual only.
 */
export class GroundItemViews {
  private readonly views: View[];

  constructor(scene: Phaser.Scene, items: readonly GroundItemState[]) {
    this.views = items.map((g) => {
      const shadow = scene.add.ellipse(g.x, g.y + GROUND_OFFSET, 12, 4, 0x0f0e0c, 0.45).setDepth(DEPTH.pickups);
      const glow = scene.add.circle(g.x, g.y, GLOW_RADIUS, GLOW_COLOR, GLOW_MIN).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.pickups);
      const icon = scene.add
        .image(g.x, g.y + GROUND_OFFSET, objectTextureKey(ASSET_KEYS.item), Math.max(0, ITEM_IDS.indexOf(g.item)))
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.pickups);
      return { shadow, glow, icon };
    });
  }

  sync(items: readonly GroundItemState[], time: number): void {
    const pulse = (1 - Math.cos((time / ITEMS.glowPeriod) * Math.PI * 2)) / 2;
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      const on = items[i]?.active === true;
      if (!v) continue;
      if (v.icon.visible !== on) {
        v.icon.setVisible(on);
        v.shadow.setVisible(on);
        v.glow.setVisible(on);
      }
      if (on) v.glow.setAlpha(GLOW_MIN + (GLOW_MAX - GLOW_MIN) * pulse);
    }
  }
}
