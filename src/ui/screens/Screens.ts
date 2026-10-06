import { nextVolumeLevel, type VolumeLevel } from '../../config/audio';
import type { GameMode } from '../../config/dungeon';
import type { RecordValues } from '../../native/records';
import { pixelIcon } from '../icons';
import { STRINGS } from '../strings';
import './screens.css';

/** Plays a menu sound by its id (spec 08 §1): the screens never import the audio engine. */
export type PlayUi = (id: string) => void;

/**
 * Full-screen menus in plain DOM, like the HUD: they only call back, never
 * touch the game (CLAUDE.md rule 4). Every visible text comes from strings.ts.
 */

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label: string, onClick: () => void, extra = '', playUi?: PlayUi): HTMLButtonElement {
  const b = el('button', `screen-button ${extra}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', () => {
    playUi?.('ui.tap');
    onClick();
  });
  return b;
}

/**
 * Focuses the main button so Enter works with a keyboard. Only where there
 * is a mouse: on a touch screen the focus ring would show around it.
 */
function focusForKeyboard(b: HTMLButtonElement): void {
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) b.focus();
}

/** The records under each mode's button (spec 09 §10), as lines; none says so. */
export function recordLines(records: Readonly<RecordValues>, mode: GameMode): string[] {
  if (mode === 'survival') return [records.survival.bestRound > 0 ? STRINGS.title.survivalRecord(records.survival.bestRound) : STRINGS.title.noRecord];
  const d = records.dungeon;
  if (d.bestFloor === 0) return [STRINGS.title.noRecord];
  const lines = [STRINGS.title.dungeonRecord(d.bestFloor, d.mostRooms)];
  if (d.wins > 0 && d.bestWinTime !== null) lines.push(STRINGS.title.dungeonWins(d.wins, STRINGS.clock(d.bestWinTime)));
  return lines;
}

/**
 * Title screen (spec 09 §1): SUPERVIVENCIA and MAZMORRA, each with its line
 * and its record. Either tap is also where the audio is unlocked.
 */
export class TitleScreen {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, onPlay: (mode: GameMode) => void, records: Readonly<RecordValues>, preselected: GameMode = 'survival') {
    this.root = el('div', 'screen screen--title');
    const modes = el('div', 'screen-modes');
    const buttons: Partial<Record<GameMode, HTMLButtonElement>> = {};
    const add = (mode: GameMode, name: string, subtitle: string): void => {
      const column = el('div', 'screen-mode');
      const play = button(name, () => onPlay(mode), 'screen-button--primary screen-button--big');
      buttons[mode] = play;
      column.append(play, el('p', 'screen-subtitle', subtitle));
      for (const line of recordLines(records, mode)) column.append(el('p', 'screen-mode__record', line));
      modes.appendChild(column);
    };
    add('survival', STRINGS.title.survival, STRINGS.title.survivalSubtitle);
    add('dungeon', STRINGS.title.dungeon, STRINGS.title.dungeonSubtitle);
    this.root.append(el('h1', 'screen-title', STRINGS.gameTitle), modes);
    parent.appendChild(this.root);
    const focus = buttons[preselected];
    if (focus) focusForKeyboard(focus);
  }

  destroy(): void {
    this.root.remove();
  }
}

export interface GameOverInfo {
  rounds: number;
  score: number;
}

/** Game over: rounds survived, points and REINTENTAR. */
export class GameOverScreen {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, info: GameOverInfo, onRetry: () => void, playUi?: PlayUi) {
    this.root = el('div', 'screen screen--over');
    const points = el('div', 'screen-points');
    points.append(el('span', 'hud-label', STRINGS.gameOver.points), el('span', 'screen-points__value', String(info.score)));
    const retry = button(STRINGS.gameOver.retry, onRetry, 'screen-button--primary screen-button--big', playUi);
    this.root.append(
      el('h1', 'screen-title', STRINGS.gameOver.title),
      el('p', 'screen-line', STRINGS.gameOver.survived(info.rounds)),
      points,
      retry,
    );
    parent.appendChild(this.root);
    focusForKeyboard(retry);
  }

  destroy(): void {
    this.root.remove();
  }
}

/** How a dungeon run ended (spec 09 §10). */
export interface RunOverInfo {
  won: boolean;
  floor: number;
  rooms: number;
  kills: number;
  /** Seconds of play. */
  time: number;
  seed: number;
  newRecord: boolean;
}

export interface RunOverActions {
  again: () => void;
  sameSeed: () => void;
  menu: () => void;
  /** Only when won: down to the next floor (§12). */
  keepGoing?: () => void;
}

/** The end of a run (spec 09 §10): HAS CAÍDO or HAS ESCAPADO, the floor, rooms, kills and time, the seed, and the ways out. */
export class RunOverScreen {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, info: RunOverInfo, actions: RunOverActions, playUi?: PlayUi) {
    this.root = el('div', 'screen screen--over');
    const S = STRINGS.dungeon;
    const lines = el('div', 'screen-stats');
    lines.append(
      el('p', 'screen-line', S.floorReached(info.floor)),
      el('p', 'screen-line', S.roomsCleared(info.rooms)),
      el('p', 'screen-line', S.kills(info.kills)),
      el('p', 'screen-line', S.time(STRINGS.clock(info.time))),
    );
    const buttons = el('div', 'screen-buttons');
    const again = button(S.again, actions.again, 'screen-button--primary', playUi);
    buttons.append(again, button(S.sameSeed, actions.sameSeed, '', playUi), button(S.menu, actions.menu, '', playUi));
    if (actions.keepGoing) buttons.prepend(button(S.keepGoing, actions.keepGoing, 'screen-button--primary', playUi));
    this.root.append(el('h1', 'screen-title', info.won ? S.escaped : S.fell), lines);
    if (info.newRecord) this.root.append(el('p', 'screen-mode__record', S.newRecord));
    this.root.append(el('p', 'screen-subtitle', S.seed(info.seed)), buttons);
    parent.appendChild(this.root);
    focusForKeyboard(again);
  }

  destroy(): void {
    this.root.remove();
  }
}

/** Preferences the pause menu switches; the caller keeps them (src/native/preferences.ts). */
export interface PauseSettings {
  vibration: boolean;
  /** Effects and music volume (spec 08 §2): each tap goes ALTO → MEDIO → BAJO → NO. */
  sfx: VolumeLevel;
  music: VolumeLevel;
}

/** Pause menu with CONTINUAR, REINICIAR and the vibration, effects and music settings; hidden until shown. */
export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly resume: HTMLButtonElement;

  constructor(parent: HTMLElement, onResume: () => void, onRestart: () => void, settings: PauseSettings, playUi?: PlayUi) {
    this.root = el('div', 'screen screen--pause');
    this.root.hidden = true;
    // CONTINUAR sounds as the pause closing (spec 08 §6.6), not as a tap.
    this.resume = button(STRINGS.pause.resume, onResume, 'screen-button--primary');
    const buttons = el('div', 'screen-buttons');
    buttons.append(this.resume, button(STRINGS.pause.restart, onRestart, '', playUi));
    const vibrate = button('', () => {
      settings.vibration = !settings.vibration;
      showVibration();
    }, 'screen-button--toggle', playUi);
    const showVibration = (): void => {
      vibrate.textContent = STRINGS.pause.vibration(settings.vibration);
      vibrate.setAttribute('aria-pressed', String(settings.vibration));
    };
    showVibration();
    // The new level is set before the tap's sound, so EFECTOS sounds at the level just chosen.
    const level = (key: 'sfx' | 'music', label: (level: VolumeLevel) => string): HTMLButtonElement => {
      const b = button('', () => {
        settings[key] = nextVolumeLevel(settings[key]);
        show();
        playUi?.('ui.tap');
      }, 'screen-button--toggle');
      const show = (): void => {
        b.textContent = label(settings[key]);
        b.setAttribute('aria-pressed', String(settings[key] !== 'off'));
      };
      show();
      return b;
    };
    const sound = el('div', 'screen-settings');
    sound.append(vibrate, level('sfx', STRINGS.pause.sfx), level('music', STRINGS.pause.music));
    this.root.append(el('h1', 'screen-title', STRINGS.pause.title), buttons, sound);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    focusForKeyboard(this.resume);
  }

  hide(): void {
    this.root.hidden = true;
  }

  destroy(): void {
    this.root.remove();
  }
}

/** The 32×32 pause button in the bottom-right corner (its tap area is larger, screens.css). */
export class PauseButton {
  private readonly root: HTMLButtonElement;

  constructor(parent: HTMLElement, onPause: () => void) {
    this.root = el('button', 'pause-button');
    this.root.type = 'button';
    this.root.setAttribute('aria-label', STRINGS.pause.button);
    this.root.appendChild(pixelIcon('pause', 24));
    this.root.addEventListener('click', onPause);
    parent.appendChild(this.root);
  }

  set visible(v: boolean) {
    this.root.hidden = !v;
  }

  destroy(): void {
    this.root.remove();
  }
}
