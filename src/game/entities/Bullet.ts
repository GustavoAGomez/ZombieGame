import type Phaser from 'phaser';
import { PLAYER } from '../../config/balance';
import { DISPLAY } from '../../config/display';
import type { BulletState, PlayerState } from '../../core/GameState';
import { lerp } from '../../core/math';
import { ASSET_KEYS, objectTextureKey, type CharacterDef } from '../assets/manifest';
import { DEPTH } from '../depth';
import { muzzleOffset } from './muzzle';

interface Slot {
  image: Phaser.GameObjects.Image;
  active: boolean;
  /** Visual offset from the logical position, fixed at spawn. */
  dx: number;
  dy: number;
}

/**
 * One preallocated image per pooled bullet; mirrors state.bullets. Bullets
 * collide on the ground plane but are drawn along the line that leaves the
 * gun's muzzle (the same line as the aim line), so the offset between the
 * logical spawn point and the drawn muzzle is kept for the whole flight.
 */
export class BulletViewPool {
  private readonly slots: Slot[];
  private readonly offset = { x: 0, y: 0 };

  constructor(
    scene: Phaser.Scene,
    poolSize: number,
    private readonly def: CharacterDef | undefined,
  ) {
    this.slots = Array.from({ length: poolSize }, () => ({
      image: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.bullet)).setDepth(DEPTH.bullets).setVisible(false),
      active: false,
      dx: 0,
      dy: 0,
    }));
  }

  sync(bullets: readonly BulletState[], players: readonly PlayerState[], alpha: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const b = bullets[i];
      if (!slot) continue;
      const img = slot.image;
      if (!b?.active) {
        slot.active = false;
        if (img.visible) img.setVisible(false);
        continue;
      }
      if (!slot.active) this.startBullet(slot, b, players);
      img
        .setVisible(true)
        .setPosition(lerp(b.prevX, b.x, alpha) + slot.dx, lerp(b.prevY, b.y, alpha) + slot.dy)
        .setRotation(Math.atan2(b.dirY, b.dirX));
    }
  }

  private startBullet(slot: Slot, b: BulletState, players: readonly PlayerState[]): void {
    slot.active = true;
    const owner = players.find((p) => p.id === b.owner);
    if (!owner) {
      slot.dx = 0;
      slot.dy = -DISPLAY.shotHeight;
      return;
    }
    // Logical spawn = feet + aim × muzzleDistance; drawn spawn = the art's muzzle.
    muzzleOffset(this.def, owner.facing, this.offset);
    slot.dx = this.offset.x - owner.aimX * PLAYER.muzzleDistance;
    slot.dy = this.offset.y - owner.aimY * PLAYER.muzzleDistance;
  }
}
