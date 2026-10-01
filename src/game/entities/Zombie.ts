import Phaser from 'phaser';
import { ZOMBIES, type ZombieKind } from '../../config/balance';
import type { ZombieState } from '../../core/GameState';
import { dir8FromAngle, lerp } from '../../core/math';
import { ASSET_KEYS, animationKey, characterTextureKey, type Manifest } from '../assets/manifest';
import { actorDepth, overFogDepth } from '../depth';

const CHARACTER_BY_KIND: Record<ZombieKind, string> = {
  walker: ASSET_KEYS.zombieWalker,
  runner: ASSET_KEYS.zombieRunner,
  sprinter: ASSET_KEYS.zombieSprinter,
};

const HIT_FLASH_MS = 80;
/** How long a zombie takes to appear or vanish at the edge of the darkness. */
const DARK_FADE_MS = 150;

type ZombieAnimation = 'walk' | 'attack' | 'climb' | 'death';

interface Slot {
  sprite: Phaser.GameObjects.Sprite;
  anim: string;
  /** actionTick last used to (re)start the attack animation. */
  action: number;
  lastHp: number;
  flashUntil: number;
  /** Tearing planks or climbing in (the death animation keeps what it had). */
  atWindow: boolean;
}

/**
 * One preallocated sprite per pooled zombie. Reads state, holds no logic.
 * A zombie in the dark (a zone not unlocked yet) is not drawn, except while
 * it is at a window, tearing planks or climbing in: then it is drawn over
 * the darkness, because the player has to see what is breaking the
 * barricade.
 */
export class ZombieViewPool {
  private readonly slots: Slot[];
  private lastNow = 0;

  constructor(scene: Phaser.Scene, private readonly manifest: Manifest, poolSize: number) {
    const def = manifest.characters[ASSET_KEYS.zombieWalker];
    this.slots = Array.from({ length: poolSize }, () => ({
      sprite: scene.add
        .sprite(0, 0, characterTextureKey(ASSET_KEYS.zombieWalker, 'walk'), 0)
        .setOrigin(def?.anchor.x ?? 0.5, def?.anchor.y ?? 0.8)
        .setVisible(false)
        .setAlpha(0),
      anim: '',
      action: -1,
      lastHp: 0,
      flashUntil: 0,
      atWindow: false,
    }));
  }

  sync(zombies: readonly ZombieState[], alpha: number, now: number, isDark: (x: number, y: number) => boolean): void {
    const fade = Math.max(0, now - this.lastNow) / DARK_FADE_MS;
    this.lastNow = now;
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const z = zombies[i];
      if (!slot) continue;
      const { sprite } = slot;
      if (!z?.active) {
        if (sprite.visible) sprite.setVisible(false).setAlpha(0);
        slot.lastHp = 0;
        slot.anim = '';
        slot.atWindow = false;
        continue;
      }
      const x = lerp(z.prevX, z.x, alpha);
      const y = lerp(z.prevY, z.y, alpha);
      if (z.ai !== 'dead') slot.atWindow = z.ai === 'tearing' || z.ai === 'climbing';
      const dark = isDark(x, y);
      const opacity = Phaser.Math.Clamp(sprite.alpha + (slot.atWindow || !dark ? fade : -fade), 0, 1);
      if (opacity === 0) {
        if (sprite.visible) sprite.setVisible(false).setAlpha(0);
        continue;
      }
      sprite
        .setVisible(true)
        .setAlpha(opacity)
        .setPosition(x, y)
        .setDepth(slot.atWindow && dark ? overFogDepth(y) : actorDepth(y));

      const character = CHARACTER_BY_KIND[z.kind];
      const key = animationKey(character, this.animationFor(character, z), dir8FromAngle(z.facing));
      const restartAttack = (z.ai === 'tearing' || z.ai === 'attacking') && z.actionTick !== slot.action;
      if (key !== slot.anim || restartAttack) {
        slot.anim = key;
        slot.action = z.actionTick;
        sprite.play(key);
      }
      // A crawling zombie (little HP left) walks slower, and so does its animation, so its feet do not slide.
      const crawling = z.hp > 0 && z.hp <= ZOMBIES.crawlAtHp && (z.ai === 'chasing' || z.ai === 'toWindow');
      const timeScale = crawling ? ZOMBIES.crawlSpeedFactor : 1;
      if (sprite.anims.timeScale !== timeScale) sprite.anims.timeScale = timeScale;

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
