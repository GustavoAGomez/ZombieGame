import type Phaser from 'phaser';
import { BOSS, SIM } from '../../config/balance';
import { BOSS_VARIANTS, BOSSES } from '../../config/bosses';
import type { BossState } from '../../core/GameState';
import { ASSET_KEYS, BOSS_POSES, bossTextureKey, objectTextureKey, type BossPose, type Manifest } from '../assets/manifest';
import { actorDepth, DEPTH } from '../depth';

/** Its walk swaps feet this often (s). */
const STEP_TIME = 0.28;
/** The corpse fades out over its last this-many seconds. */
const CORPSE_FADE = 0.5;
/** The crack is the Demon's Hand's hole drawn twice as big (96×80 over its 3×3 tiles), its fire looping this fast. */
const CRACK_SCALE = 2;
const CRACK_FIRE_FPS = 10;
/** Of the warning, the part the crack takes to break open; the rest it burns open. */
const CRACK_OPENING_SHARE = 0.4;
/** Sinking, the crack takes this long (s) to break open again around it. */
const CRACK_REOPEN_TIME = 0.24;

/** Seconds a boss has been in its phase (render only). */
function phaseElapsed(b: BossState, tick: number): number {
  return (tick - b.phaseTick) / SIM.hz;
}

/** The pose a boss shows (render only): its walk, still or stepping, its roar and its corpse. */
export function bossPose(b: BossState, time: number): BossPose {
  if (b.phase === 'dead') return 'dead';
  if (b.phase === 'roaring') return 'roar';
  if (!b.moving) return 'walk_a';
  return Math.floor(time / STEP_TIME) % 2 === 0 ? 'walk_a' : 'walk_b';
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
 * The bosses on the map (spec 07 §8): one sprite per boss slot, its pose
 * for what it is doing, tinted by its variant, standing on the bottom edge
 * of its footprint and y-sorted with the characters there; mirrored when
 * it faces west. Hidden in the dark. Render only: it reads the bosses' state.
 */
export class BossViewPool {
  private readonly sprites: Phaser.GameObjects.Sprite[];
  private readonly cracks: Phaser.GameObjects.Image[];
  private readonly crackFrames: { opening: number; fire: number };

  constructor(
    scene: Phaser.Scene,
    count: number,
    private readonly tileSize: number,
    manifest: Manifest,
  ) {
    this.sprites = Array.from({ length: count }, () =>
      scene.add.sprite(0, 0, objectTextureKey(bossTextureKey('butcher')), 0).setOrigin(0.5, 1).setVisible(false),
    );
    this.cracks = Array.from({ length: count }, () =>
      scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.handCrackOpen), 0).setScale(CRACK_SCALE).setDepth(DEPTH.decals).setVisible(false),
    );
    const frames = (key: string): number => Math.max(1, manifest.objects[key]?.frames ?? 1);
    this.crackFrames = { opening: frames(ASSET_KEYS.handCrackOpening), fire: frames(ASSET_KEYS.handCrackOpen) };
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
      if (isDark(x, y) || rise <= 0) {
        if (sprite.visible) sprite.setVisible(false);
        continue;
      }
      const feet = y + (BOSSES[b.boss].footprintTiles * this.tileSize) / 2;
      const key = objectTextureKey(bossTextureKey(b.boss));
      if (sprite.texture.key !== key) sprite.setTexture(key);
      const tint = BOSS_VARIANTS[b.variant].tint;
      if (tint) sprite.setTint(Number.parseInt(tint.slice(1), 16));
      else sprite.clearTint();
      sprite.setVisible(true).setFrame(BOSS_POSES.indexOf(bossPose(b, time)));
      // Coming out of the floor: the part still under it is pushed down and cut off at the floor line.
      const height = sprite.frame.height;
      const sunk = Math.round((1 - rise) * height);
      if (sunk > 0) sprite.setCrop(0, 0, sprite.frame.width, height - sunk);
      else if (sprite.isCropped) sprite.setCrop();
      sprite
        .setPosition(Math.round(x), Math.round(feet) + sunk)
        .setFlipX(Math.cos(b.facing) < -0.2)
        .setAlpha(b.phase === 'dead' ? Math.min(1, b.timer / CORPSE_FADE) : 1)
        .setDepth(actorDepth(feet));
    }
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
