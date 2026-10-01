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

type ZombieAnimation = 'walk' | 'attack' | 'climb' | 'death';

interface Slot {
  sprite: Phaser.GameObjects.Sprite;
  anim: string;
  /** actionTick last used to (re)start the attack animation. */
  action: number;
  lastHp: number;
  flashUntil: number;
}

/** One preallocated sprite per pooled zombie. Reads state, holds no logic. */
export class ZombieViewPool {
  private readonly slots: Slot[];

  constructor(scene: Phaser.Scene, private readonly manifest: Manifest, poolSize: number) {
    const def = manifest.characters[ASSET_KEYS.zombieWalker];
    this.slots = Array.from({ length: poolSize }, () => ({
      sprite: scene.add
        .sprite(0, 0, characterTextureKey(ASSET_KEYS.zombieWalker, 'walk'), 0)
        .setOrigin(def?.anchor.x ?? 0.5, def?.anchor.y ?? 0.8)
        .setVisible(false),
      anim: '',
      action: -1,
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
      if (!z?.active) {
        if (sprite.visible) sprite.setVisible(false);
        slot.lastHp = 0;
        slot.anim = '';
        continue;
      }
      const x = lerp(z.prevX, z.x, alpha);
      const y = lerp(z.prevY, z.y, alpha);
      sprite.setVisible(true).setPosition(x, y).setDepth(actorDepth(y));

      const character = CHARACTER_BY_KIND[z.kind];
      const key = animationKey(character, this.animationFor(character, z), dir8FromAngle(z.facing));
      const restartAttack = (z.ai === 'tearing' || z.ai === 'attacking') && z.actionTick !== slot.action;
      if (key !== slot.anim || restartAttack) {
        slot.anim = key;
        slot.action = z.actionTick;
        sprite.play(key);
      }

      if (slot.lastHp > 0 && z.hp < slot.lastHp && z.hp > 0) slot.flashUntil = now + HIT_FLASH_MS;
      slot.lastHp = z.hp;
      const flashing = now < slot.flashUntil;
      if (flashing && sprite.tintMode !== Phaser.TintModes.FILL) {
        sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      } else if (!flashing && sprite.tintMode === Phaser.TintModes.FILL) {
        sprite.clearTint().setTintMode(Phaser.TintModes.MULTIPLY);
      }
    }
  }

  private animationFor(character: string, z: ZombieState): ZombieAnimation {
    switch (z.ai) {
      case 'dead':
        return 'death';
      case 'tearing':
      case 'attacking':
        return 'attack';
      case 'climbing':
      case 'emerging':
        // `climb` is optional in the asset contract; fall back to walking.
        return this.manifest.characters[character]?.animations.climb ? 'climb' : 'walk';
      default:
        return 'walk';
    }
  }
}
