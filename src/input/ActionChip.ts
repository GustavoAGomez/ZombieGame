import type { EventBus, GameEvents } from '../core/EventBus';
import { STRINGS } from '../ui/strings';
import { PointerControl } from './PointerControl';

/**
 * Contextual action chip (spec 01 §2.4). It only shows up when the game
 * says an action is available (via the EventBus) and reports each press:
 * one tap repairs one plank, one tap buys a door. No game logic.
 */
export class ActionChip extends PointerControl {
  private readonly label: HTMLSpanElement;
  private readonly value: HTMLSpanElement;
  private readonly unsubscribe: () => void;
  private held = false;
  private pressed = false;

  constructor(parent: HTMLElement, events: EventBus) {
    const chip = document.createElement('div');
    chip.className = 'action-chip';
    chip.setAttribute('role', 'button');
    super(chip);

    this.label = document.createElement('span');
    this.label.className = 'action-chip__label';
    this.value = document.createElement('span');
    this.value.className = 'action-chip__value';
    chip.append(this.label, this.value);
    parent.appendChild(chip);

    this.unsubscribe = events.on('action:context', this.onContext);
    chip.addEventListener('animationend', () => chip.classList.remove('is-shaking'));
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
    const chip = this.target;
    chip.classList.toggle('is-visible', e.kind !== null);
    chip.classList.toggle('is-disabled', !e.enabled);
    chip.classList.toggle('action-chip--door', e.kind === 'door');
    // Blinking border: repairing is done with repeated taps.
    chip.classList.toggle('action-chip--repair', e.kind === 'repair');
    if (e.kind === 'repair') {
      this.label.textContent = STRINGS.actions.repair;
      this.value.textContent = e.amount > 0 ? `+${e.amount}` : '';
      chip.setAttribute('aria-label', STRINGS.actions.repair);
    } else if (e.kind === 'door') {
      this.label.textContent = e.enabled ? STRINGS.actions.openDoor : STRINGS.actions.missing;
      this.value.textContent = String(e.amount);
      chip.setAttribute('aria-label', STRINGS.actions.openDoor);
    } else if (this.active) {
      this.reset();
    }
  };
}
