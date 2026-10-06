import { UPGRADE_IDS, type UpgradeId } from '../../config/upgrades';
import { takeUpgrade } from '../dungeon/wizardShop';
import { debugCallWizard, debugClearRoom, debugDescend, debugGiveKey, debugGoToBoss, debugRevealMap } from '../systems/DungeonSystem';
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import Phaser from 'phaser';
import { QUIET_SNAPSHOT, type AudioSnapshot } from '../../audio/AudioDirector';
import { AUDIO } from '../../config/audio';
import { DEBUG, PLAYER, SIM, type BoostKind } from '../../config/balance';
import { DISPLAY, computeWorldZoom } from '../../config/display';
import { FixedStep } from '../../core/FixedStep';
import { createGameState, type GameState } from '../../core/GameState';
import { createInputCommand } from '../../core/InputCommand';
import { InputCollector } from '../../input/InputCollector';
import { Hud } from '../../ui/hud/Hud';
import { PauseButton, PauseMenu, upgradeLines } from '../../ui/screens/Screens';
import type { AssetLibrary } from '../assets/AssetLibrary';
import { ASSET_KEYS } from '../assets/manifest';
import { AimLine } from '../entities/AimLine';
import { FlameJet } from '../entities/FlameJet';
import { HandView } from '../entities/HandView';
import { LaserBeam } from '../entities/LaserBeam';
import { BloodViewPool } from '../entities/Blood';
import { BloodSprayPool } from '../entities/BloodSpray';
import { BulletViewPool } from '../entities/Bullet';
import { MeleeSlash } from '../entities/MeleeSlash';
import { MerchantViewPool, OffscreenArrows } from '../entities/Merchant';
import { SpeedTrail } from '../entities/SpeedTrail';
import { PlayerBloodStains } from '../entities/PlayerBlood';
import { MuzzleFlash } from '../entities/MuzzleFlash';
import { PickupViewPool } from '../entities/Pickup';
import { GroundItemViews } from '../entities/GroundItem';
import { ThrownItemViews } from '../entities/ThrownItem';
import { ActivationSiteViews } from '../entities/ActivationSite';
import { PlayerView } from '../entities/Player';
import { WorldTextPool } from '../entities/WorldText';
import { CantUseText } from '../entities/CantUseText';
import { ZombieViewPool } from '../entities/Zombie';
import { BossArrows, BossMarks, BossPuddles, BossViewPool } from '../entities/Boss';
import { BurnFlames } from '../entities/BurnFlames';
import { WeaponCaseViews } from '../entities/WeaponCase';
import { findWeapon, giveWeapon, refillWeapon } from '../systems/InventorySystem';
import { moveHand } from '../systems/HandSystem';
import { freeBossSlot, levelAt, startBossEntry } from '../systems/BossSystem';
import { isBossAlive, killBoss } from '../systems/BossCombat';
import { debugGiveItems } from '../systems/ItemSystem';
import { HudPresenter } from '../HudPresenter';
import { buildCollisionGrid } from '../map/CollisionGrid';
import type { MapData } from '../map/MapLoader';
import { MapView } from '../map/MapView';
import { cameraBounds, computeLevels, type MapLevels } from '../map/levels';
import { createRunState, descend } from '../dungeon/run';
import { bankOf } from '../dungeon/templates';
import { assembleFloor, templatesById } from '../dungeon/assembleFloor';
import { dungeonMusic } from '../systems/DungeonSystem';
import { SpawnMarks } from '../entities/SpawnMarks';
import { DungeonViews } from '../entities/DungeonViews';
import { DungeonEffects } from '../entities/DungeonEffects';
import { DUNGEON, floorConfig } from '../../config/dungeon';
import type { RunState } from '../../core/RunState';
import type { RunCarry } from './BootScene';
import type { Services } from '../services';
import { activeBulletCount } from '../systems/BulletSystem';
import { isZombieAlive } from '../systems/Combat';
import { isPlayerAlive } from '../systems/HealthSystem';
import { createBossNavs, createNav, type SimContext } from '../systems/SimContext';
import { stepSimulation } from '../systems/Simulation';
import { roundsSurvived, startRound } from '../systems/WaveSystem';
import { moveMerchant } from '../systems/MerchantSystem';
import { storeBoost } from '../systems/BoostSystem';
import { upgradeReason, upgradeWeapon } from '../systems/weaponStats';
import { UPGRADE_KINDS, WEAPONS, type WeaponId } from '../../config/weapons';
import { BOSS_VARIANT_IDS, bossesForRound, type BossVariantId } from '../../config/bosses';
import { STRINGS } from '../../ui/strings';
import { DebugDraw } from '../../debug/DebugDraw';
import type { DebugActions } from '../../debug/DebugOverlay';
import type { MuzzleTable } from '../systems/shotGeometry';
import { angleFromDir8 } from '../../core/math';
import { muzzleOffset } from '../entities/muzzle';
import { measureSafePadding, type SafePadding } from '../../ui/safeArea';
import { shopCameraOffset } from '../shopCamera';
import { SCENE_KEYS, type GameSceneData } from './BootScene';
import type { GameOverData } from './GameOverScene';

