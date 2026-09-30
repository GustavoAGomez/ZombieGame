import Phaser from 'phaser';
import { SIM } from '../../config/balance';
import { DISPLAY, computeWorldZoom } from '../../config/display';
import { FixedStep } from '../../core/FixedStep';
import { createGameState, type GameState } from '../../core/GameState';
import { createInputCommand } from '../../core/InputCommand';
import { InputCollector } from '../../input/InputCollector';
import { Hud } from '../../ui/hud/Hud';
import type { AssetLibrary } from '../assets/AssetLibrary';
import { ASSET_KEYS } from '../assets/manifest';
import { AimLine } from '../entities/AimLine';
import { BloodViewPool } from '../entities/Blood';
import { BulletViewPool } from '../entities/Bullet';
import { PickupViewPool } from '../entities/Pickup';
import { PlayerView } from '../entities/Player';
import { ZombieViewPool } from '../entities/Zombie';
import { HudPresenter } from '../HudPresenter';
import { buildCollisionGrid } from '../map/CollisionGrid';
import type { MapData } from '../map/MapLoader';
import { MapView } from '../map/MapView';
import type { Services } from '../services';
import { activeBulletCount } from '../systems/BulletSystem';
import { isZombieAlive } from '../systems/Combat';
import { createNav, type SimContext } from '../systems/SimContext';
import { stepSimulation } from '../systems/Simulation';
import { SCENE_KEYS, type GameSceneData } from './BootScene';

const RESTART_AFTER_DEATH_MS = 2500;

export class GameScene extends Phaser.Scene {
  private services!: Services;
  private assets!: AssetLibrary;
  private map!: MapData;
  private state!: GameState;
  private sim!: SimContext;
  private controls!: InputCollector;
  private hud!: Hud;
  private presenter!: HudPresenter;
  private mapView!: MapView;
  private playerView!: PlayerView;
  private zombieViews!: ZombieViewPool;
  private bulletViews!: BulletViewPool;
  private aimLine!: AimLine;
  private bloodViews!: BloodViewPool;
  private pickupViews!: PickupViewPool;
  /** ms since every player died; the scene restarts after a pause (until phase 7). */
  private deadFor = 0;
  private readonly fixedStep = new FixedStep(SIM.hz, SIM.maxStepsPerFrame, SIM.maxFrameMs);

  constructor() {
    super(SCENE_KEYS.game);
  }

  init(data: GameSceneData): void {
    this.services = data.services;
    this.assets = data.assets;
  }

  create(): void {
    const { events, hudRoot } = this.services;
    this.map = this.assets.map(ASSET_KEYS.mapRoom01);
    this.state = createGameState(this.map, { seed: Date.now() | 0, startRound: this.services.startRound });
    this.sim = {
      state: this.state,
      map: this.map,
      grid: buildCollisionGrid(this.map, this.state.doorsOpen),
      nav: createNav(this.map),
      commands: this.state.players.map(() => createInputCommand()),
      events,
    };
    this.fixedStep.reset();
    this.deadFor = 0;

    this.hud = new Hud(hudRoot, events);
    this.controls = new InputCollector(hudRoot, events);
    this.presenter = new HudPresenter(events, this.map);

    const { manifest } = this.assets;
    const playerDef = manifest.characters[ASSET_KEYS.player];
    if (!playerDef) throw new Error('The manifest has no "player" character');
    this.mapView = new MapView(this, this.map);
    this.bloodViews = new BloodViewPool(this, this.state.blood.length);
    this.pickupViews = new PickupViewPool(this, this.state.pickups.length);
    this.zombieViews = new ZombieViewPool(this, manifest, this.state.zombies.length);
    this.playerView = new PlayerView(this, playerDef);
    this.bulletViews = new BulletViewPool(this, this.state.bullets.length);
    this.aimLine = new AimLine(this);
    this.syncViews(0);

    const camera = this.cameras.main;
    camera.setBounds(0, 0, this.map.widthPx, this.map.heightPx);
    camera.setRoundPixels(true);
    camera.startFollow(this.playerView.sprite, true, DISPLAY.cameraLerp, DISPLAY.cameraLerp);
    this.applyZoom();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom);
      this.controls.destroy();
      this.hud.destroy();
    });
  }

  override update(time: number, delta: number): void {
    this.fixedStep.advance(delta, (dt) => this.step(dt));
    this.syncViews(this.fixedStep.alpha, time);
    this.presenter.publish(this.state);
    this.updateStats();
    this.checkAllDead(delta);
  }

  /** Temporary until the game-over screen (phase 7): restart after dying. */
  private checkAllDead(delta: number): void {
    for (const p of this.state.players) if (p.hp > 0) return;
    this.deadFor += delta;
    if (this.deadFor >= RESTART_AFTER_DEATH_MS) this.scene.restart();
  }

  private step(dt: number): void {
    const localCommand = this.sim.commands[0];
    if (localCommand) this.controls.sample(localCommand, this.state.tick);
    stepSimulation(this.sim, dt);
  }

  private syncViews(alpha: number, now = 0): void {
    const player = this.state.players[0];
    this.mapView.sync(this.state);
    this.bloodViews.sync(this.state.blood);
    this.pickupViews.sync(this.state.pickups, this.state.time);
    this.zombieViews.sync(this.state.zombies, alpha, now);
    if (player) {
      this.playerView.sync(player, alpha);
      this.aimLine.sync(player, alpha);
    }
    this.bulletViews.sync(this.state.bullets, alpha);
  }

  private updateStats(): void {
    const stats = this.services.stats;
    let alive = 0;
    for (const z of this.state.zombies) if (isZombieAlive(z)) alive++;
    stats.zombies = alive;
    stats.bullets = activeBulletCount(this.state.bullets);
    stats.round = this.state.wave.round;
    stats.tick = this.state.tick;
  }

  private readonly applyZoom = (): void => {
    this.cameras.main.setZoom(computeWorldZoom(this.scale.height));
  };
}
