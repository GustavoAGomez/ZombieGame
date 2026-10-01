import Phaser from 'phaser';
import type { PlayerState } from '../../core/GameState';
import { COLORS, hexToInt } from '../../config/theme';
import { actorDepth } from '../depth';

/** Afterimages behind the player and how faint each one is, newest first. */
const GHOST_ALPHAS = [0.24, 0.16, 0.1, 0.05];
/** Time between two afterimages (ms). */
const SAMPLE_MS = 45;
/** An afterimage closer than this to the player is hidden (standing still). */
const MIN_GAP = 3;

interface Sample {
  x: number;
  y: number;
  texture: string;
  frame: string | number;
}

/**
 * Faint trail of the speed boost (spec 03 §5): amber silhouettes of the
 * player's recent frames where it just was. Render only.
 */
export class SpeedTrail {
  private readonly ghosts: Phaser.GameObjects.Image[];
  private readonly history: Sample[] = [];
  private lastSample = -Infinity;

  constructor(
    scene: Phaser.Scene,
    private readonly source: Phaser.GameObjects.Sprite,
  ) {
    const tint = hexToInt(COLORS.amber);
    this.ghosts = GHOST_ALPHAS.map((alpha) =>
      scene.add
        .image(0, 0, source.texture.key, source.frame.name)
        .setOrigin(source.originX, source.originY)
        .setTint(tint)
        .setTintMode(Phaser.TintModes.FILL)
        .setAlpha(alpha)
        .setVisible(false),
    );
  }

  sync(player: PlayerState, now: number): void {
    if (player.boostActive !== 'speed' || player.hp <= 0) {
      if (this.history.length > 0) {
        this.history.length = 0;
        for (const g of this.ghosts) g.setVisible(false);
      }
      return;
    }
    if (now - this.lastSample >= SAMPLE_MS) {
      this.lastSample = now;
      this.history.unshift({ x: this.source.x, y: this.source.y, texture: this.source.texture.key, frame: this.source.frame.name });
      if (this.history.length > this.ghosts.length) this.history.length = this.ghosts.length;
    }
    for (let i = 0; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i];
      const s = this.history[i];
      if (!ghost) continue;
      if (!s || Math.hypot(s.x - this.source.x, s.y - this.source.y) < MIN_GAP) {
        ghost.setVisible(false);
        continue;
      }
      ghost
        .setVisible(true)
        .setTexture(s.texture, s.frame)
        .setPosition(s.x, s.y)
        .setDepth(actorDepth(s.y) - 0.0001);
    }
  }
}
