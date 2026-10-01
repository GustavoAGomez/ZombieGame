import './debug.css';

export interface DebugStats {
  fps: number;
  [label: string]: number | string;
}

const TRIPLE_TAP_WINDOW_MS = 600;
const REFRESH_MS = 250;

/**
 * Debug panel (spec 01 §8). Enabled with ?debug=1 or a triple tap on the
 * top-left corner. Stats are pulled on a timer, never every frame.
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
  ) {
    this.panel = document.createElement('div');
    this.panel.className = 'debug-panel';
    this.statsEl = document.createElement('pre');
    this.panel.appendChild(this.statsEl);
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
