import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import Phaser from 'phaser';
import { SIM } from '../../config/balance';
import { DISPLAY, computeWorldZoom } from '../../config/display';
import { FixedStep } from '../../core/FixedStep';
import { createGameState, type GameState } from '../../core/GameState';
import { createInputCommand } from '../../core/InputCommand';
import { InputCollector } from '../../input/InputCollector';
import { Hud } from '../../ui/hud/Hud';
import { PauseButton, PauseMenu } from '../../ui/screens/Screens';
import type { AssetLibrary } from '../assets/AssetLibrary';
import { ASSET_KEYS } from '../assets/manifest';
import { AimLine } from '../entities/AimLine';
import { BloodViewPool } from '../entities/Blood';
import { BulletViewPool } from '../entities/Bullet';
import { MuzzleFlash } from '../entities/MuzzleFlash';
import { PickupViewPool } from '../entities/Pickup';
import { PlayerView } from '../entities/Player';
import { WorldTextPool } from '../entities/WorldText';
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
import { roundsSurvived } from '../systems/WaveSystem';
import { SCENE_KEYS, type GameSceneData } from './BootScene';
import type { GameOverData } from './GameOverScene';

/** Time to watch the death ("HAS MUERTO") before the game over screen. */
const GAME_OVER_DELAY_MS = 2000;

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
  private muzzleFlash!: MuzzleFlash;
  private worldTexts!: WorldTextPool;
  private bloodViews!: BloodViewPool;
  private pickupViews!: PickupViewPool;
  private pauseButton!: PauseButton;
  private pauseMenu!: PauseMenu;
  /** The match is frozen behind the pause menu. */
  private paused = false;
  /** ms since the match ended; the game over screen shows after GAME_OVER_DELAY_MS. */
  private overFor = 0;
  private overShown = false;
  private appListeners: Promise<PluginListenerHandle>[] = [];
  /** Player teleports already shown: a new one snaps the camera instead of panning across the map. */
  private shownTeleports = 0;
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
    this.map = this.assets.mapOrDefault(this.services.mapKey);
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
    this.paused = false;
    this.overFor = 0;
    this.overShown = false;
    this.shownTeleports = 0;

    this.hud = new Hud(hudRoot, events);
    this.controls = new InputCollector(hudRoot, events);
    this.presenter = new HudPresenter(events, this.map);
    this.pauseMenu = new PauseMenu(hudRoot, () => this.setPaused(false), () => this.scene.restart());
    this.pauseButton = new PauseButton(hudRoot, () => this.setPaused(true));
    this.listenToApp();

    const { manifest } = this.assets;
    const playerDef = manifest.characters[ASSET_KEYS.player];
    if (!playerDef) throw new Error('The manifest has no "player" character');
    this.mapView = new MapView(this, this.map);
    this.bloodViews = new BloodViewPool(this, this.state.blood.length);
    this.pickupViews = new PickupViewPool(this, this.state.pickups.length);
    this.zombieViews = new ZombieViewPool(this, manifest, this.state.zombies.length);
    this.playerView = new PlayerView(this, playerDef);
    this.bulletViews = new BulletViewPool(this, this.state.bullets.length, playerDef);
    this.aimLine = new AimLine(this, playerDef);
    this.muzzleFlash = new MuzzleFlash(this, playerDef);
    this.worldTexts = new WorldTextPool(this, events);
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
      this.worldTexts.destroy();
      this.pauseMenu.destroy();
      this.pauseButton.destroy();
      this.stopListeningToApp();
      this.anims.resumeAll();
    });
  }

  override update(time: number, delta: number): void {
    if (!this.paused && !this.overShown) this.fixedStep.advance(delta, (dt) => this.step(dt));
    this.syncViews(this.fixedStep.alpha, time);
    this.presenter.publish(this.state);
    this.updateStats();
    this.checkGameOver(delta);
  }

  /** Freezes or resumes the match behind the pause menu (spec 01 §2.5). */
  private setPaused(paused: boolean): void {
    if (this.overShown || paused === this.paused) return;
    this.paused = paused;
    this.pauseMenu[paused ? 'show' : 'hide']();
    this.pauseButton.visible = !paused;
    if (paused) {
      // A finger held on a control would otherwise stay pressed after resuming.
      this.controls.resetAll();
      this.anims.pauseAll();
    } else {
      // No catching up on the time spent paused.
      this.fixedStep.reset();
      this.anims.resumeAll();
    }
  }

  /** Every player is dead: a moment to see it, then the game over screen. */
  private checkGameOver(delta: number): void {
    if (this.overShown || this.state.wave.phase !== 'over') return;
    this.overFor += delta;
    if (this.overFor < GAME_OVER_DELAY_MS) return;
    this.overShown = true;
    this.pauseMenu.hide();
    this.pauseButton.visible = false;
    this.controls.resetAll();
    const data: GameOverData = {
      services: this.services,
      assets: this.assets,
      rounds: roundsSurvived(this.state),
      score: this.state.players[0]?.score ?? 0,
    };
    this.scene.launch(SCENE_KEYS.gameOver, data);
  }

  /**
   * Automatic pause when the app goes to the background (visibilitychange on
   * the web, appStateChange on iOS and Android), and the Android back button
   * opens or closes the pause menu (spec 01 §2.5, §4.9).
   */
  private listenToApp(): void {
    document.addEventListener('visibilitychange', this.onVisibility);
    if (!Capacitor.isNativePlatform()) return;
    this.appListeners = [
      App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) this.setPaused(true);
      }),
      App.addListener('backButton', () => this.setPaused(!this.paused)),
    ];
  }

  private stopListeningToApp(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    for (const handle of this.appListeners) void handle.then((h) => h.remove());
    this.appListeners = [];
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.setPaused(true);
  };

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
      if (player.teleports !== this.shownTeleports) {
        this.shownTeleports = player.teleports;
        this.cameras.main.centerOn(this.playerView.sprite.x, this.playerView.sprite.y);
      }
      this.aimLine.sync(player, alpha);
      this.muzzleFlash.sync(player, alpha, this.state.tick);
    }
    this.bulletViews.sync(this.state.bullets, this.state.players, alpha);
    this.worldTexts.sync(now);
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
