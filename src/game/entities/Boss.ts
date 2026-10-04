import type Phaser from 'phaser';
import { BOSS, SIM } from '../../config/balance';
import { BOSS_VARIANTS, BOSSES } from '../../config/bosses';
import { COLORS } from '../../config/theme';
import { chargeWindup, leapAirTime, slamWindup, waveRadius } from '../systems/BossAttacks';
import type { BossState, PuddleState } from '../../core/GameState';
import { dir8FromAngle } from '../../core/math';
import {
  ASSET_KEYS,
  animationKey,
  bossCharacterKey,
  characterTextureKey,
  objectTextureKey,
  type AnimationDef,
  type BossAnimation,
  type CharacterDef,
  type Manifest,
} from '../assets/manifest';
import { actorDepth, DEPTH } from '../depth';
import { ARROW_EDGE_GAP, edgeArrow, type ViewEdges } from './Merchant';

/** The corpse fades out over its last this-many seconds. */
const CORPSE_FADE = 0.5;
/** The crack is the Demon's Hand's hole drawn twice as big (96×80 over its 3×3 tiles), its fire looping this fast. */
const CRACK_SCALE = 2;
const CRACK_FIRE_FPS = 10;
/** Of the warning, the part the crack takes to break open; the rest it burns open. */
const CRACK_OPENING_SHARE = 0.4;
/** Sinking, the crack takes this long (s) to break open again around it. */
const CRACK_REOPEN_TIME = 0.24;

/** How high (px) its leap arcs above the floor at the top. */
const LEAP_HEIGHT = 40;
/** Its fury's roar flashes red this often (s). */
const FURY_FLASH = 0.12;
const FURY_TINT = Number.parseInt(COLORS.redLow.slice(1), 16);

/** Seconds a boss has been in its phase (render only). */
function phaseElapsed(b: BossState, tick: number): number {
  return (tick - b.phaseTick) / SIM.hz;
}

/** What a boss's art shows: one of its animations and the frame of it. */
export interface BossFrame {
  animation: BossAnimation;
  frame: number;
}

/** A boss's animations as the manifest declares them (frames, fps and marks). */
export type BossArt = (animation: BossAnimation) => AnimationDef | undefined;

/**
 * The frame a boss shows (render only, from its state): standing or walking,
 * its roar and its fall, and each attack in step with its timers: the charge
 * winds up for as long as its windup lasts, the slam raises its mallet
 * until the blow and brings it down on it (the sheet's `hit` mark), the leap
 * is in the air until it lands (`air` to `land`) and lands after it.
 */
export function bossFrame(b: BossState, time: number, tick: number, art: BossArt): BossFrame {
  const elapsed = phaseElapsed(b, tick);
  const frames = (animation: BossAnimation): number => Math.max(1, art(animation)?.frames ?? 1);
  const fps = (animation: BossAnimation): number => art(animation)?.fps ?? 1;
  const mark = (animation: BossAnimation, name: string, fallback: number): number => art(animation)?.marks?.[name] ?? fallback;
  const loop = (animation: BossAnimation): BossFrame => ({ animation, frame: Math.floor(time * fps(animation)) % frames(animation) });
  const once = (animation: BossAnimation, t: number): BossFrame => ({ animation, frame: Math.min(frames(animation) - 1, Math.floor(t * fps(animation))) });
  // Frames [from, to) spread over progress p (0..1).
  const span = (animation: BossAnimation, from: number, to: number, p: number): BossFrame => ({
    animation,
    frame: from + Math.min(Math.max(0, to - from - 1), Math.floor(Math.min(1, Math.max(0, p)) * (to - from))),
  });
  const idle: BossFrame = { animation: 'idle', frame: 0 };

  if (b.phase === 'dead') return once('death', elapsed);
  if (b.phase === 'roaring') return span('roar', 0, frames('roar'), elapsed / BOSS.roarTime);
  if (b.phase === 'attacking') {
    const sinceBlow = (tick - b.blowTick) / SIM.hz;
    switch (b.attack) {
      case 'charge':
        if (b.stage === 'windup') return span('charge_windup', 0, frames('charge_windup'), elapsed / chargeWindup(b));
        if (b.stage === 'run') return loop('charge');
        if (b.stage === 'stunned') return loop('stunned');
        return idle;
      case 'slam': {
        // Each blow comes down in the frames after `hit`, at the sheet's pace; meanwhile the next one winds up.
        const total = frames('slam');
        const hit = mark('slam', 'hit', Math.floor(total / 2));
        const blowTime = (total - hit) / fps('slam');
        if (b.count > 0 && sinceBlow < blowTime) return span('slam', hit, total, sinceBlow / blowTime);
        return b.stage === 'windup' ? span('slam', 0, hit, elapsed / slamWindup(b)) : idle;
      }
      case 'leap': {
        const total = frames('leap');
        const land = mark('leap', 'land', Math.floor(total / 2));
        if (b.stage === 'air') return span('leap', mark('leap', 'air', 0), land, elapsed / leapAirTime(b));
        const landTime = (total - land) / fps('leap');
        if (b.count > 0 && sinceBlow < landTime) return span('leap', land, total, sinceBlow / landTime);
        return idle;
      }
      default:
        return idle;
    }
  }
  if (b.phase === 'walking' && b.moving) return loop('walk');
  return idle;
}

