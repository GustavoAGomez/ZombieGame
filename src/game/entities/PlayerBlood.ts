import type Phaser from 'phaser';
import type { EventBus, GameEvents } from '../../core/EventBus';
import type { PlayerState } from '../../core/GameState';
import { ASSET_KEYS, characterTextureKey, objectTextureKey, type CharacterDef } from '../assets/manifest';
import { bodySpots, type Spot } from './bodySpots';

/** Stains a player can carry at once, and how many each blow adds. */
const MAX_STAINS = 10;
const STAINS_PER_HIT = { min: 1, max: 2 } as const;
/** Animations whose frames tell where the body always is. */
const BODY_ANIMATIONS = ['idle', 'walk', 'shoot', 'shoot_walk'] as const;
/** Back at full health, the stains fade out in this long (s). */
const CLEAN_FADE = 0.5;
const STAIN_FRAMES = 3;

interface Stain {
  img: Phaser.GameObjects.Image;
  active: boolean;
  /** Offset from the player's feet (the sprite's anchor). */
  dx: number;
  dy: number;
}

/**
 * Fresh blood stains on the local player (player:damaged): each blow leaves
 * one or two in random places of the body, up to MAX_STAINS, and they stay
 * until the player is back at full health, then fade out. The places come
 * from the character's own frames (bodySpots), so a stain never floats off
 * the silhouette. Render only.
 */
export class PlayerBloodStains {
  private readonly stains: Stain[];
  private readonly spots: Spot[];
  private readonly unsubscribe: () => void;
  /** Seconds left of the fade once back at full health; 0 when not fading. */
  private fading = 0;

  constructor(
    scene: Phaser.Scene,
    def: CharacterDef,
    events: EventBus,
    private readonly localPlayerId = 0,
  ) {
    this.spots = readBodySpots(scene, def);
    this.stains = Array.from({ length: MAX_STAINS }, () => ({
      img: scene.add.image(0, 0, objectTextureKey(ASSET_KEYS.bloodStain), 0).setVisible(false),
      active: false,
      dx: 0,
      dy: 0,
    }));
    this.unsubscribe = events.on('player:damaged', this.onDamaged);
  }

  /** Follows the player's sprite; clears the stains once at full health. `dt` is 0 while paused. */
  sync(player: PlayerState, sprite: Phaser.GameObjects.Sprite, dt: number): void {
    const alive = player.hp > 0;
    if (alive && player.hp >= player.maxHp && this.fading === 0 && this.stains.some((s) => s.active)) this.fading = CLEAN_FADE;
    if (this.fading > 0) {
      this.fading = Math.max(0, this.fading - dt);
      if (this.fading === 0) for (const s of this.stains) this.clear(s);
    }
    const alpha = this.fading > 0 ? this.fading / CLEAN_FADE : 1;
    for (const s of this.stains) {
      if (!s.active) continue;
      // Hidden on the death pose: the body lies differently.
      s.img
        .setVisible(alive)
        .setPosition(Math.round(sprite.x + s.dx), Math.round(sprite.y + s.dy))
        .setDepth(sprite.depth + 0.00005)
        .setAlpha(alpha);
    }
  }

  destroy(): void {
    this.unsubscribe();
  }

  private clear(s: Stain): void {
    s.active = false;
    s.img.setVisible(false);
  }

  private readonly onDamaged = (e: GameEvents['player:damaged']): void => {
    if (e.playerId !== this.localPlayerId || e.hp <= 0 || this.spots.length === 0) return;
    // Hurt again while the old stains were fading: they stay.
    this.fading = 0;
    const count = STAINS_PER_HIT.min + Math.floor(Math.random() * (STAINS_PER_HIT.max - STAINS_PER_HIT.min + 1));
    for (let i = 0; i < count; i++) {
      const free = this.stains.find((s) => !s.active);
      if (!free) return;
      const spot = this.spots[Math.floor(Math.random() * this.spots.length)];
      if (!spot) return;
      free.active = true;
      free.dx = spot.x;
      free.dy = spot.y;
      free.img
        .setFrame(Math.floor(Math.random() * STAIN_FRAMES))
        .setFlip(Math.random() < 0.5, false)
        .setAlpha(1);
    }
  };
}

/** Body spots of the character from the frames of its sheets (images or placeholder canvases). */
function readBodySpots(scene: Phaser.Scene, def: CharacterDef): Spot[] {
  const w = def.frameWidth;
  const h = def.frameHeight;
  const frames: Uint8ClampedArray[] = [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  for (const animation of BODY_ANIMATIONS) {
    if (!def.animations[animation]) continue;
    const key = characterTextureKey(ASSET_KEYS.player, animation);
    if (!scene.textures.exists(key)) continue;
    const source = scene.textures.get(key).getSourceImage() as CanvasImageSource & { width: number; height: number };
    canvas.width = source.width;
    canvas.height = source.height;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let fy = 0; fy + h <= canvas.height; fy += h) {
      for (let fx = 0; fx + w <= canvas.width; fx += w) {
        const alpha = new Uint8ClampedArray(w * h);
        let any = false;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const a = data[((fy + y) * canvas.width + fx + x) * 4 + 3] ?? 0;
            alpha[y * w + x] = a;
            if (a > 0) any = true;
          }
        }
        // Empty cells at the end of a sheet are not frames.
        if (any) frames.push(alpha);
      }
    }
  }
  return bodySpots(frames, w, h, def.anchor.x * w, def.anchor.y * h);
}
