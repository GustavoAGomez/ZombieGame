import { ITEMS } from '../config/balance';
import type { ItemId } from '../config/items';
import type { EventBus, GameEvents } from '../core/EventBus';
import { iconSize } from '../ui/icons';
import { STRINGS } from '../ui/strings';
import { TapButton } from './TapButton';

/**
 * The special items' inventory (spec 05 §4): a row of slots to the left of
 * the points, one per item carried (ITEMS.maxSlots at most; none is drawn
 * while it is empty), in the order they were picked up from right to left,
 * so a new item never moves the others. A tap asks to use that slot's item
 * (InputCommand.useItem); where it does nothing the slot shakes. No game
 * logic.
 */
export class ItemBar {
  readonly element: HTMLDivElement;
  private readonly slots: TapButton[] = [];
  private readonly shown: (ItemId | null)[] = [];
  private readonly unsubscribers: (() => void)[];

  constructor(
    parent: HTMLElement,
    events: EventBus,
    private readonly localPlayerId = 0,
  ) {
    this.element = document.createElement('div');
    this.element.className = 'item-bar';
    this.element.setAttribute('aria-label', STRINGS.items.inventory);
    parent.appendChild(this.element);
    for (let i = 0; i < ITEMS.maxSlots; i++) {
      const slot = new TapButton(this.element, 'item-slot', null, '', '');
      slot.el.hidden = true;
      slot.el.addEventListener('animationend', () => slot.el.classList.remove('is-shaking'));
      this.slots.push(slot);
      this.shown.push(null);
    }
    this.unsubscribers = [events.on('items:inventory', this.onInventory), events.on('item:cantUse', this.onCantUse)];
  }

  /** Slot tapped since the last tick, -1 for none (one per tick; the last tap wins). */
  consumeUse(): number {
    let used = -1;
    this.slots.forEach((slot, i) => {
      if (slot.consume() && !slot.el.hidden) used = i;
    });
    return used;
  }

  reset(): void {
    for (const slot of this.slots) slot.reset();
  }

  destroy(): void {
    for (const off of this.unsubscribers) off();
    for (const slot of this.slots) slot.dispose();
    this.element.remove();
  }

  private readonly onInventory = ({ items }: GameEvents['items:inventory']): void => {
    this.slots.forEach((button, i) => {
      const item = items[i] ?? null;
      button.el.hidden = item === null;
      if (item === null || this.shown[i] === item) {
        if (item === null) this.shown[i] = null;
        return;
      }
      this.shown[i] = item;
      // Whole pixels: the 12-unit icon at 1×, inside its frame.
      button.setIcon(item, iconSize(item, 1));
      button.el.setAttribute('aria-label', STRINGS.items.use(STRINGS.items.names[item]));
    });
  };

  /** Used where it does nothing: the slot shakes (restarted on repeated taps). */
  private readonly onCantUse = ({ playerId, slot }: GameEvents['item:cantUse']): void => {
    if (playerId !== this.localPlayerId) return;
    const el = this.slots[slot]?.el;
    if (!el) return;
    el.classList.remove('is-shaking');
    void el.offsetWidth;
    el.classList.add('is-shaking');
  };
}
