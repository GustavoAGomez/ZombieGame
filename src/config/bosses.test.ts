import { describe, expect, it } from 'vitest';
import { BOSS_SCHEDULE, BOSS_VARIANT_IDS, BOSS_VARIANTS, BOSSES, MIN_WINDUP_FACTOR, bossHp, bossesForRound, windupFactor } from './bosses';

const names = (round: number): string[] => bossesForRound(round).map((b) => `${b.boss}:${b.variant}`);

describe('boss calendar (spec 07 §1)', () => {
  it('brings the butcher in rounds 6, 12, 18, 24 and 30 with their variants', () => {
    expect(names(6)).toEqual(['butcher:base']);
    expect(names(12)).toEqual(['butcher:rabid']);
    expect(names(18)).toEqual(['butcher:base', 'butcher:base']);
    expect(names(24)).toEqual(['butcher:putrid']);
    expect(names(30)).toEqual(['butcher:rabid', 'butcher:base']);
    for (const round of [6, 12, 18, 24, 30]) expect(bossesForRound(round).every((b) => b.hpFactor === 1)).toBe(true);
  });

  it('has no boss in the other rounds', () => {
    for (const round of [1, 2, 5, 7, 11, 13, 29, 31, 35, 37]) expect(bossesForRound(round)).toEqual([]);
  });

  it('repeats rounds 12 to 30 every 6 rounds after that, with the health ×1.3 per lap', () => {
    expect(names(36)).toEqual(names(12));
    expect(names(42)).toEqual(names(18));
    expect(names(48)).toEqual(names(24));
    expect(names(54)).toEqual(names(30));
    expect(names(60)).toEqual(names(12));
    expect(bossesForRound(36)[0]?.hpFactor).toBeCloseTo(BOSS_SCHEDULE.lapHpFactor);
    expect(bossesForRound(54)[0]?.hpFactor).toBeCloseTo(1.3);
    expect(bossesForRound(60)[0]?.hpFactor).toBeCloseTo(1.3 * 1.3);
  });
});

describe('boss variants (spec 07 §1)', () => {
  it('multiply health and damage, and shorten the windups', () => {
    expect(BOSS_VARIANTS.base).toMatchObject({ hp: 1, damage: 1, windup: 1, enraged: false, puddles: false, tint: null });
    expect(BOSS_VARIANTS.rabid).toMatchObject({ hp: 1.8, damage: 1.25, windup: 0.85, enraged: true, puddles: false });
    expect(BOSS_VARIANTS.putrid).toMatchObject({ hp: 2.5, damage: 1.5, windup: 0.85, enraged: true, puddles: true });
    expect(bossHp('butcher', 'base')).toBe(BOSSES.butcher.hp);
    expect(bossHp('butcher', 'rabid')).toBeCloseTo(180);
    expect(bossHp('butcher', 'putrid', 1.3)).toBeCloseTo(325);
  });

  it('never take a windup under 80 % of its base value', () => {
    expect(MIN_WINDUP_FACTOR).toBe(0.8);
    for (const id of BOSS_VARIANT_IDS) expect(windupFactor(id)).toBeGreaterThanOrEqual(MIN_WINDUP_FACTOR);
    expect(windupFactor('rabid')).toBeCloseTo(0.85);
  });

  it('multiply the health by the number of players (spec 07 §9)', () => {
    expect(bossHp('butcher', 'base', 1, 3)).toBe(300);
  });
});
