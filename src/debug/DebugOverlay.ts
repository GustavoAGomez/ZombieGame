import { STRINGS } from '../ui/strings';
import './debug.css';

export interface DebugStats {
  fps: number;
  [label: string]: number | string;
}

/**
 * What the debug buttons can do, provided by the running game scene. The
 * toggles return their new state so the button shows it.
 */
export interface DebugActions {
  nextRound(): void;
  addPoints(): void;
  toggleGod(): boolean;
  toggleHitboxes(): boolean;
  toggleFlowField(): boolean;
}

const TRIPLE_TAP_WINDOW_MS = 600;
const REFRESH_MS = 250;

/**
 * Debug panel (spec 01 §8). Enabled with ?debug=1 or a triple tap on the
 * top-left corner. Stats are pulled on a timer, never every frame. Buttons:
 * next round, +1000 points, god mode, and drawing the hitboxes and the flow
 * field (only while a match is running).
 */
export class DebugOverlay {
  private readonly panel: HTMLDivElement;
  private readonly statsEl: HTMLPreElement;
  private timer = 0;
  private visible = false;

  constructor(
    root: HTMLElement,
    private readonly readStats: () => DebugStats,
    enabled: boolean,
    actions: () => DebugActions | null = () => null,
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel';
    this.statsEl = document.createElement('pre');
    const buttons = document.createElement('div');
    buttons.className = 'debug-buttons';
    const button = (label: string, run: (a: DebugActions) => boolean | void): void => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'debug-button';
      b.textContent = label;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const a = actions();
        if (!a) return;
        const on = run(a);
        if (typeof on === 'boolean') b.classList.toggle('is-on', on);
      });
      buttons.appendChild(b);
    };
    button(STRINGS.debug.nextRound, (a) => a.nextRound());
    button(STRINGS.debug.points, (a) => a.addPoints());
    button(STRINGS.debug.god, (a) => a.toggleGod());
    button(STRINGS.debug.hitboxes, (a) => a.toggleHitboxes());
    button(STRINGS.debug.flowField, (a) => a.toggleFlowField());
    this.panel.append(this.statsEl, buttons);
    root.appendChild(this.panel);

    const corner = document.createElement('div');
    corner.className = 'debug-corner';
    root.appendChild(corner);
    let taps: number[] = [];
    corner.addEventListener('pointerdown', (e) => {
      const now = e.timeStamp;
      taps = taps.filter((t) => now - t < TRIPLE_TAP_WINDOW_MS);
      taps.push(now);
      if (taps.length >= 3) {
        taps = [];
        this.setVisible(!this.visible);
      }
    });

    this.setVisible(enabled);
  }

  get isVisible(): boolean {
    return this.visible;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.panel.style.display = visible ? 'block' : 'none';
    window.clearInterval(this.timer);
    if (visible) {
      this.refresh();
      this.timer = window.setInterval(() => this.refresh(), REFRESH_MS);
    }
  }

  private refresh(): void {
    const stats = this.readStats();
    const lines: string[] = [];
    for (const [label, value] of Object.entries(stats)) {
      lines.push(`${label}: ${typeof value === 'number' ? Math.round(value) : value}`);
    }
    this.statsEl.textContent = lines.join('\n');
  }
}

export function isDebugRequested(search: string = window.location.search): boolean {
  return new URLSearchParams(search).get('debug') === '1';
}

/** ?round=N (1..99), used to test later rounds before the wave flow exists. */
export function requestedStartRound(search: string = window.location.search): number {
  const n = Number.parseInt(new URLSearchParams(search).get('round') ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 99) : 1;
}

/** ?map=<key> chooses the map from the manifest (default: the first one). */
export function requestedMap(search: string = window.location.search): string | null {
  const key = new URLSearchParams(search).get('map');
  return key && /^[a-z0-9_]+$/.test(key) ? key : null;
}
