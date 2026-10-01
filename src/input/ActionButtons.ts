import { WEAPONS } from '../config/balance';
import type { EventBus } from '../core/EventBus';
import { pixelIcon, type IconName } from '../ui/icons';
import { STRINGS } from '../ui/strings';

/**
 * Tap buttons in an arc above the fire button (spec 01 §2.3): weapon switch,
 * special (dash), reload, right above the fire button, and the knife, left
 * of the switch. Presses are
 * latched until the next tick reads them. The special button shows its
 * cooldown and the reload button the reload in progress (dimmed while there
 * is nothing to reload), both received via the EventBus.
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
  private readonly reloadButton: TapButton;
  private readonly meleeButton: TapButton;
  private readonly veil: HTMLDivElement;
  private readonly seconds: HTMLSpanElement;
  private readonly reloadVeil: HTMLDivElement;
  private readonly unsubscribe: (() => void)[];

  constructor(parent: HTMLElement, events: EventBus) {
    this.switchButton = new TapButton(parent, 'action-button--switch', 'swap', STRINGS.controls.weaponShort, STRINGS.controls.switchWeapon);
    this.specialButton = new TapButton(parent, 'action-button--special', 'bolt', STRINGS.controls.specialShort, STRINGS.controls.special);
    this.reloadButton = new TapButton(parent, 'action-button--reload', 'reload', STRINGS.controls.reloadShort, STRINGS.controls.reload);
    this.meleeButton = new TapButton(parent, 'action-button--melee', 'knife', STRINGS.controls.meleeShort, STRINGS.controls.melee);

    this.veil = document.createElement('div');
    this.veil.className = 'action-button__veil';
    this.seconds = document.createElement('span');
    this.seconds.className = 'action-button__seconds';
    this.specialButton.el.append(this.veil, this.seconds);
    this.reloadVeil = document.createElement('div');
    this.reloadVeil.className = 'action-button__veil';
    this.reloadButton.el.append(this.reloadVeil);

    this.unsubscribe = [
      events.on('special:cooldown', ({ remaining, total }) => {
        const fraction = total > 0 ? Math.min(1, remaining / total) : 0;
        this.veil.style.transform = `scaleY(${fraction})`;
        this.veil.style.display = fraction > 0 ? 'block' : 'none';
        this.seconds.textContent = fraction > 0 ? String(Math.ceil(remaining)) : '';
        this.specialButton.el.classList.toggle('is-cooling', fraction > 0);
      }),
      events.on('weapon:state', ({ weapon, magazine, reserve, reloadProgress, switching }) => {
        const reloading = reloadProgress !== null;
        // The veil empties as the reload progresses.
        this.reloadVeil.style.transform = `scaleY(${reloading ? 1 - reloadProgress : 0})`;
        this.reloadVeil.style.display = reloading ? 'block' : 'none';
        this.reloadButton.el.classList.toggle('is-cooling', reloading);
        const canReload = !reloading && !switching && magazine < WEAPONS[weapon].magazine && reserve > 0;
        this.reloadButton.el.classList.toggle('is-disabled', !reloading && !canReload);
      }),
    ];
  }

  consumeSwitch(): boolean {
    return this.switchButton.consume();
  }

  consumeSpecial(): boolean {
    return this.specialButton.consume();
  }

  consumeReload(): boolean {
    return this.reloadButton.consume();
  }

  consumeMelee(): boolean {
    return this.meleeButton.consume();
  }

  reset(): void {
    this.switchButton.reset();
    this.specialButton.reset();
    this.reloadButton.reset();
    this.meleeButton.reset();
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    this.switchButton.dispose();
    this.specialButton.dispose();
    this.reloadButton.dispose();
    this.meleeButton.dispose();
  }
}
