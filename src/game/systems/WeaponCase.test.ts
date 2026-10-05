import { describe, expect, it, vi } from 'vitest';
import { LOADOUT, WEAPON_CASES } from '../../config/balance';
import { WEAPONS, type WeaponId } from '../../config/weapons';
import { command, createTestContext, player } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import type { CaseFacing, MapWeaponCase } from '../map/MapLoader';
import { giveWeapon } from './InventorySystem';
import { stepSimulation } from './Simulation';
import { ammoPrice, caseFront, caseInReach, caseOffer, inFrontOf } from './WeaponCaseSystem';
import { upgradeWeapon } from './weaponStats';

type Ctx = ReturnType<typeof createTestContext>;

/**
 * A weapon case two tiles north of the player's spawn (room01), facing
 * `facing`, in the player's zone; the player standing right at its front.
 */
function withCase(weapon: WeaponId = 'smg', cost = 1000, facing: CaseFacing = 'south'): { ctx: Ctx; c: MapWeaponCase } {
  const ctx = createTestContext();
  const p = player(ctx);
  const ts = ctx.map.tileSize;
  const tileX = Math.floor(p.x / ts);
  const tileY = Math.floor(p.y / ts) - 2;
  const zoneIndex = ctx.map.cellZone[Math.floor(p.y / ts) * ctx.map.width + tileX] ?? 0;
  const c: MapWeaponCase = {
    id: 'V',
    tileX,
    tileY,
    x: (tileX + 0.5) * ts,
    y: (tileY + 0.5) * ts,
    facing,
    weapon,
    cost,
    zone: ctx.map.zones[zoneIndex]?.id ?? '',
    zoneIndex,
  };
  ctx.map.weaponCases.push(c);
  standAtFront(ctx, c);
  p.money = 10_000;
  return { ctx, c };
}

function standAtFront(ctx: Ctx, c: MapWeaponCase, extra = 8): void {
  const p = player(ctx);
  const f = caseFront(c, ctx.map.tileSize);
  const n = { south: [0, 1], east: [1, 0], west: [-1, 0] }[c.facing];
  p.x = p.prevX = f.x + (n[0] ?? 0) * extra;
  p.y = p.prevY = f.y + (n[1] ?? 0) * extra;
}

function tap(ctx: Ctx): void {
  command(ctx).actionPressed = true;
  stepSimulation(ctx, 1 / 60);
  command(ctx).actionPressed = false;
}

