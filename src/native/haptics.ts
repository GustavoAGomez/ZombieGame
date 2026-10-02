import { Haptics, ImpactStyle } from '@capacitor/haptics';
import type { EventBus } from '../core/EventBus';
import type { Preferences } from './preferences';

export type HapticStrength = 'light' | 'medium' | 'heavy';
export type Vibrate = (strength: HapticStrength) => void;

const IMPACT: Readonly<Record<HapticStrength, ImpactStyle>> = {
  light: ImpactStyle.Light,
  medium: ImpactStyle.Medium,
  heavy: ImpactStyle.Heavy,
};

/**
 * Taptic engine on iOS, vibrator on Android, navigator.vibrate on mobile
 * browsers that have it. Where there is none (Safari, desktop) the plugin
 * rejects, and that is fine.
 */
export const nativeVibrate: Vibrate = (strength) => {
  Haptics.impact({ style: IMPACT[strength] }).catch(() => undefined);
};

/**
 * Haptic feedback driven by game events, like the HUD (CLAUDE.md rule 4):
 * a light tap when the local player is hurt and a medium one when they buy
 * a door, a portal or something from a merchant (spec 01 §4.2, §4.7, spec 03 §3). Off when the player disables
 * vibration in the pause menu.
 */
export class HapticFeedback {
  private readonly unsubscribe: (() => void)[];

  constructor(
    events: EventBus,
    private readonly preferences: Preferences,
    private readonly vibrate: Vibrate = nativeVibrate,
    private readonly localPlayerId = 0,
  ) {
    this.unsubscribe = [
      events.on('player:damaged', (e) => this.play(e.playerId, 'light')),
      events.on('door:opened', (e) => this.play(e.playerId, 'medium')),
      events.on('portal:opened', (e) => this.play(e.playerId, 'medium')),
      events.on('merchant:purchase', (e) => this.play(e.playerId, 'medium')),
      events.on('weaponCase:purchase', (e) => this.play(e.playerId, 'medium')),
      events.on('boost:activated', (e) => this.play(e.playerId, 'light')),
      events.on('item:picked', (e) => this.play(e.playerId, 'light')),
    ];
  }

  private play(playerId: number, strength: HapticStrength): void {
    if (playerId === this.localPlayerId && this.preferences.vibration) this.vibrate(strength);
  }

  destroy(): void {
    for (const off of this.unsubscribe) off();
  }
}
