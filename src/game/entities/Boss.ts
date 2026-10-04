import type Phaser from 'phaser';
import { BOSS_VARIANTS, BOSSES } from '../../config/bosses';
import type { BossState } from '../../core/GameState';
import { BOSS_POSES, bossTextureKey, objectTextureKey, type BossPose } from '../assets/manifest';
import { actorDepth } from '../depth';

/** Its walk swaps feet this often (s). */
const STEP_TIME = 0.28;
/** The corpse fades out over its last this-many seconds. */
const CORPSE_FADE = 0.5;

/** The pose a boss shows (render only): its walk, still or stepping, and its corpse. */
export function bossPose(b: BossState, time: number): BossPose {
  if (b.phase === 'dead') return 'dead';
  if (!b.moving) return 'walk_a';
  return Math.floor(time / STEP_TIME) % 2 === 0 ? 'walk_a' : 'walk_b';
}

/**
 * The bosses on the map (spec 07 §8): one sprite per boss slot, its pose
 * for what it is doing, tinted by its variant, standing on the bottom edge
 * of its footprint and y-sorted with the characters there; mirrored when
 * it faces west. Hidden in the dark. Render only: it reads the bosses' state.
 */
export class BossViewPool {
  private readonly sprites: Phaser.GameObjects.Sprite[];

  constructor(
    scene: Phaser.Scene,
    count: number,
    private readonly tileSize: number,
  ) {
    this.sprites = Array.from({ length: count }, () =>
      scene.add.sprite(0, 0, objectTextureKey(bossTextureKey('butcher')), 0).setOrigin(0.5, 1).setVisible(false),
    );
  }

  sync(bosses: readonly BossState[], alpha: number, time: number, isDark: (x: number, y: number) => boolean): void {
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const b = bosses[i];
      if (!sprite) continue;
      if (!b?.active) {
        if (sprite.visible) sprite.setVisible(false);
        continue;
      }
      const x = b.prevX + (b.x - b.prevX) * alpha;
      const y = b.prevY + (b.y - b.prevY) * alpha;
      if (isDark(x, y)) {
        if (sprite.visible) sprite.setVisible(false);
        continue;
      }
      const feet = y + (BOSSES[b.boss].footprintTiles * this.tileSize) / 2;
      const key = objectTextureKey(bossTextureKey(b.boss));
      if (sprite.texture.key !== key) sprite.setTexture(key);
      const tint = BOSS_VARIANTS[b.variant].tint;
      if (tint) sprite.setTint(Number.parseInt(tint.slice(1), 16));
      else sprite.clearTint();
      sprite
        .setVisible(true)
        .setFrame(BOSS_POSES.indexOf(bossPose(b, time)))
        .setPosition(Math.round(x), Math.round(feet))
        .setFlipX(Math.cos(b.facing) < -0.2)
        .setAlpha(b.phase === 'dead' ? Math.min(1, b.timer / CORPSE_FADE) : 1)
        .setDepth(actorDepth(feet));
    }
  }
}
