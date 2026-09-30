import type { EventBus } from '../core/EventBus';
import { pixelIcon, type IconName } from '../ui/icons';
import { STRINGS } from '../ui/strings';

/**
 * Tap buttons in an arc above the fire button (spec 01 §2.3): weapon switch
 * and special (dash). Presses are latched until the next tick reads them.
 * The special button also shows its cooldown, received via the EventBus.
 */
class TapButton {
  readonly el: HTMLButtonElement;
  private pressed = false;
  private pointerId: number | null = null;

  constructor(parent: HTMLElement, className: string, icon: IconName, label: string, ariaLabel: string) {
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = `action-button ${className}`;
    this.el.setAttribute('aria-label', ariaLabel);
    const text = document.createElement('span');
    text.className = 'action-button__label';
    text.textContent = label;
    this.el.append(pixelIcon(icon, 24), text);
    parent.appendChild(this.el);

    // Every press counts, even if a previous release was never delivered,
    // so a missed pointerup can never leave the button unresponsive.
    this.el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.pointerId = e.pointerId;
      this.pressed = true;
      this.el.classList.add('is-pressed');
    });
    this.el.addEventListener('pointerup', this.release);
    this.el.addEventListener('pointercancel', this.release);
    this.el.addEventListener('pointerleave', this.release);
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerup', this.release, true);
    window.addEventListener('pointercancel', this.release, true);
  }

  private readonly release = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.el.classList.remove('is-pressed');
  };

  dispose(): void {
    window.removeEventListener('pointerup', this.release, true);
    window.removeEventListener('pointercancel', this.release, true);
  }

  /** True once per press. */
  consume(): boolean {
    const was = this.pressed;
    this.pressed = false;
    return was;
  }

  reset(): void {
    this.pressed = false;
    this.pointerId = null;
    this.el.classList.remove('is-pressed');
  }
}

export class ActionButtons {
  private readonly switchButton: TapButton;
  private readonly specialButton: TapButton;
  private readonly veil: HTMLDivElement;
  private readonly seconds: HTMLSpanElement;
  private readonly unsubscribe: () => void;

  constructor(parent: HTMLElement, events: EventBus) {
    this.switchButton = new TapButton(parent, 'action-button--switch', 'swap', STRINGS.controls.weaponShort, STRINGS.controls.switchWeapon);
    this.specialButton = new TapButton(parent, 'action-button--special', 'bolt', STRINGS.controls.specialShort, STRINGS.controls.special);

    this.veil = document.createElement('div');
    this.veil.className = 'action-button__veil';
    this.seconds = document.createElement('span');
    this.seconds.className = 'action-button__seconds';
    this.specialButton.el.append(this.veil, this.seconds);

    this.unsubscribe = events.on('special:cooldown', ({ remaining, total }) => {
      const fraction = total > 0 ? Math.min(1, remaining / total) : 0;
      this.veil.style.transform = `scaleY(${fraction})`;
      this.veil.style.display = fraction > 0 ? 'block' : 'none';
      this.seconds.textContent = fraction > 0 ? String(Math.ceil(remaining)) : '';
      this.specialButton.el.classList.toggle('is-cooling', fraction > 0);
    });
  }

  consumeSwitch(): boolean {
    return this.switchButton.consume();
  }

  consumeSpecial(): boolean {
    return this.specialButton.consume();
  }

  reset(): void {
    this.switchButton.reset();
    this.specialButton.reset();
  }

  destroy(): void {
    this.unsubscribe();
    this.switchButton.dispose();
    this.specialButton.dispose();
  }
}
