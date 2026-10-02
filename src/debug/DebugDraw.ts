import type Phaser from 'phaser';
import { BULLETS, MERCHANT, PLAYER, ZOMBIES } from '../config/balance';
import type { GameState } from '../core/GameState';
import { DEPTH } from '../game/depth';
import { BLOCK_BULLET, cellBlocks, cellShapeRects, type CollisionGrid } from '../game/map/CollisionGrid';
import { UNREACHABLE, flowNextCell, type FlowField } from '../game/map/FlowField';
import { isZombieAlive } from '../game/systems/Combat';
import { hurtboxOf } from '../game/systems/shotGeometry';

/**
 * Debug drawing over the world (spec 01 §8): hitboxes (player, zombie and
 * merchant circles, the zombies' drawn bodies that bullets hit, bullets, and
 * what stops bullets: walls by their drawn shape, doors and furniture) and the flow
 * field (an arrow per visible cell towards its next cell, windows the way
 * goes through in amber). Redrawn every frame only while enabled.
 */
export class DebugDraw {
  showHitboxes = false;
  showFlowField = false;
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.debug);
  }

  draw(state: GameState, nav: FlowField, grid: CollisionGrid): void {
    const g = this.g;
    g.clear();
    if (this.showFlowField) this.drawFlowField(nav);
    if (!this.showHitboxes) return;
    this.drawBulletBlockers(grid);
    g.lineStyle(1, 0x5fd0ff, 1);
    for (const p of state.players) if (p.hp > 0) g.strokeCircle(p.x, p.y, PLAYER.hitboxRadius);
    g.lineStyle(1, 0x3a6fd8, 1);
    for (const m of state.merchants) if (m.active) g.strokeCircle(m.x, m.y, MERCHANT.radius);
    g.lineStyle(1, 0x5fd0ff, 1);
    for (const z of state.zombies) {
      if (!isZombieAlive(z)) continue;
      g.lineStyle(1, 0xff4040, 1);
      g.strokeCircle(z.x, z.y, ZOMBIES.hitboxRadius);
      g.lineStyle(1, 0xffd040, 1);
      const box = hurtboxOf(z);
      g.strokeRect(z.x - box.width / 2, z.y - box.height, box.width, box.height);
    }
    g.fillStyle(0xffffff, 1);
    for (const b of state.bullets) if (b.active) g.fillCircle(b.x + b.drawX, b.y + b.drawY, Math.max(1, BULLETS.radius));
  }

  /**
   * What stops bullets in view, in green, drawn at the bullets' flight
   * height: where a visible bullet stops (thin walls only on their base).
   */
  private drawBulletBlockers(grid: CollisionGrid): void {
    const g = this.g;
    const ts = grid.tileSize;
    const view = this.scene.cameras.main.worldView;
    const x0 = Math.max(0, Math.floor(view.x / ts));
    const y0 = Math.max(0, Math.floor(view.y / ts));
    const x1 = Math.min(grid.width - 1, Math.ceil((view.x + view.width) / ts));
    const y1 = Math.min(grid.height - 1, Math.ceil((view.y + view.height) / ts));
    g.lineStyle(1, 0x60e070, 0.8);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!cellBlocks(grid, x, y, BLOCK_BULLET)) continue;
        for (const [rx0, ry0, rx1, ry1] of cellShapeRects(grid, x, y)) {
          g.strokeRect(rx0 + 0.5, ry0 - BULLETS.flightHeight + 0.5, rx1 - rx0 - 1, ry1 - ry0 - 1);
        }
      }
    }
  }

  private drawFlowField(nav: FlowField): void {
    const g = this.g;
    const ts = nav.tileSize;
    const view = this.scene.cameras.main.worldView;
    const x0 = Math.max(0, Math.floor(view.x / ts));
    const y0 = Math.max(0, Math.floor(view.y / ts));
    const x1 = Math.min(nav.width - 1, Math.ceil((view.x + view.width) / ts));
    const y1 = Math.min(nav.height - 1, Math.ceil((view.y + view.height) / ts));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cell = y * nav.width + x;
        const d = nav.dist[cell] ?? UNREACHABLE;
        if (d === UNREACHABLE) continue;
        const cx = (x + 0.5) * ts;
        const cy = (y + 0.5) * ts;
        if ((nav.cellWindow[cell] ?? -1) >= 0) {
          g.fillStyle(0xe8b04a, 0.35);
          g.fillRect(x * ts, y * ts, ts, ts);
        }
        const next = flowNextCell(nav, cx, cy);
        if (next < 0) {
          g.fillStyle(0x5fd0ff, 0.9);
          g.fillCircle(cx, cy, 3); // a source: the player's cell
          continue;
        }
        const nx = ((next % nav.width) + 0.5) * ts;
        const ny = (Math.floor(next / nav.width) + 0.5) * ts;
        const ex = cx + (nx - cx) * 0.4;
        const ey = cy + (ny - cy) * 0.4;
        g.lineStyle(1, 0x7cff9a, 0.7);
        g.lineBetween(cx, cy, ex, ey);
        g.fillStyle(0x7cff9a, 0.9);
        g.fillRect(ex - 1, ey - 1, 2, 2);
      }
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
