import type Phaser from 'phaser';
import type { PlayerState } from '../../core/GameState';
import { dir8FromAngle, lerp } from '../../core/math';
import { ASSET_KEYS, animationKey, characterTextureKey, type CharacterDef } from '../assets/manifest';
import { actorDepth } from '../depth';

export type PlayerAnimation = 'idle' | 'walk' | 'shoot' | 'dash' | 'death';

/** Slowest pace of the run animation, as a fraction of its frame rate. */
const MIN_RUN_TIME_SCALE = 0.5;
const RUN_PREFIX = `${ASSET_KEYS.player}:walk:`;

/** Player sprite. Reads PlayerState every frame and holds no game logic. */
export class PlayerView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private playing = '';

  constructor(scene: Phaser.Scene, def: CharacterDef) {
    this.sprite = scene.add
      .sprite(0, 0, characterTextureKey(ASSET_KEYS.player, 'idle'), 0)
      .setOrigin(def.anchor.x, def.anchor.y);
  }

  sync(player: PlayerState, alpha: number): void {
    const x = lerp(player.prevX, player.x, alpha);
    const y = lerp(player.prevY, player.y, alpha);
    this.sprite.setPosition(x, y).setDepth(actorDepth(y));
    const animation = pickAnimation(player);
    const key = animationKey(ASSET_KEYS.player, animation, dir8FromAngle(player.facing));
    if (key !== this.playing) {
      // Turning while running keeps the stride instead of restarting the cycle.
      const progress = this.playing.startsWith(RUN_PREFIX) && animation === 'walk' ? this.sprite.anims.getProgress() : 0;
      this.playing = key;
      this.sprite.play(key);
      if (progress > 0) this.sprite.anims.setProgress(progress);
    }
    // The run cycle follows the analog speed so a slow jog does not look like sliding.
    const timeScale = animation === 'walk' ? Math.max(MIN_RUN_TIME_SCALE, player.moveFactor) : 1;
    if (this.sprite.anims.timeScale !== timeScale) this.sprite.anims.timeScale = timeScale;
  }
}

export function pickAnimation(p: PlayerState): PlayerAnimation {
  if (p.hp <= 0) return 'death';
  if (p.dashTimer > 0) return 'dash';
  if (p.moving) return 'walk';
  if (p.firing) return 'shoot';
  return 'idle';
}