/** How much of its body is out of the floor (0 under it .. 1 all out): it climbs out, and sinks back in. */
export function bossRise(b: BossState, elapsed: number): number {
  switch (b.phase) {
    case 'warning':
      return 0;
    case 'emerging': {
      const t = Math.min(1, Math.max(0, elapsed / BOSS.emergeTime));
      return 1 - (1 - t) * (1 - t);
    }
    case 'sinking': {
      const t = Math.min(1, Math.max(0, elapsed / BOSS.sinkTime));
      return 1 - t * t;
    }
    default:
      return 1;
  }
}

/** Its crack: none, breaking open (`progress` 0..1 in the opening frames, backwards to close) or open with fire. */
export interface CrackLook {
  anim: 'none' | 'opening' | 'fire';
  progress: number;
}

export function bossCrackLook(b: BossState, elapsed: number): CrackLook {
  switch (b.phase) {
    case 'warning': {
      const p = elapsed / (BOSS.warningTime * CRACK_OPENING_SHARE);
      return p < 1 ? { anim: 'opening', progress: Math.max(0, p) } : { anim: 'fire', progress: 1 };
    }
    case 'emerging':
      return { anim: 'fire', progress: 1 };
    case 'roaring':
      // Out of it: the crack closes as it roars.
      return { anim: 'opening', progress: Math.max(0, 1 - elapsed / BOSS.roarTime) };
    case 'sinking': {
      const p = elapsed / CRACK_REOPEN_TIME;
      return p < 1 ? { anim: 'opening', progress: Math.max(0, p) } : { anim: 'fire', progress: 1 };
    }
    default:
      return { anim: 'none', progress: 0 };
  }
}

/**
 * The bosses on the map (spec 07 §8): one sprite per boss slot showing the
 * frame its state asks for (bossFrame), in the row it faces, tinted by its
 * variant, standing on its anchor at the bottom edge of its footprint and
 * y-sorted with the characters there. Hidden in the dark. Render only: it
 * reads the bosses' state.
 */
export class BossViewPool {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  private readonly cracks: Phaser.GameObjects.Image[];
  private readonly crackFrames: { opening: number; fire: number };
  private readonly anims: Phaser.Animations.AnimationManager;

