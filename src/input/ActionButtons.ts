import { WEAPONS } from '../config/balance';
import type { EventBus } from '../core/EventBus';
import { STRINGS } from '../ui/strings';
import { TapButton } from './TapButton';

/**
 * Buttons around the fire button (only two, as in Wild Rift's skill arc):
 * reload right above it and the knife to its left. The special (dash) sits
 * in the bottom bar, after the weapon slots. The reload button shows the
 * reload in progress (dimmed while there is nothing to reload) and the
 * special its cooldown, both received via the EventBus.
 */
/**
 * A dark veil for a cooldown or a reload, inside a holder clipped to the
 * circle within the button's ring: scaled from the bottom it reads as a
 * level going down inside the icon, never as a squashed disc.
 */
function addVeil(button: HTMLElement): HTMLDivElement {
  const clip = document.createElement('div');
  clip.className = 'action-button__clip';
  const veil = document.createElement('div');
  veil.className = 'action-button__veil';
  clip.appendChild(veil);
  button.appendChild(clip);
  return veil;
}

export class ActionButtons {
  private readonly specialButton: TapButton;
  private readonly reloadButton: TapButton;
  private readonly meleeButton: TapButton;
  private readonly veil: HTMLDivElement;
  private readonly seconds: HTMLSpanElement;
  private readonly reloadVeil: HTMLDivElement;
  private readonly unsubscribe: (() => void)[];

  constructor(parent: HTMLElement, bottomBar: HTMLElement, events: EventBus) {
    this.reloadButton = new TapButton(parent, 'action-button--reload', 'reload', '', STRINGS.controls.reload);
    this.meleeButton = new TapButton(parent, 'action-button--melee', 'knife', '', STRINGS.controls.melee);
    this.specialButton = new TapButton(bottomBar, 'action-button--special', 'bolt', '', STRINGS.controls.special);

    this.veil = addVeil(this.specialButton.el);
    this.seconds = document.createElement('span');
    this.seconds.className = 'action-button__seconds';
    this.specialButton.el.append(this.seconds);
    this.reloadVeil = addVeil(this.reloadButton.el);

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
    this.specialButton.reset();
    this.reloadButton.reset();
    this.meleeButton.reset();
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
    this.specialButton.dispose();
    this.reloadButton.dispose();
    this.meleeButton.dispose();
  }
}
