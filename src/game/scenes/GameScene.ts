import Phaser from 'phaser';
import { SIM } from '../../config/balance';
import { computeWorldZoom } from '../../config/display';
import { FixedStep } from '../../core/FixedStep';
import { createGameState, type GameState } from '../../core/GameState';
import { SCENE_KEYS } from './BootScene';

export class GameScene extends Phaser.Scene {
  private state!: GameState;
  private readonly fixedStep = new FixedStep(SIM.hz, SIM.maxStepsPerFrame, SIM.maxFrameMs);

  constructor() {
    super(SCENE_KEYS.game);
  }

  create(): void {
    this.state = createGameState();
    this.fixedStep.reset();
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom);
    });
  }

  override update(_time: number, delta: number): void {
    this.fixedStep.advance(delta, (dt) => {
      this.state.tick++;
      this.state.time += dt;
    });
  }

  private readonly applyZoom = (): void => {
    this.cameras.main.setZoom(computeWorldZoom(this.scale.height));
  };
}
