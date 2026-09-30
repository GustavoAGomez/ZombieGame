import { CONTROLS } from '../config/balance';
import { PointerControl } from './PointerControl';
import { fireStickAim, type AimOutput } from './stickMath';
import { pixelIcon } from '../ui/icons';
import { STRINGS } from '../ui/strings';

/**
 * Fire button with drag-to-aim (spec 01 §2.2). Holding fires; dragging past
 * 12 px aims manually, otherwise the game auto-aims.
 */
export class FireStick extends PointerControl {
  private readonly knob: HTMLDivElement;
  private readonly aim: AimOutput = { manual: false, x: 0, y: 0, knobX: 0, knobY: 0 };
  private centerX = 0;
  private centerY = 0;
  private held = false;

  constructor(parent: HTMLElement) {
    const button = document.createElement('div');
    button.className = 'fire-stick';
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', STRINGS.controls.fire);
    super(button);

    this.knob = document.createElement('div');
    this.knob.className = 'fire-stick__knob';
    this.knob.appendChild(pixelIcon('crosshair', 24));
    button.appendChild(this.knob);
    parent.appendChild(button);
  }

  get firing(): boolean {
    return this.held;
  }

  get aimManual(): boolean {
    return this.held && this.aim.manual;
  }

  get aimX(): number {
    return this.aim.x;
  }

  get aimY(): number {
    return this.aim.y;
  }

  protected onPress(e: PointerEvent): void {
    const rect = this.target.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    this.held = true;
    this.target.classList.add('is-pressed');
    this.apply(e);
  }

  protected onDrag(e: PointerEvent): void {
    this.apply(e);
  }

  protected onRelease(): void {
    this.held = false;
    this.aim.manual = false;
    this.target.classList.remove('is-pressed', 'is-aiming');
    this.knob.style.transform = 'translate3d(0, 0, 0)';
  }

  private apply(e: PointerEvent): void {
    fireStickAim(
      e.clientX - this.centerX,
      e.clientY - this.centerY,
      CONTROLS.fireAimThreshold,
      CONTROLS.fireKnobMaxTravel,
      this.aim,
    );
    this.target.classList.toggle('is-aiming', this.aim.manual);
    this.knob.style.transform = `translate3d(${this.aim.knobX}px, ${this.aim.knobY}px, 0)`;
  }
}
