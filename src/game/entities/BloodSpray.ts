import type Phaser from 'phaser';
import { PLAYER } from '../../config/balance';
import type { EventBus, GameEvents } from '../../core/EventBus';
import { ASSET_KEYS, objectTextureKey } from '../assets/manifest';
import { actorDepth, DEPTH, overFogDepth } from '../depth';

/** Drops in the pool; the oldest is reused when they are all in use. */
const POOL_SIZE = 180;
/** Thick drops thrown along the shot, plus a few more on a kill. */
const DROPS = { min: 5, max: 8, extraOnKill: 5 } as const;
/** Spread of the spray around the shot's direction (radians) and its speed (px/s on the ground). */
const SPREAD = 0.6;
const SPEED = { min: 35, max: 105 } as const;
/** A drop or two thrown back towards the shooter, slower. */
const BACK_SPLASH = { count: 1, speed: 30 } as const;
/** Drops that just ooze and fall from the wound. */
const DRIPS = 2;
/** The player bleeds less than a shot zombie. */
const PLAYER_DROPS = { min: 4, max: 6 } as const;

/** Rotten zombie blood, or the player's fresh red blood. */
type BloodKind = 'rotten' | 'fresh';
const TEXTURES: Record<BloodKind, { drop: string; splat: string }> = {
  rotten: { drop: objectTextureKey(ASSET_KEYS.bloodDrop), splat: objectTextureKey(ASSET_KEYS.bloodSplat) },
  fresh: { drop: objectTextureKey(ASSET_KEYS.bloodDropFresh), splat: objectTextureKey(ASSET_KEYS.bloodSplatFresh) },
};
/** Upward speed when thrown (px/s), gravity (px/s²) and drag (viscous blood slows fast, per second). */
const LIFT = { min: 10, max: 50 } as const;
const GRAVITY = 320;
const DRAG = 3.2;
/** Above this speed a drop is drawn stretched along its way. */
const STRETCH_SPEED = 55;
/** A landed drop stays this long (s) and fades over the last part. */
const SPLAT_TIME = 2.6;
const SPLAT_FADE = 0.9;

const FRAME_ROUND = 0;
const FRAME_STRETCHED = 1;
const FRAME_SMALL = 2;
const SPLAT_FRAMES = 3;

interface Drop {
  img: Phaser.GameObjects.Image;
  active: boolean;
  landed: boolean;
  /** Ground position and height above it (px). */
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Seconds left once landed. */
  life: number;
  /** Over the darkness (a zombie at a window of the dark outside): no splat stays. */
  overFog: boolean;
  /** Drawn with the small drop frame. */
  small: boolean;
  kind: BloodKind;
}

const rand = (min: number, max: number): number => min + Math.random() * (max - min);

/**
 * Blood of a hit (zombie:hit): thick drops of rotten blood thrown along the
 * shot, one back towards the shooter and a couple oozing from the wound. A
 * hurt player (player:damaged) bleeds fresh red blood away from the blow.
 * They fly slowly (viscous), fall to the zombie's feet and leave small
 * splats that fade in a few seconds. Render only, pooled (CLAUDE.md rule 7);
 * cosmetic randomness is not part of the simulation.
 */
export class BloodSprayPool {
  private readonly drops: Drop[];
  private next = 0;
  private readonly unsubscribe: () => void;

