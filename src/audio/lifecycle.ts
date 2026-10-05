import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

/** The engine calls the lifecycle needs (WebAudioEngine). */
export interface AudioLifecycleTarget {
  unlock(): void;
  suspend(): void;
  resume(): void;
}

/** Gestures that count as user activation for the audio on iOS and Android. */
const GESTURES = ['touchend', 'pointerup', 'click', 'keydown'] as const;

/**
 * Keeps the audio alive on a phone (spec 08 §2):
 * - Any gesture unlocks it, as a fallback to the JUGAR tap, and wakes it
 *   if iOS left it suspended when the app came back: the game never stays
 *   mute for the rest of the session.
 * - In the background it is suspended (appStateChange on iOS and Android,
 *   visibilitychange in the browser) and resumed on return.
 * The iPhone's silent switch mutes web audio: as expected in a game, it is
 * not worked around.
 */
export function keepAudioAlive(target: AudioLifecycleTarget): void {
  for (const type of GESTURES) document.addEventListener(type, () => target.unlock(), { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') target.suspend();
    else target.resume();
  });
  if (!Capacitor.isNativePlatform()) return;
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) target.resume();
    else target.suspend();
  });
}
