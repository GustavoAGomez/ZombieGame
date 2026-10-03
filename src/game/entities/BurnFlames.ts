import type Phaser from 'phaser';
import type { ZombieState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey, type Manifest } from '../assets/manifest';
import { actorDepth } from '../depth';
import { hurtboxOf } from '../systems/shotGeometry';

/** Flames alive at once (pooled, CLAUDE.md rule 7); the oldest is reused when all are busy. */
const POOL_SIZE = 72;
/** A burning zombie gives off a flame this often (s). */
const SPAWN_INTERVAL = 0.07;
/** Seconds a flame lives, how fast it rises (px/s) and how often it changes shape (s). */
const LIFE = 0.45;
const RISE = 22;
const FLICKER = 0.09;
/** One in this many is an ember spark (the Demon's Hand's, `hand_ember`): it rises faster and higher, and lives longer. */
const EMBER_EVERY = 4;
const EMBER_RISE = 40;
const EMBER_LIFE = 1.6;

interface Flame {
  image: Phaser.GameObjects.Image;
  age: number;
  /** -1 when free. */
  life: number;
  sway: number;
  /** An ember spark: it keeps its look and size, and only fades. */
  ember: boolean;
}

/**
 * Small flames rising off burning zombies (the burn effect, spec 04 §1):
 * they start somewhere on the drawn body, rise, flicker and fade, with
 * ember sparks (the Demon's Hand's) flying up among them. Render only: it
 * reads each zombie's burn state, and freezes with the match (the scene
 * passes dt = 0 when paused).
 */
export class BurnFlames {
  private readonly flames: Flame[];
  private readonly spawnTimers: number[];
  private readonly flameFrames: number;
  private readonly emberFrames: number;
  private next = 0;
  private spawned = 0;
  private seed = 1;

  constructor(scene: Phaser.Scene, zombieCount: number, manifest: Manifest) {
    this.flameFrames = Math.max(1, manifest.objects[ASSET_KEYS.flame]?.frames ?? 1);
    this.emberFrames = Math.max(1, manifest.objects[ASSET_KEYS.handEmber]?.frames ?? 1);
    this.flames = Array.from({ length: POOL_SIZE }, () => ({
      image: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.flame), 0).setOrigin(0.5, 1).setVisible(false),
      age: 0,
      life: -1,
      sway: 0,
      ember: false,
    }));
    this.spawnTimers = new Array<number>(zombieCount).fill(0);
  }

  /** `shown(i)`: zombie i is drawn (not hidden in the dark), so its flames show too. */
  update(zombies: readonly ZombieState[], dt: number, shown: (index: number) => boolean): void {
    if (dt <= 0) return;
    for (let i = 0; i < zombies.length; i++) {
      const z = zombies[i];
      if (!z?.active || z.burn.timer <= 0 || z.hp <= 0 || !shown(i)) {
        this.spawnTimers[i] = 0;
        continue;
      }
      let t = (this.spawnTimers[i] ?? 0) - dt;
      while (t <= 0) {
        this.spawn(z);
        t += SPAWN_INTERVAL;
      }
      this.spawnTimers[i] = t;
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
      f.image.setPosition(f.image.x + f.sway * dt, f.image.y - (f.ember ? EMBER_RISE : RISE) * dt).setAlpha(1 - k * k);
      if (!f.ember) f.image.setScale(1 - k * 0.4).setFrame(Math.floor(f.age / FLICKER + f.sway) % this.flameFrames);
    }
  }

  private spawn(z: ZombieState): void {
    const f = this.flames[this.next];
    if (!f) return;
    this.next = (this.next + 1) % this.flames.length;
    const box = hurtboxOf(z);
    const x = z.x + (this.random() - 0.5) * box.width * 0.7;
    const y = z.y - 2 - this.random() * box.height * 0.8;
    f.ember = ++this.spawned % EMBER_EVERY === 0;
    f.age = 0;
    f.life = LIFE * (0.7 + this.random() * 0.6) * (f.ember ? EMBER_LIFE : 1);
    f.sway = (this.random() - 0.5) * (f.ember ? 20 : 12);
    if (f.ember) f.image.setTexture(objectTextureKey(ASSET_KEYS.handEmber), Math.floor(this.random() * this.emberFrames));
    else f.image.setTexture(objectTextureKey(ASSET_KEYS.flame), 0);
    // In front of its zombie, sorted with the other actors.
    f.image.setVisible(true).setPosition(x, y).setAlpha(1).setScale(1).setDepth(actorDepth(z.y) + 0.0005);
  }

  /** Look-only randomness (never the simulation's RNG). */
  private random(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return this.seed / 2147483647;
  }
}
