/**
 * Player preferences kept on the device. Storage can be missing or throw
 * (private browsing, blocked site data, some WebViews): reads fall back to
 * the defaults and writes are best effort, so the game never depends on it.
 */
export interface PreferenceValues {
  vibration: boolean;
}

export type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

const KEY = 'zombies.preferences';
const DEFAULTS: PreferenceValues = { vibration: true };

function browserStorage(): PreferenceStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function load(storage: PreferenceStorage | null): PreferenceValues {
  try {
    const raw = storage?.getItem(KEY);
    const saved: unknown = raw ? JSON.parse(raw) : null;
    if (typeof saved !== 'object' || saved === null) return { ...DEFAULTS };
    const { vibration } = saved as Partial<Record<keyof PreferenceValues, unknown>>;
    return { vibration: typeof vibration === 'boolean' ? vibration : DEFAULTS.vibration };
  } catch {
    return { ...DEFAULTS };
  }
}

export class Preferences {
  private values: PreferenceValues;

  constructor(private readonly storage: PreferenceStorage | null = browserStorage()) {
    this.values = load(storage);
  }

  get vibration(): boolean {
    return this.values.vibration;
  }

  set vibration(on: boolean) {
    this.values = { ...this.values, vibration: on };
    try {
      this.storage?.setItem(KEY, JSON.stringify(this.values));
    } catch {
      // Kept for this session only.
    }
  }
}
