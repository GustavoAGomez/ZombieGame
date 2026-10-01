import type { BoostKind } from '../config/balance';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { IconName } from '../ui/icons';
import { STRINGS } from '../ui/strings';
import { TapButton } from './TapButton';

const ICONS: Record<BoostKind, IconName> = { speed: 'bolt', double_damage: 'x2' };
/** Radius of the countdown ring inside the 56 px button (SVG units = CSS px). */
const RING_RADIUS = 25;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The stored boost's button (spec 03 §5), in the arc of buttons around the
 * fire button like a Wild Rift ability, up and to the left between the knife
 * and reload. It shows up when a boost is stored; one tap starts it, and
 * while it runs a ring empties with the seconds left in the middle. It
 * disappears when the boost ends. A tap only latches a press for the next
 * tick (`boost` in the InputCommand); it does not touch the fire stick.
 */
export class BoostButton {
  private readonly button: TapButton;
  private readonly ring: SVGCircleElement;
  private readonly seconds: HTMLSpanElement;
  private readonly unsubscribe: () => void;
  private shownIcon: BoostKind | null = null;
  private stored = false;

  constructor(parent: HTMLElement, events: EventBus) {
    this.button = new TapButton(parent, 'action-button--boost', null, '', '', 24);
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'boost-ring');
    svg.setAttribute('viewBox', '0 0 56 56');
    svg.setAttribute('aria-hidden', 'true');
    this.ring = document.createElementNS(SVG_NS, 'circle');
    this.ring.setAttribute('cx', '28');
    this.ring.setAttribute('cy', '28');
    this.ring.setAttribute('r', String(RING_RADIUS));
    this.ring.setAttribute('stroke-dasharray', String(RING_LENGTH));
    svg.appendChild(this.ring);
    this.seconds = document.createElement('span');
    this.seconds.className = 'boost-seconds';
    this.button.el.append(svg, this.seconds);
    this.unsubscribe = events.on('boost:state', this.onBoost);
  }

  /** True once per tap while a boost is stored. */
  consume(): boolean {
    return this.button.consume() && this.stored;
  }

  reset(): void {
    this.button.reset();
  }

  destroy(): void {
    this.unsubscribe();
    this.button.dispose();
    this.button.el.remove();
  }

  private readonly onBoost = (e: GameEvents['boost:state']): void => {
    const kind = e.active ?? e.stored;
    const el = this.button.el;
    this.stored = e.stored !== null;
    el.classList.toggle('is-visible', kind !== null);
    el.classList.toggle('is-running', e.active !== null);
    if (!kind) return;
    if (kind !== this.shownIcon) {
      this.shownIcon = kind;
      this.button.setIcon(ICONS[kind], 24);
      el.setAttribute('aria-label', STRINGS.boosts.activate(STRINGS.boosts.names[kind]));
    }
    this.ring.setAttribute('stroke-dashoffset', String(RING_LENGTH * (1 - e.progress)));
    this.seconds.textContent = e.active ? String(e.seconds) : '';
  };
}