  constructor(
    scene: Phaser.Scene,
    count: number,
    private readonly tileSize: number,
    private readonly manifest: Manifest,
  ) {
    this.anims = scene.anims;
    const def = this.character('butcher');
    this.sprites = Array.from({ length: count }, () =>
      scene.add
        .sprite(0, 0, characterTextureKey(bossCharacterKey('butcher'), 'idle'), 0)
        .setOrigin(def?.anchor.x ?? 0.5, def?.anchor.y ?? 1)
        .setVisible(false),
    );
    this.cracks = Array.from({ length: count }, () =>
      scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.handCrackOpen), 0).setScale(CRACK_SCALE).setDepth(DEPTH.decals).setVisible(false),
    );
    const frames = (key: string): number => Math.max(1, manifest.objects[key]?.frames ?? 1);
    this.crackFrames = { opening: frames(ASSET_KEYS.handCrackOpening), fire: frames(ASSET_KEYS.handCrackOpen) };
  }

  private character(boss: BossState['boss']): CharacterDef | undefined {
    return this.manifest.characters[bossCharacterKey(boss)];
  }

  /** `time`: simulated seconds (loops freeze with the match); `tick`: the match's tick (phase times). */
  sync(bosses: readonly BossState[], alpha: number, time: number, tick: number, isDark: (x: number, y: number) => boolean): void {
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const crack = this.cracks[i];
      const b = bosses[i];
      if (!sprite || !crack) continue;
      if (!b?.active) {
        if (sprite.visible) sprite.setVisible(false);
        if (crack.visible) crack.setVisible(false);
        continue;
      }
      const x = b.prevX + (b.x - b.prevX) * alpha;
      const y = b.prevY + (b.y - b.prevY) * alpha;
      const elapsed = phaseElapsed(b, tick);
      this.syncCrack(crack, bossCrackLook(b, elapsed), x, y, time, isDark(x, y));
      const rise = bossRise(b, elapsed);
      const def = this.character(b.boss);
      if (isDark(x, y) || rise <= 0 || !def) {
        if (sprite.visible) sprite.setVisible(false);
        continue;
      }
      const feet = y + (BOSSES[b.boss].footprintTiles * this.tileSize) / 2;
      const { animation, frame } = bossFrame(b, time, tick, (a) => def.animations[a]);
      if (!this.showFrame(sprite, bossCharacterKey(b.boss), animation, dir8FromAngle(b.facing), frame)) {
        if (sprite.visible) sprite.setVisible(false);
        continue;
      }
      const tint = BOSS_VARIANTS[b.variant].tint;
      if (tint) sprite.setTint(Number.parseInt(tint.slice(1), 16));
      else sprite.clearTint();
      // Its fury's roar (spec 07 §5): a red flash.
      if (b.phase === 'roaring' && b.enraged && Math.floor(elapsed / FURY_FLASH) % 2 === 0) sprite.setTint(FURY_TINT);
      // Coming out of the floor: the part still under it is pushed down and cut off at the floor line (its feet).
      const feetRow = Math.round(sprite.frame.height * def.anchor.y);
      const sunk = Math.round((1 - rise) * feetRow);
      if (sunk > 0) sprite.setCrop(0, 0, sprite.frame.width, feetRow - sunk);
      else if (sprite.isCropped) sprite.setCrop();
      // In the air on a leap it arcs up and down over its line.
      const t = b.stage === 'air' ? Math.min(1, Math.max(0, 1 - b.timer / leapAirTime(b))) : 0;
      const lift = Math.round(4 * LEAP_HEIGHT * t * (1 - t));
      sprite
        .setVisible(true)
        .setPosition(Math.round(x), Math.round(feet) + sunk - lift)
        .setAlpha(b.phase === 'dead' ? Math.min(1, b.timer / CORPSE_FADE) : 1)
        .setDepth(actorDepth(feet));
    }
  }

  /**
   * Shows frame `index` of a character's animation in the row for `dir8`,
   * through the animation AssetLibrary registered (so a missing sheet shows
   * its placeholder or the idle it falls back on). False if there is none.
   */
  private showFrame(sprite: Phaser.GameObjects.Sprite, character: string, animation: string, dir8: number, index: number): boolean {
    const frames = this.anims.get(animationKey(character, animation, dir8))?.frames;
    const frame = frames?.[Math.min(frames.length - 1, index)]?.frame;
    if (!frame) return false;
    if (sprite.texture.key !== frame.texture.key) sprite.setTexture(frame.texture.key, frame.name);
    else if (sprite.frame.name !== frame.name) sprite.setFrame(frame.name);
    return true;
  }

  private syncCrack(crack: Phaser.GameObjects.Image, look: CrackLook, x: number, y: number, time: number, dark: boolean): void {
    if (look.anim === 'none' || dark) {
      if (crack.visible) crack.setVisible(false);
      return;
    }
    const { opening, fire } = this.crackFrames;
    if (look.anim === 'fire') crack.setTexture(objectTextureKey(ASSET_KEYS.handCrackOpen), Math.floor(time * CRACK_FIRE_FPS) % fire);
    else crack.setTexture(objectTextureKey(ASSET_KEYS.handCrackOpening), Math.min(opening - 1, Math.floor(look.progress * opening)));
    crack.setVisible(true).setPosition(Math.round(x), Math.round(y));
  }
}

