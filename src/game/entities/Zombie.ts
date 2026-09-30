import Phaser from 'phaser';
import type { ZombieKind } from '../../config/balance';
import type { ZombieState } from '../../core/GameState';
import { dir8FromAngle, lerp } from '../../core/math';
import { ASSET_KEYS, animationKey, characterTextureKey, type Manifest } from '../assets/manifest';
import { actorDepth } from '../depth';

const CHARACTER_BY_KIND: Record<ZombieKind, string> = {
  walker: ASSET_KEYS.zombieWalker,
  runner: ASSET_KEYS.zombieRunner,
  sprinter: ASSET_KEYS.zombieSprinter,
};

const HIT_FLASH_MS = 80;

interface Slot {
  sprite: Phaser.GameObjects.Sprite;
  anim: string;
  lastHp: number;
  flashUntil: number;
}

/** One preallocated sprite per pooled zombie. Reads state, holds no logic. */
export class ZombieViewPool {
  private readonly slots: Slot[];

  constructor(scene: Phaser.Scene, manifest: Manifest, poolSize: number) {
    const def = manifest.characters[ASSET_KEYS.zombieWalker];
    this.slots = Array.from({ length: poolSize }, () => ({
      sprite: scene.add
        .sprite(0, 0, characterTextureKey(ASSET_KEYS.zombieWalker, 'walk'), 0)
        .setOrigin(def?.anchor.x ?? 0.5, def?.anchor.y ?? 0.8)
        .setVisible(false),
      anim: '',
      lastHp: 0,
      flashUntil: 0,
    }));
  }

  sync(zombies: readonly ZombieState[], alpha: number, now: number): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const z = zombies[i];
      if (!slot) continue;
      const { sprite } = slot;
      if (!z?.active || z.hp <= 0) {
        if (sprite.visible) sprite.setVisible(false);
        slot.lastHp = 0;
        continue;
      }
      const x = lerp(z.prevX, z.x, alpha);
      const y = lerp(z.prevY, z.y, alpha);
      sprite.setVisible(true).setPosition(x, y).setDepth(actorDepth(y));

      const key = animationKey(CHARACTER_BY_KIND[z.kind], 'walk', dir8FromAngle(z.facing));
      if (key !== slot.anim) {
        slot.anim = key;
        sprite.play(key);
      }

      if (slot.lastHp > 0 && z.hp < slot.lastHp) slot.flashUntil = now + HIT_FLASH_MS;
      slot.lastHp = z.hp;
      const flashing = now < slot.flashUntil;
      if (flashing && sprite.tintMode !== Phaser.TintModes.FILL) {
        sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      } else if (!flashing && sprite.tintMode === Phaser.TintModes.FILL) {
        sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
    }
  }
}
