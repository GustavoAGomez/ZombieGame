import { describe, expect, it, vi } from 'vitest';
import { embeddedMansion } from '../../../scripts/lib/mansion-fixture';
import { MELEE, PLAYER, POINTS } from '../../config/balance';
import { WEAPONS } from '../../config/weapons';
import { createWeaponSlot } from '../../core/GameState';
import { command, createTestContext, placeZombie, player } from '../../test/fixtures';
import { HudPresenter } from '../HudPresenter';
import { parseMap } from '../map/MapLoader';
import type { TiledObjectLayer } from '../map/tiled';
import { updateMovement } from './MovementSystem';
import type { SimContext } from './SimContext';
import { updateWeapons } from './WeaponSystem';

/** Spec 06 §2.2: the katana, a sweep that cuts every zombie in its arc. */

const KATANA = WEAPONS.katana;
const DT = 1 / 60;

function withKatana(): SimContext {
  const ctx = createTestContext();
  const p = player(ctx);
  p.weapons = [createWeaponSlot('katana')];
  p.activeSlot = 0;
  return ctx;
}

function swingEast(ctx: SimContext): void {
  Object.assign(command(ctx), { fire: true, aimManual: true, aimX: 1, aimY: 0 });
  updateWeapons(ctx, DT);
}

describe('katana', () => {
  it('cuts every zombie inside its 140° arc and reach, and none outside', () => {
    const ctx = withKatana();
    const p = player(ctx);
    const ahead = placeZombie(ctx, 0, p.x + 25, p.y, 100);
    const diagonal = placeZombie(ctx, 1, p.x + 20, p.y + 20, 100); // 45°: inside ±70°
    const side = placeZombie(ctx, 2, p.x, p.y - 30, 100); // 90°: outside
    const behind = placeZombie(ctx, 3, p.x - 25, p.y, 100);
    const far = placeZombie(ctx, 4, p.x + 50, p.y, 100); // 44 px to its hitbox: beyond 34
    swingEast(ctx);
    expect([ahead.hp, diagonal.hp]).toEqual([100 - KATANA.damage, 100 - KATANA.damage]);
    expect([side.hp, behind.hp, far.hp]).toEqual([100, 100, 100]);
    expect(p.meleeWide).toBe(true);
    expect(p.meleeAngle).toBeCloseTo(0);
  });

  it('pushes each zombie it cuts 6 px away, and scores like the knife for each one', () => {
    const ctx = withKatana();
    const p = player(ctx);
    const a = placeZombie(ctx, 0, p.x + 25, p.y, 100, 'chasing');
    placeZombie(ctx, 1, p.x + 20, p.y - 15, 100, 'chasing');
    const money = p.money;
    swingEast(ctx);
    expect(a.x).toBeCloseTo(p.x + 25 + (KATANA.knockback ?? 0));
    expect(p.money).toBe(money + 2 * POINTS.meleeHit);
  });

  it('needs no ammo, sweeps at once on the press and then every 0.45 s while held', () => {
    const ctx = withKatana();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 25, p.y, 1000);
    swingEast(ctx); // the very first tick: no wait before it
    expect(z.hp).toBe(1000 - KATANA.damage);
    for (let t = 1; t < 120; t++) updateWeapons(ctx, DT); // 2 s held
    // Sweeps at 0, 0.45, 0.9, 1.35 and 1.8 s.
    expect(z.hp).toBe(1000 - 5 * KATANA.damage);
    expect(p.weapons[0]).toMatchObject({ magazine: 0, reserve: 0 });
    expect(p.reloadTimer).toBe(0);
    expect(p.meleeCooldown).toBe(0); // never the knife instead
  });

  it('hits twice as hard with double damage', () => {
    const ctx = withKatana();
    const p = player(ctx);
    p.boostActive = 'double_damage';
    const z = placeZombie(ctx, 0, p.x + 25, p.y, 100);
    swingEast(ctx);
    expect(z.hp).toBe(100 - 2 * KATANA.damage);
  });

  it('does not cut through a wall: the closed door protects the zombie behind it', () => {
    const ctx = withKatana();
    const p = player(ctx);
    const d1 = ctx.map.doors[0]!;
    p.x = d1.center.x;
    p.y = d1.y - 10;
    const z = placeZombie(ctx, 0, d1.center.x, d1.y + d1.height + 12, 100);
    Object.assign(command(ctx), { fire: true, aimManual: true, aimX: 0, aimY: 1 });
    updateWeapons(ctx, DT);
    expect(z.hp).toBe(100);
  });

  it('without a drag turns to the nearest zombie in reach, like the knife', () => {
    const ctx = withKatana();
    const p = player(ctx);
    p.facing = 0; // east
    const z = placeZombie(ctx, 0, p.x, p.y + 30, 100); // south
    command(ctx).fire = true;
    updateWeapons(ctx, DT);
    expect(p.aimY).toBeCloseTo(1);
    expect(z.hp).toBe(100 - KATANA.damage);
  });

  it('does not slow the player down while attacking, unlike a gun', () => {
    const run = (katana: boolean): number => {
      const ctx = katana ? withKatana() : createTestContext();
      const p = player(ctx);
      const x0 = p.x;
      Object.assign(command(ctx), { fire: true, moveX: 1 });
      updateMovement(ctx, DT);
      return p.x - x0;
    };
    expect(run(true)).toBeCloseTo(PLAYER.speed * DT);
    expect(run(false)).toBeCloseTo(PLAYER.speed * PLAYER.shootingSpeedFactor * DT);
  });

  it('keeps the knife as it was, on its own button', () => {
    const ctx = withKatana();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 15, p.y, 100);
    command(ctx).melee = true;
    updateWeapons(ctx, DT);
    expect(z.hp).toBe(100 - MELEE.damage);
    expect(p.meleeWide).toBe(false);
  });

  it('shows ∞ on the HUD instead of the ammo', () => {
    const ctx = withKatana();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const weapon = vi.fn();
    const loadout = vi.fn();
    ctx.events.on('weapon:state', weapon);
    ctx.events.on('weapons:loadout', loadout);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenLastCalledWith(expect.objectContaining({ weapon: 'katana', ammo: 'none' }));
    expect(loadout).toHaveBeenLastCalledWith(expect.objectContaining({ slots: [expect.objectContaining({ weapon: 'katana', ammo: 'none' })] }));
  });

  it('is never sold at a weapon case', () => {
    const raw = embeddedMansion();
    const objects = (raw.layers.find((l) => l.name === 'objects') as TiledObjectLayer).objects;
    const weapon = objects.find((o) => o.type === 'weapon_case')?.properties?.find((q) => q.name === 'weapon');
    if (weapon) weapon.value = 'katana';
    expect(() => parseMap(raw)).toThrow(/only sell basic weapons/);
  });
});
