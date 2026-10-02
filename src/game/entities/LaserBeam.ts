import type Phaser from 'phaser';
import type { PlayerState } from '../../core/GameState';
import { lerp } from '../../core/math';
import type { CharacterDef } from '../assets/manifest';
import { DEPTH } from '../depth';
import { muzzleOffset } from './muzzle';

/** Light red ray with a white core, and the flash where it ends (spec 06 §2.1). Placeholder. */
const RAY_COLOR = 0xff6b5e;
const CORE_COLOR = 0xffffff;
const FLASH_RADIUS = 3;

/**
 * The laser's beam while it fires: a 2 px line from the gun's muzzle along
 * the aim, as long as the simulation measured it (to a wall or its range),
 * and a flash at its end that flickers every frame. Render only; one
 * Graphics object, redrawn only while the beam is on.
 */
export class LaserBeam {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly offset = { x: 0, y: 0 };
  private drawn = false;
  private flicker = false;

  constructor(
    scene: Phaser.Scene,
    private readonly def: CharacterDef | undefined,
  ) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.bullets);
  }

  sync(player: PlayerState, alpha: number): void {
    if (!player.beamOn || player.hp <= 0) {
      if (this.drawn) this.gfx.clear();
      this.drawn = false;
      return;
    }
    muzzleOffset(this.def, player.facing, this.offset);
    const x0 = lerp(player.prevX, player.x, alpha) + this.offset.x;
    const y0 = lerp(player.prevY, player.y, alpha) + this.offset.y;
    const x1 = x0 + player.aimX * player.beamLength;
    const y1 = y0 + player.aimY * player.beamLength;
    this.flicker = !this.flicker;
    const g = this.gfx;
    g.clear();
    g.lineStyle(2, RAY_COLOR, 1).lineBetween(x0, y0, x1, y1);
    g.lineStyle(1, CORE_COLOR, 1).lineBetween(x0, y0, x1, y1);
    g.fillStyle(this.flicker ? CORE_COLOR : RAY_COLOR, 1).fillCircle(x1, y1, this.flicker ? FLASH_RADIUS : FLASH_RADIUS - 1);
    this.drawn = true;
  }
}
