import type Phaser from 'phaser';
import { WEAPONS } from '../../config/weapons';
import type { PlayerState } from '../../core/GameState';
import { dir8FromAngle, lerp } from '../../core/math';
import { ASSET_KEYS, animationKey, characterTextureKey, type CharacterDef } from '../assets/manifest';
import { actorDepth } from '../depth';

/** `melee` is optional in the manifest: without it, the provisional slash effect (MeleeSlash) is drawn instead. */
export type PlayerAnimation = 'idle' | 'walk' | 'shoot' | 'shoot_walk' | 'dash' | 'death' | 'melee';

/** Slowest pace of the movement animations, as a fraction of their frame rate. */
const MIN_MOVE_TIME_SCALE = 0.5;
/** Simulation ticks a shot's recoil takes to settle (5 at 60 Hz ≈ 80 ms). */
const RECOIL_TICKS = 5;

/** Player sprite. Reads PlayerState every frame and holds no game logic. */
export class PlayerView {
  readonly sprite: Phaser.GameObjects.Sprite;
  private playingKey = '';
  private playingAnimation: PlayerAnimation | '' = '';
  private reversed = false;
  private readonly hasShootWalk: boolean;
  private readonly hasMelee: boolean;
  private shownMeleeTick = -1;

  constructor(scene: Phaser.Scene, def: CharacterDef) {
    this.sprite = scene.add
      .sprite(0, 0, characterTextureKey(ASSET_KEYS.player, 'idle'), 0)
      .setOrigin(def.anchor.x, def.anchor.y);
    this.hasShootWalk = def.animations.shoot_walk !== undefined;
    this.hasMelee = def.animations.melee !== undefined;
  }

  /** `tick` is the current simulation tick, for the recoil of weapons that kick (the shotgun). */
  sync(player: PlayerState, alpha: number, tick = -1): void {
    const x = lerp(player.prevX, player.x, alpha);
    const y = lerp(player.prevY, player.y, alpha);
    const kick = recoilOffset(player, tick);
    this.sprite.setPosition(x - player.aimX * kick, y - player.aimY * kick).setDepth(actorDepth(y));

    const animation = pickAnimation(player, this.hasShootWalk, this.hasMelee);
    // Retreating while shooting plays the walk cycle backwards.
    const reversed = animation === 'shoot_walk' && isMovingBackwards(player);
    const key = animationKey(ASSET_KEYS.player, animation, dir8FromAngle(player.facing));
    const anims = this.sprite.anims;

    // Every knife slash plays its animation from the start, even two in a row.
    const newSlash = animation === 'melee' && player.meleeTick !== this.shownMeleeTick;
    if (newSlash) this.shownMeleeTick = player.meleeTick;
    if (key !== this.playingKey || newSlash) {
      // Turning keeps the step of the cycle instead of restarting it.
      const progress = animation === this.playingAnimation && !newSlash ? anims.getProgress() : 0;
      this.playingKey = key;
      this.playingAnimation = animation;
      this.reversed = reversed;
      if (reversed) this.sprite.playReverse(key);
      else this.sprite.play(key);
      if (progress > 0) anims.setProgress(progress);
    } else if (reversed !== this.reversed) {
      this.reversed = reversed;
      anims.reverse();
    }

    // Movement cycles follow the analog speed so a slow step does not look like sliding.
    const moving = animation === 'walk' || animation === 'shoot_walk';
    const timeScale = moving ? Math.max(MIN_MOVE_TIME_SCALE, player.moveFactor) : 1;
    if (anims.timeScale !== timeScale) anims.timeScale = timeScale;
  }
}

/** How far back (px) the last shot still pushes the drawn player: the weapon's recoil, easing out. */
export function recoilOffset(p: PlayerState, tick: number): number {
  const weapon = p.weapons[p.activeSlot];
  const recoil = weapon ? (WEAPONS[weapon.id].recoil ?? 0) : 0;
  const age = tick - p.lastShotTick;
  if (recoil <= 0 || tick < 0 || age < 0 || age >= RECOIL_TICKS || p.hp <= 0) return 0;
  return recoil * (1 - age / RECOIL_TICKS);
}

export function pickAnimation(p: PlayerState, hasShootWalk = true, hasMelee = false): PlayerAnimation {
  if (p.hp <= 0) return 'death';
  if (p.dashTimer > 0) return 'dash';
  if (p.meleeTimer > 0 && hasMelee) return 'melee';
  if (p.moving && p.firing) return hasShootWalk ? 'shoot_walk' : 'walk';
  if (p.moving) return 'walk';
  if (p.firing) return 'shoot';
  return 'idle';
}

/** True when the last move goes against the facing (the aim while shooting). */
export function isMovingBackwards(p: PlayerState): boolean {
  return p.moveX * Math.cos(p.facing) + p.moveY * Math.sin(p.facing) < 0;
}
