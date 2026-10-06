import type { ItemId } from '../config/items';
import { merchantDef, type MerchantId } from '../config/merchants';
import { WEAPON_IDS, type WeaponId } from '../config/weapons';
import type { EventBus, GameEvents } from '../core/EventBus';
import { ASSET_KEYS } from '../game/assets/manifest';
import { WEAPON_ICONS, iconSize, pixelIcon } from '../ui/icons';
import { itemSprite } from '../ui/itemSprites';
import { sheetIcon } from '../ui/sheetIcons';
import { STRINGS } from '../ui/strings';
import { PointerControl } from './PointerControl';

/**
 * Contextual action button in the bottom row of the screen (spec 01 §2.4, a
 * round button as in Wild Rift): it only shows up when the game says an
 * action is available (via the EventBus), with a hammer to repair a
 * barricade, a door or stairs to unlock the room behind them, a wizard hat
 * to open a merchant's shop, and a text with the points per plank, the room
 * and its price (or what is missing) or the merchant's name. One tap
 * repairs one plank, unlocks the room or opens and closes the shop. No game
 * logic.
 */
export class ContextButton extends PointerControl {
  private readonly icons: Record<'repair' | 'door' | 'portal' | 'hand', HTMLElement | SVGSVGElement>;
  /** The merchant's hat, one per colour. */
  private readonly hats = new Map<MerchantId, SVGSVGElement>();
  /** A weapon case's weapon, one icon per weapon. */
  private readonly weaponIcons = new Map<WeaponId, HTMLElement | SVGSVGElement>();
  /** A special item on the floor, one icon per item. */
  private readonly itemIcons = new Map<ItemId, HTMLElement | SVGSVGElement>();
  private readonly face: HTMLSpanElement;
  private readonly value: HTMLSpanElement;
  private readonly unsubscribe: () => void;
  private held = false;
  private pressed = false;

