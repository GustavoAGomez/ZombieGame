import type Phaser from 'phaser';
import { HAND } from '../../config/balance';
import { WEAPON_IDS } from '../../config/weapons';
import type { EventBus, GameEvents } from '../../core/EventBus';
import type { HandPhase, HandState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey } from '../assets/manifest';
import { actorDepth, DEPTH } from '../depth';
import type { MapData } from '../map/MapLoader';
import { ARROW_EDGE_GAP, edgeArrow, type ViewEdges } from './Merchant';

/** The embers of the crack switch between dim and bright this often (s). */
const EMBER_PULSE = 0.4;
/** Weapon outlines shown while rolling, slowing down towards the end (spec 06 §3.4). */
const ROLL_STEPS = 14;
/** The weapon on offer floats this high over the open hand (px) and bobs this much; in its last seconds it blinks. */
const FLOAT_HEIGHT = 34;
const BOB = 2;
/** The outlines are the HUD's 1× icons: drawn bigger over the hand so they read on the map. */
const WEAPON_SCALE = 1.5;
const BLINK_PERIOD = 0.15;
/** A special weapon's flash as the hand opens: a ring this wide (px) that fades in this long (s). */
const FLASH_RADIUS = 26;
const FLASH_TIME = 0.4;

/** The column of embers over the crack (spec 06 §3.2): this many, rising this high (px) in this long (s). */
const EMBERS = 22;
const EMBER_RISE = 48;
const EMBER_LIFE = 1.4;
const EMBER_COLORS = [0xff5a24, 0xc9221a, 0xffa040] as const;
/** The arrow at the screen edge towards it, in dark red. */
const ARROW_TINT = 0x9a1f1f;

const FIST = 0;
const OPEN = 1;
const MOCK = 2;

/**
 * The Demon's Hand on the map (spec 06 §3.7, placeholders): its crack on the
 * floor with pulsing embers; the hand growing out of it with its fist closed,
 * weapon outlines rolling over it, then open with the weapon floating over
 * it (blinking in its last seconds) or empty, and sinking back; and a flash
 * when it offers a special weapon; the mocking gesture when tired. Over
 * all of it, a column of embers rising from the crack that shows even over
 * the darkness of a locked room, and an arrow at the screen edge towards it
 * while it is out of view in an unlocked room of the level shown. Render
 * only: it reads the hand's state. While the hand is away (moving), none of
 * it shows.
 */
export class HandView {
  private readonly crack: Phaser.GameObjects.Image;
  private readonly hand: Phaser.GameObjects.Image;
  private readonly weapon: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Graphics;
  private readonly embers: Phaser.GameObjects.Graphics;
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly unsubscribe: () => void;
  private flashAge = -1;
  private shownSpot = -2;

