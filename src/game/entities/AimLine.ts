import type Phaser from 'phaser';
import { AIM } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import { lerp } from '../../core/math';
import { ASSET_KEYS, objectTextureKey, type CharacterDef } from '../assets/manifest';
import { DEPTH } from '../depth';
import { muzzleOffset } from './muzzle';

const DOT_SPACING = 6;

/**
 * Amber dotted aim line from the gun's muzzle, drawn while the fire stick
 * is dragged (spec 01 §2.2). Uses a fixed set of dot images: no allocation.
 */
export class AimLine {
  private readonly dots: Phaser.GameObjects.Image[];
  private readonly offset = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    private readonly def: CharacterDef | undefined,
  ) {
    const count = Math.floor(AIM.lineLength / DOT_SPACING);
    this.dots = Array.from({ length: count }, (_, i) =>
      scene.add
        .image(0, 0, objectTextureKey(ASSET_KEYS.aimDot))
        .setDepth(DEPTH.aimLine)
        .setVisible(false)
        .setAlpha(1 - (i / count) * 0.6),
    );
  }

  sync(player: PlayerState, alpha: number): void {
    const visible = player.aimManual;
    muzzleOffset(this.def, player.facing, this.offset);
    const x = lerp(player.prevX, player.x, alpha) + this.offset.x;
    const y = lerp(player.prevY, player.y, alpha) + this.offset.y;
    for (let i = 0; i < this.dots.length; i++) {
      const dot = this.dots[i];
      if (!dot) continue;
      if (!visible) {
        if (dot.visible) dot.setVisible(false);
        continue;
      }
      const d = (i + 1) * DOT_SPACING;
      dot.setVisible(true).setPosition(Math.round(x + player.aimX * d), Math.round(y + player.aimY * d));
    }
  }
}
