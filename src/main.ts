import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/silkscreen/latin-400.css';
import './ui/global.css';
import { COLORS, applyThemeTokens } from './config/theme';
import { EventBus } from './core/EventBus';
import { DebugOverlay, isDebugRequested, requestedStartRound } from './debug/DebugOverlay';
import { BootScene } from './game/scenes/BootScene';
import { GameScene } from './game/scenes/GameScene';
import type { Services } from './game/services';
import { measureViewport, watchViewport } from './game/viewport';
import { mountRotateOverlay } from './ui/RotateOverlay';

function requireElement(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el;
}

applyThemeTokens();

const gameRoot = requireElement('game');
const hudRoot = requireElement('hud');
mountRotateOverlay(document.body);

const services: Services = {
  events: new EventBus(),
  hudRoot,
  debug: isDebugRequested(),
  stats: { fps: 0 },
  startRound: requestedStartRound(),
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
  scene: [new BootScene(services), new GameScene()],
});

watchViewport(game, gameRoot);

new DebugOverlay(
  hudRoot,
  () => {
    services.stats.fps = game.loop.actualFps;
    return services.stats;
  },
  services.debug,
);

if (services.debug) {
  // Handy for inspecting the running game from the browser console.
  (window as unknown as { game: Phaser.Game }).game = game;
}
