import type Phaser from 'phaser';
import { WEAPONS } from '../../config/weapons';
import type { EventBus, GameEvents } from '../../core/EventBus';
import type { PlayerState } from '../../core/GameState';
import { degToRad } from '../../core/math';
import { ASSET_KEYS, objectTextureKey, type CharacterDef } from '../assets/manifest';
import { DEPTH } from '../depth';
import { muzzleOffset } from './muzzle';

/** Flames alive at once (pooled, CLAUDE.md rule 7); the oldest is reused when all are busy. */
const POOL_SIZE = 64;
/** The jet gives off a flame this often (s), each living this long (s) as it flies out to the weapon's range. */
const JET_INTERVAL = 0.018;
const JET_LIFE = 0.28;
/** A hellfire burst: this many flames flying out over its radius in BURST_LIFE s. */
const BURST_FLAMES = 14;
const BURST_LIFE = 0.35;
const FLICKER = 0.06;
const FRAMES = 3;

interface Flame {
  image: Phaser.GameObjects.Image;
  age: number;
  /** -1 when free. */
  life: number;
  vx: number;
  vy: number;
}

/**
 * The flamethrower's jet (spec 06 §2.3, placeholder): flames thrown from the
 * gun's muzzle in a fan over its cone, flying out to its range as they grow
 * and fade; and the flames of each hellfire burst ('fire:blast'), flying out
 * in a ring. Reuses the burn effect's flame frames. Render only: it reads
 * whether the player's jet is on, and freezes with the match (dt = 0).
 */
export class FlameJet {
  private readonly flames: Flame[];
  private readonly offset = { x: 0, y: 0 };
  private readonly unsubscribe: () => void;
  private next = 0;
  private spawnTimer = 0;
  private seed = 7;

  constructor(
    scene: Phaser.Scene,
    private readonly def: CharacterDef | undefined,
    events: EventBus,
  ) {
    this.flames = Array.from({ length: POOL_SIZE }, () => ({
      image: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.flame), 0).setDepth(DEPTH.bullets).setVisible(false),
      age: 0,
      life: -1,
      vx: 0,
      vy: 0,
    }));
    this.unsubscribe = events.on('fire:blast', this.onBlast);
  }

  update(player: PlayerState | undefined, dt: number): void {
    if (dt <= 0) return;
    if (player?.coneOn && player.hp > 0) {
      this.spawnTimer -= dt;
      while (this.spawnTimer <= 0) {
        this.spawnJet(player);
        this.spawnTimer += JET_INTERVAL;
      }
    } else {
      this.spawnTimer = 0;
    }
    for (const f of this.flames) {
      if (f.life < 0) continue;
      f.age += dt;
      if (f.age >= f.life) {
        f.life = -1;
        f.image.setVisible(false);
        continue;
      }
      const k = f.age / f.life;
      f.image
        .setPosition(f.image.x + f.vx * dt, f.image.y + f.vy * dt)
        .setAlpha(1 - k * k)
        .setScale(0.7 + k * 0.8)
        .setFrame(Math.floor(f.age / FLICKER + f.vx) % FRAMES);
    }
  }

  destroy(): void {
    this.unsubscribe();
  }

  private spawnJet(p: PlayerState): void {
    const weapon = WEAPONS.flamethrower;
    muzzleOffset(this.def, p.facing, this.offset);
    const half = degToRad(weapon.arc ?? 0) / 2;
    const angle = Math.atan2(p.aimY, p.aimX) + (this.random() * 2 - 1) * half;
    const speed = (weapon.range / JET_LIFE) * (0.75 + this.random() * 0.25);
    this.launch(p.x + this.offset.x, p.y + this.offset.y, angle, speed, JET_LIFE * (0.8 + this.random() * 0.2));
  }

  private readonly onBlast = (e: GameEvents['fire:blast']): void => {
    for (let i = 0; i < BURST_FLAMES; i++) {
      const angle = (i / BURST_FLAMES) * Math.PI * 2 + this.random() * 0.3;
      // A ring at about the zombie's waist, out to the burst's radius.
      this.launch(e.x, e.y - 12, angle, (40 / BURST_LIFE) * (0.7 + this.random() * 0.3), BURST_LIFE);
    }
  };

  private launch(x: number, y: number, angle: number, speed: number, life: number): void {
    const f = this.flames[this.next];
    if (!f) return;
    this.next = (this.next + 1) % this.flames.length;
    f.age = 0;
    f.life = life;
    f.vx = Math.cos(angle) * speed;
    f.vy = Math.sin(angle) * speed;
    f.image.setVisible(true).setPosition(x, y).setAlpha(1).setScale(0.7);
  }

  /** Look-only randomness (never the simulation's RNG). */
  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
