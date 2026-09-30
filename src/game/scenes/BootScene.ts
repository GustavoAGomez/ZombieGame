import Phaser from 'phaser';
import { AssetLibrary } from '../assets/AssetLibrary';
import { MANIFEST_URL, parseManifest } from '../assets/manifest';
import type { Services } from '../services';

export const SCENE_KEYS = {
  boot: 'boot',
  game: 'game',
} as const;

const MANIFEST_KEY = 'manifest';

export interface GameSceneData {
  services: Services;
  assets: AssetLibrary;
}

/** Loads the manifest, then every asset it declares, then starts the game. */
export class BootScene extends Phaser.Scene {
  constructor(private readonly services: Services) {
    super(SCENE_KEYS.boot);
  }

  preload(): void {
    this.load.json(MANIFEST_KEY, MANIFEST_URL);
  }

  create(): void {
    const assets = new AssetLibrary(parseManifest(this.cache.json.get(MANIFEST_KEY)));
    assets.queue(this);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      assets.finalize(this);
      const data: GameSceneData = { services: this.services, assets };
      this.scene.start(SCENE_KEYS.game, data);
    });
    this.load.start();
  }
}
