import { COLORS } from '../config/theme';
import type { Rarity } from '../config/upgrades';
import type { BoostKind } from '../config/balance';
import { UPGRADE_LEVELS, WEAPONS, type UpgradeKind } from '../config/weapons';
import { merchantDef, type MerchantId, type MerchantItemId } from '../config/merchants';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { ShopItemStatus } from '../core/shop';
import { WEAPON_ICONS, pixelIcon, type IconName } from '../ui/icons';
import { STRINGS } from '../ui/strings';
import './shop.css';

type ShopRow = GameEvents['shop:state']['rows'][number];

/** Provisional item icons, drawn in the merchant's colour. */
const ITEM_ICONS: Record<MerchantItemId, IconName> = {
  max_ammo: 'bullet',
  round_boost: 'bolt',
  upgrade_ammo: 'bullet',
  upgrade_fire_rate: 'bolt',
  upgrade_damage: 'crosshair',
  weapon_special: 'star',
  repair: 'hammer',
  upgrade: 'star',
  reroll: 'reload',
  key: 'door',
  medkit: 'heart',
};
/** The dungeon's rarities (spec 09 §7.1), in the wizards' colours: a rarity sells with its wizard. */
const RARITY_COLORS: Record<Rarity, string> = { common: COLORS.merchantBlue, rare: COLORS.red, legendary: COLORS.amber };
/** The red merchant's items, by the kind of upgrade they sell. */
const UPGRADE_OF: Partial<Record<MerchantItemId, UpgradeKind>> = { upgrade_ammo: 'ammo', upgrade_fire_rate: 'fire_rate', upgrade_damage: 'damage' };
/** The round boost row shows the boost drawn for this visit. */
const BOOST_ICONS: Record<BoostKind, IconName> = { speed: 'bolt', double_damage: 'x2' };

interface RowElements {
  index: number;
  /** Weapon slot of a row sold per weapon, -1 otherwise. */
  slot: number;
  row: HTMLDivElement;
  button: HTMLButtonElement;
  status: ShopItemStatus;
}

/**
 * A merchant's shop panel (spec 03 §3). It shows what the game publishes
 * (`shop:state`) and turns taps into commands: COMPRAR buys the item (read
 * by InputCollector as `shopBuy`), X closes (`shopClose`). The match keeps
 * running and the panel stays in the upper half, clear of the joystick and
 * the fire button. With too few points the button shakes and nothing is
 * sent; items that would do nothing are disabled with the reason. No game
 * logic.
 */
export class ShopPanel {
  readonly el: HTMLDivElement;
  private readonly title: HTMLSpanElement;
  private readonly list: HTMLDivElement;
  private readonly closeButton: HTMLButtonElement;
  private readonly unsubscribe: () => void;
  private rows: RowElements[] = [];
  /** Merchant and items the rows were built for. */
  private builtFor = '';
  private buy = -1;
  private buySlot = -1;
  private close = false;

  constructor(parent: HTMLElement, events: EventBus) {
    this.el = document.createElement('div');
    this.el.className = 'shop-panel';
    this.el.hidden = true;
    const header = document.createElement('div');
    header.className = 'shop-panel__header';
    this.title = document.createElement('span');
    this.title.className = 'shop-panel__title';
    this.closeButton = document.createElement('button');
    this.closeButton.type = 'button';
    this.closeButton.className = 'shop-panel__close';
    this.closeButton.setAttribute('aria-label', STRINGS.shop.close);
    this.closeButton.textContent = '×';
    onTap(this.closeButton, () => (this.close = true));
    header.append(this.title, this.closeButton);
    this.list = document.createElement('div');
    this.list.className = 'shop-panel__rows';
    this.el.append(header, this.list);
    parent.appendChild(this.el);
    this.unsubscribe = events.on('shop:state', this.onShop);
  }

  /** Top edge of the open panel on screen (CSS px), or null while it is closed. */
  top(): number | null {
    return this.el.hidden ? null : this.el.getBoundingClientRect().top;
  }

  /** Item index bought since the last tick (and its weapon slot for items sold per weapon), or null. */
  consumeBuy(): { item: number; slot: number } | null {
    if (this.buy < 0) return null;
    const bought = { item: this.buy, slot: this.buySlot };
    this.buy = -1;
    this.buySlot = -1;
    return bought;
  }

  /** True once after the X was tapped. */
  consumeClose(): boolean {
    const was = this.close;
    this.close = false;
    return was;
  }

  reset(): void {
    this.buy = -1;
    this.buySlot = -1;
    this.close = false;
  }

  destroy(): void {
    this.unsubscribe();
    this.el.remove();
  }

  private readonly onShop = (e: GameEvents['shop:state']): void => {
    if (!e.merchant) {
      this.el.hidden = true;
      this.builtFor = '';
      this.reset();
      return;
    }
    const key = `${e.merchant}:${e.rows.map((r) => `${r.index}${r.boost ?? ''}${r.slot ?? ''}${r.weapon ?? ''}${r.level ?? ''}${r.uses ?? ''}${r.upgrade ?? ''}:${r.price}`).join(',')}`;
    if (key !== this.builtFor) this.build(e.merchant, e.rows, key);
    this.el.hidden = false;
    e.rows.forEach((r, i) => {
      const row = this.rows[i];
      if (row) this.showStatus(row, r);
    });
  };

