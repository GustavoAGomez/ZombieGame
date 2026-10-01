import type Phaser from 'phaser';
import { MELEE, PLAYER } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import { lerp } from '../../core/math';
import { ASSET_KEYS, objectTextureKey, type CharacterDef, type ObjectDef } from '../assets/manifest';
import { DEPTH } from '../depth';

/** How far in front of the player the slash is drawn (px). */
const SLASH_REACH = 10;

/**
 * Provisional knife slash: an arc in front of the player, turned to the
 * slash's direction, for the swing time. Render only. When the player's
 * character gets its own `melee` animation in the manifest, the character
 * plays it and this effect is no longer drawn.
 */
export class MeleeSlash {
  private readonly image: Phaser.GameObjects.Image;
  private readonly frames: number;
  private readonly enabled: boolean;
  private shownFrame = -1;

  constructor(scene: Phaser.Scene, character: CharacterDef | undefined, slash: ObjectDef | undefined) {
    this.frames = Math.max(1, slash?.frames ?? 1);
    this.enabled = character?.animations.melee === undefined;
    this.image = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.meleeSlash), 0).setDepth(DEPTH.bullets + 1).setVisible(false);
  }

  sync(player: PlayerState, alpha: number): void {
    if (!this.enabled || player.meleeTimer <= 0 || player.hp <= 0) {
      if (this.image.visible) this.image.setVisible(false);
      return;
    }
    const progress = 1 - player.meleeTimer / MELEE.swingTime;
    const frame = Math.min(this.frames - 1, Math.floor(progress * this.frames));
    if (frame !== this.shownFrame) {
      this.shownFrame = frame;
      this.image.setFrame(frame);
    }
    const x = lerp(player.prevX, player.x, alpha) + Math.cos(player.meleeAngle) * SLASH_REACH;
    const y = lerp(player.prevY, player.y, alpha) - PLAYER.chestHeight + Math.sin(player.meleeAngle) * SLASH_REACH;
    this.image.setVisible(true).setPosition(Math.round(x), Math.round(y)).setRotation(player.meleeAngle);
  }
}
