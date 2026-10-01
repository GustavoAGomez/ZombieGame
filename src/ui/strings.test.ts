import { describe, expect, it } from 'vitest';
import { STRINGS } from './strings';

describe('STRINGS', () => {
  it('says how many rounds were survived, in singular and plural', () => {
    expect(STRINGS.gameOver.survived(1)).toBe('HAS SOBREVIVIDO 1 RONDA');
    expect(STRINGS.gameOver.survived(7)).toBe('HAS SOBREVIVIDO 7 RONDAS');
  });
});
