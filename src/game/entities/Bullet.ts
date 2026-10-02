import Phaser from 'phaser';
import { COLORS, hexToInt } from '../../config/theme';
import type { BulletLook, BulletState, PlayerState } from '../../core/GameState';

/** Level 3 bullets: lighter than the plain tracer. */
const UPGRADED_BULLET = '#fff4d0';
import { lerp } from '../../core/math';
import { ASSET_KEYS, objectTextureKey, type CharacterDef } from '../assets/manifest';
import { DEPTH } from '../depth';

interface Slot {
  image: Phaser.GameObjects.Image;
  /** How it is drawn now. */
  look: BulletLook;
}

/** Fill tints per look (spec 03 §5–6): none for plain bullets. */
const TINTS: Readonly<Record<BulletLook, number | null>> = {
  normal: null,
  upgraded: hexToInt(UPGRADED_BULLET),
  boosted: hexToInt(COLORS.boostDamage),
  special: hexToInt(COLORS.amber),
  fire: hexToInt(COLORS.fire),
};

/**
 * One preallocated image per pooled bullet; mirrors state.bullets. Each
 * bullet is drawn at its logical position plus the offset the simulation
 * gave it (from the gun's drawn muzzle, along the aim line): the same place
 * where it can hit zombies. Bullets fired with double damage are drawn in
 * light blue (spec 03 §5); from weapon level 3 lighter, and gold with the
 * weapon's special (§6).
 */
export class BulletViewPool {
  private readonly slots: Slot[];

  constructor(scene: Phaser.Scene, poolSize: number, _def?: CharacterDef) {
    this.slots = Array.from({ length: poolSize }, () => ({
      image: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.bullet)).setDepth(DEPTH.bullets).setVisible(false),
      look: 'normal',
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
      if (b.look !== slot.look) {
        slot.look = b.look;
        const tint = TINTS[b.look];
        if (tint !== null) img.setTint(tint).setTintMode(Phaser.TintModes.FILL);
        else img.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
      img
        .setVisible(true)
        .setPosition(lerp(b.prevX, b.x, alpha) + b.drawX, lerp(b.prevY, b.y, alpha) + b.drawY)
        .setRotation(Math.atan2(b.dirY, b.dirX));
    }
  }
}