/**
 * A zone on the floor that a boss's blow is about to hit (spec 07 §4), with
 * how full it is (0..1, up to the blow): the charge's corridor (from the
 * front of its footprint, as wide as its body and as long as its run or up
 * to what will stop it), the slam's arc and the leap's landing circle.
 */
export type BossZone =
  | { kind: 'corridor'; x: number; y: number; dirX: number; dirY: number; length: number; width: number; fill: number }
  | { kind: 'arc'; x: number; y: number; angle: number; spread: number; radius: number; fill: number }
  | { kind: 'circle'; x: number; y: number; radius: number; fill: number };

/** The zone boss `b` is announcing now, or null. */
export function bossZone(b: BossState, tileSize: number): BossZone | null {
  if (b.phase !== 'attacking') return null;
  const def = BOSSES[b.boss];
  const fill = (total: number): number => Math.min(1, Math.max(0, 1 - b.timer / total));
  if (b.attack === 'charge' && b.stage === 'windup') {
    const half = (def.footprintTiles * tileSize) / 2;
    return {
      kind: 'corridor',
      x: b.x + b.aimX * half,
      y: b.y + b.aimY * half,
      dirX: b.aimX,
      dirY: b.aimY,
      // As far as it will get: a wall stops it short.
      length: Math.min(def.charge.distance, b.runLeft),
      width: def.charge.width,
      fill: fill(chargeWindup(b)),
    };
  }
  if (b.attack === 'slam' && b.stage === 'windup') {
    return { kind: 'arc', x: b.x, y: b.y, angle: Math.atan2(b.aimY, b.aimX), spread: (def.slam.arc * Math.PI) / 180, radius: def.slam.reach, fill: fill(slamWindup(b)) };
  }
  if (b.attack === 'leap' && b.stage === 'air') {
    return { kind: 'circle', x: b.targetX, y: b.targetY, radius: def.leap.landRadius, fill: fill(leapAirTime(b)) };
  }
  return null;
}

/** The warning zones drawn on the floor: red, see-through, filling up until the blow, with a firmer edge. */
const ZONE_COLOR = Number.parseInt(COLORS.red.slice(1), 16);
const ZONE_EDGE = Number.parseInt(COLORS.redLow.slice(1), 16);
/** The ring of a landing: orange like the fire, the band that hurts. */
const WAVE_COLOR = Number.parseInt(COLORS.fire.slice(1), 16);
/** The putrid boss's puddles: its sickly green, fading as they dry. */
const PUDDLE_COLOR = Number.parseInt((BOSS_VARIANTS.putrid.tint ?? COLORS.red).slice(1), 16);
/** A leaping boss's shadow on the floor, under where it is. */
const SHADOW_COLOR = Number.parseInt(COLORS.ink.slice(1), 16);
/** A puddle fades out over its last this-many seconds. */
const BOSS_PUDDLE_FADE = 1;
/** Points of the arc's outline. */
const ARC_STEPS = 16;

/**
 * The bosses' marks on the floor (spec 07 §4): the warning zones, the
 * rings of their landings, the shadow of one in the air and the putrid
 * boss's puddles. One Graphics
 * for all, over the floor and its decals, under the characters. Render only.
 */
