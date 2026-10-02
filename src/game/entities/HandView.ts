import type Phaser from 'phaser';
import { HAND } from '../../config/balance';
import { WEAPON_IDS } from '../../config/weapons';
import type { EventBus, GameEvents } from '../../core/EventBus';
import type { HandPhase, HandState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey } from '../assets/manifest';
import { actorDepth, DEPTH } from '../depth';
import type { MapData } from '../map/MapLoader';

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

const FIST = 0;
const OPEN = 1;

/**
 * The Demon's Hand on the map (spec 06 §3.7, placeholders): its crack on the
 * floor with pulsing embers; the hand growing out of it with its fist closed,
 * weapon outlines rolling over it, then open with the weapon floating over
 * it (blinking in its last seconds) or empty, and sinking back; and a flash
 * when it offers a special weapon. Render only: it reads the hand's state
 * and lies under the darkness of a locked zone like the rest of it.
 */
export class HandView {
  private readonly crack: Phaser.GameObjects.Image;
  private readonly hand: Phaser.GameObjects.Image;
  private readonly weapon: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Graphics;
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
    this.unsubscribe = events.on('hand:offer', this.onOffer);
  }

  /** `time`: seconds of simulated time (the embers and the bobbing freeze with the match). */
  sync(state: HandState, time: number, dt: number): void {
    const spot = this.map.handSpots[state.spot];
    if (!spot) {
      if (this.crack.visible) [this.crack, this.hand, this.weapon].forEach((o) => o.setVisible(false));
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
    this.hand
      .setVisible(rise > 0)
      .setFrame(phase === 'rising' || phase === 'rolling' ? FIST : OPEN)
      .setScale(1, rise);
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
    case 'sinking':
      return HAND.sinkingTime;
    default:
      return 0;
  }
}
