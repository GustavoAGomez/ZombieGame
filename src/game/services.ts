import type { EventBus } from '../core/EventBus';

/** Objects shared between Phaser scenes and the DOM layer. */
export interface Services {
  events: EventBus;
  hudRoot: HTMLElement;
  debug: boolean;
}
