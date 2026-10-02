import Phaser from 'phaser';
import { ZOMBIES, type ZombieKind } from '../../config/balance';
import { COLORS, hexToInt } from '../../config/theme';
import type { ZombieState } from '../../core/GameState';
import { dir8FromAngle, lerp } from '../../core/math';
import { ASSET_KEYS, animationKey, characterTextureKey, isAnimationPlaceholder, type Manifest } from '../assets/manifest';
import { actorDepth, overFogDepth } from '../depth';
import { isLegless, isStrike, letsStrikeFinish, swingId, zombiePose, type ZombieArt, type ZombieAnimation, type ZombiePose } from './zombieAnimation';

const CHARACTER_BY_KIND: Record<ZombieKind, string> = {
  walker: ASSET_KEYS.zombieWalker,
  runner: ASSET_KEYS.zombieRunner,
  sprinter: ASSET_KEYS.zombieSprinter,
};

/** Multiplied over the shared art so each kind reads at a glance (white = untouched). */
const KIND_TINT: Record<ZombieKind, number> = {
  walker: 0xffffff,
  runner: hexToInt(COLORS.zombieRunnerTint),
  sprinter: hexToInt(COLORS.zombieSprinterTint),
};

/** A burning zombie's tint (spec 04 §1), flickering between two oranges this often. */
const BURN_TINT = hexToInt(COLORS.fire);
const BURN_TINT_LIGHT = hexToInt('#ff9a3a');
const BURN_FLICKER_MS = 90;

const HIT_FLASH_MS = 80;
/** How long a zombie takes to appear or vanish at the edge of the darkness. */
const DARK_FADE_MS = 150;

interface Slot {
  sprite: Phaser.GameObjects.Sprite;
  /** Animation key playing (character, animation and direction). */
  anim: string;
  /** Animation name playing, to tell a turn from a change of animation. */
  animation: ZombieAnimation | '';
  /** swingId of the last strike started. */
  swing: number;
  /** That strike was at a window's planks (it never finishes while walking away). */
  swingAtPlanks: boolean;
  lastHp: number;
  flashUntil: number;
  /** Tearing planks or climbing in (the death animation keeps what it had). */
  atWindow: boolean;
  /** 0..1, fading in and out at the edge of the darkness. */
  visibility: number;
  /** Kind tint applied (-1 none yet), so it is set again only when it changes. */
  tint: number;
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
  private readonly art: Record<string, ZombieArt>;
  private lastNow = 0;

