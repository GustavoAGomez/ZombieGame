import { pixelIcon } from '../icons';
import { STRINGS } from '../strings';
import './screens.css';

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

function button(label: string, onClick: () => void, extra = ''): HTMLButtonElement {
  const b = el('button', `screen-button ${extra}`.trim(), label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

/** Title screen: JUGAR over the whole screen. That tap is also where audio will be unlocked. */
export class TitleScreen {
  private readonly root: HTMLDivElement;

  constructor(parent: HTMLElement, onPlay: () => void) {
    this.root = el('div', 'screen screen--title');
    const play = button(STRINGS.title.play, onPlay, 'screen-button--primary screen-button--big');
    this.root.append(el('h1', 'screen-title', STRINGS.gameTitle), el('p', 'screen-subtitle', STRINGS.title.subtitle), play);
    parent.appendChild(this.root);
    play.focus();
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

  constructor(parent: HTMLElement, info: GameOverInfo, onRetry: () => void) {
    this.root = el('div', 'screen screen--over');
    const points = el('div', 'screen-points');
    points.append(el('span', 'hud-label', STRINGS.gameOver.points), el('span', 'screen-points__value', String(info.score)));
    const retry = button(STRINGS.gameOver.retry, onRetry, 'screen-button--primary screen-button--big');
    this.root.append(
      el('h1', 'screen-title', STRINGS.gameOver.title),
      el('p', 'screen-line', STRINGS.gameOver.survived(info.rounds)),
      points,
      retry,
    );
    parent.appendChild(this.root);
    retry.focus();
  }

  destroy(): void {
    this.root.remove();
  }
}

/** Pause menu with CONTINUAR and REINICIAR; hidden until shown. */
export class PauseMenu {
  private readonly root: HTMLDivElement;
  private readonly resume: HTMLButtonElement;

  constructor(parent: HTMLElement, onResume: () => void, onRestart: () => void) {
    this.root = el('div', 'screen screen--pause');
    this.root.hidden = true;
    this.resume = button(STRINGS.pause.resume, onResume, 'screen-button--primary');
    const buttons = el('div', 'screen-buttons');
    buttons.append(this.resume, button(STRINGS.pause.restart, onRestart));
    this.root.append(el('h1', 'screen-title', STRINGS.pause.title), buttons);
    parent.appendChild(this.root);
  }

  get visible(): boolean {
    return !this.root.hidden;
  }

  show(): void {
    this.root.hidden = false;
    this.resume.focus();
  }

  hide(): void {
    this.root.hidden = true;
  }

  destroy(): void {
    this.root.remove();
  }
}

/** The 44×44 pause button at the top centre. */
export class PauseButton {
  private readonly root: HTMLButtonElement;

  constructor(parent: HTMLElement, onPause: () => void) {
    this.root = el('button', 'pause-button');
    this.root.type = 'button';
    this.root.setAttribute('aria-label', STRINGS.pause.button);
    this.root.appendChild(pixelIcon('pause', 18));
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
