import type Phaser from 'phaser';
import { COLORS } from '../../config/theme';
import type { ChestState, RunState } from '../../core/RunState';
import { DEPTH } from '../depth';

/**
 * The dungeon's own things on the floor (spec 09 §4, §6), drawn as
 * placeholders until they have art (docs/ASSETS-TODO.md): the chests (a
 * wooden box; golden lock on a locked one; a glass case for the treasure's
 * weapon; the lid open once opened) and the trapdoor the boss leaves.
 * Drawn from the run's state; nothing of its own.
 */
export class DungeonViews {
  private readonly graphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.graphics = scene.add.graphics().setDepth(DEPTH.mapObjects + 0.5);
  }

  sync(run: RunState | null): void {
    const g = this.graphics;
    g.clear();
    if (!run) return;
    if (run.altar) this.drawAltar(run.altar.x, run.altar.y, run.pact?.accepted === true);
    for (const chest of run.chests) this.drawChest(chest);
    if (run.trapdoor) {
      const { x, y } = run.trapdoor;
      g.fillStyle(hex(COLORS.ink), 1);
      g.fillRect(x - 14, y - 14, 28, 28);
      g.lineStyle(2, hex(COLORS.wood), 1);
      g.strokeRect(x - 14, y - 14, 28, 28);
      g.lineStyle(1, hex(COLORS.dim), 1);
      g.lineBetween(x - 10, y, x + 10, y);
      g.lineBetween(x, y - 10, x, y + 10);
    }
  }

  /** The altar of the pact (spec 09 §9): a ring of red candles on a dark circle, put out once the pact is sealed. */
  private drawAltar(x: number, y: number, sealed: boolean): void {
    const g = this.graphics;
    g.fillStyle(hex(COLORS.ink), 0.7);
    g.fillEllipse(x, y + 2, 30, 18);
    g.lineStyle(1, hex(sealed ? COLORS.dim : COLORS.redDark), 1);
    g.strokeEllipse(x, y + 2, 30, 18);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const cx = x + Math.cos(a) * 11;
      const cy = y + 2 + Math.sin(a) * 6;
      g.fillStyle(hex(COLORS.bone), 1);
      g.fillRect(cx - 1, cy - 4, 2, 4);
      if (!sealed) {
        g.fillStyle(hex(COLORS.redLow), 1);
        g.fillRect(cx - 1, cy - 6, 2, 2);
        g.fillStyle(hex(COLORS.amber), 1);
        g.fillRect(cx, cy - 7, 1, 1);
      }
    }
  }

  private drawChest(c: ChestState): void {
    const g = this.graphics;
    const x = c.x;
    const y = c.y;
    if (c.kind === 'weapon') {
      // A glass case: dark frame, pale glass, dim once emptied.
      g.fillStyle(hex(COLORS.wall), 1);
      g.fillRect(x - 12, y - 10, 24, 18);
      g.fillStyle(hex(c.opened ? COLORS.dim : COLORS.bone), c.opened ? 0.4 : 0.8);
      g.fillRect(x - 10, y - 8, 20, 12);
      g.lineStyle(2, hex(COLORS.amber), c.opened ? 0.3 : 1);
      g.strokeRect(x - 12, y - 10, 24, 18);
      return;
    }
    const body = c.kind === 'boss' ? COLORS.redDark : COLORS.wood;
    g.fillStyle(hex(body), 1);
    g.fillRect(x - 10, y - 6, 20, 12);
    g.lineStyle(2, hex(COLORS.ink), 1);
    g.strokeRect(x - 10, y - 6, 20, 12);
    // The lid: shut over the box, or open behind it.
    g.fillStyle(hex(c.opened ? COLORS.floor : body), 1);
    if (c.opened) g.fillRect(x - 10, y - 14, 20, 6);
    else g.fillRect(x - 10, y - 10, 20, 5);
    if (!c.opened && c.kind === 'locked') {
      g.fillStyle(hex(COLORS.amber), 1);
      g.fillRect(x - 3, y - 4, 6, 6);
    }
    if (c.kind === 'big') {
      g.lineStyle(2, hex(COLORS.amber), 1);
      g.strokeRect(x - 12, y - 12, 24, 20);
    }
  }
}

function hex(color: string): number {
  return Number.parseInt(color.replace('#', ''), 16);
}
