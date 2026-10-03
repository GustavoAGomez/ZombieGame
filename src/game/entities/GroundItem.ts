import Phaser from 'phaser';
import { ITEMS } from '../../config/balance';
import { itemDef } from '../../config/items';
import { COLORS } from '../../config/theme';
import type { GroundItemState } from '../../core/GameState';
import { itemSpriteKey, objectTextureKey, type Manifest } from '../assets/manifest';
import { DEPTH } from '../depth';

/**
 * A circular spot of light on the floor, like a mission marker in GTA San
 * Andreas: an amber pool added to the floor, its rim, and the item in the
 * middle (its 24×24 sprite). The pool's alpha swings between these as it pulses.
 */
const SPOT_RADIUS = 15;
const SPOT_MIN = 0.22;
const SPOT_MAX = 0.5;
const RIM_ALPHA = 0.85;
const SPOT_COLOR = Number.parseInt(COLORS.amber.slice(1), 16);
/** A floating item (the wand) hovers this high over its spot (px), bobbing this much once every FLOAT_PERIOD s. */
const FLOAT_HEIGHT = 5;
const FLOAT_BOB = 2;
const FLOAT_PERIOD = 1.6;

interface View {
  spot: Phaser.GameObjects.Arc;
  rim: Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image;
  /** Frames of its animated sprite, and at how many frames per second they play. */
  frames: number;
  fps: number;
  floats: boolean;
}

/** The frame of an item's animation `time` s in: it loops at its fps. */
export function itemFrame(time: number, fps: number, frames: number): number {
  return frames > 1 ? Math.floor(time * fps) % frames : 0;
}

/**
 * Special items on the floor (spec 05 §3): a circular spot of light that
 * pulses every ITEMS.glowPeriod seconds, with the item's animated sprite
 * inside (the wand floating over it), so it shows on any floor. Drawn with the pickups, under the darkness of locked
 * zones: there it looks like the rest of the room's things, with no marker
 * pointing at it. One view per item placed this match, created once.
 * Visual only.
 */
export class GroundItemViews {
  private readonly views: View[];

  constructor(scene: Phaser.Scene, items: readonly GroundItemState[], manifest: Manifest) {
    this.views = items.map((g) => {
      const key = itemSpriteKey(g.item);
      const def = itemDef(g.item);
      const spot = scene.add.circle(g.x, g.y, SPOT_RADIUS, SPOT_COLOR, SPOT_MIN).setBlendMode(Phaser.BlendModes.ADD).setDepth(DEPTH.pickups);
      const rim = scene.add.circle(g.x, g.y, SPOT_RADIUS).setStrokeStyle(1, SPOT_COLOR, RIM_ALPHA).setDepth(DEPTH.pickups);
      const icon = scene.add.image(g.x, g.y, objectTextureKey(key), 0).setDepth(DEPTH.pickups);
      return { spot, rim, icon, frames: Math.max(1, manifest.objects[key]?.frames ?? 1), fps: def.fps, floats: def.floats === true };
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
      if (!on) continue;
      v.spot.setAlpha(SPOT_MIN + (SPOT_MAX - SPOT_MIN) * pulse);
      v.icon.setFrame(itemFrame(time, v.fps, v.frames));
      const item = items[i];
      if (v.floats && item) v.icon.setY(item.y - FLOAT_HEIGHT - Math.round(Math.sin((time / FLOAT_PERIOD) * Math.PI * 2) * FLOAT_BOB));
    }
  }
}
