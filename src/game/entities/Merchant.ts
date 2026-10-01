import type Phaser from 'phaser';
import { MERCHANT, SIM } from '../../config/balance';
import { merchantDef, type MerchantId } from '../../config/merchants';
import { hexToInt } from '../../config/theme';
import type { MerchantState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey, type ObjectDef } from '../assets/manifest';
import { actorDepth, DEPTH } from '../depth';
import type { MapData } from '../map/MapLoader';

/** Placeholder diamond over the merchant: floats 2 px up and down every 1.2 s (spec 03 §2). */
const GEM_BOB = 2;
const GEM_PERIOD = 1.2;
/** Gap between the top of the body and the diamond (px). */
const GEM_GAP = 3;
/** The body's bottom edge sits this far below the merchant's feet point, like other actors. */
const FEET_OFFSET = 4;

export function merchantTextureKey(id: MerchantId): string {
  return objectTextureKey(`merchant_${id}`);
}

interface MerchantSprites {
  body: Phaser.GameObjects.Image;
  gem: Phaser.GameObjects.Image;
  /** Smoke where it arrived and where it left. */
  arrival: Phaser.GameObjects.Image;
  departure: Phaser.GameObjects.Image;
}

/**
 * Merchants on the map (spec 03 §2): a body y-sorted with the other actors,
 * a floating diamond and a smoke puff of its colour for MERCHANT.puffTime
 * where it appears and where it left. Render only: positions and timing
 * come from the state, so the puff also freezes with the pause.
 */
export class MerchantViewPool {
  private readonly sprites: MerchantSprites[];
  private readonly puffFrames: number;

  constructor(
    scene: Phaser.Scene,
    private readonly map: MapData,
    merchants: readonly MerchantState[],
    puff: ObjectDef | undefined,
  ) {
    this.puffFrames = Math.max(1, puff?.frames ?? 1);
    this.sprites = merchants.map((m) => {
      const tint = hexToInt(merchantDef(m.id).color);
      const puffImage = (): Phaser.GameObjects.Image =>
        scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.smokePuff), 0).setTint(tint).setVisible(false);
      return {
        body: scene.add.image(0, 0, merchantTextureKey(m.id)).setOrigin(0.5, 1).setVisible(false),
        gem: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.merchantGem)).setOrigin(0.5, 1).setTint(tint).setVisible(false),
        arrival: puffImage(),
        departure: puffImage(),
      };
    });
  }

  sync(merchants: readonly MerchantState[], tick: number, time: number): void {
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      const m = merchants[i];
      if (!s) continue;
      if (!m?.active) {
        for (const img of [s.body, s.gem, s.arrival, s.departure]) if (img.visible) img.setVisible(false);
        continue;
      }
      const bottom = m.y + FEET_OFFSET;
      s.body.setVisible(true).setPosition(m.x, bottom).setDepth(actorDepth(m.y));
      const bob = Math.round(Math.sin((time / GEM_PERIOD) * Math.PI * 2) * GEM_BOB);
      s.gem
        .setVisible(true)
        .setPosition(m.x, bottom - s.body.height - GEM_GAP + bob)
        .setDepth(actorDepth(m.y) + 0.0001);

      const elapsed = (tick - m.moveTick) / SIM.hz;
      const puffing = elapsed >= 0 && elapsed < MERCHANT.puffTime;
      const frame = Math.min(this.puffFrames - 1, Math.floor((elapsed / MERCHANT.puffTime) * this.puffFrames));
      const centre = bottom - s.body.height / 2;
      this.syncPuff(s.arrival, puffing, frame, m.x, centre, actorDepth(m.y) + 0.0002);
      const from = this.map.merchantSpots[m.fromSpot];
      this.syncPuff(s.departure, puffing && from !== undefined, frame, from?.x ?? 0, (from?.y ?? 0) + FEET_OFFSET - s.body.height / 2, actorDepth(from?.y ?? 0) + 0.0002);
    }
  }

  private syncPuff(img: Phaser.GameObjects.Image, show: boolean, frame: number, x: number, y: number, depth: number): void {
    if (!show) {
      if (img.visible) img.setVisible(false);
      return;
    }
    img.setVisible(true).setFrame(frame).setPosition(Math.round(x), Math.round(y)).setDepth(depth);
  }
}

/** Gap between an off-screen arrow and the safe edge of the screen (CSS px). */
const ARROW_EDGE_GAP = 6;

export interface ViewEdges {
  /** Visible world rectangle. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Inset from each side of it where arrows go (world px). */
  insetX: number;
  insetTop: number;
  insetBottom: number;
}

/**
 * Where an arrow pointing at (tx, ty) goes: on the inset border of the view,
 * along the line from the view's centre. Null when the target is in view.
 */
export function edgeArrow(view: ViewEdges, tx: number, ty: number, margin = 0): { x: number; y: number; angle: number } | null {
  if (tx >= view.x - margin && tx <= view.x + view.width + margin && ty >= view.y - margin && ty <= view.y + view.height + margin) return null;
  const left = view.x + view.insetX;
  const right = view.x + view.width - view.insetX;
  const top = view.y + view.insetTop;
  const bottom = view.y + view.height - view.insetBottom;
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  const sx = dx !== 0 ? (right - cx) / Math.abs(dx) : Infinity;
  const sy = dy !== 0 ? (bottom - cy) / Math.abs(dy) : Infinity;
  const s = Math.min(sx, sy, 1);
  return { x: cx + dx * s, y: cy + dy * s, angle: Math.atan2(dy, dx) };
}

/**
 * Small arrow of each merchant's colour at the edge of the screen, pointing
 * at it while it is out of view (spec 03 §2). Off with
 * MERCHANT.offscreenIndicator. Merchants on another level (the basement, the
 * roof) are elsewhere on the map: an arrow towards them would mislead, so
 * none is shown.
 */
export class OffscreenArrows {
  private readonly arrows: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene, merchants: readonly MerchantState[]) {
    this.arrows = merchants.map((m) =>
      scene.add
        .image(0, 0, objectTextureKey(ASSET_KEYS.offscreenArrow))
        .setTint(hexToInt(merchantDef(m.id).color))
        .setDepth(DEPTH.indicators)
        .setVisible(false),
    );
  }

  /**
   * `edges` is the visible world and its safe inset; `sameLevel(spot)` says
   * whether a merchant spot is on the level the camera shows.
   */
  sync(merchants: readonly MerchantState[], edges: ViewEdges, worldPerCssPx: number, sameLevel: (spot: number) => boolean): void {
    const gap = ARROW_EDGE_GAP * worldPerCssPx;
    const inset: ViewEdges = { ...edges, insetX: edges.insetX + gap, insetTop: edges.insetTop + gap, insetBottom: edges.insetBottom + gap };
    for (let i = 0; i < this.arrows.length; i++) {
      const arrow = this.arrows[i];
      const m = merchants[i];
      if (!arrow) continue;
      const at = MERCHANT.offscreenIndicator && m?.active && sameLevel(m.spot) ? edgeArrow(inset, m.x, m.y - 10, 4) : null;
      if (!at) {
        if (arrow.visible) arrow.setVisible(false);
        continue;
      }
      // Pushed in by half its size so the whole arrow stays inside the inset.
      const half = arrow.width / 2;
      arrow
        .setVisible(true)
        .setPosition(Math.round(at.x - Math.cos(at.angle) * half), Math.round(at.y - Math.sin(at.angle) * half))
        .setRotation(at.angle);
    }
  }
}
