import { describe, expect, it } from 'vitest';
import { UPGRADE_PRICES } from '../../config/merchants';
import { UPGRADE_LEVELS, WEAPONS, type WeaponDef } from '../../config/weapons';
import { createTestContext, player } from '../../test/fixtures';
import { itemPrice, shopItemStatus } from './ShopSystem';
import { moveMerchant } from './MerchantSystem';
import { levelStats, maxUpgradeLevel, specialReason, upgradeReason } from './weaponStats';

const NONE = { ammo: 0, fire_rate: 0, damage: 0 };

/** A made-up weapon that takes only two damage levels and one of ammo; no special. */
const FAKE: WeaponDef = { ...WEAPONS.pistol, upgrades: { damage: 2, ammo: 1 }, special: undefined };

/** A later special weapon without levels, only the gold merchant's upgrade. */
const NO_LEVELS: WeaponDef = { ...WEAPONS.smg, category: 'special', upgrades: {} };

describe('weapon catalogue: upgrade levels per kind (spec 04 §1, chosen at the red merchant)', () => {
  it('each kind gives its factor at its level, the total at that level (levels do not multiply)', () => {
    const p = WEAPONS.pistol;
    expect(levelStats(p, NONE)).toMatchObject({ magazine: p.magazine, maxReserve: p.maxReserve, fireRate: p.fireRate, damage: p.damage });
    expect(UPGRADE_LEVELS).toEqual({ ammo: [1.5, 2, 2.5], fire_rate: [1.25, 1.5, 1.75], damage: [1.5, 2, 2.5] });
    for (let level = 1; level <= 3; level++) {
      const at = levelStats(p, { ammo: level, fire_rate: level, damage: level });
      expect(at.magazine).toBe(Math.round(p.magazine * UPGRADE_LEVELS.ammo[level - 1]!));
      expect(at.maxReserve).toBe(Math.round(p.maxReserve * UPGRADE_LEVELS.ammo[level - 1]!));
      expect(at.fireRate).toBeCloseTo(p.fireRate * UPGRADE_LEVELS.fire_rate[level - 1]!);
      expect(at.damage).toBeCloseTo(p.damage * UPGRADE_LEVELS.damage[level - 1]!);
    }
    // Kinds are independent: damage 3 with no ammo levels.
    expect(levelStats(p, { ammo: 0, fire_rate: 0, damage: 3 })).toMatchObject({ magazine: p.magazine, damage: p.damage * 2.5 });
  });

  it('whole-number magazines and reserves for every basic weapon at every ammo level', () => {
    for (const def of Object.values(WEAPONS)) {
      for (let level = 0; level <= 3; level++) {
        const s = levelStats(def, { ...NONE, ammo: level });
        expect(Number.isInteger(s.magazine) && Number.isInteger(s.maxReserve), `${def.id} ${level}`).toBe(true);
      }
    }
  });

  it('every basic weapon takes three levels of each kind', () => {
    for (const def of Object.values(WEAPONS)) {
      expect(def.category).toBe('basic');
      for (const kind of ['ammo', 'fire_rate', 'damage'] as const) expect(maxUpgradeLevel(def, kind), `${def.id} ${kind}`).toBe(3);
    }
  });

  it('a weapon applies only the levels it takes of each kind', () => {
    expect(maxUpgradeLevel(FAKE, 'fire_rate')).toBe(0);
    expect(levelStats(FAKE, { ammo: 3, fire_rate: 3, damage: 3 })).toEqual(levelStats(FAKE, { ammo: 1, fire_rate: 0, damage: 2 }));
  });

  it('a fire rate level speeds up the reload only on weapons that say so', () => {
    const slow: WeaponDef = { ...FAKE, upgrades: { fire_rate: 3 }, fireRateSpeedsReload: true };
    expect(levelStats(slow, { ...NONE, fire_rate: 2 }).reloadTime).toBeCloseTo(slow.reloadTime / UPGRADE_LEVELS.fire_rate[1]!);
    expect(levelStats(WEAPONS.pistol, { ...NONE, fire_rate: 2 }).reloadTime).toBe(WEAPONS.pistol.reloadTime);
  });

  it('a kind a weapon does not take is NOT UPGRADABLE; at its last level it is at MAX LEVEL', () => {
    expect(upgradeReason(NO_LEVELS, 'damage', 0)).toBe('notUpgradable');
    expect(upgradeReason(FAKE, 'fire_rate', 0)).toBe('notUpgradable');
    expect(upgradeReason(FAKE, 'damage', 1)).toBeNull();
    expect(upgradeReason(FAKE, 'damage', 2)).toBe('maxLevel');
    expect(upgradeReason(WEAPONS.pistol, 'ammo', 3)).toBe('maxLevel');
  });

  it('a weapon without a special has NO SPECIAL; one that has it already says so', () => {
    expect(specialReason(FAKE, false)).toBe('noSpecial');
    expect(specialReason(WEAPONS.smg, false)).toBeNull();
    expect(specialReason(WEAPONS.smg, true)).toBe('hasSpecial');
  });
});

describe('the red merchant: three kinds of upgrade, each level dearer', () => {
  function atRed() {
    const ctx = createTestContext();
    const red = ctx.state.merchants.findIndex((m) => m.id === 'red');
    const m = ctx.state.merchants[red]!;
    m.enabled = true;
    m.round = ctx.state.wave.round;
    moveMerchant(ctx, red);
    const p = player(ctx);
    p.money = 100_000;
    p.x = p.prevX = m.x + 20;
    p.y = p.prevY = m.y;
    return { ctx, red, p };
  }

  it('sells ammo, fire rate and damage for the weapon in hand, priced by the level each would buy', () => {
    const { ctx, red, p } = atRed();
    const items = ctx.state.merchants[red] && ['upgrade_ammo', 'upgrade_fire_rate', 'upgrade_damage'];
    expect(items).toBeTruthy();
    expect(UPGRADE_PRICES).toEqual([1500, 3000, 5000]);
    const pistol = p.weapons[p.activeSlot]!;
    const def = { id: 'upgrade_damage' as const, price: UPGRADE_PRICES };
    expect(itemPrice(p, def)).toBe(1500);
    pistol.levels.damage = 1;
    expect(itemPrice(p, def)).toBe(3000);
    pistol.levels.damage = 2;
    expect(itemPrice(p, def)).toBe(5000);
    // The other kinds keep their own level's price.
    expect(itemPrice(p, { id: 'upgrade_ammo', price: UPGRADE_PRICES })).toBe(1500);
    pistol.levels.damage = 3;
    expect(shopItemStatus(ctx.state, red, 0, 2)).toEqual({ kind: 'unavailable', reason: 'maxLevel' });
    expect(shopItemStatus(ctx.state, red, 0, 0)).toEqual({ kind: 'buy' });
  });
});