/** Time to watch the death ("HAS MUERTO") before the game over screen. */
const GAME_OVER_DELAY_MS = 2000;

export class GameScene extends Phaser.Scene {
  private services!: Services;
  private assets!: AssetLibrary;
  private map!: MapData;
  /** The match's seed (spec 09 §1), shown in the debug panel. */
  private seed = 0;
  private spawnMarks!: SpawnMarks;
  private dungeonViews!: DungeonViews;
  private dungeonEffects!: DungeonEffects;
  /** Spec 09 §10: whether this run counts for the records. */
  private recordable = true;
  /** The scene is already going down to the next floor. */
  private descended = false;
  /** The run coming down from the floor above (spec 09 §4), or null. */
  private carry: RunCarry | null = null;
  /** The dungeon's camera (spec 09 §4): the room it shows, sliding from the last one. */
  private roomCamera: { room: number; from: CameraRect; to: CameraRect; t: number } | null = null;
  private state!: GameState;
  private sim!: SimContext;
  private controls!: InputCollector;
  private hud!: Hud;
  private presenter!: HudPresenter;
  private mapView!: MapView;
  private readonly isDark = (x: number, y: number): boolean => this.mapView.isDark(x, y);
  private playerView!: PlayerView;
  private speedTrail!: SpeedTrail;
  private playerStains!: PlayerBloodStains;
  private zombieViews!: ZombieViewPool;
  private bossViews!: BossViewPool;
  private bossMarks!: BossMarks;
  private bossPuddles!: BossPuddles;
  private bossArrows!: BossArrows;
  private bulletViews!: BulletViewPool;
  private aimLine!: AimLine;
  private laserBeam!: LaserBeam;
  private flameJet!: FlameJet;
  private handView!: HandView;
  private muzzleFlash!: MuzzleFlash;
  private meleeSlash!: MeleeSlash;
  private worldTexts!: WorldTextPool;
  private cantUseText!: CantUseText;
  private debugDraw!: DebugDraw;
  private bloodViews!: BloodViewPool;
  private bloodSpray!: BloodSprayPool;
  private burnFlames!: BurnFlames;
  private weaponCases!: WeaponCaseViews;
  private pickupViews!: PickupViewPool;
  private groundItemViews!: GroundItemViews;
  private thrownItems!: ThrownItemViews;
  private activationSites!: ActivationSiteViews;
  private merchantViews!: MerchantViewPool;
  private offscreenArrows!: OffscreenArrows;
  /** The HUD's safe-area margins, for the off-screen arrows (measured on resize). */
  private safePadding: SafePadding = { x: 0, top: 0, bottom: 0 };
  private pauseButton!: PauseButton;
  private pauseMenu!: PauseMenu;
  /** The match is frozen behind the pause menu. */
  private paused = false;
  /** Filled in place every frame for the audio (spec 08 §1.3): no garbage. */
  private readonly audioSnapshot: AudioSnapshot = { ...QUIET_SNAPSHOT };
  /** ms since the match ended; the game over screen shows after GAME_OVER_DELAY_MS. */
  private overFor = 0;
  private overShown = false;
  private appListeners: Promise<PluginListenerHandle>[] = [];
  /** Ground floor, basement, roof…: the camera stays inside the player's level. */
  private levels!: MapLevels;
  private currentLevel = -1;
  /** Player teleports already shown: a new one snaps the camera instead of panning across the map. */
  private shownTeleports = 0;
  /** The variant INVOCAR MATARIFE calls up (the debug panel's selector). */
  private debugVariant: BossVariantId = 'base';
  /** The upgrade DAR MEJORA gives (spec 09 §13). */
  private debugUpgrade: UpgradeId = UPGRADE_IDS[0] ?? 'vitality';
  /** Last boost given from the debug panel (they alternate). */
  private debugBoost: BoostKind = 'double_damage';
  private readonly fixedStep = new FixedStep(SIM.hz, SIM.maxStepsPerFrame, SIM.maxFrameMs);

  constructor() {
    super(SCENE_KEYS.game);
  }

  init(data: GameSceneData): void {
    this.services = data.services;
    this.assets = data.assets;
    this.carry = data.carry ?? null;
  }

