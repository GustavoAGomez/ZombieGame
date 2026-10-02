import Phaser from 'phaser';
import { FONTS } from '../../config/theme';
import { AssetLibrary } from '../assets/AssetLibrary';
import { ASSETS_BASE_URL, MANIFEST_URL, parseManifest } from '../assets/manifest';
import { applyUiSkin } from '../../ui/skin';
import type { Services } from '../services';

export const SCENE_KEYS = {
  boot: 'boot',
  title: 'title',
  game: 'game',
  gameOver: 'gameOver',
} as const;

const MANIFEST_KEY = 'manifest';

/** Resolves once the pixel fonts are loaded (or failed: text then falls back to monospace). */
function loadFonts(): Promise<unknown> {
  if (!('fonts' in document)) return Promise.resolve();
  return Promise.allSettled([document.fonts.load(`8px ${FONTS.display}`), document.fonts.load(`8px ${FONTS.label}`)]);
}

export interface GameSceneData {
  services: Services;
  assets: AssetLibrary;
}

/** Loads the manifest, then every asset it declares, then shows the title screen. */
export class BootScene extends Phaser.Scene {
  constructor(private readonly services: Services) {
    super(SCENE_KEYS.boot);
  }

  preload(): void {
    this.load.json(MANIFEST_KEY, MANIFEST_URL);
  }

  create(): void {
    const manifest = parseManifest(this.cache.json.get(MANIFEST_KEY));
    // The HUD skin is DOM: its pieces go to CSS straight away (no Phaser texture).
    applyUiSkin(manifest.ui, ASSETS_BASE_URL);
    const assets = new AssetLibrary(manifest);
    assets.queue(this);
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      assets.finalize(this);
      const data: GameSceneData = { services: this.services, assets };
      // World texts use the pixel font: make sure it is ready before drawing them.
      void loadFonts().then(() => this.scene.start(SCENE_KEYS.title, data));
    });
    this.load.start();
  }
}
