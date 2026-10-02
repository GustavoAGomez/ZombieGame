import { describe, expect, it } from 'vitest';
import { UPGRADE_EFFECTS, WEAPONS, type WeaponDef } from '../../config/weapons';
import { createTestContext, player } from '../../test/fixtures';
import { shopItemStatus } from './ShopSystem';
import { moveMerchant } from './MerchantSystem';
import { levelStats, levelUpReason, specialReason, upgradeCount } from './weaponStats';

/** A made-up weapon: its first level is damage ×2, then ammo ×2; no special. */
const FAKE: WeaponDef = {
  ...WEAPONS.pistol,
  upgrades: ['damage_x2', 'ammo_x2'],
  special: undefined,
};

/** A later special weapon without levels, only the gold merchant's upgrade. */
const NO_LEVELS: WeaponDef = { ...WEAPONS.smg, category: 'special', upgrades: [] };

describe('weapon catalogue: levels per weapon (spec 04 §1)', () => {
  it('reads each level from the weapon’s own list', () => {
    expect(levelStats(FAKE, 0).damage).toBe(FAKE.damage);
    // Level 1 of this weapon is damage ×2, not ammo ×2 as on the pistol.
    expect(levelStats(FAKE, 1).damage).toBe(FAKE.damage * UPGRADE_EFFECTS.damage_x2.damageFactor);
    expect(levelStats(FAKE, 1).magazine).toBe(FAKE.magazine);
    expect(levelStats(FAKE, 2).magazine).toBe(FAKE.magazine * UPGRADE_EFFECTS.ammo_x2.capacityFactor);
    // Beyond its list nothing else applies.
    expect(levelStats(FAKE, 3)).toEqual(levelStats(FAKE, 2));
    expect(upgradeCount(FAKE, 5, 'fire_rate')).toBe(0);
  });

  it('the pistol and the SMG keep their spec 03 levels: ammo, fire rate, damage', () => {
    for (const def of [WEAPONS.pistol, WEAPONS.smg]) {
      expect(def.upgrades).toEqual(['ammo_x2', 'fire_rate', 'damage_x2']);
      expect(def.category).toBe('basic');
    }
    expect(WEAPONS.pistol.special).toBe('fan');
    expect(WEAPONS.smg.special).toBe('pierce');
  });

  it('a fire rate level speeds up the reload only on weapons that say so', () => {
    const slow: WeaponDef = { ...FAKE, upgrades: ['fire_rate'], fireRateSpeedsReload: true };
    expect(levelStats(slow, 1).reloadTime).toBeCloseTo(slow.reloadTime / UPGRADE_EFFECTS.fire_rate.reloadFactor);
    expect(levelStats(WEAPONS.pistol, 2).reloadTime).toBe(WEAPONS.pistol.reloadTime);
  });

  it('a weapon with no levels is NOT UPGRADABLE; at the end of its list it is at MAX LEVEL', () => {
    expect(levelUpReason(NO_LEVELS, 0)).toBe('notUpgradable');
    expect(levelUpReason(FAKE, 1)).toBeNull();
    expect(levelUpReason(FAKE, 2)).toBe('maxLevel');
    expect(levelUpReason(WEAPONS.pistol, 3)).toBe('maxLevel');
  });

  it('a weapon without a special has NO SPECIAL; one that has it already says so', () => {
    expect(specialReason(FAKE, false)).toBe('noSpecial');
    expect(specialReason(WEAPONS.smg, false)).toBeNull();
    expect(specialReason(WEAPONS.smg, true)).toBe('hasSpecial');
  });
});

describe('red and gold merchants read the weapon’s own list', () => {
  it('the red merchant sells the next level of the weapon in hand until its list ends', () => {
    const ctx = createTestContext();
    const red = ctx.state.merchants.findIndex((m) => m.id === 'red');
    const m = ctx.state.merchants[red]!;
    m.enabled = true;
    moveMerchant(ctx, red);
    const p = player(ctx);
    p.money = 100_000;
    p.x = p.prevX = m.x + 20;
    p.y = p.prevY = m.y;
    expect(m.active).toBe(true);
    expect(shopItemStatus(ctx.state, red, 0, 0)).toEqual({ kind: 'buy' });
    p.weapons[p.activeSlot]!.level = WEAPONS.pistol.upgrades.length;
    expect(shopItemStatus(ctx.state, red, 0, 0)).toEqual({ kind: 'unavailable', reason: 'maxLevel' });
  });
});
