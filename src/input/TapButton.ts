import { pixelIcon, type IconName } from '../ui/icons';

/**
 * A round tap button of the touch controls. Presses are latched until the
 * next tick reads them (consume), so a quick tap between two ticks is never
 * lost. No game logic.
 */
export class TapButton {
  readonly el: HTMLButtonElement;
  private readonly iconHolder: HTMLSpanElement;
  private readonly labelEl: HTMLSpanElement;
  private pressed = false;
  private pointerId: number | null = null;

  constructor(parent: HTMLElement, className: string, icon: IconName | null, label: string, ariaLabel: string, iconSize = 20) {
    this.el = document.createElement('button');
    this.el.type = 'button';
    this.el.className = `action-button ${className}`;
    this.el.setAttribute('aria-label', ariaLabel);
    this.iconHolder = document.createElement('span');
    this.iconHolder.className = 'action-button__icon';
    if (icon) this.iconHolder.appendChild(pixelIcon(icon, iconSize));
    this.labelEl = document.createElement('span');
    this.labelEl.className = 'action-button__label';
    this.labelEl.textContent = label;
    this.el.append(this.iconHolder, this.labelEl);
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

  /** Replaces the icon (e.g. a weapon slot that now holds another weapon). */
  setIcon(icon: IconName, size = 20): void {
    this.iconHolder.replaceChildren(pixelIcon(icon, size));
  }

  setLabel(label: string): void {
    this.labelEl.textContent = label;
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
