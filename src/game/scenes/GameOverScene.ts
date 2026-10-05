import Phaser from 'phaser';
import { GameOverScreen } from '../../ui/screens/Screens';
import { SCENE_KEYS, type GameSceneData } from './BootScene';

export interface GameOverData extends GameSceneData {
  rounds: number;
  score: number;
}

/**
 * Game over (spec 01 §4.9), shown over the frozen match: rounds survived,
 * points and REINTENTAR, which starts a new match.
 */
export class GameOverScene extends Phaser.Scene {
  private sceneData!: GameOverData;

  constructor() {
    super(SCENE_KEYS.gameOver);
  }

  init(data: GameOverData): void {
    this.sceneData = data;
  }

  create(): void {
    const { services, assets, rounds, score } = this.sceneData;
    const screen = new GameOverScreen(services.hudRoot, { rounds, score }, () => this.scene.start(SCENE_KEYS.game, { services, assets }));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen.destroy());
  }
}
