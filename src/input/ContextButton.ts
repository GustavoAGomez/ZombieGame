import type { EventBus, GameEvents } from '../core/EventBus';
import { pixelIcon } from '../ui/icons';
import { STRINGS } from '../ui/strings';
import { PointerControl } from './PointerControl';

/**
 * Contextual action button at the right of the screen (spec 01 §2.4, now a
 * round button as in Wild Rift): it only shows up when the game says an
 * action is available (via the EventBus), with a hammer to repair a
 * barricade, a door or stairs to buy one, and a badge with the points per
 * plank or the cost (or what is missing). One tap repairs one plank or buys
 * the door. No game logic.
 */
export class ContextButton extends PointerControl {
  private readonly icons: Record<'repair' | 'door' | 'portal', SVGSVGElement>;
  private readonly value: HTMLSpanElement;
  private readonly unsubscribe: () => void;
  private held = false;
  private pressed = false;

  constructor(parent: HTMLElement, events: EventBus) {
    const button = document.createElement('div');
    button.className = 'context-button';
    button.setAttribute('role', 'button');
    super(button);

    const face = document.createElement('span');
    face.className = 'context-button__face';
    this.icons = { repair: pixelIcon('hammer', 26), door: pixelIcon('door', 24), portal: pixelIcon('stairs', 24) };
    face.append(this.icons.repair, this.icons.door, this.icons.portal);
    this.value = document.createElement('span');
    this.value.className = 'context-button__value';
    button.append(face, this.value);
    parent.appendChild(button);

    this.unsubscribe = events.on('action:context', this.onContext);
    button.addEventListener('animationend', () => button.classList.remove('is-shaking'));
  }

  get isHeld(): boolean {
    return this.held;
  }

  /** True once per press. */
  consumePress(): boolean {
    const was = this.pressed;
    this.pressed = false;
    return was;
  }

  destroy(): void {
    this.unsubscribe();
    this.dispose();
  }

  protected onPress(): void {
    this.held = true;
    this.pressed = true;
    this.target.classList.add('is-pressed');
    if (this.target.classList.contains('is-disabled')) {
      // Restart the shake animation even on repeated taps.
      this.target.classList.remove('is-shaking');
      void this.target.offsetWidth;
      this.target.classList.add('is-shaking');
    }
  }

  protected onDrag(): void {
    // Holding is all that matters; the finger may drift.
  }

  protected onRelease(): void {
    this.held = false;
    this.target.classList.remove('is-pressed');
  }

  private readonly onContext = (e: GameEvents['action:context']): void => {
    const button = this.target;
    button.classList.toggle('is-visible', e.kind !== null);
    button.classList.toggle('is-disabled', !e.enabled);
    // Blinking ring: repairing is done with repeated taps.
    button.classList.toggle('context-button--repair', e.kind === 'repair');
    for (const kind of ['repair', 'door', 'portal'] as const) this.icons[kind].style.display = e.kind === kind ? 'block' : 'none';
    if (e.kind === 'repair') {
      this.value.textContent = e.amount > 0 ? `+${e.amount}` : '';
      button.setAttribute('aria-label', STRINGS.actions.repair);
    } else if (e.kind === 'door') {
      this.value.textContent = e.enabled ? String(e.amount) : `-${e.amount}`;
      button.setAttribute('aria-label', e.enabled ? STRINGS.actions.openDoor : STRINGS.actions.missing);
    } else if (e.kind === 'portal') {
      const open = e.portal === 'hatch' ? STRINGS.actions.openHatch : STRINGS.actions.openStairs;
      this.value.textContent = e.locked ? '' : e.enabled ? String(e.amount) : `-${e.amount}`;
      button.setAttribute('aria-label', e.locked ? STRINGS.actions.locked : e.enabled ? open : STRINGS.actions.missing);
    } else if (this.active) {
      this.reset();
    }
  };
}