export class BossZones {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly tileSize: number,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.decals + 0.5);
  }

  sync(bosses: readonly BossState[], puddles: readonly PuddleState[], alpha: number, isDark: (x: number, y: number) => boolean): void {
    const g = this.g;
    g.clear();
    for (const pd of puddles) {
      if (!pd.active || isDark(pd.x, pd.y)) continue;
      const fade = Math.min(1, pd.timer / BOSS_PUDDLE_FADE);
      g.fillStyle(PUDDLE_COLOR, 0.4 * fade).fillCircle(pd.x, pd.y, pd.radius);
      g.lineStyle(2, PUDDLE_COLOR, 0.8 * fade).strokeCircle(pd.x, pd.y, pd.radius);
    }
    for (const b of bosses) {
      if (!b.active || isDark(b.x, b.y)) continue;
      const zone = bossZone(b, this.tileSize);
      if (zone?.kind === 'corridor') this.drawCorridor(zone);
      else if (zone?.kind === 'arc') this.drawArc(zone);
      else if (zone?.kind === 'circle') this.drawCircle(zone);
      if (b.waveTime >= 0) this.drawWave(b);
      if (b.stage === 'air') {
        const x = b.prevX + (b.x - b.prevX) * alpha;
        const y = b.prevY + (b.y - b.prevY) * alpha + (BOSSES[b.boss].footprintTiles * this.tileSize) / 2 - 4;
        g.fillStyle(SHADOW_COLOR, 0.35).fillEllipse(x, y, 60, 18);
      }
    }
  }

  private zoneStyle(fill: number): void {
    this.g.fillStyle(ZONE_COLOR, 0.15 + 0.35 * fill).lineStyle(2, ZONE_EDGE, 0.5 + 0.4 * fill);
  }

  private drawCorridor(z: Extract<BossZone, { kind: 'corridor' }>): void {
    const nx = -z.dirY * (z.width / 2);
    const ny = z.dirX * (z.width / 2);
    const ex = z.x + z.dirX * z.length;
    const ey = z.y + z.dirY * z.length;
    const g = this.g;
    this.zoneStyle(z.fill);
    g.beginPath();
    g.moveTo(z.x + nx, z.y + ny);
    g.lineTo(ex + nx, ey + ny);
    g.lineTo(ex - nx, ey - ny);
    g.lineTo(z.x - nx, z.y - ny);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private drawArc(z: Extract<BossZone, { kind: 'arc' }>): void {
    const g = this.g;
    this.zoneStyle(z.fill);
    g.beginPath();
    g.moveTo(z.x, z.y);
    for (let i = 0; i <= ARC_STEPS; i++) {
      const a = z.angle - z.spread / 2 + (z.spread * i) / ARC_STEPS;
      g.lineTo(z.x + Math.cos(a) * z.radius, z.y + Math.sin(a) * z.radius);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private drawCircle(z: Extract<BossZone, { kind: 'circle' }>): void {
    this.zoneStyle(z.fill);
    this.g.fillCircle(z.x, z.y, z.radius).strokeCircle(z.x, z.y, z.radius);
  }

  /** The ring that hurts: its band, fading as it reaches its full size. */
  private drawWave(b: BossState): void {
    const leap = BOSSES[b.boss].leap;
    const outer = waveRadius(b, b.waveTime);
    const width = Math.min(leap.waveWidth, outer);
    if (width <= 0) return;
    const fade = 1 - outer / leap.waveRadius;
    this.g.lineStyle(width, WAVE_COLOR, 0.35 + 0.4 * fade).strokeCircle(b.waveX, b.waveY, outer - width / 2);
  }
}

/** The arrow towards a boss out of view: red, like its bar. */
const BOSS_ARROW_TINT = Number.parseInt(COLORS.red.slice(1), 16);

/**
 * An arrow at the screen edge towards each boss out of view (spec 07 §6),
 * with the merchants' arrows (Merchant.ts): while it is alive, crack and
 * all, and on the level the camera shows. Render only.
 */
export class BossArrows {
  private readonly arrows: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene, count: number) {
    this.arrows = Array.from({ length: count }, () =>
      scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.offscreenArrow)).setTint(BOSS_ARROW_TINT).setDepth(DEPTH.indicators).setVisible(false),
    );
  }

  /** `edges`: the visible world and its safe inset; `sameLevel(x, y)`: that point is on the level the camera shows. */
  sync(bosses: readonly BossState[], edges: ViewEdges, worldPerCssPx: number, sameLevel: (x: number, y: number) => boolean): void {
    const gap = ARROW_EDGE_GAP * worldPerCssPx;
    const inset: ViewEdges = { ...edges, insetX: edges.insetX + gap, insetTop: edges.insetTop + gap, insetBottom: edges.insetBottom + gap };
    for (let i = 0; i < this.arrows.length; i++) {
      const arrow = this.arrows[i];
      const b = bosses[i];
      if (!arrow) continue;
      const at = b?.active && b.phase !== 'dead' && sameLevel(b.x, b.y) ? edgeArrow(inset, b.x, b.y, 16) : null;
      if (!at) {
        if (arrow.visible) arrow.setVisible(false);
        continue;
      }
      const half = arrow.width / 2;
      arrow
        .setVisible(true)
        .setPosition(Math.round(at.x - Math.cos(at.angle) * half), Math.round(at.y - Math.sin(at.angle) * half))
        .setRotation(at.angle);
    }
  }
}
