import type Phaser from 'phaser';
import { HAND } from '../../config/balance';
import { COLORS } from '../../config/theme';
import { WEAPON_IDS } from '../../config/weapons';
import type { EventBus, GameEvents } from '../../core/EventBus';
import type { HandPhase, HandState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey, type Manifest } from '../assets/manifest';
import { actorDepth, DEPTH } from '../depth';
import type { MapData } from '../map/MapLoader';
import { ARROW_EDGE_GAP, edgeArrow, type ViewEdges } from './Merchant';

/** The hole's loops, in frames per second: the glowing cracks of its crust, and the fire inside once open. */
const CRUST_FPS = 5;
const FIRE_FPS = 10;
/** The hole breaks open in this long (s) as the hand starts rising, and closes back in as long once it has sunk. */
export const HOLE_TIME = 0.24;
/** The hand starts coming out this long (s) after the hole starts opening (half open). */
export const EMERGE_DELAY = 0.12;
/** The floor line the hand comes out of, this far (px) under the hole's centre: towards its front, inside the fire. */
const GROUND = 7;
/** Moving away when tired, its hole fades out in this long (s), once the hand has sunk. */
const FADE_TIME = 0.4;
/** Weapon outlines shown while rolling, slowing down towards the end (spec 06 §3.4). */
const ROLL_STEPS = 14;
/**
 * The weapon on offer floats this high over the floor line (px), cradled by
 * the open claw just over its glowing palm, and bobs this much; in its last
 * seconds it blinks. While rolling, the outlines pass over the fist.
 */
const FLOAT_HEIGHT = 28;
const ROLL_HEIGHT = 44;
const BOB = 2;
/** The weapons' PixelLab icons (32×16), at 1× like everything on the map. */
const WEAPON_SCALE = 1;
const BLINK_PERIOD = 0.15;
/** A special weapon's flash as the hand opens: a ring this wide (px) that fades in this long (s). */
const FLASH_RADIUS = 26;
const FLASH_TIME = 0.4;
/** The mocking gesture jabs up this far (px), this fast (rad/s). */
const JAB = 2;
const JAB_SPEED = 14;

/** The column of embers over the hole (spec 06 §3.2): this many, rising this high (px) in this long (s). */
const EMBERS = 22;
const EMBER_RISE = 48;
const EMBER_LIFE = 1.4;
/** The arrow at the screen edge towards it, in black (the game's ink). */
const ARROW_TINT = Number.parseInt(COLORS.ink.slice(1), 16);

/** The poses of `demon_hand`, in frame order: fist, open holding the weapon (glowing palm), open and empty, and mocking. */
const FIST = 0;
const OFFER = 1;
const EMPTY = 2;
const MOCK = 3;

/** The hole: sealed by its crust, breaking open or closing (`progress` 0 sealed .. 1 open, in the opening frames), or open onto the fire. */
export interface HoleLook {
  anim: 'crust' | 'opening' | 'fire';
  progress: number;
}

/** How the hole looks in a phase, `elapsed` s into it: it opens as the hand starts rising and closes once it has sunk. */
export function holeLook(phase: HandPhase, elapsed: number): HoleLook {
  switch (phase) {
    case 'idle':
    case 'away':
      return { anim: 'crust', progress: 0 };
    case 'rising': {
      const p = clamp01(elapsed / HOLE_TIME);
      return p < 1 ? { anim: 'opening', progress: p } : { anim: 'fire', progress: 1 };
    }
    case 'sinking': {
      const p = clamp01((HAND.sinkingTime - elapsed) / HOLE_TIME);
      return p < 1 ? { anim: 'opening', progress: p } : { anim: 'fire', progress: 1 };
    }
    default:
      return { anim: 'fire', progress: 1 };
  }
}

/**
 * How far out of the floor the hand is (0 hidden .. 1 all out) in a phase,
 * `elapsed` s into it: it comes out once the hole is half open, slowing as
 * it ends, and sinks speeding up, all in before the hole closes.
 */
export function handRise(phase: HandPhase, elapsed: number): number {
  switch (phase) {
    case 'idle':
    case 'away':
      return 0;
    case 'rising': {
      const t = clamp01((elapsed - EMERGE_DELAY) / (HAND.risingTime - EMERGE_DELAY));
      return 1 - (1 - t) * (1 - t);
    }
    case 'sinking': {
      const t = clamp01(elapsed / (HAND.sinkingTime - HOLE_TIME));
      return 1 - t * t;
    }
    default:
      return 1;
  }
}

