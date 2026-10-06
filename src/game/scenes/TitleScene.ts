import Phaser from 'phaser';
import { QUIET_SNAPSHOT } from '../../audio/AudioDirector';
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
    // The title's music (spec 08 §7): it starts with the first tap that lets the sound out.
    services.audio.update({ ...QUIET_SNAPSHOT, music: 'title' });
    const screen = new TitleScreen(
      services.hudRoot,
      (mode) => {
        // The tap lets the sound out (spec 08 §2): it must happen inside the gesture.
        services.audio.unlock();
        services.audio.playUi('ui.play');
        services.mode = mode;
        this.scene.start(SCENE_KEYS.game, this.sceneData);
      },
      services.records.all,
      services.mode,
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen.destroy());
  }
}
