import type { EventBus, GameEvents } from '../core/EventBus';
import { STRINGS } from '../ui/strings';
import { PointerControl } from './PointerControl';

/**
 * Contextual action chip (spec 01 §2.4). It only shows up when the game
 * says an action is available (via the EventBus) and reports whether it is
 * held (repair) and when it was pressed (doors, phase 6). No game logic.
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
  }

  protected onPress(): void {
    this.held = true;
    this.pressed = true;
    this.target.classList.add('is-pressed');
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
