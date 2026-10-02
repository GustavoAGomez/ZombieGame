import { merchantDef, type MerchantId } from '../config/merchants';
import type { WeaponId } from '../config/weapons';
import { WEAPON_ICONS } from './WeaponBar';
import type { EventBus, GameEvents } from '../core/EventBus';
import { pixelIcon } from '../ui/icons';
import { STRINGS } from '../ui/strings';
import { PointerControl } from './PointerControl';

/**
 * Contextual action button in the bottom row of the screen (spec 01 §2.4, a
 * round button as in Wild Rift): it only shows up when the game says an
 * action is available (via the EventBus), with a hammer to repair a
 * barricade, a door or stairs to buy one, a wizard hat to open a merchant's
 * shop, and a badge with the points per plank, the cost (or what is
 * missing) or the merchant's name. One tap repairs one plank, buys the door
 * or opens and closes the shop. No game logic.
 */
export class ContextButton extends PointerControl {
  private readonly icons: Record<'repair' | 'door' | 'portal', SVGSVGElement>;
  /** The merchant's hat, one per colour. */
  private readonly hats = new Map<MerchantId, SVGSVGElement>();
  /** A weapon case's weapon, one icon per weapon. */
  private readonly weaponIcons = new Map<WeaponId, SVGSVGElement>();
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
    this.icons = { repair: pixelIcon('hammer', 19), door: pixelIcon('door', 17), portal: pixelIcon('stairs', 17) };
    face.append(this.icons.repair, this.icons.door, this.icons.portal);
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
    for (const [id, hat] of this.hats) hat.style.display = e.kind === 'merchant' && e.merchant === id ? 'block' : 'none';
    for (const [id, icon] of this.weaponIcons) icon.style.display = e.kind === 'weaponCase' && e.weaponCase?.weapon === id ? 'block' : 'none';
    this.value.style.color = '';
    button.classList.toggle('is-confirming', e.weaponCase?.mode === 'confirm');
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
    } else if (e.kind === 'merchant' && e.merchant) {
      this.hatFor(e.merchant).style.display = 'block';
      this.value.textContent = STRINGS.merchants.names[e.merchant];
      this.value.style.color = merchantDef(e.merchant).color;
      button.setAttribute('aria-label', STRINGS.merchants.names[e.merchant]);
    } else if (e.kind === 'repair') {
      this.value.textContent = e.amount > 0 ? STRINGS.hud.moneyGained(e.amount) : '';
      button.setAttribute('aria-label', STRINGS.actions.repair);
    } else if (e.kind === 'door') {
      this.value.textContent = e.enabled ? STRINGS.hud.money(e.amount) : STRINGS.hud.moneySpent(e.amount);
      button.setAttribute('aria-label', e.enabled ? STRINGS.actions.openDoor : STRINGS.actions.missing);
    } else if (e.kind === 'portal') {
      const open = e.portal === 'hatch' ? STRINGS.actions.openHatch : STRINGS.actions.openStairs;
      this.value.textContent = e.locked ? '' : e.enabled ? STRINGS.hud.money(e.amount) : STRINGS.hud.moneySpent(e.amount);
      button.setAttribute('aria-label', e.locked ? STRINGS.actions.locked : e.enabled ? open : STRINGS.actions.missing);
    } else if (this.active) {
      this.reset();
    }
  };

  private weaponIconFor(id: WeaponId): SVGSVGElement {
    let icon = this.weaponIcons.get(id);
    if (!icon) {
      icon = pixelIcon(WEAPON_ICONS[id], 22);
      this.weaponIcons.set(id, icon);
      this.face.appendChild(icon);
    }
    return icon;
  }

  private hatFor(id: MerchantId): SVGSVGElement {
    let hat = this.hats.get(id);
    if (!hat) {
      hat = pixelIcon('wizard', 19, merchantDef(id).color);
      this.hats.set(id, hat);
      this.face.appendChild(hat);
    }
    return hat;
  }
}
