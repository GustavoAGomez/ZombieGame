import type Phaser from 'phaser';
import type { PlayerState } from '../../core/GameState';
import { dir8FromAngle, lerp } from '../../core/math';
import { ASSET_KEYS, animationKey, characterTextureKey, type CharacterDef } from '../assets/manifest';
import { actorDepth } from '../depth';

export type PlayerAnimation = 'idle' | 'walk' | 'shoot' | 'dash' | 'death';

/** Player sprite. Reads PlayerState every frame and holds no game logic. */
export class PlayerView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private playing = '';

  constructor(scene: Phaser.Scene, def: CharacterDef) {
    this.sprite = scene.add
      .sprite(0, 0, characterTextureKey(ASSET_KEYS.player, 'idle'), 0)
      .setOrigin(def.anchor.x, def.anchor.y);
  }

  sync(player: PlayerState, alpha: number, animation: PlayerAnimation): void {
    const x = lerp(player.prevX, player.x, alpha);
    const y = lerp(player.prevY, player.y, alpha);
    this.sprite.setPosition(x, y).setDepth(actorDepth(y));
    const key = animationKey(ASSET_KEYS.player, animation, dir8FromAngle(player.facing));
    if (key !== this.playing) {
      this.playing = key;
      this.sprite.play(key);
    }
  }
}
