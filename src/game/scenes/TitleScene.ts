import Phaser from 'phaser';
import { TitleScreen } from '../../ui/screens/Screens';
import { SCENE_KEYS, type GameSceneData } from './BootScene';

/** Title screen (spec 01 §4.9): JUGAR over the whole screen starts a match. */
export class TitleScene extends Phaser.Scene {
  private sceneData!: GameSceneData;

  constructor() {
    super(SCENE_KEYS.title);
  }

  init(data: GameSceneData): void {
    this.sceneData = data;
  }

  create(): void {
    const { services } = this.sceneData;
    const screen = new TitleScreen(services.hudRoot, () => {
      // The JUGAR tap lets the sound out (spec 08 §2): it must happen inside the gesture.
      services.audio.unlock();
      services.audio.playUi('ui.tap');
      this.scene.start(SCENE_KEYS.game, this.sceneData);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen.destroy());
  }
}
