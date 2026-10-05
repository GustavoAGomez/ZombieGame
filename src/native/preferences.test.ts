import { describe, expect, it } from 'vitest';
import { Preferences, type PreferenceStorage } from './preferences';

function memoryStorage(initial: Record<string, string> = {}): PreferenceStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
  };
}

describe('Preferences: effects and music volume (spec 08 §2)', () => {
  it('starts both at ALTO and remembers each level', () => {
    const storage = memoryStorage();
    const p = new Preferences(storage);
    expect([p.sfx, p.music]).toEqual(['high', 'high']);
    p.sfx = 'low';
    p.music = 'off';
    const again = new Preferences(storage);
    expect([again.sfx, again.music, again.vibration]).toEqual(['low', 'off', true]);
  });

  it('falls back to the default for a corrupt or unknown level, keeping the rest', () => {
    const p = new Preferences(memoryStorage({ 'zombies.preferences': '{"vibration":false,"sfx":"loud","music":3}' }));
    expect([p.vibration, p.sfx, p.music]).toEqual([false, 'high', 'high']);
    expect(new Preferences(memoryStorage({ 'zombies.preferences': '{not json' })).sfx).toBe('high');
  });

  it('tells its listeners after every change, until they stop listening', () => {
    const p = new Preferences(memoryStorage());
    let calls = 0;
    const stop = p.onChange(() => calls++);
    p.sfx = 'medium';
    p.vibration = false;
    stop();
    p.music = 'low';
    expect(calls).toBe(2);
  });
});
