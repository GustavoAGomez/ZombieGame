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
  /** Spec 03 §7: the weapon in hand one level up; its special on or off. */
  levelUpWeapon(): void;
  toggleWeaponSpecial(): boolean;
  /** A temporary boost in the slot, speed and double damage in turns. */
  giveBoost(): void;
  /** Every merchant on the map teleports now. */
  moveMerchants(): void;
  /** The red and gold merchants, off in a normal match, on (and on the map) or off again. */
  toggleRedGold(): boolean;
  addManyPoints(): void;
  /** Spec 04 §5: the weapon into a free slot (or in place of the one in hand), full of ammo. */
  giveSmg(): void;
  giveShotgun(): void;
  /** Spec 06 §5: the special weapons, which only the Demon's Hand gives in a match. */
  giveKatana(): void;
  giveLaser(): void;
  giveFlamethrower(): void;
  /** Spec 06 §5: the Demon's Hand takes no payment (on/off), moves now, mocks at the next payment, and its spots drawn. */
  toggleFreeHand(): boolean;
  moveHand(): void;
  forceMock(): void;
  toggleHandSpots(): boolean;
  /** Spec 05 §8: the heart and the wand into the inventory (off the floor: items are unique). */
  giveItems(): void;
  /** Spec 05 §8: the player next to the wand, while it is still on the floor. */
  goToWand(): void;
  /** Spec 05 §8: every item spot on the map (the wand's ringed) and the activation sites. */
  toggleItemSpots(): boolean;
  /** Spec 07 §10: El Matarife comes into the match now; the bosses on the map die. */
  summonBoss(): void;
  killBoss(): void;
  /** The bosses' next attack is this one, as soon as they finish what they are doing. */
  forceAttack(attack: 'charge' | 'slam' | 'leap'): void;
}

const TRIPLE_TAP_WINDOW_MS = 600;
const REFRESH_MS = 250;

/**
 * Debug panel (spec 01 §8, spec 03 §7, spec 04 §5, spec 05 §8). Enabled
 * with ?debug=1 or a triple tap on the top-left corner. Stats are pulled on
 * a timer, never every frame. Buttons: next round, +5000$, god mode,
 * drawing the hitboxes and the flow field, then weapon level and special, a
 * boost, moving the merchants, the red and gold merchants, +10000$, the SMG
 * and the shotgun, and the special items: both into the inventory, a jump
 * to the wand and drawing the item spots (only while a match is running).
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
    button(STRINGS.debug.levelUp, (a) => a.levelUpWeapon());
    button(STRINGS.debug.special, (a) => a.toggleWeaponSpecial());
    button(STRINGS.debug.boost, (a) => a.giveBoost());
    button(STRINGS.debug.moveMerchants, (a) => a.moveMerchants());
    button(STRINGS.debug.redGold, (a) => a.toggleRedGold());
    button(STRINGS.debug.bigPoints, (a) => a.addManyPoints());
    button(STRINGS.debug.giveSmg, (a) => a.giveSmg());
    button(STRINGS.debug.giveShotgun, (a) => a.giveShotgun());
    button(STRINGS.debug.giveKatana, (a) => a.giveKatana());
    button(STRINGS.debug.giveLaser, (a) => a.giveLaser());
    button(STRINGS.debug.giveFlamethrower, (a) => a.giveFlamethrower());
    button(STRINGS.debug.freeHand, (a) => a.toggleFreeHand());
    button(STRINGS.debug.moveHand, (a) => a.moveHand());
    button(STRINGS.debug.forceMock, (a) => a.forceMock());
    button(STRINGS.debug.handSpots, (a) => a.toggleHandSpots());
    button(STRINGS.debug.giveItems, (a) => a.giveItems());
    button(STRINGS.debug.goToWand, (a) => a.goToWand());
    button(STRINGS.debug.itemSpots, (a) => a.toggleItemSpots());
    button(STRINGS.debug.summonBoss, (a) => a.summonBoss());
    button(STRINGS.debug.killBoss, (a) => a.killBoss());
    button(STRINGS.debug.forceCharge, (a) => a.forceAttack('charge'));
    this.panel.append(this.statsEl, buttons);
    this.statsEl.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.panel.classList.toggle('is-folded');
    });
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
