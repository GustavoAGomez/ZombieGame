import { describe, expect, it } from 'vitest';
import { EventBus } from '../core/EventBus';
import { HapticFeedback, type HapticStrength } from './haptics';
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

function setup(storage = memoryStorage()) {
  const events = new EventBus();
  const preferences = new Preferences(storage);
  const played: HapticStrength[] = [];
  const haptics = new HapticFeedback(events, preferences, (s) => played.push(s));
  return { events, preferences, played, haptics };
}

describe('HapticFeedback', () => {
  it('taps lightly when the local player is hurt and medium when they buy a door or a portal', () => {
    const { events, played } = setup();
    events.emit('player:damaged', { playerId: 0, hp: 80, maxHp: 100, x: 0, y: 0, fromX: 10, fromY: 0 });
    events.emit('door:opened', { doorId: 'd1', playerId: 0, x: 0, y: 0 });
    events.emit('portal:opened', { portalId: 'p1', playerId: 0, x: 0, y: 0 });
    events.emit('merchant:purchase', { playerId: 0, merchant: 'blue', item: 'max_ammo' });
    events.emit('boost:activated', { playerId: 0, boost: 'speed' });
    expect(played).toEqual(['light', 'medium', 'medium', 'medium', 'light']);
  });

  it('ignores what happens to other players', () => {
    const { events, played } = setup();
    events.emit('player:damaged', { playerId: 1, hp: 80, maxHp: 100, x: 0, y: 0, fromX: 10, fromY: 0 });
    events.emit('door:opened', { doorId: 'd1', playerId: 2, x: 0, y: 0 });
    expect(played).toEqual([]);
  });

  it('stays quiet with vibration off, and after being destroyed', () => {
    const { events, preferences, played, haptics } = setup();
    preferences.vibration = false;
    events.emit('player:damaged', { playerId: 0, hp: 80, maxHp: 100, x: 0, y: 0, fromX: 10, fromY: 0 });
    preferences.vibration = true;
    haptics.destroy();
    events.emit('door:opened', { doorId: 'd1', playerId: 0, x: 0, y: 0 });
    expect(played).toEqual([]);
  });
});

describe('Preferences', () => {
  it('starts with vibration on and remembers the choice', () => {
    const storage = memoryStorage();
    expect(new Preferences(storage).vibration).toBe(true);
    new Preferences(storage).vibration = false;
    expect(new Preferences(storage).vibration).toBe(false);
  });

  it('falls back to the defaults when storage is missing, broken or throws', () => {
    expect(new Preferences(null).vibration).toBe(true);
    expect(new Preferences(memoryStorage({ 'zombies.preferences': '{not json' })).vibration).toBe(true);
    expect(new Preferences(memoryStorage({ 'zombies.preferences': '{"vibration":"no"}' })).vibration).toBe(true);
    const throwing: PreferenceStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const p = new Preferences(throwing);
    expect(p.vibration).toBe(true);
    p.vibration = false;
    expect(p.vibration).toBe(false);
  });
});
