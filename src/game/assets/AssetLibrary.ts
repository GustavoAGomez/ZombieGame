import type Phaser from 'phaser';
import { parseMap, type MapData } from '../map/MapLoader';
import {
  ASSETS_BASE_URL,
  animationKey,
  characterTextureKey,
  directionRow,
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
      if (def.placeholder) continue;
      for (const [anim, a] of Object.entries(def.animations)) {
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
      for (const anim of Object.keys(def.animations)) {
        const textureKey = characterTextureKey(key, anim);
        if (def.placeholder || this.isMissing(scene, textureKey)) createCharacterPlaceholder(scene, key, def, anim);
      }
    }

    for (const [key, def] of Object.entries(manifest.objects)) {
      const textureKey = objectTextureKey(key);
      if (def.placeholder || this.isMissing(scene, textureKey)) createObjectPlaceholder(scene, key, def);
    }

    for (const [key, def] of Object.entries(manifest.tilesets)) {
      const textureKey = tilesetTextureKey(key);
      if (!def.placeholder && !this.isMissing(scene, textureKey)) continue;
      // The tile layout comes from the first map that embeds this tileset.
      const tileset = [...this.maps.values()].map((m) => m.tileset).find((t) => t.name === key);
      if (tileset) createTilesetPlaceholder(scene, key, tileset);
    }

    this.createAnimations(scene);
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
        const textureKey = characterTextureKey(key, anim);
        for (let dir = 0; dir < 8; dir++) {
          const animKey = animationKey(key, anim, dir);
          if (scene.anims.exists(animKey)) scene.anims.remove(animKey);
          const row = directionRow(dir, def.directions);
          const start = row * a.frames;
          scene.anims.create({
            key: animKey,
            frames: scene.anims.generateFrameNumbers(textureKey, { start, end: start + a.frames - 1 }),
            frameRate: a.fps,
            repeat: a.loop ? -1 : 0,
          });
        }
      }
    }
  }
}
