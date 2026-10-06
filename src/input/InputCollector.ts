import type { UpgradeId } from '../config/upgrades';
import type { EventBus } from '../core/EventBus';
import type { InputCommand } from '../core/InputCommand';
import { ActionButtons } from './ActionButtons';
import { BoostButton } from './BoostButton';
import { ContextButton } from './ContextButton';
import { FireStick } from './FireStick';
import { ItemBar } from './ItemBar';
import { KeyboardInput } from './KeyboardInput';
import { ShopPanel } from './ShopPanel';
import { VirtualJoystick } from './VirtualJoystick';
import { WeaponBar } from './WeaponBar';
import './controls.css';

/** Keyboard keys for the weapon slots. */
const WEAPON_KEYS = ['Digit1', 'Digit2', 'Digit3'] as const;

/**
 * Owns the touch controls and turns their state into one InputCommand per
 * simulation tick. This is the only bridge between DOM input and the game.
 */
export class InputCollector {
  readonly root: HTMLDivElement;
  private readonly joystick: VirtualJoystick;
  private readonly fireStick: FireStick;
  private readonly buttons: ActionButtons;
  private readonly weaponBar: WeaponBar;
  private readonly chip: ContextButton;
  private readonly shop: ShopPanel;
  private readonly boost: BoostButton;
  private readonly items: ItemBar;
  private readonly keyboard = new KeyboardInput();
  private readonly axis = { x: 0, y: 0 };

  constructor(hudRoot: HTMLElement, events: EventBus) {
    this.root = document.createElement('div');
    this.root.className = 'controls';
    hudRoot.appendChild(this.root);
    this.joystick = new VirtualJoystick(this.root);
    this.fireStick = new FireStick(this.root, events);
    this.weaponBar = new WeaponBar(this.root, events);
    this.buttons = new ActionButtons(this.root, events);
    this.chip = new ContextButton(this.root, events);
    this.shop = new ShopPanel(this.root, events);
    this.boost = new BoostButton(this.root, events);
    this.items = new ItemBar(this.root, events);

    // A finger lifted while the app was hidden never sends pointerup.
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.resetAll);
  }

  /** The shop rows' ⓘ (spec 09 §7.1): who shows what an upgrade does. */
  set onInfo(show: ((upgrade: UpgradeId) => void) | null) {
    this.shop.onInfo = show;
  }

  /** Fills `cmd` for the given tick. Edge-triggered inputs are consumed. */
  sample(cmd: InputCommand, tick: number): InputCommand {
    const kb = this.keyboard;
    cmd.tick = tick;
    this.joystick.validate();
    this.fireStick.validate();
    this.chip.validate();

    kb.moveAxis(this.axis);
    if (this.axis.x !== 0 || this.axis.y !== 0) {
      cmd.moveX = this.axis.x;
      cmd.moveY = this.axis.y;
    } else {
      cmd.moveX = this.joystick.x;
      cmd.moveY = this.joystick.y;
    }

    kb.aimAxis(this.axis);
    const keyboardAim = this.axis.x !== 0 || this.axis.y !== 0;
    cmd.fire = this.fireStick.firing || keyboardAim || kb.isDown('Space');
    if (keyboardAim) {
      cmd.aimManual = true;
      cmd.aimX = this.axis.x;
      cmd.aimY = this.axis.y;
    } else {
      cmd.aimManual = this.fireStick.aimManual;
      cmd.aimX = this.fireStick.aimX;
      cmd.aimY = this.fireStick.aimY;
    }

    cmd.switchWeapon = kb.consumePress('KeyQ');
    // The HUD slots, or 1 / 2 / 3 on the keyboard.
    cmd.selectWeapon = this.weaponBar.consumeSelect();
    for (let i = 0; i < WEAPON_KEYS.length; i++) if (kb.consumePress(WEAPON_KEYS[i] ?? '')) cmd.selectWeapon = i;
    cmd.reload = this.buttons.consumeReload() || kb.consumePress('KeyR');
    cmd.melee = this.buttons.consumeMelee() || kb.consumePress('KeyV');
    cmd.special = this.buttons.consumeSpecial() || kb.consumePress('ShiftLeft') || kb.consumePress('KeyE');
    // F / Enter mirror the chip on desktop.
    cmd.actionPressed = this.chip.consumePress() || kb.consumePress('KeyF') || kb.consumePress('Enter');
    cmd.action = this.chip.isHeld || kb.isDown('KeyF') || kb.isDown('Enter');
    const bought = this.shop.consumeBuy();
    cmd.shopBuy = bought?.item ?? -1;
    cmd.shopSlot = bought?.slot ?? -1;
    cmd.shopClose = this.shop.consumeClose();
    cmd.boost = this.boost.consume() || kb.consumePress('KeyB');
    cmd.useItem = this.items.consumeUse();
    return cmd;
  }

  /** Top edge of the shop panel on screen (CSS px) while it is open, else null. */
  shopPanelTop(): number | null {
    return this.shop.top();
  }

  readonly resetAll = (): void => {
    this.joystick.reset();
    this.fireStick.reset();
    this.buttons.reset();
    this.weaponBar.reset();
    this.chip.reset();
    this.shop.reset();
    this.boost.reset();
    this.items.reset();
    this.keyboard.reset();
  };

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.resetAll);
    this.joystick.dispose();
    this.fireStick.dispose();
    this.buttons.destroy();
    this.weaponBar.destroy();
    this.chip.destroy();
    this.shop.destroy();
    this.boost.destroy();
    this.items.destroy();
    this.keyboard.destroy();
    this.root.remove();
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) this.resetAll();
  };
}