  constructor(scene: Phaser.Scene, manifest: Manifest, poolSize: number) {
    const def = manifest.characters[ASSET_KEYS.zombieWalker];
    this.art = Object.fromEntries(
      Object.values(CHARACTER_BY_KIND).map((key) => {
        const c = manifest.characters[key];
        const real = (anim: string): boolean => c !== undefined && c.animations[anim] !== undefined && !isAnimationPlaceholder(c, anim);
        return [key, { climb: real('climb'), crawl: real('crawl'), crawlAttack: real('crawl_attack'), death: real('death') }];
      }),
    );
    this.slots = Array.from({ length: poolSize }, () => ({
      sprite: scene.add
        .sprite(0, 0, characterTextureKey(ASSET_KEYS.zombieWalker, 'walk'), 0)
        .setOrigin(def?.anchor.x ?? 0.5, def?.anchor.y ?? 0.8)
        .setVisible(false)
        .setAlpha(0),
      anim: '',
      animation: '',
      swing: -1,
      swingAtPlanks: false,
      lastHp: 0,
      flashUntil: 0,
      atWindow: false,
      visibility: 0,
      tint: -1,
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
        slot.animation = '';
        slot.swing = -1;
        slot.swingAtPlanks = false;
        slot.atWindow = false;
        slot.visibility = 0;
        continue;
      }
      const x = lerp(z.prevX, z.x, alpha);
      const y = lerp(z.prevY, z.y, alpha);
      if (z.ai !== 'dead') slot.atWindow = z.ai === 'tearing' || z.ai === 'climbing';
      const dark = isDark(x, y);
      slot.visibility = Phaser.Math.Clamp(slot.visibility + (slot.atWindow || !dark ? fade : -fade), 0, 1);
      if (slot.visibility === 0) {
        if (sprite.visible) sprite.setVisible(false).setAlpha(0);
        continue;
      }

      const character = CHARACTER_BY_KIND[z.kind];
      const art = this.art[character] ?? NO_ART;
      const pose = zombiePose(z, art);
      // Without death art the body drops and fades out over the corpse time.
      const corpseFade = pose.corpse ? Phaser.Math.Clamp(z.timer / ZOMBIES.corpseTime, 0, 1) : 1;
      sprite
        .setVisible(true)
        .setAlpha(slot.visibility * corpseFade)
        .setPosition(x, y)
        .setDepth(slot.atWindow && dark ? overFogDepth(y) : actorDepth(y));

      this.animate(slot, character, z, pose);
      // Crawling without crawl art: the walk slows down with the zombie, so its feet do not slide.
      const slowWalk = isLegless(z) && !art.crawl && (z.ai === 'chasing' || z.ai === 'toWindow');
      const timeScale = slowWalk ? ZOMBIES.crawlSpeedFactor : 1;
      if (sprite.anims.timeScale !== timeScale) sprite.anims.timeScale = timeScale;

      if (slot.lastHp > 0 && z.hp < slot.lastHp && z.hp > 0) slot.flashUntil = now + HIT_FLASH_MS;
      slot.lastHp = z.hp;
      // A hit flashes white; a burning zombie flickers orange; otherwise the kind's tint
      // (a pooled sprite may change kind).
      const flashing = now < slot.flashUntil;
      const burning = z.burn.timer > 0 && z.hp > 0;
      const tint = burning ? (Math.floor(now / BURN_FLICKER_MS) % 2 === 0 ? BURN_TINT : BURN_TINT_LIGHT) : KIND_TINT[z.kind];
      if (flashing && sprite.tintMode !== Phaser.TintModes.FILL) {
        sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        slot.tint = -1;
      } else if (!flashing && slot.tint !== tint) {
        sprite.setTint(tint).setTintMode(Phaser.TintModes.MULTIPLY);
        slot.tint = tint;
      }
    }
  }

  /** Zombie `index` is on screen (not hidden in the dark): its fire's flames show too. */
  isShown(index: number): boolean {
    const slot = this.slots[index];
    return slot !== undefined && slot.sprite.visible && slot.visibility > 0;
  }

  private animate(slot: Slot, character: string, z: ZombieState, pose: ZombiePose): void {
    const { sprite } = slot;
    const anims = sprite.anims;
    const swing = swingId(z);
    const newSwing = swing !== null && swing !== slot.swing && isStrike(pose.animation);
    if (newSwing) {
      slot.swing = swing;
      slot.swingAtPlanks = z.ai === 'tearing';
    }
    // A strike at a player plays to the end even if the zombie walks on right after landing it.
    const finishingStrike = isStrike(slot.animation) && anims.isPlaying && letsStrikeFinish(z, slot.swingAtPlanks);
    const animation = finishingStrike && !newSwing && slot.animation !== '' ? slot.animation : pose.animation;
    const key = animationKey(character, animation, dir8FromAngle(z.facing));
    if (key !== slot.anim || newSwing) {
      // Turning keeps the step of the animation instead of restarting it, and so does a
      // strike that switches between standing and on the ground (legs shot off mid-swing).
      const same = animation === slot.animation || (isStrike(animation) && isStrike(slot.animation));
      const progress = same && !newSwing ? anims.getProgress() : 0;
      const wasPlaying = anims.isPlaying;
      slot.anim = key;
      slot.animation = animation;
      sprite.play(key);
      if (progress > 0) anims.setProgress(progress);
      // A strike that is not swinging holds its pose (tearing, until the next plank).
      if (isStrike(animation) && !newSwing && !(same && wasPlaying)) anims.stop();
    }
    if (pose.corpse && anims.isPlaying) {
      anims.setProgress(0);
      anims.stop();
    }
  }
}

const NO_ART: ZombieArt = { climb: false, crawl: false, crawlAttack: false, death: false };
