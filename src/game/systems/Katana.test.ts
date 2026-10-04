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

/** The player faces east and presses the button: the katana cuts where the player faces. */
function swingEast(ctx: SimContext): void {
  player(ctx).facing = 0;
  command(ctx).fire = true;
  updateWeapons(ctx, DT);
}

describe('katana', () => {
  it('cuts every zombie inside its 140° arc and its 102 px reach, and none outside', () => {
    const ctx = withKatana();
    const p = player(ctx);
    const ahead = placeZombie(ctx, 0, p.x + 25, p.y, 100);
    const diagonal = placeZombie(ctx, 1, p.x + 20, p.y + 20, 100); // 45°: inside ±70°
    const side = placeZombie(ctx, 2, p.x, p.y - 30, 100); // 90°: outside
    const behind = placeZombie(ctx, 3, p.x - 25, p.y, 100);
    const far = placeZombie(ctx, 4, p.x + 120, p.y, 100); // 114 px to its hitbox: beyond 102
    const reach = placeZombie(ctx, 5, p.x + 100, p.y, 100); // 94 px: inside
    swingEast(ctx);
    expect([ahead.hp, diagonal.hp, reach.hp]).toEqual([100 - KATANA.damage, 100 - KATANA.damage, 100 - KATANA.damage]);
    expect([side.hp, behind.hp, far.hp]).toEqual([100, 100, 100]);
    expect(p.meleeRange).toBe(KATANA.range);
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

  it('needs no ammo, sweeps at once on the press and then every second while held', () => {
    const ctx = withKatana();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 25, p.y, 1000);
    swingEast(ctx); // the very first tick: no wait before it
    expect(z.hp).toBe(1000 - KATANA.damage);
    for (let t = 1; t < 60 * 3.5; t++) updateWeapons(ctx, DT); // 3.5 s held
    // Sweeps at 0, 1, 2 and 3 s.
    expect(z.hp).toBe(1000 - 4 * KATANA.damage);
    expect(p.weapons[0]).toMatchObject({ magazine: 0, reserve: 0 });
    expect(p.reloadTimer).toBe(0);
    expect(p.meleeCooldown).toBe(0); // never the knife instead
  });

  it('keeps its cooldown in the holster: a swap neither skips it nor blocks the guns', () => {
    const ctx = withKatana();
    const p = player(ctx);
    p.weapons.push(createWeaponSlot('pistol'));
    const z = placeZombie(ctx, 0, p.x + 25, p.y, 1000);
    swingEast(ctx);
    expect(p.weapons[0]!.cooldown).toBeCloseTo(1, 1);
    // To the pistol: it fires as soon as it is in hand, the katana's cooldown does not hold it.
    command(ctx).fire = false;
    command(ctx).selectWeapon = 1;
    updateWeapons(ctx, DT);
    command(ctx).selectWeapon = -1;
    for (let t = 0; t < 25; t++) updateWeapons(ctx, DT);
    p.firing = true;
    p.aimTime = 1;
    command(ctx).fire = true;
    updateWeapons(ctx, DT);
    expect(p.weapons[1]!.magazine).toBe(WEAPONS.pistol.magazine - 1);
    // Back to the katana, under a second after its sweep: still cooling down, no sweep.
    command(ctx).fire = false;
    command(ctx).selectWeapon = 0;
    updateWeapons(ctx, DT);
    command(ctx).selectWeapon = -1;
    for (let t = 0; t < 30; t++) updateWeapons(ctx, DT);
    const hp = z.hp;
    swingEast(ctx);
    expect(z.hp).toBe(hp);
    expect(p.weapons[0]!.cooldown).toBeGreaterThan(0);
  });

  it('shows its cooldown on the HUD, filling back up in place of the ∞', () => {
    const ctx = withKatana();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const weapon = vi.fn();
    ctx.events.on('weapon:state', weapon);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenLastCalledWith(expect.objectContaining({ cooldown: 0 }));
    swingEast(ctx);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenLastCalledWith(expect.objectContaining({ cooldown: 1 }));
    for (let t = 0; t < 30; t++) updateWeapons(ctx, DT); // half of the second
    presenter.publish(ctx.state);
    const last = weapon.mock.lastCall?.[0] as { cooldown: number } | undefined;
    expect(last?.cooldown).toBeGreaterThan(0.45);
    expect(last?.cooldown).toBeLessThan(0.55);
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
    p.facing = Math.PI / 2; // south, at the door
    command(ctx).fire = true;
    updateWeapons(ctx, DT);
    expect(z.hp).toBe(100);
  });

  it('only cuts where the player faces: a drag does not aim it, and a zombie beside it does not turn it (petición del usuario)', () => {
    const ctx = withKatana();
    const p = player(ctx);
    p.facing = 0; // east
    const south = placeZombie(ctx, 0, p.x, p.y + 30, 100);
    const ahead = placeZombie(ctx, 1, p.x + 30, p.y, 100);
    // Dragged south: the drag is ignored.
    Object.assign(command(ctx), { fire: true, aimManual: true, aimX: 0, aimY: 1 });
    updateWeapons(ctx, DT);
    expect(p.aimX).toBeCloseTo(1);
    expect(p.aimManual).toBe(false);
    expect(p.facing).toBeCloseTo(0);
    expect(south.hp).toBe(100);
    expect(ahead.hp).toBe(100 - KATANA.damage);
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
    expect(p.meleeRange).toBe(MELEE.range);
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

  it('wears out: 60 sweeps, and the last one breaks it; broken, it stays in its slot and cuts nothing', () => {
    const ctx = withKatana();
    const p = player(ctx);
    p.weapons.push(createWeaponSlot('pistol'));
    expect(p.weapons[0]!.uses).toBe(60);
    const broken = vi.fn();
    ctx.events.on('weapon:broken', broken);
    const z = placeZombie(ctx, 0, p.x + 25, p.y, 1000);
    swingEast(ctx);
    expect(p.weapons[0]!.uses).toBe(59);
    p.weapons[0]!.uses = 1;
    p.weapons[0]!.cooldown = 0;
    swingEast(ctx);
    expect(p.weapons[0]!.uses).toBe(0);
    expect(broken).toHaveBeenCalledWith({ playerId: p.id, weapon: 'katana', lost: false });
    const hp = z.hp;
    for (let t = 0; t < 120; t++) updateWeapons(ctx, DT); // held 2 s: nothing more
    expect(z.hp).toBe(hp);
    expect(p.weapons.map((w) => w.id)).toEqual(['katana', 'pistol']);
    expect(broken).toHaveBeenCalledTimes(1);
  });

  it('broken and with no ammo anywhere else, the knife slashes instead', () => {
    const ctx = withKatana();
    const p = player(ctx);
    p.weapons[0]!.uses = 0;
    swingEast(ctx);
    expect(p.meleeCooldown).toBeGreaterThan(0);
    expect(p.meleeRange).toBe(MELEE.range);
  });

  it('shows its uses left on the HUD and in its slot, 0 once broken', () => {
    const ctx = withKatana();
    const presenter = new HudPresenter(ctx.events, ctx.map);
    const weapon = vi.fn();
    const loadout = vi.fn();
    ctx.events.on('weapon:state', weapon);
    ctx.events.on('weapons:loadout', loadout);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenLastCalledWith(expect.objectContaining({ uses: 60, overheatsLeft: null }));
    swingEast(ctx);
    presenter.publish(ctx.state);
    expect(weapon).toHaveBeenLastCalledWith(expect.objectContaining({ uses: 59 }));
    expect(loadout).toHaveBeenLastCalledWith({ slots: [expect.objectContaining({ weapon: 'katana', uses: 59 })], active: 0 });
  });
});
