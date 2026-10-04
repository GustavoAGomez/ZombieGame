import type Phaser from 'phaser';
import { MELEE, PLAYER } from '../../config/balance';
import type { PlayerState } from '../../core/GameState';
import { lerp } from '../../core/math';
import { ASSET_KEYS, objectTextureKey, type ObjectDef } from '../assets/manifest';
import { DEPTH } from '../depth';

/**
 * How far in front of the player each slash starts (px): its art is drawn
 * pointing right around its frame's left middle, so its arc reaches about
 * this plus its frame's width (the knife ~30 px, the katana ~100 px, near
 * their reach).
 */
const KNIFE_OFFSET = 2;
const KATANA_OFFSET = 12;
/** Over the last part of the swing the slash also fades out (the katana's frames only dim). */
const FADE_FROM = 0.6;

/**
 * The slash of a cut (petición del usuario, art from PixelLab): the knife's
 * small swipe, or the katana's wide one for a sweep (a reach longer than the
 * knife's). It shows at once in front of the player, turned to the cut's
 * direction, and dissipates over the swing time: its frames, and a fade over
 * the last part. Render only.
 */
export class MeleeSlash {
  private readonly knife: Phaser.GameObjects.Image;
  private readonly katana: Phaser.GameObjects.Image;
  private readonly frames: { knife: number; katana: number };

  constructor(scene: Phaser.Scene, knife: ObjectDef | undefined, katana: ObjectDef | undefined) {
    this.frames = { knife: Math.max(1, knife?.frames ?? 1), katana: Math.max(1, katana?.frames ?? 1) };
    const image = (key: string): Phaser.GameObjects.Image =>
      scene.add.image(0, 0, objectTextureKey(key), 0).setOrigin(0, 0.5).setDepth(DEPTH.bullets + 1).setVisible(false);
    this.knife = image(ASSET_KEYS.meleeSlash);
    this.katana = image(ASSET_KEYS.katanaSlash);
  }

  sync(player: PlayerState, alpha: number): void {
    const cutting = player.meleeTimer > 0 && player.hp > 0;
    const sweep = player.meleeRange > MELEE.range;
    const shown = sweep ? this.katana : this.knife;
    const hidden = sweep ? this.knife : this.katana;
    if (hidden.visible) hidden.setVisible(false);
    if (!cutting) {
      if (shown.visible) shown.setVisible(false);
      return;
    }
    const frames = sweep ? this.frames.katana : this.frames.knife;
    const progress = 1 - player.meleeTimer / MELEE.swingTime;
    const frame = Math.min(frames - 1, Math.floor(progress * frames));
    const offset = sweep ? KATANA_OFFSET : KNIFE_OFFSET;
    const x = lerp(player.prevX, player.x, alpha) + Math.cos(player.meleeAngle) * offset;
    const y = lerp(player.prevY, player.y, alpha) - PLAYER.chestHeight + Math.sin(player.meleeAngle) * offset;
    const alphaLeft = progress < FADE_FROM ? 1 : Math.max(0, (1 - progress) / (1 - FADE_FROM));
    shown.setVisible(true).setFrame(frame).setPosition(Math.round(x), Math.round(y)).setRotation(player.meleeAngle).setAlpha(alphaLeft);
  }
}
