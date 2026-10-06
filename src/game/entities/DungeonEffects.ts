import type Phaser from 'phaser';
import { DUNGEON } from '../../config/dungeon';
import { UPGRADE_EFFECTS } from '../../config/upgrades';
import type { GameState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey, type Manifest } from '../assets/manifest';
import { DEPTH } from '../depth';

/** Bursts on screen at once (chained exploders); more wait for a free one. */
const BURST_POOL = 8;
/** The art's ring at its widest, in px of its frame: a burst of `radius` px is drawn at radius / this. */
const BURST_ART_RADIUS = 60;
/** The glob's wobble, frame by frame. */
const SHOT_FRAME_SECONDS = 0.08;
/** The glob is drawn flying up and to the right. */
const SHOT_ART_ANGLE = -Math.PI / 4;

/**
 * The dungeon kinds' effects (spec 09 §5.2): the spitters' acid globs, turned
 * to where they fly, and the exploders' bursts, played over their fade time
 * at their radius; also the embers of Paso de sombra. Drawn from the state;
 * nothing of its own. Sprites are pooled (CLAUDE.md rule 7).
 */
export class DungeonEffects {
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly shots: Phaser.GameObjects.Sprite[];
  private readonly bursts: Phaser.GameObjects.Sprite[];
  private readonly shotFrames: number;
  private readonly burstFrames: number;

  constructor(scene: Phaser.Scene, manifest: Manifest) {
    this.graphics = scene.add.graphics().setDepth(DEPTH.bullets);
    this.shotFrames = Math.max(1, manifest.objects[ASSET_KEYS.enemyShot]?.frames ?? 1);
    this.burstFrames = Math.max(1, manifest.objects[ASSET_KEYS.enemyBurst]?.frames ?? 1);
    const pool = (key: string, size: number): Phaser.GameObjects.Sprite[] =>
      Array.from({ length: size }, () => scene.add.sprite(0, 0, objectTextureKey(key), 0).setDepth(DEPTH.bullets).setVisible(false));
    this.shots = pool(ASSET_KEYS.enemyShot, DUNGEON.shots.pool);
    this.bursts = pool(ASSET_KEYS.enemyBurst, BURST_POOL);
  }

  sync(state: GameState): void {
    const shotFrame = Math.floor(state.time / SHOT_FRAME_SECONDS) % this.shotFrames;
    this.shots.forEach((sprite, i) => {
      const s = state.enemyShots[i];
      if (!s?.active) {
        if (sprite.visible) sprite.setVisible(false);
        return;
      }
      sprite
        .setVisible(true)
        .setPosition(s.x, s.y)
        .setRotation(Math.atan2(s.vy, s.vx) - SHOT_ART_ANGLE)
        .setFrame(shotFrame);
    });

    const explosions = state.run?.explosions ?? [];
    this.bursts.forEach((sprite, i) => {
      const e = explosions[i];
      if (!e) {
        if (sprite.visible) sprite.setVisible(false);
        return;
      }
      const frame = Math.min(this.burstFrames - 1, Math.floor((e.age / DUNGEON.explosionFade) * this.burstFrames));
      sprite
        .setVisible(true)
        .setPosition(e.x, e.y)
        .setScale(e.radius / BURST_ART_RADIUS)
        .setFrame(frame);
    });

    // Paso de sombra's fire (spec 09 §7.2): embers that die down.
    const g = this.graphics;
    g.clear();
    for (const t of state.run?.trails ?? []) {
      const life = Math.max(0, 1 - t.age / UPGRADE_EFFECTS.shadow_dash.trail);
      g.fillStyle(0xff6a1a, 0.35 * life + 0.1);
      g.fillCircle(t.x, t.y, UPGRADE_EFFECTS.shadow_dash.trailRadius * (0.6 + 0.4 * life));
      g.fillStyle(0xffd24a, 0.5 * life);
      g.fillCircle(t.x, t.y - 1, 4 * life + 1);
    }
  }
}
