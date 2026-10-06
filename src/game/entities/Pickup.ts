import type Phaser from 'phaser';
import { PICKUPS, type PickupKind } from '../../config/balance';
import type { PickupState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey } from '../assets/manifest';
import { DEPTH } from '../depth';

const TEXTURE: Record<PickupKind, string> = {
  ammo: objectTextureKey(ASSET_KEYS.pickupAmmo),
  health: objectTextureKey(ASSET_KEYS.pickupHealth),
  key: objectTextureKey(ASSET_KEYS.pickupKey),
  boss_key: objectTextureKey(ASSET_KEYS.pickupBossKey),
};

/** Visual only: a 1 px bob so pickups catch the eye, and blinking before they vanish. */
const BOB_SPEED = 4;
const BLINK_PERIOD = 0.15;
/** Pickups rest on the floor: their bottom edge sits a little below the drop point. */
const GROUND_OFFSET = 4;

export class PickupViewPool {
  private readonly images: Phaser.GameObjects.Image[];
  private readonly kinds: (PickupKind | null)[];

  constructor(scene: Phaser.Scene, poolSize: number) {
    this.images = Array.from({ length: poolSize }, () =>
      scene.add.image(0, 0, TEXTURE.ammo).setOrigin(0.5, 1).setDepth(DEPTH.pickups).setVisible(false),
    );
    this.kinds = this.images.map(() => null);
  }

  sync(pickups: readonly PickupState[], time: number): void {
    for (let i = 0; i < this.images.length; i++) {
      const img = this.images[i];
      const p = pickups[i];
      if (!img) continue;
      if (!p?.active) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      if (this.kinds[i] !== p.kind) {
        this.kinds[i] = p.kind;
        img.setTexture(TEXTURE[p.kind]);
      }
      const remaining = PICKUPS.lifetime - p.age;
      const blinkOff = remaining < PICKUPS.blinkTime && Math.floor(p.age / BLINK_PERIOD) % 2 === 1;
      const bob = Math.round(Math.sin(time * BOB_SPEED + i) * 1);
      img.setVisible(!blinkOff).setPosition(p.x, p.y + GROUND_OFFSET + bob);
    }
  }
}
