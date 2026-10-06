import type { GameAudio } from '../audio/AudioDirector';
import type { GameMode } from '../config/dungeon';
import type { EventBus } from '../core/EventBus';
import type { DebugActions, DebugStats } from '../debug/DebugOverlay';
import type { Preferences } from '../native/preferences';
import type { Records } from '../native/records';

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
  /** The game the title starts (spec 09 §1): ?mode=dungeon preselects the dungeon. */
  mode: GameMode;
  /** A fixed seed (?seed=N, or MISMA SEMILLA), or null for a new one each match. */
  seed: number | null;
  /** The records kept on the device (spec 09 §10). */
  records: Records;
  /** Set by the running game scene for the debug panel's buttons; null outside a match. */
  debugActions: DebugActions | null;
  /** Player preferences kept on the device (vibration, effects and music volume). */
  preferences: Preferences;
  /** Sound (spec 08): the scenes unlock it, pause it and hand playUi to the DOM menus. */
  audio: GameAudio;
}
