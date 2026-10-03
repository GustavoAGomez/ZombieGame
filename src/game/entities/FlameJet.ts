import type Phaser from 'phaser';
import { WEAPONS } from '../../config/weapons';
import type { EventBus, GameEvents } from '../../core/EventBus';
import type { PlayerState } from '../../core/GameState';
import { degToRad } from '../../core/math';
import { ASSET_KEYS, objectTextureKey, type CharacterDef, type Manifest } from '../assets/manifest';
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
/** One particle in this many is an ember spark (the Demon's Hand's, `hand_ember`) instead of a flame; it lives longer. */
const EMBER_EVERY = 4;
const EMBER_LIFE = 1.4;

interface Flame {
  image: Phaser.GameObjects.Image;
  age: number;
  /** -1 when free. */
  life: number;
  vx: number;
  vy: number;
  /** An ember spark: it keeps its look and size, and only fades. */
  ember: boolean;
}

/**
 * The flamethrower's jet (spec 06 §2.3): flames thrown from the gun's
 * muzzle in a fan over its cone, flying out to its range as they grow and
 * fade, with ember sparks among them; and the flames and sparks of each
 * hellfire burst ('fire:blast'), flying out in a ring. The same flames as
 * the burn effect and the same sparks as the Demon's Hand. Render only: it
 * reads whether the player's jet is on, and freezes with the match (dt = 0).
 */
export class FlameJet {
  private readonly flames: Flame[];
  private readonly offset = { x: 0, y: 0 };
  private readonly unsubscribe: () => void;
  private readonly flameFrames: number;
  private readonly emberFrames: number;
  private next = 0;
  private launched = 0;
  private spawnTimer = 0;
  private seed = 7;

  constructor(
    scene: Phaser.Scene,
    private readonly def: CharacterDef | undefined,
    events: EventBus,
    manifest: Manifest,
  ) {
    this.flameFrames = Math.max(1, manifest.objects[ASSET_KEYS.flame]?.frames ?? 1);
    this.emberFrames = Math.max(1, manifest.objects[ASSET_KEYS.handEmber]?.frames ?? 1);
    this.flames = Array.from({ length: POOL_SIZE }, () => ({
      image: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.flame), 0).setDepth(DEPTH.bullets).setVisible(false),
      age: 0,
      life: -1,
      vx: 0,
      vy: 0,
      ember: false,
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
      f.image.setPosition(f.image.x + f.vx * dt, f.image.y + f.vy * dt).setAlpha(1 - k * k);
      if (!f.ember) f.image.setScale(0.7 + k * 0.8).setFrame(Math.floor(f.age / FLICKER + f.vx) % this.flameFrames);
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
    // Every EMBER_EVERY-th one is a spark: slower, flying on past the flames and lasting longer.
    f.ember = ++this.launched % EMBER_EVERY === 0;
    const slow = f.ember ? 0.5 : 1;
    f.age = 0;
    f.life = f.ember ? life * EMBER_LIFE : life;
    f.vx = Math.cos(angle) * speed * slow;
    f.vy = Math.sin(angle) * speed * slow;
    if (f.ember) f.image.setTexture(objectTextureKey(ASSET_KEYS.handEmber), Math.floor(this.random() * this.emberFrames)).setScale(1);
    else f.image.setTexture(objectTextureKey(ASSET_KEYS.flame), 0).setScale(0.7);
    f.image.setVisible(true).setPosition(x, y).setAlpha(1);
  }

  /** Look-only randomness (never the simulation's RNG). */
  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
