import Phaser from 'phaser';
import { FONTS } from '../../config/theme';
import { AssetLibrary } from '../assets/AssetLibrary';
import { ASSETS_BASE_URL, MANIFEST_URL, parseManifest } from '../assets/manifest';
import { registerItemSprites } from '../../ui/itemSprites';
import { registerSheetIcons } from '../../ui/sheetIcons';
import { applyUiSkin } from '../../ui/skin';
import type { Services } from '../services';
import type { PlayerState } from '../../core/GameState';
import type { RunState } from '../../core/RunState';

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
  /** The dungeon (spec 09 §4): the run going down to its next floor, with what the player keeps. */
  carry?: RunCarry;
}

/** What a dungeon run keeps from floor to floor (spec 09 §4): the run itself and the player's body, weapons and money. */
export interface RunCarry {
  run: RunState;
  player: Pick<PlayerState, 'hp' | 'maxHp' | 'weapons' | 'activeSlot' | 'money' | 'score' | 'items' | 'boostStored'>;
  /** Whether the run counts for the records (§10): not with the debug nor MISMA SEMILLA. */
  recordable: boolean;
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
    void applyUiSkin(manifest.ui, ASSETS_BASE_URL);
    // The special items' animated sprites in the HUD slots, from the same sheets as the map.
    registerItemSprites(manifest.objects, ASSETS_BASE_URL);
    // The weapons and the round buttons' symbols, cut from their sheets.
    registerSheetIcons(manifest.objects, ASSETS_BASE_URL);
    // Every sound is decoded now, so the first shot has no delay (spec 08 §1).
    // The candidates only with the debug on, for the sound test (spec 08 §8).
    this.services.audio.load(manifest.audio, ASSETS_BASE_URL, this.services.debug);
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
