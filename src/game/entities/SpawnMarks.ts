import type Phaser from 'phaser';
import { DUNGEON } from '../../config/dungeon';
import type { RunState } from '../../core/RunState';
import { DEPTH } from '../depth';

/**
 * The warning of a wave (spec 09 §4): a shadow on the floor at each point
 * an enemy is about to appear on, darkening through the warning. Drawn
 * from the fight's state; nothing of its own.
 */
export class SpawnMarks {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(DEPTH.floorProps + 0.5);
  }

  sync(run: RunState | null): void {
    const g = this.graphics;
    g.clear();
    const fight = run?.fight;
    if (!fight || fight.phase !== 'warning') return;
    const progress = 1 - Math.max(0, fight.timer) / DUNGEON.fight.spawnWarning;
    for (const s of fight.spots) {
      g.fillStyle(0x000000, 0.2 + 0.4 * progress);
      g.fillEllipse(s.x, s.y + 4, 22 + 6 * progress, 11 + 3 * progress);
    }
  }
}
