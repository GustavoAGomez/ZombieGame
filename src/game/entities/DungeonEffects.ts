import type Phaser from 'phaser';
import { DUNGEON } from '../../config/dungeon';
import { UPGRADE_EFFECTS } from '../../config/upgrades';
import type { GameState } from '../../core/GameState';
import { DEPTH } from '../depth';

/**
 * The dungeon kinds' effects (spec 09 §5.2), as placeholders: the spitters'
 * shots (a green blob with a lighter core) and the exploders' bursts (a red
 * ring that grows and fades). Drawn from the state; nothing of its own.
 */
export class DungeonEffects {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(DEPTH.bullets);
  }

  sync(state: GameState): void {
    const g = this.graphics;
    g.clear();
    for (const s of state.enemyShots) {
      if (!s.active) continue;
      g.fillStyle(0x5a8a2a, 1);
      g.fillCircle(s.x, s.y, DUNGEON.kinds.spitter.shotRadius + 1);
      g.fillStyle(0xb8f060, 1);
      g.fillCircle(s.x - 1, s.y - 1, DUNGEON.kinds.spitter.shotRadius - 2);
    }
    // Paso de sombra's fire (spec 09 §7.2): embers that die down.
    for (const t of state.run?.trails ?? []) {
      const life = Math.max(0, 1 - t.age / UPGRADE_EFFECTS.shadow_dash.trail);
      g.fillStyle(0xff6a1a, 0.35 * life + 0.1);
      g.fillCircle(t.x, t.y, UPGRADE_EFFECTS.shadow_dash.trailRadius * (0.6 + 0.4 * life));
      g.fillStyle(0xffd24a, 0.5 * life);
      g.fillCircle(t.x, t.y - 1, 4 * life + 1);
    }
    for (const e of state.run?.explosions ?? []) {
      const t = Math.min(1, e.age / DUNGEON.explosionFade);
      g.lineStyle(4 * (1 - t) + 1, 0xff7040, 1 - t);
      g.strokeCircle(e.x, e.y, 10 + (e.radius - 10) * t);
      g.fillStyle(0xffc060, 0.5 * (1 - t));
      g.fillCircle(e.x, e.y, e.radius * 0.5 * (1 - t) + 4);
    }
  }
}
