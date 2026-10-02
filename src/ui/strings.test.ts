import { describe, expect, it } from 'vitest';
import { STRINGS } from './strings';

describe('STRINGS', () => {
  it('says how many rounds were survived, in singular and plural', () => {
    expect(STRINGS.gameOver.survived(1)).toBe('HAS SOBREVIVIDO 1 RONDA');
    expect(STRINGS.gameOver.survived(7)).toBe('HAS SOBREVIVIDO 7 RONDAS');
  });

  it('names a room only once unlocked, in its gender, and never on the door', () => {
    expect(STRINGS.zoneUnlocked('cocina')).toBe('COCINA DESBLOQUEADA');
    expect(STRINGS.zoneUnlocked('garaje')).toBe('GARAJE DESBLOQUEADO');
    expect(STRINGS.zoneUnlocked('azotea')).toBe('AZOTEA DESBLOQUEADA');
    expect(STRINGS.zoneUnlocked('sotano')).toBe('SÓTANO DESBLOQUEADO');
    expect(STRINGS.zoneUnlocked('trastero')).toBe('SALA DESBLOQUEADA');
    expect(STRINGS.actions.unlockRoom('1000$')).toBe('DESBLOQUEAR · 1000$');
    expect(STRINGS.actions.unlockRoomMissing('250$')).toBe('DESBLOQUEAR · FALTAN 250$');
  });
});
