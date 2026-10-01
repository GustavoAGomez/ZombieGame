import type { EventBus } from '../core/EventBus';
import type { DebugStats } from '../debug/DebugOverlay';

/** Objects shared between Phaser scenes and the DOM layer. */
export interface Services {
  events: EventBus;
  hudRoot: HTMLElement;
  debug: boolean;
  /** Filled in by the running scene; read by the debug overlay on a timer. */
  stats: DebugStats;
  /** Round to start at (?round=N), to test later rounds. */
  startRound: number;
  /** Map key from ?map=…, or null for the default map. */
  mapKey: string | null;
}
