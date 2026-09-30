import type Phaser from 'phaser';
import type { BulletState } from '../../core/GameState';
import { lerp } from '../../core/math';
import { ASSET_KEYS, objectTextureKey } from '../assets/manifest';
import { DEPTH } from '../depth';

/** One preallocated image per pooled bullet; mirrors state.bullets. */
export class BulletViewPool {
  private readonly images: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene, poolSize: number) {
    this.images = Array.from({ length: poolSize }, () =>
      scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.bullet)).setDepth(DEPTH.bullets).setVisible(false),
    );
  }

  sync(bullets: readonly BulletState[], alpha: number): void {
    for (let i = 0; i < this.images.length; i++) {
      const img = this.images[i];
      const b = bullets[i];
      if (!img) continue;
      if (!b?.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      img
        .setVisible(true)
        .setPosition(lerp(b.prevX, b.x, alpha), lerp(b.prevY, b.y, alpha))
        .setRotation(Math.atan2(b.dirY, b.dirX));
    }
  }
}
