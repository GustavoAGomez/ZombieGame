import Phaser from 'phaser';
import type { Services } from '../services';

export const SCENE_KEYS = {
  boot: 'boot',
  game: 'game',
} as const;

/** Loads shared data, then hands over to the game scene. */
export class BootScene extends Phaser.Scene {
  constructor(private readonly services: Services) {
    super(SCENE_KEYS.boot);
  }

  create(): void {
    this.scene.start(SCENE_KEYS.game, this.services);
  }
}
