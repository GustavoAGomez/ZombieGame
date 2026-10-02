import type { BoostKind } from '../config/balance';
import type { EventBus, GameEvents } from '../core/EventBus';
import type { IconName } from '../ui/icons';
import { STRINGS } from '../ui/strings';
import { TapButton } from './TapButton';

const ICONS: Record<BoostKind, IconName> = { speed: 'bolt', double_damage: 'x2' };
/** Size of the button and radius of the countdown ring inside it (SVG units = CSS px). */
const SIZE = 40;
const RING_RADIUS = 17.5;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The stored boost's button (spec 03 §5), in the bottom row like a Wild
 * Rift summoner spell. It shows up when a boost is stored; one tap starts it, and
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
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${SIZE}`);
    svg.setAttribute('aria-hidden', 'true');
    this.ring = document.createElementNS(SVG_NS, 'circle');
    this.ring.setAttribute('cx', String(SIZE / 2));
    this.ring.setAttribute('cy', String(SIZE / 2));
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
      // Whole pixels: the 12×12 bolt and the 11×7 ×2 at 2×.
      this.button.setIcon(ICONS[kind], kind === 'speed' ? 24 : 22);
      el.setAttribute('aria-label', STRINGS.boosts.activate(STRINGS.boosts.names[kind]));
    }
    this.ring.setAttribute('stroke-dashoffset', String(RING_LENGTH * (1 - e.progress)));
    this.seconds.textContent = e.active ? String(e.seconds) : '';
  };
}
