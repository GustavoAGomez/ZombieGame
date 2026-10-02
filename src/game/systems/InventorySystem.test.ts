import { describe, expect, it } from 'vitest';
import { LOADOUT } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
import { command, createTestContext, player } from '../../test/fixtures';
import { stepSimulation } from './Simulation';
import { HudPresenter } from '../HudPresenter';
import { giveWeapon, needsSwapConfirm, weaponReplacedBy } from './InventorySystem';
import { levelUp, magazineSize } from './weaponStats';

/**
 * With only three basic weapons a player carrying all three never buys a
 * fourth, so "every slot full" is tested with 2 slots: pistol and SMG
 * carried, the shotgun bought.
 */
const TWO_SLOTS = 2;

describe('inventory (spec 04 §2)', () => {
  it('starts with the pistol alone', () => {
    const p = player(createTestContext());
    expect(p.weapons.map((w) => w.id)).toEqual(['pistol']);
    expect(p.activeSlot).toBe(0);
  });

  it('a new weapon goes into a free slot and is taken in hand, full of ammo', () => {
    const p = player(createTestContext());
    expect(giveWeapon(p, 'smg')).toBe('added');
    expect(p.weapons.map((w) => w.id)).toEqual(['pistol', 'smg']);
    expect(p.activeSlot).toBe(1);
    expect(p.switchTimer).toBe(LOADOUT.switchTime);
    expect(p.weapons[1]?.magazine).toBe(WEAPONS.smg.magazine);
    expect(giveWeapon(p, 'shotgun')).toBe('added');
    expect(p.weapons).toHaveLength(LOADOUT.maxWeapons);
  });

  it('a weapon already carried is only taken in hand', () => {
    const p = player(createTestContext());
    giveWeapon(p, 'smg');
    p.activeSlot = 0;
    expect(giveWeapon(p, 'smg')).toBe('owned');
    expect(p.weapons).toHaveLength(2);
    expect(p.activeSlot).toBe(1);
  });

  it('with every slot full it replaces the weapon in hand', () => {
    const p = player(createTestContext());
    giveWeapon(p, 'smg');
    p.activeSlot = 0; // the pistol in hand
    expect(weaponReplacedBy(p, 'shotgun', TWO_SLOTS)?.id).toBe('pistol');
    expect(giveWeapon(p, 'shotgun', TWO_SLOTS)).toBe('replaced');
    expect(p.weapons.map((w) => w.id)).toEqual(['shotgun', 'smg']);
    expect(p.activeSlot).toBe(0);
  });

  it('replacing a weapon throws away its levels and special: the new one comes fresh', () => {
    const p = player(createTestContext());
    giveWeapon(p, 'smg'); // SMG in hand
    const smg = p.weapons[1]!;
    levelUp(smg);
    levelUp(smg);
    smg.special = true;
    giveWeapon(p, 'shotgun', TWO_SLOTS);
    const bought = p.weapons[1]!;
    expect(bought.id).toBe('shotgun');
    expect([bought.level, bought.special]).toEqual([0, false]);
    expect(bought.magazine).toBe(magazineSize(bought));
    expect(p.weapons.some((w) => w.id === 'smg')).toBe(false);
  });

  it('asks to confirm only when the weapon going away is upgraded (levels or special)', () => {
    const p = player(createTestContext());
    giveWeapon(p, 'smg'); // SMG in hand, every slot full with TWO_SLOTS
    const smg = p.weapons[1]!;
    expect(needsSwapConfirm(p, 'shotgun', TWO_SLOTS)).toBe(false);
    levelUp(smg);
    expect(needsSwapConfirm(p, 'shotgun', TWO_SLOTS)).toBe(true);
    smg.level = 0;
    smg.special = true;
    expect(needsSwapConfirm(p, 'shotgun', TWO_SLOTS)).toBe(true);
    // With a free slot nothing goes away: never asks.
    expect(needsSwapConfirm(p, 'shotgun')).toBe(false);
  });

  it('switching does nothing with one weapon and rotates in order with two or three', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const next = (): number => {
      command(ctx).switchWeapon = true;
      stepSimulation(ctx, 1 / 60);
      command(ctx).switchWeapon = false;
      p.switchTimer = 0;
      return p.activeSlot;
    };
    const tap = (slot: number): number => {
      command(ctx).selectWeapon = slot;
      stepSimulation(ctx, 1 / 60);
      command(ctx).selectWeapon = -1;
      p.switchTimer = 0;
      return p.activeSlot;
    };
    expect([next(), tap(0), tap(1)]).toEqual([0, 0, 0]);
    expect(p.switchTimer).toBe(0);
    giveWeapon(p, 'smg');
    p.activeSlot = 0;
    expect([next(), next()]).toEqual([1, 0]);
    giveWeapon(p, 'shotgun');
    p.activeSlot = 0;
    expect([next(), next(), next()]).toEqual([1, 2, 0]);
    expect(tap(2)).toBe(2);
  });

  it('the weapon column shows one slot per weapon carried: 1, 2 and 3', () => {
    const ctx = createTestContext();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const slots: number[] = [];
    ctx.events.on('weapons:loadout', (e) => slots.push(e.slots.length));
    presenter.publish(ctx.state);
    giveWeapon(player(ctx), 'smg');
    presenter.publish(ctx.state);
    giveWeapon(player(ctx), 'shotgun');
    presenter.publish(ctx.state);
    expect(slots).toEqual([1, 2, 3]);
  });
});
