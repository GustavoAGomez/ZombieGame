import { LOADOUT } from '../config/balance';
import { WEAPON_IDS, type WeaponId } from '../config/weapons';
import type { EventBus, GameEvents } from '../core/EventBus';
import { ASSET_KEYS } from '../game/assets/manifest';
import { WEAPON_ICONS, iconSize } from '../ui/icons';
import { sheetIcon } from '../ui/sheetIcons';
import { STRINGS } from '../ui/strings';
import { TapButton } from './TapButton';

/**
 * Weapon slots in a column at the top right of the screen: one per weapon
 * the player carries, at most LOADOUT.maxWeapons, each with its icon and the
 * bullets in its magazine. Tapping a slot picks that weapon; the active one
 * is highlighted. No game logic.
 */
export class WeaponBar {
  readonly element: HTMLDivElement;
  private readonly slots: TapButton[] = [];
  private readonly shown: (WeaponId | null)[] = [];
  private readonly unsubscribe: () => void;

  constructor(parent: HTMLElement, events: EventBus) {
    this.element = document.createElement('div');
    this.element.className = 'weapon-column';
    parent.appendChild(this.element);
    for (let i = 0; i < LOADOUT.maxWeapons; i++) {
      const slot = new TapButton(this.element, 'weapon-slot', null, '', STRINGS.controls.weaponSlot(i + 1));
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
        // The weapon's PixelLab outline at 1×; without art, its SVG glyph.
        const icon = sheetIcon(ASSET_KEYS.weaponIcon, WEAPON_IDS.indexOf(slot.weapon));
        if (icon) button.setIconElement(icon);
        else button.setIcon(WEAPON_ICONS[slot.weapon], iconSize(WEAPON_ICONS[slot.weapon], 1));
        button.el.setAttribute('aria-label', `${STRINGS.controls.weaponSlot(i + 1)}: ${STRINGS.weapons[slot.weapon]}`);
      }
      // A weapon without rounds shows no count, but one that wears out (the katana) shows its uses left; broken, it is empty.
      const rounds = slot.ammo === 'rounds';
      button.setLabel(rounds ? String(slot.magazine) : slot.uses !== null ? String(slot.uses) : '');
      button.el.classList.toggle('is-active', i === active);
      button.el.classList.toggle('is-empty', (rounds && slot.magazine === 0 && slot.reserve === 0) || slot.uses === 0);
    });
  };
}