  constructor(parent: HTMLElement, events: EventBus) {
    const button = document.createElement('div');
    button.className = 'context-button';
    button.setAttribute('role', 'button');
    super(button);

    const face = document.createElement('span');
    face.className = 'context-button__face';
    this.face = face;
    // Whole pixels: every 12-unit icon at 2×; the hammer is PixelLab's symbol at 1× once it has art.
    this.icons = {
      repair: sheetIcon(ASSET_KEYS.iconRepair) ?? pixelIcon('hammer', iconSize('hammer', 2)),
      door: pixelIcon('door', iconSize('door', 2)),
      portal: pixelIcon('stairs', iconSize('stairs', 2)),
      hand: pixelIcon('hand', iconSize('hand', 2)),
    };
    face.append(this.icons.repair, this.icons.door, this.icons.portal, this.icons.hand);
    this.value = document.createElement('span');
    this.value.className = 'context-button__value';
    button.append(face, this.value);
    parent.appendChild(button);

    this.unsubscribe = events.on('action:context', this.onContext);
    button.addEventListener('animationend', () => button.classList.remove('is-shaking'));
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
    const button = this.target;
    button.classList.toggle('is-visible', e.kind !== null);
    button.classList.toggle('is-disabled', !e.enabled);
    // Blinking ring: repairing is done with repeated taps.
    button.classList.toggle('context-button--repair', e.kind === 'repair');
    for (const kind of ['repair', 'door', 'portal'] as const) this.icons[kind].style.display = e.kind === kind ? 'block' : 'none';
    // The hand's claw while paying; the weapon itself once it is on offer.
    const handWeapon = e.kind === 'hand' ? e.hand?.weapon : undefined;
    this.icons.hand.style.display = e.kind === 'hand' && !handWeapon ? 'block' : 'none';
    for (const [id, hat] of this.hats) hat.style.display = e.kind === 'merchant' && e.merchant === id ? 'block' : 'none';
    for (const [id, icon] of this.weaponIcons) icon.style.display = (e.kind === 'weaponCase' && e.weaponCase?.weapon === id) || handWeapon === id ? 'block' : 'none';
    for (const [id, icon] of this.itemIcons) icon.style.display = e.kind === 'pickup' && e.item === id ? 'block' : 'none';
    this.value.style.color = '';
    button.classList.toggle('is-confirming', e.weaponCase?.mode === 'confirm' || e.hand?.mode === 'confirm');
    if (e.kind === 'weaponCase' && e.weaponCase) {
      const offer = e.weaponCase;
      const name = STRINGS.weapons[offer.weapon];
      this.weaponIconFor(offer.weapon).style.display = 'block';
      const price = STRINGS.hud.money(e.amount);
      if (offer.mode === 'confirm' && offer.replaces) {
        // "CAMBIAR PISTOLA ★★ POR SMG", the stars drawn like the HUD's.
        const stars = Array.from({ length: offer.replacesLevel ?? 0 }, () => pixelIcon('star', 7));
        this.value.replaceChildren(`${STRINGS.actions.swapFrom(STRINGS.weapons[offer.replaces])} `, ...stars, ` ${STRINGS.actions.swapTo(name)}`);
        this.value.style.color = 'var(--amber)';
      } else if (offer.full) {
        this.value.textContent = STRINGS.actions.ammoFull;
      } else if (!e.enabled) {
        this.value.textContent = STRINGS.shop.missing(e.amount);
      } else {
        this.value.textContent = offer.mode === 'ammo' ? STRINGS.actions.weaponAmmo(name, price) : STRINGS.actions.buyWeapon(name, price);
      }
      button.setAttribute('aria-label', STRINGS.actions.buyWeaponLabel(name));
    } else if (e.kind === 'hand' && e.hand) {
      const hand = e.hand;
      const name = hand.weapon ? STRINGS.weapons[hand.weapon] : '';
      if (hand.weapon) this.weaponIconFor(hand.weapon).style.display = 'block';
      if (hand.mode === 'confirm' && hand.replaces) {
        const stars = Array.from({ length: hand.replacesLevel ?? 0 }, () => pixelIcon('star', 7));
        this.value.replaceChildren(`${STRINGS.actions.swapFrom(STRINGS.weapons[hand.replaces])} `, ...stars, ` ${STRINGS.actions.swapTo(name)}`);
        this.value.style.color = 'var(--amber)';
      } else if (hand.mode === 'take') {
        this.value.textContent = STRINGS.actions.handTake(name);
      } else if (hand.mode === 'blood') {
        // The blood pact, in red: it costs health, not money.
        this.value.textContent = STRINGS.actions.bloodPact(e.amount);
        this.value.style.color = 'var(--red)';
      } else if (hand.mode === 'short') {
        this.value.textContent = STRINGS.shop.missing(e.amount);
      } else if (hand.mode === 'spent') {
        this.value.textContent = STRINGS.actions.handSpent;
      } else {
        this.value.textContent = STRINGS.actions.handPay(STRINGS.hud.money(e.amount));
      }
      button.setAttribute('aria-label', STRINGS.actions.handLabel);
    } else if (e.kind === 'dungeon' && e.dungeon) {
      const a = e.dungeon.action;
      const S = STRINGS.actions;
      const pact = e.dungeon.pact;
      const pactText = (confirm: boolean): string => {
        const upgrade = pact ? (STRINGS.upgrades.names[pact.upgrade] ?? pact.upgrade) : '';
        const curse = pact ? (STRINGS.upgrades.curses[pact.curse]?.name ?? pact.curse) : '';
        return confirm ? S.pactConfirm(upgrade, curse) : S.pact(upgrade, curse);
      };
      // The pact's second tap, in red: it is the one that seals it.
      if (a === 'pactConfirm') this.value.style.color = 'var(--red)';
      this.value.textContent =
        a === 'pact'
          ? pactText(false)
          : a === 'pactConfirm'
            ? pactText(true)
            : a === 'chest'
          ? S.openChest
          : a === 'chestKey'
            ? S.openChestKey
            : a === 'needKey'
              ? S.needKey
              : a === 'weapon'
                ? e.dungeon.weapon
                  ? S.takeWeapon(STRINGS.weapons[e.dungeon.weapon])
                  : S.takeAmmo
                : a === 'door'
                  ? S.openDoorKey
                  : a === 'bossDoor'
                    ? S.openBossDoor
                    : a === 'needBossKey'
                      ? S.needBossKey
                      : a === 'challenge'
                        ? S.challengeRoom
                        : S.descend;
      button.setAttribute('aria-label', S.dungeonLabel);
    } else if (e.kind === 'pickup' && e.item) {
      // "RECOGER VARITA DESGASTADA", or why not with the inventory full.
      this.itemIconFor(e.item).style.display = 'block';
      const name = STRINGS.items.names[e.item];
      this.value.textContent = e.enabled ? STRINGS.actions.pickUp(name) : STRINGS.actions.inventoryFull;
      button.setAttribute('aria-label', STRINGS.actions.pickUp(name));
    } else if (e.kind === 'merchant' && e.merchant) {
      this.hatFor(e.merchant).style.display = 'block';
      this.value.textContent = STRINGS.merchants.names[e.merchant];
      this.value.style.color = merchantDef(e.merchant).color;
      button.setAttribute('aria-label', STRINGS.merchants.names[e.merchant]);
    } else if (e.kind === 'repair') {
      this.value.textContent = e.amount > 0 ? STRINGS.hud.moneyGained(e.amount) : '';
      button.setAttribute('aria-label', STRINGS.actions.repair);
    } else if (e.kind === 'door' || e.kind === 'portal') {
      // Rooms are unlocked, not doors, and which one is a surprise: "DESBLOQUEAR · 1000$" (or what is missing).
      // A secondary staircase is locked.
      if (e.locked) this.value.textContent = STRINGS.actions.locked;
      else this.value.textContent = e.enabled ? STRINGS.actions.unlockRoom(STRINGS.hud.money(e.amount)) : STRINGS.actions.unlockRoomMissing(STRINGS.hud.money(e.amount));
      button.setAttribute('aria-label', e.locked ? STRINGS.actions.locked : STRINGS.actions.unlockRoomLabel);
    } else if (this.active) {
      this.reset();
    }
  };

  private weaponIconFor(id: WeaponId): HTMLElement | SVGSVGElement {
    let icon = this.weaponIcons.get(id);
    if (!icon) {
      // The weapon's PixelLab outline at 1×; without art, its glyph at 2×.
      icon = sheetIcon(ASSET_KEYS.weaponIcon, WEAPON_IDS.indexOf(id)) ?? pixelIcon(WEAPON_ICONS[id], iconSize(WEAPON_ICONS[id], 2));
      this.weaponIcons.set(id, icon);
      this.face.appendChild(icon);
    }
    return icon;
  }

  private itemIconFor(id: ItemId): HTMLElement | SVGSVGElement {
    let icon = this.itemIcons.get(id);
    if (!icon) {
      // The item's animated sprite (24 px at 1×), or its icon at 2× without art.
      icon = itemSprite(id) ?? pixelIcon(id, iconSize(id, 2));
      this.itemIcons.set(id, icon);
      this.face.appendChild(icon);
    }
    return icon;
  }

  private hatFor(id: MerchantId): SVGSVGElement {
    let hat = this.hats.get(id);
    if (!hat) {
      hat = pixelIcon('wizard', iconSize('wizard', 2), merchantDef(id).color);
      this.hats.set(id, hat);
      this.face.appendChild(hat);
    }
    return hat;
  }
}
