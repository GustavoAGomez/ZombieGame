import Phaser from 'phaser';
import { GameOverScreen, RunOverScreen, type RunOverInfo } from '../../ui/screens/Screens';
import { SCENE_KEYS, type GameSceneData, type RunCarry } from './BootScene';

export interface GameOverData extends GameSceneData {
  rounds: number;
  score: number;
  /** A dungeon run's end (spec 09 §10), with the next floor ready when it was won. */
  run?: RunOverInfo & { keepGoing: RunCarry | null };
}

/**
 * Game over (spec 01 §4.9), shown over the frozen match: rounds survived,
 * points and REINTENTAR, which starts a new match. For the dungeon (spec 09
 * §10): the run's figures and OTRA PARTIDA, MISMA SEMILLA, MENÚ and, won,
 * SEGUIR.
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
    const { services, assets, rounds, score, run } = this.sceneData;
    const start = (carry?: RunCarry): void => {
      this.scene.start(SCENE_KEYS.game, { services, assets, ...(carry ? { carry } : {}) });
    };
    if (run) {
      const screen = new RunOverScreen(
        services.hudRoot,
        run,
        {
          again: () => {
            services.seed = null;
            start();
          },
          sameSeed: () => {
            services.seed = run.seed;
            start();
          },
          menu: () => this.scene.start(SCENE_KEYS.title, { services, assets }),
          ...(run.keepGoing ? { keepGoing: () => start(run.keepGoing ?? undefined) } : {}),
        },
        services.audio.playUi,
      );
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen.destroy());
      return;
    }
    const screen = new GameOverScreen(services.hudRoot, { rounds, score }, () => start(), services.audio.playUi);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => screen.destroy());
  }
}
