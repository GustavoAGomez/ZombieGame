import { describe, expect, it } from 'vitest';
import { PLAYER } from '../../config/balance';
import { CURSE_EFFECTS, UPGRADE_EFFECTS } from '../../config/upgrades';
import type { RunState } from '../../core/RunState';
import { adrenalineOn, copiesOf, fireRateBonus, maxHpWith, NEUTRAL_STATS, playerStats, speedBonus } from './stats';

/** A run with just its lists: the stats read nothing else. */
function runWith(upgrades: RunState['upgrades'], curses: RunState['curses'] = []): RunState {
  return { upgrades, curses } as unknown as RunState;
}

describe('the upgrades\' stats (spec 09 §7.2, §9)', () => {
  it('is neutral without a run (Survival) and with an empty one', () => {
    expect(playerStats(null)).toBe(NEUTRAL_STATS);
    expect(playerStats(runWith([]))).toEqual(NEUTRAL_STATS);
  });

  it('adds the copies up: life, reload, speed, money, reserve, pierce, bounces, fire, leech', () => {
    const s = playerStats(runWith(['vitality', 'vitality', 'quick_hands', 'quick_hands', 'light_feet', 'greed', 'greed', 'deep_pockets', 'piercing', 'piercing', 'ricochet', 'incendiary', 'incendiary', 'leech', 'leech']));
    expect(s.maxHpBonus).toBe(2 * UPGRADE_EFFECTS.vitality.maxHp);
    expect(s.reload).toBeCloseTo(UPGRADE_EFFECTS.quick_hands.reload ** 2);
    expect(s.speed).toBeCloseTo(UPGRADE_EFFECTS.light_feet.speed);
    expect(s.money).toBeCloseTo(UPGRADE_EFFECTS.greed.money ** 2);
    expect(s.reserve).toBeCloseTo(UPGRADE_EFFECTS.deep_pockets.reserve);
    expect(s.extraPierce).toBe(2);
    expect(s.bounces).toBe(1);
    expect(s.igniteChance).toBeCloseTo(2 * UPGRADE_EFFECTS.incendiary.chance);
    // Two leeches heal every five kills.
    expect(s.leech).toEqual({ kills: 5, heal: UPGRADE_EFFECTS.leech.heal });
    expect(copiesOf(runWith(['greed', 'greed', 'vitality']), 'greed')).toBe(2);
  });

  it('switches the rest on: magnet, knife, volatile, dashes, adrenaline, fan, shadow dash, ward, crit', () => {
    const s = playerStats(runWith(['magnet', 'sharp_knife', 'volatile', 'second_wind', 'adrenaline', 'fan_fire', 'shadow_dash', 'ward', 'executioner']));
    expect(s.pickupRange).toBe(UPGRADE_EFFECTS.magnet.range);
    expect(s.pickupsExpire).toBe(false);
    expect(s.knifeDamage).toBe(UPGRADE_EFFECTS.sharp_knife.damage);
    expect(s.knifeReach).toBe(UPGRADE_EFFECTS.sharp_knife.reach);
    expect(s.volatile).toMatchObject({ radius: UPGRADE_EFFECTS.volatile.radius, damage: UPGRADE_EFFECTS.volatile.damage });
    expect(s.dashes).toBe(2);
    expect(s.adrenaline).toEqual({ fireRate: UPGRADE_EFFECTS.adrenaline.fireRate, speed: UPGRADE_EFFECTS.adrenaline.speed });
    expect(s.fan).toEqual(UPGRADE_EFFECTS.fan_fire);
    expect(s.shadowDash).toEqual(UPGRADE_EFFECTS.shadow_dash);
    expect(s.ward).toBe(true);
    expect(s.crit).toEqual(UPGRADE_EFFECTS.executioner);
  });

  it('the curses take away: life, enemy speed, prices and reserve, which Fuga and Bolsillos hondos multiply together', () => {
    const s = playerStats(runWith(['deep_pockets'], ['frail', 'hunted', 'tithe', 'leak']));
    expect(s.maxHpBonus).toBe(CURSE_EFFECTS.frail.maxHp);
    expect(s.enemySpeed).toBe(CURSE_EFFECTS.hunted.enemySpeed);
    expect(s.prices).toBe(CURSE_EFFECTS.tithe.prices);
    expect(s.reserve).toBeCloseTo(UPGRADE_EFFECTS.deep_pockets.reserve * CURSE_EFFECTS.leak.reserve);
    expect(maxHpWith(s)).toBe(PLAYER.maxHp + CURSE_EFFECTS.frail.maxHp);
  });

  it('is memoized per run until its lists grow', () => {
    const run = runWith(['greed']);
    const first = playerStats(run);
    expect(playerStats(run)).toBe(first);
    run.upgrades.push('greed');
    const second = playerStats(run);
    expect(second).not.toBe(first);
    expect(second.money).toBeCloseTo(UPGRADE_EFFECTS.greed.money ** 2);
  });

  it('Adrenalina runs with the life low, alive', () => {
    const s = playerStats(runWith(['adrenaline', 'light_feet']));
    expect(adrenalineOn(s, { hp: PLAYER.lowHpThreshold })).toBe(false);
    expect(adrenalineOn(s, { hp: PLAYER.lowHpThreshold - 1 })).toBe(true);
    expect(adrenalineOn(s, { hp: 0 })).toBe(false);
    expect(speedBonus(s, { hp: 10 })).toBeCloseTo(UPGRADE_EFFECTS.light_feet.speed * UPGRADE_EFFECTS.adrenaline.speed);
    expect(speedBonus(s, { hp: 100 })).toBeCloseTo(UPGRADE_EFFECTS.light_feet.speed);
    expect(fireRateBonus(s, { hp: 10 })).toBe(UPGRADE_EFFECTS.adrenaline.fireRate);
    expect(fireRateBonus(NEUTRAL_STATS, { hp: 10 })).toBe(1);
  });
});
