import { describe, expect, it } from 'vitest';
import { PICKUPS, ZOMBIES } from '../config/balance';
import { DUNGEON } from '../config/dungeon';
import { rules, rulesOf } from './rules';

describe('the mode rules (spec 09 §1, §5.1)', () => {
  it('leaves Survival with its own numbers and systems', () => {
    const r = rulesOf('survival');
    expect(r).toMatchObject({ waves: true, payDoors: true, merchants: true, dungeon: false, zombieDamage: ZOMBIES.attackDamage, medkitHeal: PICKUPS.healthAmount });
    expect(r.infiniteReserve).toEqual([]);
    expect(rules({ mode: 'survival' })).toBe(r);
  });

  it('gives the dungeon its scratch, its medkit, the endless pistol and its systems', () => {
    const r = rulesOf('dungeon');
    expect(r).toMatchObject({ waves: false, payDoors: false, merchants: false, dungeon: true, zombieDamage: 20, medkitHeal: 40 });
    expect(r.infiniteReserve).toEqual(['pistol']);
    expect(DUNGEON.combat.zombieDamage).toBeLessThan(ZOMBIES.attackDamage);
  });
});