/**
 * The Demon's Hand on the map (spec 06 §3.7): its hole in the floor, sealed
 * by a crust whose cracks glow; the crust breaks open and the hand comes up
 * out of the floor with its fist closed, weapon outlines rolling over it,
 * then opens with the weapon floating in its claw over the glowing palm
 * (blinking in its last seconds), or open and dark once the weapon is taken
 * or when there was none, and sinks back into the floor before the hole
 * closes; a flash when it offers a special weapon; the obscene gesture when
 * tired. Over it, a column of embers rising from the hole while its room is
 * unlocked (nothing of a locked room shows), and an arrow at the screen edge
 * towards it while it is out of view in an unlocked room of the level shown.
 * Render only: it reads the hand's state. While the hand is away (moving),
 * only its hole shows, fading out where it was.
 */
export class HandView {
  private readonly crack: Phaser.GameObjects.Image;
  private readonly hand: Phaser.GameObjects.Image;
  private readonly weapon: Phaser.GameObjects.Image;
  private readonly flash: Phaser.GameObjects.Graphics;
  private readonly embers: Phaser.GameObjects.Image[];
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly unsubscribe: () => void;
  /** Frames of the hole's crust loop, opening and fire loop, and of the ember variants. */
  private readonly frames: { crust: number; opening: number; fire: number; ember: number };
  private flashAge = -1;
  private shownSpot = -2;

