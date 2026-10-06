import type { AudioCandidate } from '../game/assets/manifest';
import { STRINGS } from '../ui/strings';

/**
 * «Probar en partida» (sound test, spec 08 §4.4): the candidates on trial
 * are kept on the device, so they last across reloads, and given back as
 * the text to send in the chat to fix them in the game.
 */
const KEY = 'zombies.soundTrials';
const LETTERS: readonly string[] = ['A', 'B', 'C'];

/** What a browser's localStorage offers; it may be missing or throw (private mode, cleared data). */
export interface TrialStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadTrials(storage: TrialStorage | null): Record<string, AudioCandidate> {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(KEY) ?? '{}');
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
    // Anything else (an old or broken value) is left out.
    return Object.fromEntries(Object.entries(raw).filter((e): e is [string, AudioCandidate] => typeof e[1] === 'string' && LETTERS.includes(e[1])));
  } catch {
    return {};
  }
}

export function saveTrials(storage: TrialStorage | null, trials: Readonly<Record<string, AudioCandidate>>): void {
  try {
    storage?.setItem(KEY, JSON.stringify(trials));
  } catch {
    // Not kept: it still works for this session.
  }
}

/** The text to paste in the chat: one «id: letter» per sound on trial, sorted. */
export function choiceText(trials: Readonly<Record<string, AudioCandidate>>): string {
  const lines = Object.entries(trials)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, letter]) => `${id}: ${letter}`);
  return lines.length === 0 ? STRINGS.debug.noTrials : `${STRINGS.debug.choiceTitle}\n${lines.join('\n')}`;
}
