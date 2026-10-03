import type Phaser from 'phaser';
import { ITEMS } from '../../config/balance';
import { itemDef, type ItemId } from '../../config/items';
import { COLORS } from '../../config/theme';
import type { EventBus, GameEvents } from '../../core/EventBus';
import { itemSpriteKey, objectTextureKey, type Manifest } from '../assets/manifest';
import { itemFrame } from './GroundItem';
import { DEPTH } from '../depth';

/** Peak of the arc above the straight line, in world px. */
const ARC_HEIGHT = 22;
/** The splash after landing (s): a ring opening on the water and four drops. */
const SPLASH_TIME = 0.35;
const SPLASH_RADIUS = 10;
const DROPS = 4;
const POOL_SIZE = 2;
const WATER_LIGHT = Number.parseInt(COLORS.bone.slice(1), 16);
/** Over the actors, under the darkness of locked zones. */
const FLIGHT_DEPTH = DEPTH.actors + 9;

interface Throw {
  icon: Phaser.GameObjects.Image;
  /** What flies: its sprite keeps playing (the heart beats, the wand crackles). */
  item: ItemId | null;
  ring: Phaser.GameObjects.Arc;
  drops: Phaser.GameObjects.Arc[];
  /** Simulated time it was thrown (s); -Infinity when idle. */
  from: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

/**
 * Special items thrown at an activation site (spec 05 §6): the item flies in
 * an arc from the player to the water for ITEMS.throwTime and lands with a
 * splash. Pooled, driven by simulated time, so the pause freezes it.
 * Visual only.
 */
export class ThrownItemViews {
  private readonly throws: Throw[];
  private next = 0;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    events: EventBus,
    private readonly manifest: Manifest,
  ) {
    this.throws = Array.from({ length: POOL_SIZE }, () => ({
      icon: scene.add.image(0, 0, objectTextureKey(itemSpriteKey('living_heart')), 0).setDepth(FLIGHT_DEPTH).setVisible(false),
      item: null,
      ring: scene.add.circle(0, 0, 2).setStrokeStyle(1, WATER_LIGHT, 1).setDepth(DEPTH.decals + 0.2).setVisible(false),
      drops: Array.from({ length: DROPS }, () => scene.add.circle(0, 0, 1, WATER_LIGHT, 1).setDepth(DEPTH.decals + 0.2).setVisible(false)),
      from: -Infinity,
      fromX: 0,
      fromY: 0,
      toX: 0,
      toY: 0,
    }));
    this.unsubscribe = events.on('item:thrown', this.onThrown);
  }

  /** `time`: simulated seconds (GameState.time). */
  sync(time: number): void {
    for (const t of this.throws) {
      const elapsed = time - t.from;
      const flight = elapsed / ITEMS.throwTime;
      const inFlight = flight >= 0 && flight < 1;
      t.icon.setVisible(inFlight);
      if (inFlight) {
        const x = t.fromX + (t.toX - t.fromX) * flight;
        const y = t.fromY + (t.toY - t.fromY) * flight - Math.sin(Math.PI * flight) * ARC_HEIGHT;
        t.icon.setPosition(Math.round(x), Math.round(y)).setAngle(flight * 360);
        if (t.item) t.icon.setFrame(itemFrame(time, itemDef(t.item).fps, Math.max(1, this.manifest.objects[itemSpriteKey(t.item)]?.frames ?? 1)));
      }
      const splash = (elapsed - ITEMS.throwTime) / SPLASH_TIME;
      const splashing = splash >= 0 && splash < 1;
      t.ring.setVisible(splashing);
      for (const d of t.drops) d.setVisible(splashing);
      if (!splashing) continue;
      t.ring.setPosition(t.toX, t.toY).setRadius(2 + (SPLASH_RADIUS - 2) * splash).setAlpha(1 - splash);
      t.drops.forEach((d, i) => {
        const angle = (i / DROPS) * Math.PI * 2 + Math.PI / 4;
        const out = 3 + 7 * splash;
        // The drops jump out and fall back: up and down along the screen's y.
        const up = Math.sin(Math.PI * splash) * 6;
        d.setPosition(Math.round(t.toX + Math.cos(angle) * out), Math.round(t.toY + Math.sin(angle) * out * 0.5 - up)).setAlpha(1 - splash);
      });
    }
  }

  destroy(): void {
    this.unsubscribe();
  }

  private readonly onThrown = (e: GameEvents['item:thrown']): void => {
    const t = this.throws[this.next];
    if (!t) return;
    this.next = (this.next + 1) % this.throws.length;
    Object.assign(t, { item: e.item, from: e.time, fromX: e.fromX, fromY: e.fromY - 10, toX: e.toX, toY: e.toY });
    t.icon.setTexture(objectTextureKey(itemSpriteKey(e.item)), 0);
  };
}