  constructor(
    scene: Phaser.Scene,
    events: EventBus,
    private readonly isDark: (x: number, y: number) => boolean,
  ) {
    this.drops = Array.from({ length: POOL_SIZE }, () => ({
      img: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.bloodDrop), FRAME_ROUND).setVisible(false),
      active: false,
      landed: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      overFog: false,
      small: false,
      kind: 'rotten',
    }));
    const offHit = events.on('zombie:hit', this.onHit);
    const offHurt = events.on('player:damaged', this.onPlayerHurt);
    this.unsubscribe = () => {
      offHit();
      offHurt();
    };
  }

  /** Advances the drops by `dt` seconds (0 while paused). */
  update(dt: number): void {
    for (const d of this.drops) {
      if (!d.active) continue;
      if (dt > 0) this.step(d, dt);
      if (!d.active) continue;
      if (d.landed) continue;
      const speed = Math.hypot(d.vx, d.vy - d.vz);
      const stretched = speed > STRETCH_SPEED;
      d.img
        .setPosition(Math.round(d.x), Math.round(d.y - d.z))
        .setFrame(stretched ? FRAME_STRETCHED : d.small ? FRAME_SMALL : FRAME_ROUND)
        .setRotation(stretched ? Math.atan2(d.vy - d.vz, d.vx) : 0)
        .setDepth(d.overFog ? overFogDepth(d.y) + 0.0002 : actorDepth(d.y) + 0.0005);
    }
  }

  destroy(): void {
    this.unsubscribe();
  }

  private step(d: Drop, dt: number): void {
    if (d.landed) {
      d.life -= dt;
      if (d.life <= 0) {
        d.active = false;
        d.img.setVisible(false);
      } else if (d.life < SPLAT_FADE) {
        d.img.setAlpha((d.life / SPLAT_FADE) * 0.9);
      }
      return;
    }
    const drag = Math.exp(-DRAG * dt);
    d.vx *= drag;
    d.vy *= drag;
    d.vz -= GRAVITY * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    if (d.z > 0) return;
    // Landed: a small splat on the floor, under the actors.
    if (d.overFog) {
      d.active = false;
      d.img.setVisible(false);
      return;
    }
    d.landed = true;
    d.z = 0;
    d.life = SPLAT_TIME;
    d.img
      .setTexture(TEXTURES[d.kind].splat, Math.floor(Math.random() * SPLAT_FRAMES))
      .setRotation(0)
      .setFlip(Math.random() < 0.5, Math.random() < 0.5)
      .setPosition(Math.round(d.x), Math.round(d.y))
      .setDepth(DEPTH.decals + 0.01)
      .setAlpha(0.9);
  }

  private readonly onHit = (e: GameEvents['zombie:hit']): void => {
    const height = Math.max(2, e.groundY - e.y);
    const overFog = this.isDark(e.x, e.groundY);
    const angle = Math.atan2(e.dirY, e.dirX);
    const count = Math.round(rand(DROPS.min, DROPS.max)) + (e.killed ? DROPS.extraOnKill : 0);
    this.spray('rotten', e.x, e.groundY, height, angle, count, overFog);
  };

  /** The player's fresh blood, from the chest and away from what hit them. */
  private readonly onPlayerHurt = (e: GameEvents['player:damaged']): void => {
    const angle = Math.atan2(e.y - e.fromY, e.x - e.fromX);
    this.spray('fresh', e.x, e.y, PLAYER.chestHeight, angle, Math.round(rand(PLAYER_DROPS.min, PLAYER_DROPS.max)), false);
  };

  private spray(kind: BloodKind, x: number, groundY: number, height: number, angle: number, count: number, overFog: boolean): void {
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-SPREAD, SPREAD);
      const speed = rand(SPEED.min, SPEED.max);
      this.launch(kind, x, groundY, height, Math.cos(a) * speed, Math.sin(a) * speed, rand(LIFT.min, LIFT.max), i % 3 === 2, overFog);
    }
    for (let i = 0; i < BACK_SPLASH.count; i++) {
      const a = angle + Math.PI + rand(-SPREAD, SPREAD);
      this.launch(kind, x, groundY, height, Math.cos(a) * BACK_SPLASH.speed, Math.sin(a) * BACK_SPLASH.speed, rand(LIFT.min, LIFT.max), true, overFog);
    }
    for (let i = 0; i < DRIPS; i++) {
      this.launch(kind, x + rand(-3, 3), groundY, height * rand(0.5, 1), rand(-6, 6), rand(-2, 4), 0, false, overFog);
    }
  }

  private launch(kind: BloodKind, x: number, y: number, z: number, vx: number, vy: number, vz: number, small: boolean, overFog: boolean): void {
    const d = this.drops[this.next];
    this.next = (this.next + 1) % this.drops.length;
    if (!d) return;
    Object.assign(d, { active: true, landed: false, x, y, z, vx, vy, vz, life: 0, overFog, small, kind });
    d.img
      .setTexture(TEXTURES[kind].drop, small ? FRAME_SMALL : FRAME_ROUND)
      .setFlip(false, false)
      .setAlpha(1)
      .setRotation(0)
      .setPosition(Math.round(x), Math.round(y - z))
      .setVisible(true);
  }
}
