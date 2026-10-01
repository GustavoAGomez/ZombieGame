import type Phaser from 'phaser';
import type { BulletState, PlayerState } from '../../core/GameState';
import { lerp } from '../../core/math';
import { ASSET_KEYS, objectTextureKey, type CharacterDef } from '../assets/manifest';
import { DEPTH } from '../depth';

interface Slot {
  image: Phaser.GameObjects.Image;
}

/**
 * One preallocated image per pooled bullet; mirrors state.bullets. Each
 * bullet is drawn at its logical position plus the offset the simulation
 * gave it (from the gun's drawn muzzle, along the aim line): the same place
 * where it can hit zombies.
 */
export class BulletViewPool {
  private readonly slots: Slot[];

  constructor(scene: Phaser.Scene, poolSize: number, _def?: CharacterDef) {
    this.slots = Array.from({ length: poolSize }, () => ({
      image: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.bullet)).setDepth(DEPTH.bullets).setVisible(false),
    }));
  }

  sync(bullets: readonly BulletState[], _players: readonly PlayerState[], alpha: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const b = bullets[i];
      if (!slot) continue;
      const img = slot.image;
      if (!b?.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      img
        .setVisible(true)
        .setPosition(lerp(b.prevX, b.x, alpha) + b.drawX, lerp(b.prevY, b.y, alpha) + b.drawY)
        .setRotation(Math.atan2(b.dirY, b.dirX));
    }
  }
}
