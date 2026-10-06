import { describe, expect, it } from 'vitest';
import { STRINGS } from '../ui/strings';
import { choiceText, loadTrials, saveTrials, type TrialStorage } from './soundTrials';

class MemoryStorage implements TrialStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
}

describe('«Probar en partida»: the candidates on trial (spec 08 §4.4)', () => {
  it('keeps them on the device and brings them back', () => {
    const storage = new MemoryStorage();
    saveTrials(storage, { 'impact.flesh': 'C', 'jingle.round.start': 'A' });
    expect(loadTrials(storage)).toEqual({ 'impact.flesh': 'C', 'jingle.round.start': 'A' });
  });

  it('leaves out anything broken, and works without storage at all', () => {
    const storage = new MemoryStorage();
    storage.items.set('zombies.soundTrials', JSON.stringify({ 'ui.tap': 'B', 'ui.play': 'D', other: 3 }));
    expect(loadTrials(storage)).toEqual({ 'ui.tap': 'B' });
    storage.items.set('zombies.soundTrials', '{not json');
    expect(loadTrials(storage)).toEqual({});
    expect(loadTrials(null)).toEqual({});
    const failing: TrialStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(loadTrials(failing)).toEqual({});
    expect(() => saveTrials(failing, { 'ui.tap': 'A' })).not.toThrow();
  });

  it('writes the text to send in the chat, one sound per line, sorted', () => {
    expect(choiceText({ 'jingle.round.start': 'A', 'impact.flesh': 'C' })).toBe(`${STRINGS.debug.choiceTitle}\nimpact.flesh: C\njingle.round.start: A`);
    expect(choiceText({})).toBe(STRINGS.debug.noTrials);
  });
});
