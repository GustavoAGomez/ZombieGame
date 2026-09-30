import type { EventBus } from '../core/EventBus';
import type { InputCommand } from '../core/InputCommand';
import { ActionButtons } from './ActionButtons';
import { FireStick } from './FireStick';
import { KeyboardInput } from './KeyboardInput';
import { VirtualJoystick } from './VirtualJoystick';
import './controls.css';

/**
 * Owns the touch controls and turns their state into one InputCommand per
 * simulation tick. This is the only bridge between DOM input and the game.
 */
export class InputCollector {
  readonly root: HTMLDivElement;
  private readonly joystick: VirtualJoystick;
  private readonly fireStick: FireStick;
  private readonly buttons: ActionButtons;
  private readonly keyboard = new KeyboardInput();
  private readonly axis = { x: 0, y: 0 };

  constructor(hudRoot: HTMLElement, events: EventBus) {
    this.root = document.createElement('div');
    this.root.className = 'controls';
    hudRoot.appendChild(this.root);
    this.joystick = new VirtualJoystick(this.root);
    this.fireStick = new FireStick(this.root);
    this.buttons = new ActionButtons(this.root, events);

    // A finger lifted while the app was hidden never sends pointerup.
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.resetAll);
  }

  /** Fills `cmd` for the given tick. Edge-triggered inputs are consumed. */
  sample(cmd: InputCommand, tick: number): InputCommand {
    const kb = this.keyboard;
    cmd.tick = tick;

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

    cmd.switchWeapon = this.buttons.consumeSwitch() || kb.consumePress('KeyQ');
    cmd.special = this.buttons.consumeSpecial() || kb.consumePress('ShiftLeft') || kb.consumePress('KeyE');
    cmd.actionPressed = false;
    cmd.action = false;
    return cmd;
  }

  readonly resetAll = (): void => {
    this.joystick.reset();
    this.fireStick.reset();
    this.buttons.reset();
    this.keyboard.reset();
  };

  destroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.resetAll);
    this.buttons.destroy();
    this.keyboard.destroy();
    this.root.remove();
  }

  private readonly onVisibility = (): void => {
    if (document.hidden) this.resetAll();
  };
}
