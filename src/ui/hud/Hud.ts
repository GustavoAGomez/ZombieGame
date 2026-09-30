import type { EventBus, GameEvents } from '../../core/EventBus';
import { pixelIcon } from '../icons';
import { STRINGS } from '../strings';
import './hud.css';

/**
 * DOM HUD. It only listens to EventBus payloads and never imports or
 * queries Phaser (CLAUDE.md rule 4). The DOM is touched only on events,
 * which are emitted only when a value changes.
 */
export class Hud {
  private readonly root: HTMLDivElement;
  private readonly weaponRow: HTMLDivElement;
  private readonly weaponName: HTMLSpanElement;
  private readonly magazine: HTMLSpanElement;
  private readonly reloadFill: HTMLDivElement;
  private readonly reserve: HTMLSpanElement;
  private readonly unsubscribers: (() => void)[] = [];

  constructor(parent: HTMLElement, events: EventBus) {
    this.root = document.createElement('div');
    this.root.className = 'hud';

    const right = document.createElement('div');
    right.className = 'hud-right';

    this.weaponRow = document.createElement('div');
    this.weaponRow.className = 'hud-row hud-weapon';
    this.weaponName = document.createElement('span');
    this.weaponName.className = 'hud-label';
    this.magazine = document.createElement('span');
    this.magazine.className = 'hud-mag';
    const reload = document.createElement('div');
    reload.className = 'hud-reload';
    reload.setAttribute('aria-label', STRINGS.hud.reloading);
    this.reloadFill = document.createElement('div');
    this.reloadFill.className = 'hud-reload__fill';
    reload.appendChild(this.reloadFill);
    this.reserve = document.createElement('span');
    this.reserve.className = 'hud-reserve';
    this.weaponRow.append(this.weaponName, pixelIcon('bullet', 21), this.magazine, reload, this.reserve);

    right.appendChild(this.weaponRow);
    this.root.appendChild(right);
    parent.appendChild(this.root);

    this.unsubscribers.push(events.on('weapon:state', this.onWeapon));
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
    this.root.remove();
  }

  private readonly onWeapon = (e: GameEvents['weapon:state']): void => {
    this.weaponName.textContent = STRINGS.weapons[e.weapon];
    this.magazine.textContent = String(e.magazine);
    this.reserve.textContent = `/ ${e.reserve}`;
    const reloading = e.reloadProgress !== null;
    this.weaponRow.classList.toggle('is-reloading', reloading);
    this.weaponRow.classList.toggle('is-switching', e.switching);
    if (reloading) this.reloadFill.style.transform = `scaleX(${e.reloadProgress})`;
  };
}
