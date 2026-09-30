import type Phaser from 'phaser';
import type { PlayerState } from '../../core/GameState';
import { dir8FromAngle, lerp } from '../../core/math';
import { ASSET_KEYS, animationKey, characterTextureKey, type CharacterDef } from '../assets/manifest';
import { actorDepth } from '../depth';

export type PlayerAnimation = 'idle' | 'walk' | 'shoot' | 'shoot_walk' | 'dash' | 'death';

/** Slowest pace of the movement animations, as a fraction of their frame rate. */
const MIN_MOVE_TIME_SCALE = 0.5;

/** Player sprite. Reads PlayerState every frame and holds no game logic. */
export class PlayerView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private playingKey = '';
  private playingAnimation: PlayerAnimation | '' = '';
  private reversed = false;
  private readonly hasShootWalk: boolean;

  constructor(scene: Phaser.Scene, def: CharacterDef) {
    this.sprite = scene.add
      .sprite(0, 0, characterTextureKey(ASSET_KEYS.player, 'idle'), 0)
      .setOrigin(def.anchor.x, def.anchor.y);
    this.hasShootWalk = def.animations.shoot_walk !== undefined;
  }

  sync(player: PlayerState, alpha: number): void {
    const x = lerp(player.prevX, player.x, alpha);
    const y = lerp(player.prevY, player.y, alpha);
    this.sprite.setPosition(x, y).setDepth(actorDepth(y));

    const animation = pickAnimation(player, this.hasShootWalk);
    // Retreating while shooting plays the walk cycle backwards.
    const reversed = animation === 'shoot_walk' && isMovingBackwards(player);
    const key = animationKey(ASSET_KEYS.player, animation, dir8FromAngle(player.facing));
    const anims = this.sprite.anims;

    if (key !== this.playingKey) {
      // Turning keeps the step of the cycle instead of restarting it.
      const progress = animation === this.playingAnimation ? anims.getProgress() : 0;
      this.playingKey = key;
      this.playingAnimation = animation;
      this.reversed = reversed;
      if (reversed) this.sprite.playReverse(key);
      else this.sprite.play(key);
      if (progress > 0) anims.setProgress(progress);
    } else if (reversed !== this.reversed) {
      this.reversed = reversed;
      anims.reverse();
    }

    // Movement cycles follow the analog speed so a slow step does not look like sliding.
    const moving = animation === 'walk' || animation === 'shoot_walk';
    const timeScale = moving ? Math.max(MIN_MOVE_TIME_SCALE, player.moveFactor) : 1;
    if (anims.timeScale !== timeScale) anims.timeScale = timeScale;
  }
}

export function pickAnimation(p: PlayerState, hasShootWalk = true): PlayerAnimation {
  if (p.hp <= 0) return 'death';
  if (p.dashTimer > 0) return 'dash';
  if (p.moving && p.firing) return hasShootWalk ? 'shoot_walk' : 'walk';
  if (p.moving) return 'walk';
  if (p.firing) return 'shoot';
  return 'idle';
}

/** True when the last move goes against the facing (the aim while shooting). */
export function isMovingBackwards(p: PlayerState): boolean {
  return p.moveX * Math.cos(p.facing) + p.moveY * Math.sin(p.facing) < 0;
}
