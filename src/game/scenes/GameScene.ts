import Phaser from 'phaser';
import { SIM } from '../../config/balance';
import { DISPLAY, computeWorldZoom } from '../../config/display';
import { FixedStep } from '../../core/FixedStep';
import { createGameState, type GameState } from '../../core/GameState';
import type { AssetLibrary } from '../assets/AssetLibrary';
import { ASSET_KEYS } from '../assets/manifest';
import { PlayerView } from '../entities/Player';
import { buildCollisionGrid, type CollisionGrid } from '../map/CollisionGrid';
import type { MapData } from '../map/MapLoader';
import { MapView } from '../map/MapView';
import type { Services } from '../services';
import { SCENE_KEYS, type GameSceneData } from './BootScene';

export class GameScene extends Phaser.Scene {
  private services!: Services;
  private assets!: AssetLibrary;
  private map!: MapData;
  private state!: GameState;
  private grid!: CollisionGrid;
  private mapView!: MapView;
  private playerView!: PlayerView;
  private readonly fixedStep = new FixedStep(SIM.hz, SIM.maxStepsPerFrame, SIM.maxFrameMs);

  constructor() {
    super(SCENE_KEYS.game);
  }

  init(data: GameSceneData): void {
    this.services = data.services;
    this.assets = data.assets;
  }

  create(): void {
    this.map = this.assets.map(ASSET_KEYS.mapRoom01);
    this.state = createGameState(this.map);
    this.grid = buildCollisionGrid(this.map, this.state.doorsOpen);
    this.fixedStep.reset();

    this.mapView = new MapView(this, this.map);
    const playerDef = this.assets.manifest.characters[ASSET_KEYS.player];
    if (!playerDef) throw new Error('The manifest has no "player" character');
    this.playerView = new PlayerView(this, playerDef);
    this.syncViews(0);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.map.widthPx, this.map.heightPx);
    camera.setRoundPixels(true);
    camera.startFollow(this.playerView.sprite, true, DISPLAY.cameraLerp, DISPLAY.cameraLerp);
    this.applyZoom();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom);
    });
  }

  override update(_time: number, delta: number): void {
    this.fixedStep.advance(delta, (dt) => this.step(dt));
    this.syncViews(this.fixedStep.alpha);
    this.services.stats.tick = this.state.tick;
  }

  private step(dt: number): void {
    const state = this.state;
    for (const p of state.players) {
      p.prevX = p.x;
      p.prevY = p.y;
    }
    state.tick++;
    state.time += dt;
  }

  private syncViews(alpha: number): void {
    const player = this.state.players[0];
    if (player) this.playerView.sync(player, alpha, 'idle');
    this.mapView.sync(this.state);
  }

  private readonly applyZoom = (): void => {
    this.cameras.main.setZoom(computeWorldZoom(this.scale.height));
  };

  /** Exposed for later phases (movement) and debugging. */
  get collisionGrid(): CollisionGrid {
    return this.grid;
  }
}
