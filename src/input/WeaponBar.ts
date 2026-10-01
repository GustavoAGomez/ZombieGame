import { LOADOUT, type WeaponId } from '../config/balance';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { IconName } from '../ui/icons';
import { STRINGS } from '../ui/strings';
import { TapButton } from './TapButton';

/** Provisional icon per weapon (final art later). */
export const WEAPON_ICONS: Readonly<Record<WeaponId, IconName>> = {
  pistol: 'pistol',
  smg: 'rifle',
};

/**
 * Bottom bar of the HUD (like Wild Rift's summoner spells): one slot per
 * weapon the player carries, at most LOADOUT.maxWeapons, each with its icon
 * and the bullets in its magazine. Tapping a slot picks that weapon; the
 * active one is highlighted. Other buttons (the special) can be appended to
 * `element`. No game logic.
 */
export class WeaponBar {
  readonly element: HTMLDivElement;
  private readonly slots: TapButton[] = [];
  private readonly shown: (WeaponId | null)[] = [];
  private readonly unsubscribe: () => void;

  constructor(parent: HTMLElement, events: EventBus) {
    this.element = document.createElement('div');
    this.element.className = 'bottom-bar';
    const weapons = document.createElement('div');
    weapons.className = 'bottom-bar__weapons';
    this.element.appendChild(weapons);
    parent.appendChild(this.element);
    for (let i = 0; i < LOADOUT.maxWeapons; i++) {
      const slot = new TapButton(weapons, 'weapon-slot', null, '', STRINGS.controls.weaponSlot(i + 1));
      slot.el.hidden = true;
      this.slots.push(slot);
      this.shown.push(null);
    }
    this.unsubscribe = events.on('weapons:loadout', this.onLoadout);
  }

  /** Slot tapped since the last tick, -1 for none (one per tick; the last tap wins). */
  consumeSelect(): number {
    let picked = -1;
    this.slots.forEach((slot, i) => {
      if (slot.consume()) picked = i;
    });
    return picked;
  }

  reset(): void {
    for (const slot of this.slots) slot.reset();
  }

  destroy(): void {
    this.unsubscribe();
    for (const slot of this.slots) slot.dispose();
    this.element.remove();
  }

  private readonly onLoadout = ({ slots, active }: GameEvents['weapons:loadout']): void => {
    this.slots.forEach((button, i) => {
      const slot = slots[i];
      button.el.hidden = !slot;
      if (!slot) return;
      if (this.shown[i] !== slot.weapon) {
        this.shown[i] = slot.weapon;
        button.setIcon(WEAPON_ICONS[slot.weapon], 24);
        button.el.setAttribute('aria-label', `${STRINGS.controls.weaponSlot(i + 1)}: ${STRINGS.weapons[slot.weapon]}`);
      }
      button.setLabel(String(slot.magazine));
      button.el.classList.toggle('is-active', i === active);
      button.el.classList.toggle('is-empty', slot.magazine === 0 && slot.reserve === 0);
    });
  };
}
