import { CONTROLS } from '../config/balance';
import { PointerControl } from './PointerControl';
import { joystickVector, type JoystickTuning, type StickOutput } from './stickMath';

const TUNING: JoystickTuning = {
  maxTravel: CONTROLS.joystickMaxTravel,
  deadZone: CONTROLS.joystickDeadZone,
  minSpeed: CONTROLS.joystickMinSpeed,
  maxSpeed: CONTROLS.joystickMaxSpeed,
};

/**
 * Left movement stick (spec 01 §2.1). A touch anywhere in the left 40 % of
 * the screen drives the knob by the vector from the fixed base centre.
 * It only exposes a vector; it contains no game logic.
 */
export class VirtualJoystick extends PointerControl {
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private readonly output: StickOutput = { x: 0, y: 0, knobX: 0, knobY: 0 };
  private centerX = 0;
  private centerY = 0;

  constructor(parent: HTMLElement) {
    const zone = document.createElement('div');
    zone.className = 'joystick-zone';
    zone.style.width = `${CONTROLS.joystickZoneWidth * 100}%`;
    super(zone);

    this.base = document.createElement('div');
    this.base.className = 'joystick';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick__knob';
    this.knob.style.transitionDuration = `${CONTROLS.joystickReturnMs}ms`;
    this.base.appendChild(this.knob);
    zone.appendChild(this.base);
    parent.appendChild(zone);
  }

  /** Movement vector, length = analog speed factor (0..1). */
  get x(): number {
    return this.output.x;
  }

  get y(): number {
    return this.output.y;
  }

  protected onPress(e: PointerEvent): void {
    const rect = this.base.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    this.knob.classList.add('is-dragging');
    this.base.classList.add('is-active');
    this.apply(e);
  }

  protected onDrag(e: PointerEvent): void {
    this.apply(e);
  }

  protected onRelease(): void {
    this.output.x = 0;
    this.output.y = 0;
    this.output.knobX = 0;
    this.output.knobY = 0;
    this.knob.classList.remove('is-dragging');
    this.base.classList.remove('is-active');
    this.knob.style.transform = 'translate3d(0, 0, 0)';
  }

  private apply(e: PointerEvent): void {
    joystickVector(e.clientX - this.centerX, e.clientY - this.centerY, TUNING, this.output);
    this.knob.style.transform = `translate3d(${this.output.knobX}px, ${this.output.knobY}px, 0)`;
  }
}
