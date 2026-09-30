import type Phaser from 'phaser';
import { ZOMBIES } from '../../config/balance';
import type { BloodState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey } from '../assets/manifest';
import { DEPTH } from '../depth';

/** Blood decals fade out over the last seconds of their lifetime. */
const FADE_OUT_SECONDS = 4;

export class BloodViewPool {
  private readonly images: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene, poolSize: number) {
    this.images = Array.from({ length: poolSize }, () =>
      scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.blood), 0).setDepth(DEPTH.decals).setVisible(false),
    );
  }

  sync(blood: readonly BloodState[]): void {
    for (let i = 0; i < this.images.length; i++) {
      const img = this.images[i];
      const b = blood[i];
      if (!img) continue;
      if (!b?.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const remaining = ZOMBIES.bloodFadeTime - b.age;
      const alpha = remaining >= FADE_OUT_SECONDS ? 1 : Math.max(0, remaining / FADE_OUT_SECONDS);
      if (!img.visible || img.x !== b.x || img.y !== b.y) img.setPosition(b.x, b.y).setFrame(b.variant).setVisible(true);
      if (img.alpha !== alpha) img.setAlpha(alpha);
    }
  }
}
