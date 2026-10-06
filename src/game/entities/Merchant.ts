import type Phaser from 'phaser';
import { MERCHANT, SIM } from '../../config/balance';
import { merchantDef, type MerchantId } from '../../config/merchants';
import { hexToInt } from '../../config/theme';
import type { MerchantState, PlayerState } from '../../core/GameState';
import { ASSET_KEYS, animationKey, characterTextureKey, isAnimationPlaceholder, objectTextureKey, type Manifest } from '../assets/manifest';
import { actorDepth, DEPTH } from '../depth';
import type { MapData } from '../map/MapLoader';
import { nextCoat, type CoatState } from './merchantCoat';

/** Placeholder diamond over the merchant: floats 2 px up and down every 1.2 s (spec 03 §2). */
const GEM_BOB = 2;
const GEM_PERIOD = 1.2;
/** Gap between the top of the body and the diamond (px). */
const GEM_GAP = 3;
/** The placeholder body's bottom edge sits this far below the merchant's feet point, like other actors. */
const FEET_OFFSET = 4;
/** Height of each drawn wizard over its feet, hat included, measured on its art (the better the wizard, the taller). */
const ART_BODY_HEIGHT: Record<MerchantId, number> = { blue: 44, red: 46, gold: 48 };

export function merchantTextureKey(id: MerchantId): string {
  return objectTextureKey(`merchant_${id}`);
}

/** Character key of a merchant drawn with animated art (manifest characters). */
export function merchantCharacterKey(id: MerchantId): string {
  return `merchant_${id}`;
}

interface MerchantSprites {
  body: Phaser.GameObjects.Sprite;
  gem: Phaser.GameObjects.Image;
  /** Smoke where it arrived and where it left. */
  arrival: Phaser.GameObjects.Image;
  departure: Phaser.GameObjects.Image;
  /** Animated art (breathing, opening the coat), or null for the placeholder rectangle. */
  character: string | null;
  coat: CoatState;
  /** Height of the drawn body over the feet: where the diamond and the smoke go. */
  bodyHeight: number;
}

/**
 * Merchants on the map (spec 03 §2): a body y-sorted with the other actors,
 * a floating diamond and a smoke puff of its colour for MERCHANT.puffTime
 * where it appears and where it left. A merchant with art breathes and opens
 * its coat while its shop is open (merchantCoat.ts); its art says who it is,
 * so it needs no diamond. Render only: positions and timing come from the
 * state, so the puff also freezes with the pause.
 */
export class MerchantViewPool {
  private readonly sprites: MerchantSprites[];
  private readonly puffFrames: number;

  constructor(
    scene: Phaser.Scene,
    private readonly map: MapData,
    merchants: readonly MerchantState[],
    manifest: Manifest,
  ) {
    this.puffFrames = Math.max(1, manifest.objects[ASSET_KEYS.smokePuff]?.frames ?? 1);
    this.sprites = merchants.map((m) => {
      const tint = hexToInt(merchantDef(m.id).color);
      const puffImage = (): Phaser.GameObjects.Image =>
        scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.smokePuff), 0).setTint(tint).setVisible(false);
      const key = merchantCharacterKey(m.id);
      const def = manifest.characters[key];
      const animated = def !== undefined && !isAnimationPlaceholder(def, 'idle') && def.animations.open_coat !== undefined;
      const body = animated
        ? scene.add.sprite(0, 0, characterTextureKey(key, 'idle'), 0).setOrigin(def.anchor.x, def.anchor.y)
        : scene.add.sprite(0, 0, merchantTextureKey(m.id)).setOrigin(0.5, 1);
      return {
        body: body.setVisible(false),
        gem: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.merchantGem)).setOrigin(0.5, 1).setTint(tint).setVisible(false),
        arrival: puffImage(),
        departure: puffImage(),
        character: animated ? key : null,
        coat: 'closed',
        bodyHeight: animated ? ART_BODY_HEIGHT[m.id] : body.height,
      };
    });
  }

  sync(merchants: readonly MerchantState[], players: readonly PlayerState[], tick: number, time: number): void {
    for (let i = 0; i < this.sprites.length; i++) {
      const s = this.sprites[i];
      const m = merchants[i];
      if (!s) continue;
      if (!m?.active) {
        for (const img of [s.body, s.gem, s.arrival, s.departure]) if (img.visible) img.setVisible(false);
        continue;
      }
      // The art stands on its anchor (the feet); the placeholder on its bottom edge, a little lower.
      const feet = s.character ? m.y : m.y + FEET_OFFSET;
      s.body.setVisible(true).setPosition(m.x, feet).setDepth(actorDepth(m.y));
      if (s.character) {
        this.animateCoat(s, players.some((p) => p.shopMerchant === i));
        if (s.gem.visible) s.gem.setVisible(false);
      } else {
        const bob = Math.round(Math.sin((time / GEM_PERIOD) * Math.PI * 2) * GEM_BOB);
        s.gem
          .setVisible(true)
          .setPosition(m.x, feet - s.bodyHeight - GEM_GAP + bob)
          .setDepth(actorDepth(m.y) + 0.0001);
      }

      const elapsed = (tick - m.moveTick) / SIM.hz;
      const puffing = elapsed >= 0 && elapsed < MERCHANT.puffTime;
      const frame = Math.min(this.puffFrames - 1, Math.floor((elapsed / MERCHANT.puffTime) * this.puffFrames));
      const centre = feet - s.bodyHeight / 2;
      this.syncPuff(s.arrival, puffing, frame, m.x, centre, actorDepth(m.y) + 0.0002);
      const from = this.map.merchantSpots[m.fromSpot];
      const fromFeet = (from?.y ?? 0) + (s.character ? 0 : FEET_OFFSET);
      this.syncPuff(s.departure, puffing && from !== undefined, frame, from?.x ?? 0, fromFeet - s.bodyHeight / 2, actorDepth(from?.y ?? 0) + 0.0002);
    }
  }

  /** Bottom of merchant `index`'s drawn body (its feet, world y), to keep it in view while its shop is open. */
  bodyBottom(index: number, m: MerchantState): number {
    const s = this.sprites[index];
    if (!s) return m.y;
    return s.character ? m.y : m.y + FEET_OFFSET;
  }

  /** Breathing, or the coat opening, held open or closing, from where it is now. */
  private animateCoat(s: MerchantSprites, shopOpen: boolean): void {
    const character = s.character;
    if (!character) return;
    const anims = s.body.anims;
    const coatKey = animationKey(character, 'open_coat', 0);
    const playing = anims.currentAnim !== null && anims.currentAnim !== undefined;
    const done = playing && anims.currentAnim?.key === coatKey && !anims.isPlaying;
    const next = nextCoat(s.coat, shopOpen, done);
    if (next === s.coat && playing) return;
    // Turning back halfway starts from the frame on screen.
    const from = anims.currentAnim?.key === coatKey ? (anims.currentFrame?.index ?? 1) - 1 : -1;
    s.coat = next;
    if (next === 'opening') s.body.play({ key: coatKey, startFrame: Math.max(0, from) });
    else if (next === 'closing') s.body.playReverse(from >= 0 ? { key: coatKey, startFrame: from } : coatKey);
    else if (next === 'closed' || !playing) s.body.play(animationKey(character, 'idle', 0));
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
export const ARROW_EDGE_GAP = 6;

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
