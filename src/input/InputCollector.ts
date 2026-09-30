import type { InputCommand } from '../core/InputCommand';
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
  private readonly keyboard = new KeyboardInput();
  private readonly axis = { x: 0, y: 0 };

  constructor(hudRoot: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'controls';
    hudRoot.appendChild(this.root);
    this.joystick = new VirtualJoystick(this.root);

    // A finger lifted while the app was hidden never sends pointerup.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.resetAll();
    });
    window.addEventListener('blur', () => this.resetAll());
  }

  /** Fills `cmd` for the given tick. Edge-triggered inputs are consumed. */
  sample(cmd: InputCommand, tick: number): InputCommand {
    cmd.tick = tick;
    this.keyboard.moveAxis(this.axis);
    if (this.axis.x !== 0 || this.axis.y !== 0) {
      cmd.moveX = this.axis.x;
      cmd.moveY = this.axis.y;
    } else {
      cmd.moveX = this.joystick.x;
      cmd.moveY = this.joystick.y;
    }
    return cmd;
  }

  resetAll(): void {
    this.joystick.reset();
    this.keyboard.reset();
  }

  destroy(): void {
    this.root.remove();
  }
}
