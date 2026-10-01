import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/silkscreen/latin-400.css';
import './ui/global.css';
import { COLORS, applyThemeTokens } from './config/theme';
import { blockZoom } from './ui/noZoom';
import { EventBus } from './core/EventBus';
import { DebugOverlay, isDebugRequested, requestedMap, requestedStartRound } from './debug/DebugOverlay';
import { BootScene } from './game/scenes/BootScene';
import { GameOverScene } from './game/scenes/GameOverScene';
import { GameScene } from './game/scenes/GameScene';
import { TitleScene } from './game/scenes/TitleScene';
import type { Services } from './game/services';
import { measureViewport, watchViewport } from './game/viewport';
import { mountRotateOverlay } from './ui/RotateOverlay';

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

applyThemeTokens();
// No zoom of any kind: iOS Safari ignores the viewport meta (src/ui/noZoom.ts).
blockZoom();

const gameRoot = requireElement('game');
const hudRoot = requireElement('hud');
mountRotateOverlay(document.body);

const services: Services = {
  events: new EventBus(),
  hudRoot,
  debug: isDebugRequested(),
  stats: { fps: 0 },
  startRound: requestedStartRound(),
  mapKey: requestedMap(),
  debugActions: null,
};

const size = measureViewport(gameRoot);

const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: gameRoot,
  width: size.width,
  height: size.height,
  backgroundColor: COLORS.ink,
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, autoRound: true },
  // Touch controls are DOM elements; Phaser does not need to listen to input.
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  banner: false,
  scene: [new BootScene(services), new TitleScene(), new GameScene(), new GameOverScene()],
});

watchViewport(game, gameRoot);

new DebugOverlay(
  hudRoot,
  () => {
    services.stats.fps = game.loop.actualFps;
    return services.stats;
  },
  services.debug,
  () => services.debugActions,
);

if (services.debug) {
  // Handy for inspecting the running game from the browser console.
  (window as unknown as { game: Phaser.Game }).game = game;
}