describe('weapon cases (spec 04 §3)', () => {
  it('can only be used from its front, within reach', () => {
    const { ctx, c } = withCase();
    const ts = ctx.map.tileSize;
    const f = caseFront(c, ts);
    expect(inFrontOf(c, ts, f.x, f.y + 10)).toBe(true);
    expect(inFrontOf(c, ts, f.x + 20, f.y + 20)).toBe(true);
    // Behind it or beside its back half: no.
    expect(inFrontOf(c, ts, c.x, c.y - ts)).toBe(false);
    expect(inFrontOf(c, ts, c.x + ts, c.y - 4)).toBe(false);
    // Too far in front.
    expect(inFrontOf(c, ts, f.x, f.y + WEAPON_CASES.interactRange + 1)).toBe(false);
    // A case facing east is bought from its east side.
    const east = { ...c, facing: 'east' as const };
    expect(inFrontOf(east, ts, c.x + ts, c.y)).toBe(true);
    expect(inFrontOf(east, ts, c.x, c.y + ts)).toBe(false);
    // The action button appears only in front.
    stepSimulation(ctx, 1 / 60);
    expect(player(ctx).contextAction).toBe('weaponCase');
    const p = player(ctx);
    p.x = p.prevX = c.x;
    p.y = p.prevY = c.y - ts;
    stepSimulation(ctx, 1 / 60);
    expect(player(ctx).contextAction).not.toBe('weaponCase');
  });

  it('with a free slot: pays, adds the weapon and takes it in hand', () => {
    const { ctx } = withCase('smg', 1000);
    const p = player(ctx);
    const spent = vi.fn();
    const bought = vi.fn();
    ctx.events.on('money:spent', spent);
    ctx.events.on('weaponCase:purchase', bought);
    tap(ctx);
    expect(p.weapons.map((w) => w.id)).toEqual(['pistol', 'smg']);
    expect(p.activeSlot).toBe(1);
    expect(p.money).toBe(9000);
    expect(spent).toHaveBeenCalledWith({ playerId: p.id, amount: 1000, source: 'case' });
    expect(bought).toHaveBeenCalledWith({ playerId: p.id, weapon: 'smg', ammo: false });
  });

  it('without money enough: nothing, and the button says what is missing', () => {
    const { ctx, c } = withCase('shotgun', 1500);
    const p = player(ctx);
    p.money = 500;
    expect(caseOffer(ctx.map, p, 0)).toMatchObject({ mode: 'buy', enabled: false, missing: 1000 });
    tap(ctx);
    expect(p.weapons).toHaveLength(1);
    expect(p.money).toBe(500);
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const action = vi.fn();
    ctx.events.on('action:context', action);
    presenter.publish(ctx.state);
    expect(action).toHaveBeenLastCalledWith({ kind: 'weaponCase', amount: 1000, enabled: false, weaponCase: { weapon: c.weapon, mode: 'buy', full: false } });
  });

  it('with the weapon carried: sells its ammo at half the price, not when it is full', () => {
    const { ctx, c } = withCase('smg', 1000);
    const p = player(ctx);
    giveWeapon(p, 'smg');
    const smg = p.weapons[1]!;
    expect(caseOffer(ctx.map, p, 0)).toMatchObject({ mode: 'ammo', full: true, enabled: false });
    smg.magazine = 3;
    smg.reserve = 10;
    expect(caseOffer(ctx.map, p, 0)).toMatchObject({ mode: 'ammo', price: ammoPrice(c), enabled: true });
    expect(ammoPrice(c)).toBe(500);
    tap(ctx);
    expect([smg.magazine, smg.reserve]).toEqual([WEAPONS.smg.magazine, WEAPONS.smg.maxReserve]);
    expect(p.money).toBe(9500);
    expect(p.weapons).toHaveLength(2);
  });

  it('with every slot full it replaces the weapon in hand; an upgraded one asks first and loses its upgrades', () => {
    const { ctx } = withCase('shotgun', 1500);
    const p = player(ctx);
    giveWeapon(p, 'smg');
    // Three slots full without the shotgun: a second pistol stands in for a future weapon (only three exist yet).
    p.weapons.push({ ...p.weapons[0]!, id: 'pistol' });
    expect(p.weapons).toHaveLength(LOADOUT.maxWeapons);
    p.activeSlot = 1; // the SMG in hand, upgraded
    const smg = p.weapons[1]!;
    upgradeWeapon(smg, 'ammo');
    upgradeWeapon(smg, 'damage');
    // First tap: asks, buys nothing.
    tap(ctx);
    expect(p.swapConfirmCase).toBe(0);
    expect(caseOffer(ctx.map, p, 0)).toMatchObject({ mode: 'confirm' });
    expect(p.weapons[1]?.id).toBe('smg');
    expect(p.money).toBe(10_000);
    // Second tap: the shotgun takes the SMG's place, fresh.
    tap(ctx);
    expect(p.weapons[1]).toMatchObject({ id: 'shotgun', levels: { ammo: 0, fire_rate: 0, damage: 0 }, special: false });
    expect(p.weapons.some((w) => w.id === 'smg')).toBe(false);
    expect(p.money).toBe(8500);
    expect(p.swapConfirmCase).toBe(-1);
  });

  it('the confirmation lapses with time or when the player walks away', () => {
    const { ctx, c } = withCase('shotgun', 1500);
    const p = player(ctx);
    giveWeapon(p, 'smg');
    p.weapons.push({ ...p.weapons[0]!, id: 'pistol' });
    p.activeSlot = 1;
    p.weapons[1]!.special = true;
    tap(ctx);
    expect(p.swapConfirmCase).toBe(0);
    for (let t = 0; t < WEAPON_CASES.swapConfirmTime * 60 + 2; t++) stepSimulation(ctx, 1 / 60);
    expect(p.swapConfirmCase).toBe(-1);
    tap(ctx);
    expect(p.swapConfirmCase).toBe(0);
    p.x = p.prevX = c.x + 200;
    stepSimulation(ctx, 1 / 60);
    expect(p.swapConfirmCase).toBe(-1);
    expect(p.weapons[1]?.id).toBe('smg');
  });

  it('does nothing while its zone is locked', () => {
    const { ctx } = withCase();
    const p = player(ctx);
    ctx.state.zonesUnlocked[ctx.map.weaponCases[0]!.zoneIndex] = false;
    expect(caseInReach(ctx.map, ctx.state, p)).toBe(-1);
  });
});
