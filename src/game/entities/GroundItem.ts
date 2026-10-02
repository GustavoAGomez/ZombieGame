import Phaser from 'phaser';
import { ITEMS } from '../../config/balance';
import { ITEM_IDS } from '../../config/items';
import { COLORS } from '../../config/theme';
import type { GroundItemState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey } from '../assets/manifest';
import { DEPTH } from '../depth';

/**
 * A circular spot of light on the floor, like a mission marker in GTA San
 * Andreas: an amber pool added to the floor, its rim, and the item in the
 * middle. The pool's alpha swings between these as it pulses.
 */
const SPOT_RADIUS = 11;
const SPOT_MIN = 0.22;
const SPOT_MAX = 0.5;
const RIM_ALPHA = 0.85;
const SPOT_COLOR = Number.parseInt(COLORS.amber.slice(1), 16);

interface View {
  spot: Phaser.GameObjects.Arc;
  rim: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image;
}

/**
 * Special items on the floor (spec 05 §3): a circular spot of light that
 * pulses every ITEMS.glowPeriod seconds, with the item's icon inside, so it
 * shows on any floor. Drawn with the pickups, under the darkness of locked
 * zones: there it looks like the rest of the room's things, with no marker
 * pointing at it. One view per item placed this match, created once.
 * Visual only.
 */
export class GroundItemViews {
  private readonly views: View[];

  constructor(scene: Phaser.Scene, items: readonly GroundItemState[]) {
    this.views = items.map((g) => {
      const spot = scene.add.circle(g.x, g.y, SPOT_RADIUS, SPOT_COLOR, SPOT_MIN).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.pickups);
      const rim = scene.add.circle(g.x, g.y, SPOT_RADIUS).setStrokeStyle(1, SPOT_COLOR, RIM_ALPHA).setDepth(DEPTH.pickups);
      const icon = scene.add.image(g.x, g.y, objectTextureKey(ASSET_KEYS.item), Math.max(0, ITEM_IDS.indexOf(g.item))).setDepth(DEPTH.pickups);
      return { spot, rim, icon };
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
        v.spot.setVisible(on);
        v.rim.setVisible(on);
      }
      if (on) v.spot.setAlpha(SPOT_MIN + (SPOT_MAX - SPOT_MIN) * pulse);
    }
  }
}
