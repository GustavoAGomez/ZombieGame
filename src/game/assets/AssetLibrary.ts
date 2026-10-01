import type Phaser from 'phaser';
import { parseMap, type MapData } from '../map/MapLoader';
import {
  ASSET_KEYS,
  ASSETS_BASE_URL,
  animationKey,
  characterTextureKey,
  directionRow,
  isAnimationPlaceholder,
  mapCacheKey,
  objectTextureKey,
  tilesetTextureKey,
  type Manifest,
} from './manifest';
import { createCharacterPlaceholder, createObjectPlaceholder, createTilesetPlaceholder } from './placeholders';

/**
 * Loads everything the manifest declares. Missing or placeholder assets are
 * replaced by generated rectangles of the declared size (CLAUDE.md rule 5).
 */
export class AssetLibrary {
  private readonly failed = new Set<string>();
  private readonly maps = new Map<string, MapData>();
  /** Character texture key → animation whose frames it borrows (e.g. 'idle'). */
  private readonly fallbacks = new Map<string, string>();

  constructor(readonly manifest: Manifest) {}

  /** Queues map JSONs and every non-placeholder image on the scene loader. */
  queue(scene: Phaser.Scene): void {
    const { manifest } = this;
    scene.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.failed.add(file.key);
      console.warn(`[assets] Falta ${file.src}, se usará un placeholder`);
    });

    for (const [key, file] of Object.entries(manifest.maps)) {
      scene.load.json(mapCacheKey(key), ASSETS_BASE_URL + file);
    }
    for (const [key, def] of Object.entries(manifest.characters)) {
      for (const [anim, a] of Object.entries(def.animations)) {
        if (isAnimationPlaceholder(def, anim)) continue;
        scene.load.spritesheet(characterTextureKey(key, anim), ASSETS_BASE_URL + a.file, {
          frameWidth: def.frameWidth,
          frameHeight: def.frameHeight,
        });
      }
    }
    for (const [key, def] of Object.entries(manifest.objects)) {
      if (def.placeholder) continue;
      scene.load.spritesheet(objectTextureKey(key), ASSETS_BASE_URL + def.file, {
        frameWidth: def.frameWidth,
        frameHeight: def.frameHeight,
      });
    }
    for (const [key, def] of Object.entries(manifest.tilesets)) {
      if (def.placeholder) continue;
      scene.load.image(tilesetTextureKey(key), ASSETS_BASE_URL + def.file);
    }
  }

  /** Parses maps, generates placeholders and registers animations. */
  finalize(scene: Phaser.Scene): void {
    const { manifest } = this;

    for (const key of Object.keys(manifest.maps)) {
      const json: unknown = scene.cache.json.get(mapCacheKey(key));
      if (json === undefined) throw new Error(`Map "${key}" could not be loaded`);
      this.maps.set(key, parseMap(json));
    }

    for (const [key, def] of Object.entries(manifest.characters)) {
      const hasRealIdle = !isAnimationPlaceholder(def, 'idle') && !this.isMissing(scene, characterTextureKey(key, 'idle'));
      for (const anim of Object.keys(def.animations)) {
        const textureKey = characterTextureKey(key, anim);
        const missing = isAnimationPlaceholder(def, anim) || this.isMissing(scene, textureKey);
        if (!missing) continue;
        // While a character is half drawn, its missing animations reuse the real idle
        // so it never turns into a rectangle mid-game (docs/ASSETS.md §4).
        if (hasRealIdle) this.fallbacks.set(textureKey, 'idle');
        else createCharacterPlaceholder(scene, key, def, anim);
      }
    }

    for (const [key, def] of Object.entries(manifest.objects)) {
      const textureKey = objectTextureKey(key);
      if (def.placeholder || this.isMissing(scene, textureKey)) createObjectPlaceholder(scene, key, def);
    }

    for (const [key, def] of Object.entries(manifest.tilesets)) {
      const textureKey = tilesetTextureKey(key);
      if (!def.placeholder && !this.isMissing(scene, textureKey)) {
        addGridFrames(scene, textureKey, def.tileWidth, def.tileHeight);
        continue;
      }
      // The tile layout and properties come from the first map that embeds this tileset.
      const tileset = [...this.maps.values()].flatMap((m) => m.tilesets).find((t) => t.name === key);
      if (tileset) createTilesetPlaceholder(scene, key, tileset);
    }

    this.createAnimations(scene);
  }

  /** The map `key` if it exists, otherwise the default map (room01, the first one declared). */
  mapOrDefault(key: string | null): MapData {
    if (key && this.maps.has(key)) return this.map(key);
    if (key) console.warn(`[assets] No existe el mapa "${key}", se usa el de por defecto`);
    const fallback = this.maps.has(ASSET_KEYS.mapRoom01) ? ASSET_KEYS.mapRoom01 : [...this.maps.keys()][0];
    return this.map(fallback ?? '');
  }

  map(key: string): MapData {
    const map = this.maps.get(key);
    if (!map) throw new Error(`Unknown map "${key}"`);
    return map;
  }

  private isMissing(scene: Phaser.Scene, textureKey: string): boolean {
    return this.failed.has(textureKey) || !scene.textures.exists(textureKey);
  }

  private createAnimations(scene: Phaser.Scene): void {
    for (const [key, def] of Object.entries(this.manifest.characters)) {
      for (const [anim, a] of Object.entries(def.animations)) {
        const borrowed = this.fallbacks.get(characterTextureKey(key, anim));
        const source = borrowed ? def.animations[borrowed] : undefined;
        const textureKey = characterTextureKey(key, borrowed ?? anim);
        const frames = source ? source.frames : a.frames;
        for (let dir = 0; dir < 8; dir++) {
          const animKey = animationKey(key, anim, dir);
          if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
          const row = directionRow(dir, def.directions);
          const start = row * frames;
          scene.anims.create({
            key: animKey,
            frames: scene.anims.generateFrameNumbers(textureKey, { start, end: start + frames - 1 }),
            frameRate: source ? source.fps : a.fps,
            repeat: (source ?? a).loop ? -1 : 0,
          });
        }
      }
    }
  }
}

/** Numbered frames (0, 1, …) for every tile of a tileset image, so tiles can be drawn as images. */
function addGridFrames(scene: Phaser.Scene, textureKey: string, tileWidth: number, tileHeight: number): void {
  const texture = scene.textures.get(textureKey);
  const source = texture.getSourceImage();
  const columns = Math.floor(source.width / tileWidth);
  const rows = Math.floor(source.height / tileHeight);
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const frame = row * columns + col;
      if (!texture.has(String(frame))) texture.add(frame, 0, col * tileWidth, row * tileHeight, tileWidth, tileHeight);
    }
  }
}
