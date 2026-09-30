import type Phaser from 'phaser';
import type { PlayerState } from '../../core/GameState';
import { lerp } from '../../core/math';
import { ASSET_KEYS, objectTextureKey, type CharacterDef } from '../assets/manifest';
import { DEPTH } from '../depth';
import { muzzleOffset } from './muzzle';

/** Simulation ticks a flash stays on screen after each bullet (3 at 60 Hz = 50 ms). */
const FLASH_TICKS = 3;

/**
 * Muzzle flash drawn at the gun's muzzle every time a bullet is fired
 * (the character art has no flash on purpose). Render only.
 */
export class MuzzleFlash {
  private readonly image: Phaser.GameObjects.Image;
  private readonly offset = { x: 0, y: 0 };
  private shownFrame = -1;

  constructor(
    scene: Phaser.Scene,
    private readonly def: CharacterDef | undefined,
  ) {
    this.image = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.muzzleFlash), 0).setDepth(DEPTH.bullets + 1).setVisible(false);
  }

  /** `tick` is the current simulation tick: the flash follows the sim clock, not the render clock. */
  sync(player: PlayerState, alpha: number, tick: number): void {
    const age = tick - player.lastShotTick;
    const visible = age >= 1 && age <= FLASH_TICKS && player.hp > 0;
    if (!visible) {
      if (this.image.visible) this.image.setVisible(false);
      return;
    }
    // Alternate the two flash shapes shot after shot.
    const frame = player.lastShotTick % 2;
    if (frame !== this.shownFrame) {
      this.shownFrame = frame;
      this.image.setFrame(frame);
    }
    muzzleOffset(this.def, player.facing, this.offset);
    const x = lerp(player.prevX, player.x, alpha) + this.offset.x;
    const y = lerp(player.prevY, player.y, alpha) + this.offset.y;
    this.image.setVisible(true).setPosition(Math.round(x), Math.round(y));
  }
}
