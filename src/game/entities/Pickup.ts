import type Phaser from 'phaser';
import { PICKUPS, type PickupKind } from '../../config/balance';
import { COLORS, hexToInt } from '../../config/theme';
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

/**
 * Keys (spec 09 §6.1) must be seen across a room: they bob higher, glow on
 * the floor in the HUD's colour for them (amber, red the boss's) and a
 * sparkle winks over them at the top of each pulse.
 */
const KEY_GLOW: Partial<Record<PickupKind, number>> = { key: hexToInt(COLORS.amber), boss_key: hexToInt(COLORS.red) };
const KEY_BOB = 2;
/** Seconds per pulse of the glow. */
const GLOW_PERIOD = 1.2;
/** The glow's two ellipses on the floor at rest (px), and how much they grow at the top of a pulse. */
const GLOW_OUTER = { width: 22, height: 9, grow: 6 } as const;
const GLOW_INNER = { width: 12, height: 5, grow: 3 } as const;
/** The sparkle shows over this part of the pulse (0..1), a few px below the key's top. */
const SPARKLE_FROM = 0.8;
const SPARKLE_DROP = 6;

export class PickupViewPool {
  private readonly images: Phaser.GameObjects.Image[];
  private readonly kinds: (PickupKind | null)[];
  /** The keys' glows and sparkles, redrawn each frame (one Graphics for all). */
  private readonly glow: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, poolSize: number) {
    this.glow = scene.add.graphics().setDepth(DEPTH.pickups - 0.01);
    this.images = Array.from({ length: poolSize }, () =>
      scene.add.image(0, 0, TEXTURE.ammo).setOrigin(0.5, 1).setDepth(DEPTH.pickups).setVisible(false),
    );
    this.kinds = this.images.map(() => null);
  }

  sync(pickups: readonly PickupState[], time: number): void {
    const g = this.glow;
    g.clear();
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
      const glow = KEY_GLOW[p.kind];
      const bob = Math.round(Math.sin(time * BOB_SPEED + i) * (glow === undefined ? 1 : KEY_BOB));
      const ground = p.y + GROUND_OFFSET;
      img.setVisible(!blinkOff).setPosition(p.x, ground + bob);
      if (glow === undefined || blinkOff) continue;
      const pulse = (Math.sin((time / GLOW_PERIOD) * Math.PI * 2 + i) + 1) / 2;
      g.fillStyle(glow, 0.18 + 0.17 * pulse);
      g.fillEllipse(p.x, ground - 1, GLOW_OUTER.width + GLOW_OUTER.grow * pulse, GLOW_OUTER.height + GLOW_OUTER.grow * pulse * 0.5);
      g.fillStyle(glow, 0.35 + 0.25 * pulse);
      g.fillEllipse(p.x, ground - 1, GLOW_INNER.width + GLOW_INNER.grow * pulse, GLOW_INNER.height + GLOW_INNER.grow * pulse * 0.5);
      if (pulse > SPARKLE_FROM) {
        // A small white four-point star over the key's bow.
        const top = ground + bob - img.height + SPARKLE_DROP;
        g.fillStyle(0xffffff, (pulse - SPARKLE_FROM) / (1 - SPARKLE_FROM));
        g.fillRect(p.x + 3, top - 2, 1, 5);
        g.fillRect(p.x + 1, top, 5, 1);
      }
    }
  }
}
