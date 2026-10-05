import { AUDIO, type VolumeLevel } from '../config/audio';

/**
 * Player preferences kept on the device. Storage can be missing or throw
 * (private browsing, blocked site data, some WebViews): reads fall back to
 * the defaults and writes are best effort, so the game never depends on it.
 */
export interface PreferenceValues {
  vibration: boolean;
  /** Volume of the effects and the menus (spec 08 §2). */
  sfx: VolumeLevel;
  /** Volume of the music (spec 08 §2). */
  music: VolumeLevel;
}

export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'zombies.preferences';
const DEFAULTS: PreferenceValues = { vibration: true, sfx: 'high', music: 'high' };

function browserStorage(): PreferenceStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function isLevel(value: unknown): value is VolumeLevel {
  return typeof value === 'string' && (AUDIO.levelOrder as readonly string[]).includes(value);
}

function load(storage: PreferenceStorage | null): PreferenceValues {
  try {
    const raw = storage?.getItem(KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (typeof saved !== 'object' || saved === null) return { ...DEFAULTS };
    const { vibration, sfx, music } = saved as Partial<Record<keyof PreferenceValues, unknown>>;
    return {
      vibration: typeof vibration === 'boolean' ? vibration : DEFAULTS.vibration,
      sfx: isLevel(sfx) ? sfx : DEFAULTS.sfx,
      music: isLevel(music) ? music : DEFAULTS.music,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export class Preferences {
  private values: PreferenceValues;
  private readonly listeners: (() => void)[] = [];

  constructor(private readonly storage: PreferenceStorage | null = browserStorage()) {
    this.values = load(storage);
  }

  get vibration(): boolean {
    return this.values.vibration;
  }

  set vibration(on: boolean) {
    this.save({ vibration: on });
  }

  get sfx(): VolumeLevel {
    return this.values.sfx;
  }

  set sfx(level: VolumeLevel) {
    this.save({ sfx: level });
  }

  get music(): VolumeLevel {
    return this.values.music;
  }

  set music(level: VolumeLevel) {
    this.save({ music: level });
  }

  /** Calls `listener` after every change; returns the function that stops it. */
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => {
      const i = this.listeners.indexOf(listener);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  private save(change: Partial<PreferenceValues>): void {
    this.values = { ...this.values, ...change };
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // Kept for this session only.
    }
    for (const listener of [...this.listeners]) listener();
  }
}
