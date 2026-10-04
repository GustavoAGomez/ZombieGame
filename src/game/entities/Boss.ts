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
/** How high (px) above the floor it falls from, and jumps up to: out of view. */
const SKY_HEIGHT = 360;

/** How high (px) its leap arcs above the floor at the top. */
const LEAP_HEIGHT = 40;
/** Its fury's roar flashes red this often (s). */
const FURY_FLASH = 0.12;
const FURY_TINT = Number.parseInt(COLORS.redLow.slice(1), 16);
/**
 * Stunned against a wall (petición del usuario), stars circle over its head:
 * this many, on a flat ellipse of these radii (px) this high over its feet,
 * going round this fast (rad/s).
 */
const STUN_STARS = 3;
const STAR_ORBIT = { rx: 22, ry: 6, height: 120, speed: 4 } as const;
const STAR_COLOR = Number.parseInt(COLORS.amber.slice(1), 16);
const STAR_OUTLINE = Number.parseInt(COLORS.ink.slice(1), 16);

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
  // Falling from the sky it is in the air of its leap; jumping up into it, crouching and taking off first.
  if (b.phase === 'falling') return span('leap', mark('leap', 'air', 0), mark('leap', 'land', frames('leap')), elapsed / BOSS.fallTime);
  if (b.phase === 'rising') return span('leap', 0, mark('leap', 'land', frames('leap')), elapsed / BOSS.riseTime);
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

/**
 * How high (px) above the floor it is (render only): falling from the sky,
 * faster and faster, and jumping back up into it; null while it is still up
 * there (its circle filling).
 */
export function bossHeight(b: BossState, elapsed: number): number | null {
  switch (b.phase) {
    case 'warning':
      return null;
    case 'falling': {
      const t = Math.min(1, Math.max(0, elapsed / BOSS.fallTime));
      return SKY_HEIGHT * (1 - t * t);
    }
    case 'rising': {
      const t = Math.min(1, Math.max(0, elapsed / BOSS.riseTime));
      return SKY_HEIGHT * t * t;
    }
    default:
      return 0;
  }
}

/**
 * Size of its shadow on the floor (0 none .. 1 as big as its body): it grows
 * while its circle fills and as it falls, is whole in the air on a leap,
 * and shrinks as it jumps away. 0 when it stands on the floor.
 */
