import { CONTROLS } from '../config/balance';
import { WEAPON_IDS, WEAPONS, type WeaponId } from '../config/weapons';
import type { EventBus, GameEvents } from '../core/EventBus';
import { ASSET_KEYS } from '../game/assets/manifest';
import { PointerControl } from './PointerControl';
import { fireStickAim, type AimOutput } from './stickMath';
import { WEAPON_ICONS, iconSize, pixelIcon } from '../ui/icons';
import { sheetIcon } from '../ui/sheetIcons';
import { STRINGS } from '../ui/strings';

/**
 * Fire button with drag-to-aim (spec 01 §2.2). Holding fires; dragging past
 * 12 px aims manually, otherwise the game auto-aims. With a melee weapon in
 * hand (the katana) it is a plain action button showing that weapon: it
 * takes no aim (the cut goes where the player faces, WeaponSystem) and its
 * knob stays put (petición del usuario).
 */
export class FireStick extends PointerControl {
  private readonly knob: HTMLDivElement;
  private readonly crosshair: SVGSVGElement;
  private readonly aim: AimOutput = { manual: false, x: 0, y: 0, knobX: 0, knobY: 0 };
  private centerX = 0;
  private centerY = 0;
  private held = false;
  /** The melee weapon in hand whose icon the button shows, null with any other. */
  private melee: WeaponId | null = null;
  private readonly unsubscribe: () => void;

  constructor(parent: HTMLElement, events: EventBus) {
    const button = document.createElement('div');
    button.className = 'fire-stick';
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', STRINGS.controls.fire);
    super(button);

    this.knob = document.createElement('div');
    this.knob.className = 'fire-stick__knob';
    this.crosshair = pixelIcon('crosshair', 24);
    this.knob.appendChild(this.crosshair);
    button.appendChild(this.knob);
    parent.appendChild(button);
    this.unsubscribe = events.on('weapon:state', this.onWeapon);
  }

  private readonly onWeapon = (e: GameEvents['weapon:state']): void => {
    const melee = WEAPONS[e.weapon].attack === 'melee' ? e.weapon : null;
    if (melee === this.melee) return;
    this.melee = melee;
    this.target.classList.toggle('is-melee', melee !== null);
    this.target.setAttribute('aria-label', melee ? STRINGS.controls.slash : STRINGS.controls.fire);
    if (melee) {
      // The weapon's own art, as in its slot (its frame of the weapon icon sheet); the vector icon without it.
      const icon = sheetIcon(ASSET_KEYS.weaponIcon, WEAPON_IDS.indexOf(melee)) ?? pixelIcon(WEAPON_ICONS[melee], iconSize(WEAPON_ICONS[melee], 2));
      this.knob.replaceChildren(icon);
      this.centreKnob();
    } else this.knob.replaceChildren(this.crosshair);
  };

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
    this.target.classList.remove('is-pressed');
    this.centreKnob();
  }

  override dispose(): void {
    this.unsubscribe();
    super.dispose();
  }

  private centreKnob(): void {
    this.aim.manual = false;
    this.target.classList.remove('is-aiming');
    this.knob.style.transform = 'translate3d(0, 0, 0)';
  }

  private apply(e: PointerEvent): void {
    // A melee weapon takes no aim: the button only presses.
    if (this.melee) return;
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
