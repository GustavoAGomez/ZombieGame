import { describe, expect, it } from 'vitest';
import type { PreferenceStorage } from './preferences';
import { Records } from './records';

function memory(initial: Record<string, string> = {}): PreferenceStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => void (data[k] = v) };
}

describe('Records (spec 09 §10)', () => {
  it('starts with no record, and only a better round replaces the best', () => {
    const storage = memory();
    const records = new Records(storage);
    expect(records.all.survival.bestRound).toBe(0);
    expect(records.recordSurvival(4)).toBe(true);
    expect(records.recordSurvival(3)).toBe(false);
    expect(records.recordSurvival(4)).toBe(false);
    expect(new Records(storage).all.survival.bestRound).toBe(4);
  });

  it('keeps the dungeon\'s best floor, most rooms, wins and fastest win', () => {
    const storage = memory();
    const records = new Records(storage);
    expect(records.recordRun({ floor: 2, rooms: 9, won: false, time: 400 })).toBe(true);
    expect(records.recordRun({ floor: 1, rooms: 3, won: false, time: 100 })).toBe(false);
    expect(records.recordRun({ floor: 3, rooms: 20, won: true, time: 900 })).toBe(true);
    expect(records.recordRun({ floor: 3, rooms: 18, won: true, time: 800 })).toBe(true);
    expect(records.recordRun({ floor: 3, rooms: 18, won: true, time: 850 })).toBe(false);
    expect(new Records(storage).all.dungeon).toEqual({ bestFloor: 3, mostRooms: 20, wins: 3, bestWinTime: 800 });
  });

  it('falls back to no record on corrupt or missing storage, and never throws', () => {
    expect(new Records(memory({ 'zombies.records': '{broken' })).all.dungeon.wins).toBe(0);
    expect(new Records(memory({ 'zombies.records': JSON.stringify({ survival: { bestRound: 'many' }, dungeon: { wins: -2, bestWinTime: 0 } }) })).all).toEqual({
      survival: { bestRound: 0 },
      dungeon: { bestFloor: 0, mostRooms: 0, wins: 0, bestWinTime: null },
    });
    const throwing: PreferenceStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const records = new Records(throwing);
    expect(() => records.recordSurvival(2)).not.toThrow();
    expect(records.all.survival.bestRound).toBe(2);
    expect(new Records(null).all.survival.bestRound).toBe(0);
  });
});