  constructor(
    scene: Phaser.Scene,
    private readonly map: MapData,
    events: EventBus,
    manifest: Manifest,
  ) {
    const frames = (key: string): number => Math.max(1, manifest.objects[key]?.frames ?? 1);
    this.frames = {
      crust: frames(ASSET_KEYS.handCrack),
      opening: frames(ASSET_KEYS.handCrackOpening),
      fire: frames(ASSET_KEYS.handCrackOpen),
      ember: frames(ASSET_KEYS.handEmber),
    };
    this.crack = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.handCrack), 0).setDepth(DEPTH.decals).setVisible(false);
    this.hand = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.demonHand), FIST).setOrigin(0.5, 1).setVisible(false);
    this.weapon = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.weaponIcon), 0).setScale(WEAPON_SCALE).setVisible(false);
    this.flash = scene.add.graphics();
    this.embers = Array.from({ length: EMBERS }, (_, i) =>
      scene.add
        .image(0, 0, objectTextureKey(ASSET_KEYS.handEmber), i % this.frames.ember)
        .setVisible(false),
    );
    this.arrow = scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.offscreenArrow)).setTint(ARROW_TINT).setDepth(DEPTH.indicators).setVisible(false);
    this.unsubscribe = events.on('hand:offer', this.onOffer);
  }

  /**
   * `time`: seconds of simulated time (the loops, the embers and the bobbing
   * freeze with the match). `revealed`: its room is unlocked; in a locked one
   * it hides itself, as the darkness is under the actors it is sorted with.
   */
  sync(state: HandState, time: number, dt: number, revealed: boolean): void {
    const spot = this.map.handSpots[state.spot];
    const elapsed = phaseLength(state.phase) - state.timer;
    const fade = state.phase === 'away' ? 1 - clamp01(elapsed / FADE_TIME) : 1;
    if (!spot || fade <= 0 || !revealed) {
      if (this.crack.visible) [this.crack, this.hand, this.weapon].forEach((o) => o.setVisible(false));
      this.hideEmbers();
      this.shownSpot = -2;
      return;
    }
    if (state.spot !== this.shownSpot) {
      this.shownSpot = state.spot;
      this.crack.setPosition(spot.x, spot.y).setVisible(true);
      const depth = actorDepth(spot.y + 1);
      this.hand.setDepth(depth);
      // The embers rise behind the hand, sorted with the actors around the hole.
      for (const ember of this.embers) ember.setDepth(depth - 0.0001);
      this.weapon.setDepth(depth + 0.0001);
      this.flash.setDepth(depth + 0.0002);
    }
    this.syncHole(state.phase, elapsed, time, fade);
    this.syncHand(state, elapsed, spot.x, spot.y, time);
    this.syncFlash(spot.x, spot.y + GROUND - FLOAT_HEIGHT, dt);
    if (revealed && state.phase !== 'away') this.syncEmbers(spot.x, spot.y, time);
    else this.hideEmbers();
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

  private syncHole(phase: HandPhase, elapsed: number, time: number, alpha: number): void {
    const look = holeLook(phase, elapsed);
    const { crust, opening, fire } = this.frames;
    if (look.anim === 'crust') this.crack.setTexture(objectTextureKey(ASSET_KEYS.handCrack), Math.floor(time * CRUST_FPS) % crust);
    else if (look.anim === 'fire') this.crack.setTexture(objectTextureKey(ASSET_KEYS.handCrackOpen), Math.floor(time * FIRE_FPS) % fire);
    else this.crack.setTexture(objectTextureKey(ASSET_KEYS.handCrackOpening), Math.min(opening - 1, Math.floor(look.progress * opening)));
    this.crack.setAlpha(alpha);
  }

  private syncHand(state: HandState, elapsed: number, x: number, y: number, time: number): void {
    const { phase } = state;
    const ground = y + GROUND;
    const rise = handRise(phase, elapsed);
    if (rise <= 0) {
      this.hand.setVisible(false);
      this.weapon.setVisible(false);
      return;
    }
    // Tired: the obscene gesture, jabbing up (also while sinking back afterwards).
    const mocking = phase === 'mocking' || (phase === 'sinking' && state.mock);
    // Open with its palm glowing while it holds the weapon; it goes dark once taken (or when the draw gave nothing).
    const offer = state.taken ? null : state.offer;
    const holding = offer !== null;
    const pose = mocking ? MOCK : phase === 'rising' || phase === 'rolling' ? FIST : holding ? OFFER : EMPTY;
    const jab = phase === 'mocking' ? Math.round(JAB * Math.max(0, Math.sin(time * JAB_SPEED))) : 0;
    // Comes out of the floor: the part still under it is pushed down and cut off at the floor line.
    const sunk = Math.round((1 - rise) * this.hand.frame.height) + (phase === 'mocking' ? JAB - jab : 0);
    this.hand.setFrame(pose).setPosition(x, ground + sunk);
    cropAbove(this.hand, ground);

    let frame = -1;
    if (phase === 'rolling') {
      // Outlines switching faster at first, slower at the end; never the result itself.
      const step = Math.floor(ROLL_STEPS * Math.sqrt(Math.min(1, elapsed / HAND.rollingTime)));
      frame = (step * 7 + 3) % WEAPON_IDS.length;
    } else if ((phase === 'offering' || phase === 'sinking') && offer) {
      const blinking = phase === 'offering' && state.timer <= HAND.blinkTime && Math.floor(state.timer / BLINK_PERIOD) % 2 === 0;
      frame = blinking ? -1 : WEAPON_IDS.indexOf(offer);
    }
    if (frame < 0) {
      this.weapon.setVisible(false);
      return;
    }
    const bob = phase === 'offering' ? Math.round(Math.sin(time * 4) * BOB) : 0;
    const height = phase === 'rolling' ? ROLL_HEIGHT : FLOAT_HEIGHT;
    // The weapon goes down with the hand into the floor.
    this.weapon
      .setFrame(frame)
      .setPosition(x, ground - height + sunk + bob)
      .setAlpha(phase === 'rolling' ? 0.6 : 1);
    cropAbove(this.weapon, ground);
  }

  /** Embers rising from the hole, swaying and fading, each on its own phase of the cycle and with its own look. */
  private syncEmbers(x: number, y: number, time: number): void {
    this.embers.forEach((ember, i) => {
      const t = (time / EMBER_LIFE + i / EMBERS) % 1;
      const sway = Math.sin(i * 12.9898 + time * 2.3) * 5 * (1 - t * 0.4);
      ember
        .setVisible(true)
        .setPosition(Math.round(x + sway + ((i * 7) % 11) - 5), Math.round(y + GROUND - t * EMBER_RISE))
        .setAlpha(1 - t);
    });
  }

  private hideEmbers(): void {
    if (this.embers[0]?.visible) for (const ember of this.embers) ember.setVisible(false);
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

/** Shows only the part of `image` above the floor line `ground` (whole frame rows), hiding it when none is. */
function cropAbove(image: Phaser.GameObjects.Image, ground: number): void {
  const { width, height } = image.frame;
  const top = image.y - image.originY * height * image.scaleY;
  const rows = Math.min(height, Math.floor((ground - top) / image.scaleY));
  if (rows <= 0) {
    image.setVisible(false);
    return;
  }
  image.setVisible(true).setCrop(0, 0, width, rows);
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
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
    case 'away':
      return HAND.moveDelay;
    default:
      return 0;
  }
}