  private build(merchant: MerchantId | 'boss_chest', rows: readonly ShopRow[], key: string): void {
    this.builtFor = key;
    const color = merchant === 'boss_chest' ? COLORS.amber : merchantDef(merchant).color;
    this.el.style.setProperty('--merchant', color);
    this.title.textContent = merchant === 'boss_chest' ? STRINGS.shop.bossChest : STRINGS.merchants.names[merchant];
    this.rows = rows.map((r) => {
      const row = document.createElement('div');
      row.className = 'shop-row';
      const icon = document.createElement('span');
      icon.className = 'shop-row__icon';
      // An upgrade or repair row shows its item (the weapon is in its text); the special's rows, their weapon.
      const iconName = r.boost ? BOOST_ICONS[r.boost] : UPGRADE_OF[r.item] || r.item === 'repair' ? ITEM_ICONS[r.item] : r.weapon ? WEAPON_ICONS[r.weapon] : ITEM_ICONS[r.item];
      // A dungeon upgrade (spec 09 §7.1) shows in its rarity's colour, with the rarity under its name.
      icon.appendChild(pixelIcon(iconName, 18, r.rarity ? RARITY_COLORS[r.rarity] : color));
      const text = document.createElement('span');
      text.className = 'shop-row__text';
      const name = document.createElement('span');
      name.className = 'shop-row__name';
      name.textContent = r.upgrade ? (STRINGS.upgrades.names[r.upgrade] ?? r.upgrade) : STRINGS.shop.items[r.item].name;
      // The rarity on the name's line (what it does is the row's description).
      const head = document.createElement('span');
      head.className = 'shop-row__head';
      head.append(name);
      if (r.rarity) {
        const rarity = document.createElement('span');
        rarity.className = 'shop-row__rarity';
        rarity.textContent = STRINGS.upgrades.rarities[r.rarity] ?? r.rarity;
        rarity.style.color = RARITY_COLORS[r.rarity];
        head.append(rarity);
      }
      text.append(head);
      const description = document.createElement('span');
      description.className = 'shop-row__description';
      description.textContent = rowDescription(r);
      text.append(description);
      const price = document.createElement('span');
      price.className = 'shop-row__price';
      price.textContent = r.price === 0 ? STRINGS.shop.free : STRINGS.hud.money(r.price);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'shop-row__buy';
      const elements: RowElements = { index: r.index, slot: r.slot ?? -1, row, button, status: r.status };
      onTap(button, () => this.onBuyTap(elements));
      button.addEventListener('animationend', () => button.classList.remove('is-shaking'));
      row.append(icon, text, price, button);
      return elements;
    });
    this.list.replaceChildren(...this.rows.map((r) => r.row));
    // With many rows (the dungeon wizard's six) the panel climbs and packs tighter, so everything stays on screen.
    this.el.classList.toggle('shop-panel--tall', rows.length > 3);
  }

  private showStatus(row: RowElements, r: ShopRow): void {
    row.status = r.status;
    const s = r.status;
    const label =
      s.kind === 'buy' ? (r.price === 0 ? STRINGS.shop.take : STRINGS.shop.buy)
      : s.kind === 'short' ? STRINGS.shop.missing(s.missing)
      : s.kind === 'unavailable' ? STRINGS.shop.reasons[s.reason]
      : s.kind === 'limit' ? STRINGS.shop.comeBack
      : '';
    if (row.button.textContent !== label) row.button.textContent = label;
    row.button.dataset.status = s.kind;
    const disabled = s.kind === 'unavailable' || s.kind === 'limit';
    row.button.setAttribute('aria-disabled', String(disabled || s.kind === 'short'));
    row.row.classList.toggle('is-unavailable', disabled);
  }

  private onBuyTap(row: RowElements): void {
    if (row.status.kind === 'buy') {
      this.buy = row.index;
      this.buySlot = row.slot;
    } else if (row.status.kind === 'short') {
      // Restart the shake even on repeated taps.
      row.button.classList.remove('is-shaking');
      void row.button.offsetWidth;
      row.button.classList.add('is-shaking');
    }
  }
}

/** What the row says under its name: the boost drawn, the weapon to upgrade and the next level, the weapon's special, the wear to repair. */
function rowDescription(r: ShopRow): string {
  if (r.upgrade) return STRINGS.upgrades.descriptions[r.upgrade] ?? '';
  if (r.boost) return STRINGS.shop.boosts[r.boost];
  const kind = UPGRADE_OF[r.item];
  if (kind && r.weapon) {
    // Each weapon takes its own number of levels of each kind (spec 04 §1): the row says what the next one gives.
    const table = UPGRADE_LEVELS[kind];
    const max = Math.min(WEAPONS[r.weapon].upgrades[kind] ?? 0, table.length);
    const level = r.level ?? 0;
    const next = level < max ? table[level] : undefined;
    return STRINGS.shop.levelUp(STRINGS.weapons[r.weapon], level, max, next === undefined ? null : STRINGS.shop.upgradeEffect(kind, next));
  }
  if (r.item === 'weapon_special' && r.weapon) return STRINGS.shop.specials[r.weapon] ?? STRINGS.weapons[r.weapon];
  if (r.item === 'repair' && r.weapon) return STRINGS.shop.repairState(STRINGS.weapons[r.weapon], r.uses ?? 0, r.maxUses ?? 0);
  return STRINGS.shop.items[r.item].description;
}

/**
 * Acts on pointerdown, like the other touch buttons: a tap counts at once
 * and is not lost while other fingers hold the joystick or the fire button.
 */
function onTap(button: HTMLButtonElement, action: () => void): void {
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    button.classList.add('is-pressed');
    action();
  });
  const release = (): void => button.classList.remove('is-pressed');
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('pointerleave', release);
  button.addEventListener('contextmenu', (e) => e.preventDefault());
}