  constructor(
    scene: Phaser.Scene,
    private readonly map: MapData,
    events: EventBus,
  ) {
    this.crack = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.handCrack), 0).setDepth(DEPTH.decals).setVisible(false);
    this.hand = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.demonHand), FIST).setOrigin(0.5, 1).setVisible(false);
    this.weapon = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.weaponIcon), 0).setScale(WEAPON_SCALE).setVisible(false);
    this.flash = scene.add.graphics();
    this.embers = scene.add.graphics().setDepth(DEPTH.handEmbers);
    this.arrow = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.offscreenArrow)).setTint(ARROW_TINT).setDepth(DEPTH.indicators).setVisible(false);
    this.unsubscribe = events.on('hand:offer', this.onOffer);
  }

  /** `time`: seconds of simulated time (the embers and the bobbing freeze with the match). */
  sync(state: HandState, time: number, dt: number): void {
    const spot = this.map.handSpots[state.spot];
    if (!spot || state.phase === 'away') {
      if (this.crack.visible) [this.crack, this.hand, this.weapon].forEach((o) => o.setVisible(false));
      this.embers.clear();
      this.shownSpot = -2;
      return;
    }
    if (state.spot !== this.shownSpot) {
      this.shownSpot = state.spot;
      this.crack.setPosition(spot.x, spot.y).setVisible(true);
      const depth = actorDepth(spot.y + 1);
      this.hand.setPosition(spot.x, spot.y + 2).setDepth(depth);
      this.weapon.setDepth(depth + 0.0001);
      this.flash.setDepth(depth + 0.0002);
    }
    this.crack.setFrame(Math.floor(time / EMBER_PULSE) % 2);
    this.syncHand(state, spot.x, spot.y, time);
    this.syncFlash(spot.x, spot.y - FLOAT_HEIGHT, dt);
    this.syncEmbers(spot.x, spot.y, time);
  }

  /**
   * The arrow towards the hand: `edges` is the visible world and its safe
   * inset; `show` whether it may be pointed at (unlocked room, level shown).
   */
  syncArrow(state: HandState, edges: ViewEdges, worldPerCssPx: number, show: boolean): void {
    const spot = this.map.handSpots[state.spot];
    const gap = ARROW_EDGE_GAP * worldPerCssPx;
    const inset: ViewEdges = { ...edges, insetX: edges.insetX + gap, insetTop: edges.insetTop + gap, insetBottom: edges.insetBottom + gap };
    const at = spot && show && state.phase !== 'away' ? edgeArrow(inset, spot.x, spot.y - 10, 4) : null;
    if (!at) {
      if (this.arrow.visible) this.arrow.setVisible(false);
      return;
    }
    const half = this.arrow.width / 2;
    this.arrow
      .setVisible(true)
      .setPosition(Math.round(at.x - Math.cos(at.angle) * half), Math.round(at.y - Math.sin(at.angle) * half))
      .setRotation(at.angle);
  }

  destroy(): void {
    this.unsubscribe();
  }

  private syncHand(state: HandState, x: number, y: number, time: number): void {
    const { phase } = state;
    if (phase === 'idle') {
      this.hand.setVisible(false);
      this.weapon.setVisible(false);
      return;
    }
    const elapsed = phaseLength(phase) - state.timer;
    // Grows out of the crack, and shrinks back into it.
    const rise = phase === 'rising' ? Math.min(1, elapsed / HAND.risingTime) : phase === 'sinking' ? Math.max(0, state.timer / HAND.sinkingTime) : 1;
    // Tired: one finger up, wagging "no".
    const mocking = phase === 'mocking';
    this.hand
      .setVisible(rise > 0)
      .setFrame(mocking ? MOCK : phase === 'rising' || phase === 'rolling' ? FIST : OPEN)
      .setScale(1, rise)
      .setX(x + (mocking ? Math.round(Math.sin(time * 18) * 2) : 0));
    let frame = -1;
    if (phase === 'rolling') {
      // Outlines switching faster at first, slower at the end; never the result itself.
      const step = Math.floor(ROLL_STEPS * Math.sqrt(Math.min(1, elapsed / HAND.rollingTime)));
      frame = (step * 7 + 3) % WEAPON_IDS.length;
    } else if ((phase === 'offering' || phase === 'sinking') && state.offer && !state.taken) {
      const blinking = phase === 'offering' && state.timer <= HAND.blinkTime && Math.floor(state.timer / BLINK_PERIOD) % 2 === 0;
      frame = blinking ? -1 : WEAPON_IDS.indexOf(state.offer);
    }
    if (frame < 0) {
      this.weapon.setVisible(false);
      return;
    }
    const bob = phase === 'offering' ? Math.round(Math.sin(time * 4) * BOB) : 0;
    this.weapon
      .setVisible(true)
      .setFrame(frame)
      .setPosition(x, y - FLOAT_HEIGHT * rise + bob)
      .setAlpha(phase === 'rolling' ? 0.6 : 1);
  }

  /** Embers rising from the crack, swaying and fading, each on its own phase of the cycle. */
  private syncEmbers(x: number, y: number, time: number): void {
    const g = this.embers;
    g.clear();
    for (let i = 0; i < EMBERS; i++) {
      const t = (time / EMBER_LIFE + i / EMBERS) % 1;
      const sway = Math.sin(i * 12.9898 + time * 2.3) * 5 * (1 - t * 0.4);
      const size = i % 4 === 0 ? 3 : 2;
      g.fillStyle(EMBER_COLORS[i % EMBER_COLORS.length] ?? 0xff5a24, 1 - t);
      g.fillRect(Math.round(x + sway + ((i * 7) % 11) - 5), Math.round(y - 2 - t * EMBER_RISE), size, size);
    }
  }

  private readonly onOffer = (e: GameEvents['hand:offer']): void => {
    if (e.special) this.flashAge = 0;
  };

  private syncFlash(x: number, y: number, dt: number): void {
    if (this.flashAge < 0) return;
    this.flashAge += dt;
    const k = this.flashAge / FLASH_TIME;
    this.flash.clear();
    if (k >= 1) {
      this.flashAge = -1;
      return;
    }
    this.flash.lineStyle(3, 0xffffff, 1 - k).strokeCircle(x, y, FLASH_RADIUS * (0.3 + k * 0.7));
    this.flash.fillStyle(0xff5a24, (1 - k) * 0.5).fillCircle(x, y, FLASH_RADIUS * 0.4 * (1 - k));
  }
}

/** Seconds a phase lasts (0 for the waiting one). */
function phaseLength(phase: HandPhase): number {
  switch (phase) {
    case 'rising':
      return HAND.risingTime;
    case 'rolling':
      return HAND.rollingTime;
    case 'offering':
      return HAND.offeringTime;
    case 'empty':
      return HAND.emptyTime;
    case 'mocking':
      return HAND.mockTime;
    case 'sinking':
      return HAND.sinkingTime;
    default:
      return 0;
  }
}
