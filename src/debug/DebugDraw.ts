import type Phaser from 'phaser';
import { BOSS, BULLETS, MERCHANT, PLAYER, ZOMBIES } from '../config/balance';
import { BOSSES } from '../config/bosses';
import type { GameState } from '../core/GameState';
import type { MapData } from '../game/map/MapLoader';
import { DEPTH } from '../game/depth';
import { BLOCK_BULLET, cellBlocks, cellShapeRects, type CollisionGrid } from '../game/map/CollisionGrid';
import { UNREACHABLE, flowNextCell, type FlowField } from '../game/map/FlowField';
import { isZombieAlive } from '../game/systems/Combat';
import { bossFeetY, bossHalf, bossHurtbox, isBossAlive } from '../game/systems/BossCombat';
import { hurtboxOf } from '../game/systems/shotGeometry';

/**
 * Debug drawing over the world (spec 01 §8): hitboxes (player, zombie and
 * merchant circles, the zombies' drawn bodies that bullets hit, bullets, and
 * what stops bullets: walls by their drawn shape, doors and furniture) and the flow
 * field (an arrow per visible cell towards its next cell, windows the way
 * goes through in amber) and the special items' spots (spec 05 §8: violet
 * crosses, the one with an item still on it ringed in amber, and the
 * activation sites framed). Redrawn every frame only while enabled.
 */
export class DebugDraw {
  showHitboxes = false;
  showFlowField = false;
  showItemSpots = false;
  showHandSpots = false;
  /** Spec 07 §10: every boss blow's real damage zone. */
  showBossZones = false;
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.debug);
  }

  draw(state: GameState, nav: FlowField, grid: CollisionGrid): void {
    const g = this.g;
    g.clear();
    if (this.showFlowField) this.drawFlowField(nav);
    if (this.showItemSpots) this.drawItemSpots(state);
    if (this.showHandSpots) this.drawHandSpots(state);
    if (this.showBossZones) this.drawBossZones(state);
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
    // Bosses (spec 07): the footprint in red, the box bullets hit in yellow.
    for (const b of state.bosses) {
      if (!isBossAlive(b)) continue;
      const half = bossHalf(b, this.map.tileSize);
      g.lineStyle(1, 0xff4040, 1);
      g.strokeRect(b.x - half, b.y - half, half * 2, half * 2);
      const box = bossHurtbox(b);
      const feet = bossFeetY(b, this.map.tileSize);
      g.lineStyle(1, 0xffd040, 1);
      g.strokeRect(b.x - box.width / 2, feet - box.height, box.width, box.height);
    }
    g.fillStyle(0xffffff, 1);
    for (const b of state.bullets) if (b.active) g.fillCircle(b.x + b.drawX, b.y + b.drawY, Math.max(1, BULLETS.radius));
  }

  private drawItemSpots(state: GameState): void {
    const g = this.g;
    g.lineStyle(2, 0xbe5aeb, 1);
    for (const s of this.map.itemSpots) {
      g.lineBetween(s.x - 6, s.y, s.x + 6, s.y);
      g.lineBetween(s.x, s.y - 6, s.x, s.y + 6);
    }
    g.lineStyle(2, 0xe8b04a, 1);
    for (const item of state.groundItems) if (item.active) g.strokeCircle(item.x, item.y, 14);
    g.lineStyle(1, 0xbe5aeb, 1);
    for (const a of this.map.activationSites) g.strokeRect(a.x, a.y, a.width, a.height);
  }

  /**
   * Where each boss's blows really hurt (spec 07 §10), in magenta: its
   * charge's contact box (its footprint widened by the player's hitbox), the
   * slam's arc as it aims now, the landing circle at its leap's target, the
   * band of its ring, and the puddles.
   */
  private drawBossZones(state: GameState): void {
    const g = this.g;
    const ts = this.map.tileSize;
    g.lineStyle(1, 0xff3cff, 1);
    for (const b of state.bosses) {
      if (!isBossAlive(b)) continue;
      const def = BOSSES[b.boss];
      const reach = bossHalf(b, ts) + PLAYER.hitboxRadius;
      g.strokeRect(b.x - reach, b.y - reach, reach * 2, reach * 2);
      const aim = Math.atan2(b.aimY, b.aimX);
      const half = (def.slam.arc * Math.PI) / 360;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.arc(b.x, b.y, def.slam.reach, aim - half, aim + half);
      g.closePath();
      g.strokePath();
      if (b.stage === 'air') g.strokeCircle(b.targetX, b.targetY, def.leap.landRadius);
      if (b.waveTime >= 0) {
        const outer = Math.min(def.leap.waveRadius, def.leap.waveSpeed * b.waveTime);
        g.strokeCircle(b.waveX, b.waveY, outer);
        g.strokeCircle(b.waveX, b.waveY, Math.max(0, outer - def.leap.waveWidth));
      }
    }
    for (const pd of state.puddles) if (pd.active) g.strokeCircle(pd.x, pd.y, BOSS.puddle.radius);
  }

  /** The Demon's Hand's spots (spec 06 §5): a red cross each, the one it is at ringed. */
  private drawHandSpots(state: GameState): void {
    const g = this.g;
    g.lineStyle(2, 0xd23a2a, 1);
    for (const s of this.map.handSpots) {
      g.lineBetween(s.x - 6, s.y - 6, s.x + 6, s.y + 6);
      g.lineBetween(s.x - 6, s.y + 6, s.x + 6, s.y - 6);
    }
    const here = this.map.handSpots[state.hand.spot];
    if (here) g.strokeCircle(here.x, here.y, 16);
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