export function bossShadow(b: BossState): number {
  const done = (total: number): number => Math.min(1, Math.max(0, 1 - b.timer / total));
  switch (b.phase) {
    case 'warning':
      return 0.15 + 0.35 * done(BOSS.warningTime);
    case 'falling':
      return 0.5 + 0.5 * done(BOSS.fallTime);
    case 'rising':
      return 1 - done(BOSS.riseTime);
    default:
      return b.stage === 'air' ? 1 : 0;
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
  private readonly stars: Phaser.GameObjects.Graphics[];
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
    this.stars = Array.from({ length: count }, () => scene.add.graphics().setVisible(false));
  }

  private character(boss: BossState['boss']): CharacterDef | undefined {
    return this.manifest.characters[bossCharacterKey(boss)];
  }

  /** `time`: simulated seconds (loops freeze with the match); `tick`: the match's tick (phase times). */
  sync(bosses: readonly BossState[], alpha: number, time: number, tick: number, isDark: (x: number, y: number) => boolean): void {
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const stars = this.stars[i];
      const b = bosses[i];
      if (!sprite || !stars) continue;
      if (stars.visible) stars.clear().setVisible(false);
      if (!b?.active) {
        if (sprite.visible) sprite.setVisible(false);
        continue;
      }
      const x = b.prevX + (b.x - b.prevX) * alpha;
      const y = b.prevY + (b.y - b.prevY) * alpha;
      const elapsed = phaseElapsed(b, tick);
      const height = bossHeight(b, elapsed);
      const def = this.character(b.boss);
      if (isDark(x, y) || height === null || !def) {
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
      // In the air on a leap it arcs up and down over its line; coming in, it falls from the sky.
      const t = b.stage === 'air' ? Math.min(1, Math.max(0, 1 - b.timer / leapAirTime(b))) : 0;
      const lift = Math.round(4 * LEAP_HEIGHT * t * (1 - t) + height);
      sprite
        .setVisible(true)
        .setPosition(Math.round(x), Math.round(feet) - lift)
        .setAlpha(b.phase === 'dead' ? Math.min(1, b.timer / CORPSE_FADE) : 1)
        .setDepth(actorDepth(feet));
      if (b.phase === 'attacking' && b.stage === 'stunned') this.drawStars(stars, Math.round(x), Math.round(feet) - STAR_ORBIT.height, time, actorDepth(feet));
    }
  }

  /** Its stars going round over its head, centred at (x, y): the ones behind it smaller. */
  private drawStars(g: Phaser.GameObjects.Graphics, x: number, y: number, time: number, depth: number): void {
    g.setVisible(true).setDepth(depth + 0.0001);
    for (let k = 0; k < STUN_STARS; k++) {
      const a = time * STAR_ORBIT.speed + (k * Math.PI * 2) / STUN_STARS;
      const sx = Math.round(x + Math.cos(a) * STAR_ORBIT.rx);
      const sy = Math.round(y + Math.sin(a) * STAR_ORBIT.ry);
      // A pixel plus with a dark outline: arms of 2 px in front, 1 px behind.
      const arm = Math.sin(a) >= 0 ? 2 : 1;
      g.fillStyle(STAR_OUTLINE, 1);
      g.fillRect(sx - arm - 1, sy - 1, arm * 2 + 3, 3);
      g.fillRect(sx - 1, sy - arm - 1, 3, arm * 2 + 3);
      g.fillStyle(STAR_COLOR, 1);
      g.fillRect(sx - arm, sy, arm * 2 + 1, 1);
      g.fillRect(sx, sy - arm, 1, arm * 2 + 1);
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
}

/** The ring of a landing: orange like the fire, the band that hurts. */
const WAVE_COLOR = Number.parseInt(COLORS.fire.slice(1), 16);
/** A boss's shadow on the floor under it while it is in the air (bossShadow). */
const SHADOW_COLOR = Number.parseInt(COLORS.ink.slice(1), 16);

/**
 * The bosses' marks on the floor (spec 07 §4): the rings of their landings
 * and the shadow of one in the air or coming in. No warning zones: the user
 * asked for them to go; its windups announce its blows. One Graphics for
 * all, over the floor and its decals, under the characters. Render only.
 */
export class BossMarks {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly tileSize: number,
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH.decals + 0.5);
  }

  sync(bosses: readonly BossState[], alpha: number, isDark: (x: number, y: number) => boolean): void {
    const g = this.g;
    g.clear();
    for (const b of bosses) {
      if (!b.active || isDark(b.x, b.y)) continue;
      if (b.waveTime >= 0) this.drawWave(b);
      const shadow = bossShadow(b);
      if (shadow > 0) {
        const x = b.prevX + (b.x - b.prevX) * alpha;
        const y = b.prevY + (b.y - b.prevY) * alpha + (BOSSES[b.boss].footprintTiles * this.tileSize) / 2 - 4;
        g.fillStyle(SHADOW_COLOR, 0.35).fillEllipse(x, y, 60 * shadow, 18 * shadow);
      }
    }
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

/** A puddle fades out over its last this-many seconds. */
const PUDDLE_FADE = 1;
/** Its bubbling loops this fast. */
const PUDDLE_FPS = 8;

/**
 * The putrid boss's acid puddles (spec 07 §1): one bubbling sprite per
 * puddle of the pool, as big as the puddle (the art is drawn for a landing's;
 * the charge's trail shows it smaller), each mirrored and out of step with
 * the rest so a trail does not repeat, fading out as it dries. On the floor,
 * under the warning zones. Render only.
 */
export class BossPuddles {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  private readonly frames: number;
  private readonly size: number;

  constructor(scene: Phaser.Scene, count: number, manifest: Manifest) {
    const def = manifest.objects[ASSET_KEYS.bossPuddle];
    this.frames = Math.max(1, def?.frames ?? 1);
    this.size = def?.frameWidth ?? 88;
    this.sprites = Array.from({ length: count }, (_, i) =>
      scene.add
        .sprite(0, 0, objectTextureKey(ASSET_KEYS.bossPuddle), 0)
        .setDepth(DEPTH.decals + 0.25)
        .setFlip(i % 2 === 1, i % 4 >= 2)
        .setVisible(false),
    );
  }

  /** `time`: simulated seconds (the bubbling freezes with the match). */
  sync(puddles: readonly PuddleState[], time: number, isDark: (x: number, y: number) => boolean): void {
    for (let i = 0; i < this.sprites.length; i++) {
      const sprite = this.sprites[i];
      const pd = puddles[i];
      if (!sprite) continue;
      if (!pd?.active || isDark(pd.x, pd.y)) {
        if (sprite.visible) sprite.setVisible(false);
        continue;
      }
      sprite
        .setVisible(true)
        .setPosition(Math.round(pd.x), Math.round(pd.y))
        .setScale((pd.radius * 2) / this.size)
        .setFrame((Math.floor(time * PUDDLE_FPS) + i * 2) % this.frames)
        .setAlpha(Math.min(1, pd.timer / PUDDLE_FADE));
    }
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