  create(): void {
    const { events, hudRoot } = this.services;
    // The seed (spec 09 §1): a fixed one from ?seed= or MISMA SEMILLA, or a new one; the dungeon's plan comes from it alone.
    const seed = this.services.seed ?? Date.now() | 0;
    this.seed = seed;
    const mode = this.services.mode;
    let run: RunState | null = null;
    const carry = this.carry;
    this.recordable = carry ? carry.recordable : !this.services.debug && this.services.seed === null;
    this.descended = false;
    if (mode === 'dungeon') {
      // The dungeon's floor (spec 09 §3.3): the run going down, or a new one from the seed; its map assembled from the ambient's templates.
      const floorRun = carry?.run ?? createRunState(seed, bankOf(this.assets.roomTemplates(floorConfig(1).ambient)));
      const templates = this.assets.roomTemplates(floorRun.plan.ambient);
      const tilesets = this.assets.tilesetData();
      if (templates.length === 0 || !tilesets) throw new Error(`La mazmorra necesita las plantillas de ${floorRun.plan.ambient} y los tilesets: npm run rooms:build`);
      this.map = assembleFloor(floorRun.plan, templatesById(templates), tilesets);
      run = floorRun;
    } else {
      this.map = this.assets.mapOrDefault(this.services.mapKey);
    }
    this.state = createGameState(this.map, { seed, startRound: this.services.startRound, mode, run });
    // Down a floor (spec 09 §4): the player keeps life, weapons, ammo, money and items; only the place is new.
    const local = this.state.players[0];
    if (carry && local) {
      Object.assign(local, carry.player, { weapons: carry.player.weapons.map((w) => ({ ...w, levels: { ...w.levels } })), items: [...carry.player.items] });
      this.seed = carry.run.seed;
    }
    // The gun's drawn muzzle per direction, from the player art: bullets are drawn and hit from there.
    const muzzles: MuzzleTable = Array.from({ length: 8 }, (_, dir) =>
      muzzleOffset(this.assets.manifest.characters[ASSET_KEYS.player], angleFromDir8(dir), { x: 0, y: 0 }),
    );
    this.sim = {
      state: this.state,
      map: this.map,
      grid: buildCollisionGrid(this.map, this.state.doorsOpen),
      nav: createNav(this.map),
      bossNavs: createBossNavs(this.map),
      commands: this.state.players.map(() => createInputCommand()),
      events,
      muzzles,
    };
    this.fixedStep.reset();
    this.paused = false;
    hudRoot.classList.remove('is-paused');
    this.overFor = 0;
    this.overShown = false;
    this.shownTeleports = 0;

    this.hud = new Hud(hudRoot, events, 0, mode);
    this.controls = new InputCollector(hudRoot, events);
    this.controls.onInfo = (upgrade) => this.hud.showUpgradeInfo(upgrade);
    this.presenter = new HudPresenter(events, this.map);
    this.pauseMenu = new PauseMenu(hudRoot, () => this.setPaused(false), () => this.scene.restart(), this.services.preferences, this.services.audio.playUi, () =>
      this.state.run ? upgradeLines(this.state.run.upgrades, this.state.run.curses) : null,
    );
    this.pauseButton = new PauseButton(hudRoot, () => this.setPaused(true));
    this.listenToApp();

    const { manifest } = this.assets;
    const playerDef = manifest.characters[ASSET_KEYS.player];
    if (!playerDef) throw new Error('The manifest has no "player" character');
    this.mapView = new MapView(this, this.map);
    this.bloodViews = new BloodViewPool(this, this.state.blood.length);
    this.bloodSpray = new BloodSprayPool(this, events, this.isDark);
    this.pickupViews = new PickupViewPool(this, this.state.pickups.length);
    this.groundItemViews = new GroundItemViews(this, this.state.groundItems, manifest);
    this.activationSites = new ActivationSiteViews(this, this.map);
    this.zombieViews = new ZombieViewPool(this, manifest, this.state.zombies.length);
    this.bossViews = new BossViewPool(this, this.state.bosses.length, this.map.tileSize, manifest);
    this.bossMarks = new BossMarks(this, this.state.bosses.length, this.map.tileSize, this.sim.grid);
    this.bossPuddles = new BossPuddles(this, this.state.puddles.length, manifest);
    this.bossArrows = new BossArrows(this, this.state.bosses.length);
    this.burnFlames = new BurnFlames(this, this.state.zombies.length, manifest);
    this.weaponCases = new WeaponCaseViews(this, this.map);
    this.merchantViews = new MerchantViewPool(this, this.map, this.state.merchants, manifest);
    this.offscreenArrows = new OffscreenArrows(this, this.state.merchants);
    this.playerView = new PlayerView(this, playerDef);
    this.speedTrail = new SpeedTrail(this, this.playerView.sprite);
    this.playerStains = new PlayerBloodStains(this, playerDef, events);
    this.bulletViews = new BulletViewPool(this, this.state.bullets.length, playerDef);
    this.aimLine = new AimLine(this, playerDef);
    this.laserBeam = new LaserBeam(this, playerDef);
    this.flameJet = new FlameJet(this, playerDef, events, manifest);
    this.handView = new HandView(this, this.map, events, manifest);
    this.muzzleFlash = new MuzzleFlash(this, playerDef);
    this.meleeSlash = new MeleeSlash(this, manifest.objects[ASSET_KEYS.meleeSlash], manifest.objects[ASSET_KEYS.katanaSlash]);
    this.worldTexts = new WorldTextPool(this, events);
    this.cantUseText = new CantUseText(this, events);
    this.thrownItems = new ThrownItemViews(this, events, manifest);
    this.spawnMarks = new SpawnMarks(this);
    this.dungeonViews = new DungeonViews(this);
    this.dungeonEffects = new DungeonEffects(this);
    this.debugDraw = new DebugDraw(this, this.map);
    this.services.debugActions = this.createDebugActions();
    this.syncViews(0);

    const camera = this.cameras.main;
    this.levels = computeLevels(this.map);
    // What happens on another level is not heard (spec 08 §3.5).
    this.services.audio.setLevels((x, y) => levelAt(this.map, x, y));
    this.currentLevel = -1;
    this.updateLevel();
    camera.setRoundPixels(true);
    camera.startFollow(this.playerView.sprite, true, DISPLAY.cameraLerp, DISPLAY.cameraLerp);
    this.applyZoom();

    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom);
    // A boss's roar, its landings (from the sky too) and its crash into a wall: a jolt (spec 07).
    const offRoar = events.on('boss:roar', () => this.cameras.main.shake(DISPLAY.bossRoarShakeMs, DISPLAY.bossRoarShake));
    const offStunned = events.on('boss:stunned', () => this.cameras.main.shake(DISPLAY.bossRoarShakeMs, DISPLAY.bossRoarShake));
    const offLanded = events.on('boss:landed', () => this.cameras.main.shake(DISPLAY.bossRoarShakeMs, DISPLAY.bossRoarShake));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offRoar();
      offStunned();
      offLanded();
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom);
      this.controls.destroy();
      this.hud.destroy();
      this.worldTexts.destroy();
      this.flameJet.destroy();
      this.handView.destroy();
      this.cantUseText.destroy();
      this.thrownItems.destroy();
      this.bloodSpray.destroy();
      this.playerStains.destroy();
      this.pauseMenu.destroy();
      this.pauseButton.destroy();
      this.debugDraw.destroy();
      this.services.debugActions = null;
      this.stopListeningToApp();
      this.anims.resumeAll();
      this.services.audio.update(QUIET_SNAPSHOT);
      this.services.audio.setLevels(null);
    });
  }

  override update(time: number, delta: number): void {
    this.updateAudio();
    if (!this.paused && !this.overShown) this.fixedStep.advance(delta, (dt) => this.step(dt));
    // Before the views: a teleport snaps the camera, which must already be inside the new level.
    this.updateLevel();
    this.updateRoomCamera(delta);
    this.updateShopCamera();
    this.syncViews(this.fixedStep.alpha, time);
    // The blood of hits freezes with the match (pause, game over).
    const effectsDt = this.paused || this.overShown ? 0 : delta / 1000;
    this.bloodSpray.update(effectsDt);
    this.burnFlames.update(this.state.zombies, effectsDt, (i) => this.zombieViews.isShown(i));
    const player = this.state.players[0];
    this.flameJet.update(player, effectsDt);
    // Nothing of a locked room shows, not even the embers over the hand's hole.
    const handZone = this.map.handSpots[this.state.hand.spot]?.zoneIndex ?? -1;
    this.handView.sync(this.state.hand, this.state.time, effectsDt, this.state.zonesUnlocked[handZone] === true);
    if (player) this.playerStains.sync(player, this.playerView.sprite, effectsDt);
    this.spawnMarks.sync(this.state.run);
    this.dungeonViews.sync(this.state.run);
    this.dungeonEffects.sync(this.state);
    this.debugDraw.draw(this.state, this.sim.nav, this.sim.grid);
    this.presenter.publish(this.state);
    this.updateStats();
    this.checkGameOver(delta);
    this.checkDescent();
  }

  /** BAJAR was tapped (spec 09 §4): the next floor, with the player as they are, behind the floor's banner. */
  private checkDescent(): void {
    const run = this.state.run;
    if (!run?.descending || this.descended) return;
    this.descended = true;
    this.scene.restart({ services: this.services, assets: this.assets, carry: this.carryOf(descend(run, bankOf(this.assets.roomTemplates(floorConfig(run.floor + 1).ambient)))) });
  }

  /** What goes down with the player (spec 09 §4). */
  private carryOf(run: RunState): RunCarry {
    const p = this.state.players[0];
    if (!p) throw new Error('no player to carry');
    return {
      run,
      player: { hp: p.hp, maxHp: p.maxHp, weapons: p.weapons.map((w) => ({ ...w, levels: { ...w.levels } })), activeSlot: p.activeSlot, money: p.money, score: p.score, items: [...p.items], boostStored: p.boostStored },
      recordable: this.recordable,
    };
  }

  /** What the audio needs every frame (spec 08 §1.3): the pause, and the local player's beam or jet and the laser's heat. */
  private updateAudio(): void {
    const s = this.audioSnapshot;
    const p = this.state.players[0];
    const slot = p ? p.weapons[p.activeSlot] : undefined;
    s.paused = this.paused;
    s.continuous = p && isPlayerAlive(p) ? (p.beamOn ? 'laser' : p.coneOn ? 'flamethrower' : null) : null;
    s.heat = slot && s.continuous === 'laser' ? 1 - slot.battery : 0;
    // Where it is all heard from, and low health (spec 08 §3.5).
    s.x = p?.x ?? 0;
    s.y = p?.y ?? 0;
    s.level = p ? this.currentLevel : -1;
    s.lowHealth = p !== undefined && p.hp > 0 && p.hp < PLAYER.lowHpThreshold;
    // The zombies near enough to groan, and the nearest one (spec 08 §6.4).
    s.zombiesNear = 0;
    let nearest = AUDIO.groanRange ** 2;
    for (const z of this.state.zombies) {
      if (!p || !isZombieAlive(z)) continue;
      const d = (z.x - p.x) ** 2 + (z.y - p.y) ** 2;
      if (d > AUDIO.groanRange ** 2) continue;
      s.zombiesNear++;
      if (d <= nearest) {
        nearest = d;
        s.nearestZombieX = z.x;
        s.nearestZombieY = z.y;
      }
    }
    // A boss galloping or stunned: its loops follow it.
    s.bossCharging = false;
    s.bossStunned = false;
    for (const b of this.state.bosses) {
      if (b.phase !== 'attacking') continue;
      const charging = b.attack === 'charge' && b.stage === 'run';
      if (!charging && b.stage !== 'stunned') continue;
      s.bossCharging ||= charging;
      s.bossStunned ||= b.stage === 'stunned';
      s.bossX = b.x;
      s.bossY = b.y;
      break;
    }
    // The music of the moment (spec 08 §7): the boss's from its fall, the round's or the rest's, and silence at the end.
    const phase = this.state.wave.phase;
    const bossOn = this.state.bosses.some((b) => b.active && b.phase !== 'warning' && b.phase !== 'dead');
    s.music = phase === 'over' ? 'over' : this.state.run ? dungeonMusic(this.state.run) : bossOn ? 'boss' : phase === 'active' ? 'round' : 'calm';
    this.services.audio.update(s);
  }

  /** Freezes or resumes the match behind the pause menu (spec 01 §2.5). */
  private setPaused(paused: boolean): void {
    if (this.overShown || paused === this.paused) return;
    this.paused = paused;
    this.services.audio.playUi(paused ? 'ui.pause.open' : 'ui.pause.close');
    this.pauseMenu[paused ? 'show' : 'hide']();
    this.pauseButton.visible = !paused;
    // The HUD's notices freeze too (hud.css).
    this.services.hudRoot.classList.toggle('is-paused', paused);
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

  /** Every player is dead (or the run is won, spec 09 §10): a moment to see it, then the game over screen. */
  private checkGameOver(delta: number): void {
    const run = this.state.run;
    const won = run?.outcome === 'won';
    if (this.overShown || (this.state.wave.phase !== 'over' && !won)) return;
    this.overFor += delta;
    if (this.overFor < GAME_OVER_DELAY_MS) return;
    this.overShown = true;
    this.pauseMenu.hide();
    this.pauseButton.visible = false;
    this.controls.resetAll();
    // Survival's record (spec 09 §1, §10): not from a debug match nor one started past round 1.
    if (this.state.mode === 'survival' && !this.services.debug && this.services.startRound === 1) this.services.records.recordSurvival(roundsSurvived(this.state));
    const data: GameOverData = {
      services: this.services,
      assets: this.assets,
      rounds: roundsSurvived(this.state),
      score: this.state.players[0]?.score ?? 0,
    };
    if (run) {
      const result = { floor: run.floor, rooms: run.roomsCleared, won, time: run.time };
      const newRecord = this.recordable ? this.services.records.recordRun(result) : false;
      data.run = {
        ...result,
        kills: run.kills,
        seed: run.seed,
        newRecord,
        upgrades: [...run.upgrades],
        curses: [...run.curses],
        keepGoing: won ? this.carryOf(descend(run, bankOf(this.assets.roomTemplates(floorConfig(run.floor + 1).ambient)))) : null,
      };
    }
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
    this.groundItemViews.sync(this.state.groundItems, this.state.time);
    this.activationSites.sync(this.state);
    this.thrownItems.sync(this.state.time);
    this.zombieViews.sync(this.state.zombies, alpha, now, this.isDark);
    this.bossViews.sync(this.state.bosses, alpha, this.state.time, this.state.tick, this.isDark);
    this.bossMarks.sync(this.state.bosses, alpha, this.isDark);
    this.bossPuddles.sync(this.state.puddles, this.state.time, this.isDark);
    this.merchantViews.sync(this.state.merchants, this.state.players, this.state.tick, this.state.time);
    this.weaponCases.sync(this.state, player);
    this.syncOffscreenArrows();
    if (player) {
      this.playerView.sync(player, alpha, this.state.tick);
      this.speedTrail.sync(player, now);
      if (player.teleports !== this.shownTeleports) {
        this.shownTeleports = player.teleports;
        this.cameras.main.centerOn(this.playerView.sprite.x, this.playerView.sprite.y);
      }
      this.aimLine.sync(player, alpha);
      this.laserBeam.sync(player, alpha);
      this.muzzleFlash.sync(player, alpha, this.state.tick);
      this.meleeSlash.sync(player, alpha);
    }
    this.bulletViews.sync(this.state.bullets, this.state.players, alpha);
    this.worldTexts.sync(now);
    // On simulated time: the pause freezes it.
    this.cantUseText.sync(this.state.players[0] ? this.playerView.sprite : undefined, this.state.time * 1000);
  }

  /** Debug panel buttons (spec 01 §8). They change the state directly: they are tools, not gameplay. */
  private createDebugActions(): DebugActions {
    return {
      nextRound: () => this.debugGoToRound(this.state.wave.round + 1),
      goToBossRound: () => this.debugGoToRound(DEBUG.bossRound),
      nextBossRound: () => {
        // The next round of the calendar with bosses (12, 18, 24…).
        let round = this.state.wave.round + 1;
        while (bossesForRound(round).length === 0 && round < this.state.wave.round + DEBUG.bossRoundSearch) round++;
        this.debugGoToRound(round);
      },
      cycleBossVariant: () => {
        this.debugVariant = BOSS_VARIANT_IDS[(BOSS_VARIANT_IDS.indexOf(this.debugVariant) + 1) % BOSS_VARIANT_IDS.length] ?? 'base';
        return STRINGS.debug.bossVariant(STRINGS.bosses.variants[this.debugVariant]);
      },
      toggleBossZones: () => (this.debugDraw.showBossZones = !this.debugDraw.showBossZones),
      // The dungeon (spec 09 §13).
      revealMap: () => debugRevealMap(this.sim),
      giveKey: () => debugGiveKey(this.sim, false),
      giveBossKey: () => debugGiveKey(this.sim, true),
      addDungeonMoney: () => {
        const p = this.state.players[0];
        if (p) p.money += DEBUG.dungeonMoney;
      },
      clearRoom: () => debugClearRoom(this.sim),
      goToBoss: () => debugGoToBoss(this.sim),
      descendFloor: () => debugDescend(this.sim),
      cycleUpgrade: () => {
        this.debugUpgrade = UPGRADE_IDS[(UPGRADE_IDS.indexOf(this.debugUpgrade) + 1) % UPGRADE_IDS.length] ?? this.debugUpgrade;
        return STRINGS.debug.upgradeChoice(STRINGS.upgrades.names[this.debugUpgrade] ?? this.debugUpgrade);
      },
      giveUpgrade: () => {
        const p = this.state.players[0];
        if (p && this.state.run) takeUpgrade(this.sim, this.state.run, p, this.debugUpgrade, true);
      },
      callWizard: () => debugCallWizard(this.sim),
      addPoints: () => {
        const p = this.state.players[0];
        if (p) p.money += DEBUG.points;
      },
      toggleGod: () => {
        const p = this.state.players[0];
        if (!p) return false;
        p.godMode = !p.godMode;
        return p.godMode;
      },
      toggleHitboxes: () => (this.debugDraw.showHitboxes = !this.debugDraw.showHitboxes),
      toggleFlowField: () => (this.debugDraw.showFlowField = !this.debugDraw.showFlowField),
      levelUpWeapon: () => {
        // One level of the kind with the fewest, among those still with room (ammo, fire rate, damage on a tie).
        const p = this.state.players[0];
        const weapon = p?.weapons[p.activeSlot];
        if (!weapon) return;
        const open = UPGRADE_KINDS.filter((k) => upgradeReason(WEAPONS[weapon.id], k, weapon.levels[k]) === null);
        const kind = open.sort((a, b) => weapon.levels[a] - weapon.levels[b])[0];
        if (kind) upgradeWeapon(weapon, kind);
      },
      toggleWeaponSpecial: () => {
        const p = this.state.players[0];
        const weapon = p?.weapons[p.activeSlot];
        if (!weapon) return false;
        weapon.special = !weapon.special;
        return weapon.special;
      },
      giveBoost: () => {
        const p = this.state.players[0];
        if (!p) return;
        this.debugBoost = this.debugBoost === 'speed' ? 'double_damage' : 'speed';
        storeBoost(p, this.debugBoost);
      },
      moveMerchants: () => {
        this.state.merchants.forEach((m, i) => {
          if (!m.enabled) return;
          m.round = this.state.wave.round;
          moveMerchant(this.sim, i);
        });
      },
      toggleRedGold: () => {
        const on = !this.state.merchants.some((m) => m.id !== 'blue' && m.enabled);
        this.state.merchants.forEach((m, i) => {
          if (m.id === 'blue') return;
          m.enabled = on;
          if (on) {
            m.round = this.state.wave.round;
            moveMerchant(this.sim, i);
          } else {
            m.active = false;
            m.spot = -1;
          }
        });
        return on;
      },
      addManyPoints: () => {
        const p = this.state.players[0];
        if (p) p.money += DEBUG.bigPoints;
      },
      giveSmg: () => this.debugGiveWeapon('smg'),
      giveShotgun: () => this.debugGiveWeapon('shotgun'),
      giveKatana: () => this.debugGiveWeapon('katana'),
      giveLaser: () => this.debugGiveWeapon('laser'),
      giveFlamethrower: () => this.debugGiveWeapon('flamethrower'),
      giveItems: () => {
        const p = this.state.players[0];
        if (p) debugGiveItems(this.state, p);
      },
      goToWand: () => {
        const p = this.state.players[0];
        const wand = this.state.groundItems.find((g) => g.item === 'worn_wand' && g.active);
        if (!p || !wand) return;
        // On the wand's own tile (always free and walkable): within reach at once. The camera jumps along.
        p.x = p.prevX = wand.x;
        p.y = p.prevY = wand.y;
        p.teleports++;
      },
      toggleItemSpots: () => (this.debugDraw.showItemSpots = !this.debugDraw.showItemSpots),
      toggleFreeHand: () => (this.state.hand.debugFree = !this.state.hand.debugFree),
      moveHand: () => moveHand(this.sim),
      forceMock: () => {
        this.state.hand.usesLeft = 0;
      },
      toggleHandSpots: () => (this.debugDraw.showHandSpots = !this.debugDraw.showHandSpots),
      summonBoss: () => {
        const slot = freeBossSlot(this.sim);
        if (slot >= 0) startBossEntry(this.sim, slot, 'butcher', this.debugVariant);
      },
      killBoss: () => {
        for (const b of this.state.bosses) if (isBossAlive(b)) killBoss(this.sim, b);
      },
      forceAttack: (attack) => {
        for (const b of this.state.bosses) {
          if (!isBossAlive(b)) continue;
          b.forcedAttack = attack;
          if (b.phase === 'walking') b.walkTimer = 0;
        }
      },
    };
  }

  /** Debug: clears the zombies and the bosses on the map and starts round `round` at once. */
  private debugGoToRound(round: number): void {
    for (const z of this.state.zombies) z.active = false;
    for (const b of this.state.bosses) b.active = false;
    startRound(this.state, round);
  }

  /** Debug: the weapon in hand, full of ammo (spec 04 §5). */
  private debugGiveWeapon(id: WeaponId): void {
    const p = this.state.players[0];
    if (!p) return;
    giveWeapon(p, id);
    const slot = p.weapons[findWeapon(p, id)];
    if (slot) refillWeapon(slot);
  }

  private updateStats(): void {
    const stats = this.services.stats;
    let alive = 0;
    for (const z of this.state.zombies) if (isZombieAlive(z)) alive++;
    stats.zombies = alive;
    stats.bullets = activeBulletCount(this.state.bullets);
    stats.round = this.state.wave.round;
    stats.tick = this.state.tick;
    // Always in view (spec 09 §13): the seed reproduces the match.
    stats.seed = this.seed;
    stats.mode = this.state.mode;
    if (this.state.run) {
      stats.floor = this.state.run.floor;
      stats.room = `${this.state.run.room} (${this.state.run.plan.rooms[this.state.run.room]?.type ?? '?'})${this.state.run.fight ? ` · ${this.state.run.fight.phase}` : ''}`;
    }
  }

  private readonly applyZoom = (): void => {
    this.cameras.main.setZoom(computeWorldZoom(this.scale.height));
    this.applyCameraBounds();
    this.safePadding = measureSafePadding();
  };

  /** Arrows at the screen edge towards merchants out of view, on the level the camera shows. */
  private syncOffscreenArrows(): void {
    const camera = this.cameras.main;
    const view = camera.worldView;
    const cssWidth = this.game.canvas.clientWidth || this.scale.width;
    const worldPerCssPx = this.scale.width / cssWidth / camera.zoom;
    const pad = this.safePadding;
    this.offscreenArrows.sync(
      this.state.merchants,
      {
        x: view.x,
        y: view.y,
        width: view.width,
        height: view.height,
        insetX: pad.x * worldPerCssPx,
        insetTop: pad.top * worldPerCssPx,
        insetBottom: pad.bottom * worldPerCssPx,
      },
      worldPerCssPx,
      (spot) => {
        const zone = this.map.merchantSpots[spot]?.zoneIndex ?? -1;
        return zone >= 0 && this.levels?.zoneLevel[zone] === this.currentLevel;
      },
    );
    // Bosses (spec 07 §6): on the level shown.
    this.bossArrows.sync(
      this.state.bosses,
      {
        x: view.x,
        y: view.y,
        width: view.width,
        height: view.height,
        insetX: pad.x * worldPerCssPx,
        insetTop: pad.top * worldPerCssPx,
        insetBottom: pad.bottom * worldPerCssPx,
      },
      worldPerCssPx,
      (x, y) => levelAt(this.map, x, y) === this.currentLevel,
    );
    // The Demon's Hand (spec 06 §3.2): only once its room is unlocked, and on the level shown.
    const handZone = this.map.handSpots[this.state.hand.spot]?.zoneIndex ?? -1;
    const showHand = handZone >= 0 && this.state.zonesUnlocked[handZone] === true && this.levels?.zoneLevel[handZone] === this.currentLevel;
    this.handView.syncArrow(
      this.state.hand,
      {
        x: view.x,
        y: view.y,
        width: view.width,
        height: view.height,
        insetX: pad.x * worldPerCssPx,
        insetTop: pad.top * worldPerCssPx,
        insetBottom: pad.bottom * worldPerCssPx,
      },
      worldPerCssPx,
      showHand,
    );
  }

  /**
   * While a shop is open the view moves down just enough for the merchant,
   * opening its coat, to show above the panel; back when it closes.
   */
  private updateShopCamera(): void {
    const camera = this.cameras.main;
    const p = this.state.players[0];
    const index = p?.shopMerchant ?? -1;
    const m = index >= 0 ? this.state.merchants[index] : undefined;
    const panelTop = this.controls.shopPanelTop();
    let offset = 0;
    if (p && m?.active && panelTop !== null) {
      const canvas = this.game.canvas.getBoundingClientRect();
      const cssWidth = canvas.width || this.scale.width;
      offset = shopCameraOffset({
        merchantBottom: this.merchantViews.bodyBottom(index, m),
        targetY: this.playerView.sprite.y,
        viewHeight: camera.height / camera.zoom,
        cssPerWorld: (cssWidth / this.scale.width) * camera.zoom,
        canvasTop: canvas.top,
        panelTop,
      });
    }
    // The follow lerp eases the move both ways.
    if (camera.followOffset.y !== offset) camera.setFollowOffset(0, offset);
  }

  /** Follows the player into another level (through a portal) and fits the camera to it. */
  private updateLevel(): void {
    const p = this.state.players[0];
    if (!p) return;
    const tx = Math.floor(p.x / this.map.tileSize);
    const ty = Math.floor(p.y / this.map.tileSize);
    const zone = tx >= 0 && ty >= 0 && tx < this.map.width && ty < this.map.height ? (this.map.cellZone[ty * this.map.width + tx] ?? -1) : -1;
    // On a door or a barricade (no zone) the level does not change.
    const level = zone >= 0 ? (this.levels.zoneLevel[zone] ?? -1) : this.currentLevel;
    if (level < 0 || level === this.currentLevel) return;
    this.currentLevel = level;
    this.applyCameraBounds();
  }

  private applyCameraBounds(): void {
    const camera = this.cameras.main;
    // The dungeon's camera stays inside the current room (spec 09 §4).
    if (this.roomCamera) {
      this.setCameraRect(this.roomCamera.t >= 1 ? this.roomCamera.to : lerpRect(this.roomCamera.from, this.roomCamera.to, this.roomCamera.t));
      return;
    }
    const level = this.levels?.levels[this.currentLevel];
    if (!level) {
      camera.setBounds(0, 0, this.map.widthPx, this.map.heightPx);
      return;
    }
    this.setCameraRect(level.bounds);
  }

  /** The camera's bounds: `rect`, widened where the view is bigger (a small room sits in the middle). */
  private setCameraRect(rect: CameraRect): void {
    const camera = this.cameras.main;
    const b = cameraBounds(rect, camera.width / camera.zoom, camera.height / camera.zoom);
    camera.setBounds(b.x, b.y, b.width, b.height);
  }

  /** A room and its walls, in world px. */
  private roomRect(room: number): CameraRect {
    const zone = this.map.zones[room];
    const ts = this.map.tileSize;
    if (!zone) return { x: 0, y: 0, width: this.map.widthPx, height: this.map.heightPx };
    return { x: zone.x - ts, y: zone.y - ts, width: zone.width + 2 * ts, height: zone.height + 2 * ts };
  }

  /** The dungeon (spec 09 §4): the camera keeps to the player's room and slides to the next one. */
  private updateRoomCamera(deltaMs: number): void {
    const run = this.state.run;
    if (!run) return;
    const rc = this.roomCamera;
    if (!rc || rc.room !== run.room) {
      const to = this.roomRect(run.room);
      // The first room shows at once; the next ones slide in from where the camera was.
      this.roomCamera = rc ? { room: run.room, from: lerpRect(rc.from, rc.to, rc.t), to, t: 0 } : { room: run.room, from: to, to, t: 1 };
    } else if (rc.t < 1) {
      rc.t = Math.min(1, rc.t + deltaMs / 1000 / DUNGEON.camera.slide);
    } else {
      return;
    }
    this.applyCameraBounds();
  }
}

interface CameraRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Between two rectangles, eased so the slide starts and ends softly. */
function lerpRect(a: CameraRect, b: CameraRect, t: number): CameraRect {
  const k = t >= 1 ? 1 : t <= 0 ? 0 : t * t * (3 - 2 * t);
  return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, width: a.width + (b.width - a.width) * k, height: a.height + (b.height - a.height) * k };
}
