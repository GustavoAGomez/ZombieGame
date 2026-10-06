import { describe, expect, it } from 'vitest';
import { DASH, MELEE, PICKUPS, PLAYER } from '../../config/balance';
import { CURSE_EFFECTS, UPGRADE_EFFECTS, type UpgradeId } from '../../config/upgrades';
import type { GameEvents } from '../../core/EventBus';
import type { ZombieState } from '../../core/GameState';
import { dungeonContext } from '../../test/dungeonFixtures';
import { isBurning } from '../systems/BurnSystem';
import { damageZombie, isZombieAlive } from '../systems/Combat';
import { placeDungeonZombie } from '../systems/DungeonSystem';
import { damagePlayer } from '../systems/HealthSystem';
import { applyPickup, spawnPickup } from '../systems/PickupSystem';
import { awardPoints } from '../systems/PointsSystem';
import type { SimContext } from '../systems/SimContext';
import { stepSimulation } from '../systems/Simulation';
import { maxReserve, reloadTime } from '../systems/weaponStats';
import { critDamage, rollIgnite } from './perks';
import { playerStats } from './stats';

const DT = 1 / 60;

function steps(ctx: SimContext, seconds: number): void {
  for (let i = 0; i < Math.round(seconds / DT); i++) stepSimulation(ctx, DT);
}

/** A match settled in the start room, the player still in its middle, with `upgrades` already taken. */
function arena(upgrades: UpgradeId[] = []): { ctx: SimContext; x: number; y: number } {
  const ctx = dungeonContext(3, 1);
  ctx.state.run!.upgrades.push(...upgrades);
  steps(ctx, 0.1);
  const p = ctx.state.players[0]!;
  const zone = ctx.map.zones[ctx.state.run!.plan.start]!;
  p.x = p.prevX = zone.x + zone.width / 2;
  p.y = p.prevY = zone.y + zone.height / 2;
  return { ctx, x: p.x, y: p.y };
}

function place(ctx: SimContext, kind: ZombieState['kind'], x: number, y: number): ZombieState {
  const z = ctx.state.zombies.find((z) => !z.active)!;
  placeDungeonZombie(ctx, z, kind, x, y, 1, false);
  z.ai = 'idle';
  return z;
}

/** How far the player gets in a second walking right. */
function walked(ctx: SimContext): number {
  const p = ctx.state.players[0]!;
  const from = p.x;
  ctx.commands[0]!.moveX = 1;
  steps(ctx, 1);
  ctx.commands[0]!.moveX = 0;
  return p.x - from;
}

describe('the upgrades in play (spec 09 §7.2)', () => {
  it('Pies ligeros walks faster; Adrenalina with the life low; Acosado hurries the enemies', () => {
    const plain = walked(arena().ctx);
    expect(walked(arena(['light_feet']).ctx)).toBeCloseTo(plain * UPGRADE_EFFECTS.light_feet.speed, 0);
    const { ctx } = arena(['adrenaline']);
    ctx.state.players[0]!.hp = PLAYER.lowHpThreshold - 1;
    expect(walked(ctx)).toBeCloseTo(plain * UPGRADE_EFFECTS.adrenaline.speed, 0);
    const hunted = arena();
    const z = place(hunted.ctx, 'walker', hunted.x + 300, hunted.y);
    z.ai = 'chasing';
    const from = z.x;
    steps(hunted.ctx, 1);
    const normal = from - z.x;
    const cursed = arena();
    cursed.ctx.state.run!.curses.push('hunted');
    const c = place(cursed.ctx, 'walker', cursed.x + 300, cursed.y);
    c.ai = 'chasing';
    steps(cursed.ctx, 1);
    // The path bends a little: the gain shows, within a step or two of the straight line.
    const hurried = cursed.x + 300 - c.x;
    expect(hurried / normal).toBeGreaterThan((CURSE_EFFECTS.hunted.enemySpeed + 1) / 2);
    expect(hurried / normal).toBeLessThan(CURSE_EFFECTS.hunted.enemySpeed + 0.05);
  });

  it('Manos rápidas shortens the reload; Bolsillos hondos widens the reserve', () => {
    const { ctx } = arena(['quick_hands']);
    const p = ctx.state.players[0]!;
    const slot = p.weapons[p.activeSlot]!;
    slot.magazine = 0;
    stepSimulation(ctx, DT);
    expect(p.reloadTimer).toBeCloseTo(reloadTime(slot) * UPGRADE_EFFECTS.quick_hands.reload, 3);
    const deep = arena(['deep_pockets']);
    const run = deep.ctx.state.run!;
    const weapon = deep.ctx.state.players[0]!.weapons[0]!;
    weapon.reserve = maxReserve(weapon);
    expect(applyPickup(deep.ctx.state.players[0]!, 'ammo', 40, run)).toBe(true);
    expect(weapon.reserve).toBeGreaterThan(maxReserve(weapon));
    expect(weapon.reserve).toBeLessThanOrEqual(maxReserve(weapon, UPGRADE_EFFECTS.deep_pockets.reserve));
  });

  it('Codicia pays more money, not more score; Imán reaches farther and nothing fades', () => {
    const { ctx } = arena(['greed']);
    const p = ctx.state.players[0]!;
    const money = p.money;
    const score = p.score;
    awardPoints(ctx, p.id, 100, 'kill');
    expect(p.money).toBe(money + Math.round(100 * UPGRADE_EFFECTS.greed.money));
    expect(p.score).toBe(score + 100);
    const magnet = arena(['magnet']);
    const q = magnet.ctx.state.players[0]!;
    const reach = PLAYER.hitboxRadius + PICKUPS.radius;
    const far = spawnPickup(magnet.ctx, 'ammo', q.x + reach * 2, q.y)!;
    far.age = PICKUPS.lifetime - 0.5;
    q.weapons[0]!.reserve = 0;
    steps(magnet.ctx, 1);
    expect(far.active).toBe(false);
    expect(q.weapons[0]!.reserve).toBeGreaterThan(0);
    const spare = spawnPickup(magnet.ctx, 'health', q.x + 300, q.y)!;
    steps(magnet.ctx, PICKUPS.lifetime + 1);
    expect(spare.active).toBe(true);
  });

  it('Perforantes, Rebote and Abanico shape the shot: more pierces, bounces off the wall, two more projectiles at half damage', () => {
    const { ctx, x, y } = arena(['piercing', 'ricochet', 'fan_fire']);
    const cmd = ctx.commands[0]!;
    cmd.aimManual = true;
    cmd.aimX = 1;
    cmd.aimY = 0;
    cmd.fire = true;
    let waited = 0;
    while (!ctx.state.bullets.some((b) => b.active) && waited++ < 60) stepSimulation(ctx, DT);
    cmd.fire = false;
    const bullets = ctx.state.bullets.filter((b) => b.active);
    expect(bullets).toHaveLength(1 + UPGRADE_EFFECTS.fan_fire.extra);
    const [centre, ...sides] = bullets;
    expect(centre!.pierce).toBe(1 + UPGRADE_EFFECTS.piercing.extra);
    expect(centre!.pierceMax).toBe(centre!.pierce);
    expect(centre!.bounces).toBe(1);
    for (const s of sides) expect(s.damage).toBeCloseTo(centre!.damage * UPGRADE_EFFECTS.fan_fire.damage);
    expect(sides.map((s) => Math.sign(s.dirY)).sort()).toEqual([-1, 1]);
    // Off the room's east wall: back it comes, with its pierces again.
    const b = centre!;
    b.pierce = 1;
    const zone = ctx.map.zones[ctx.state.run!.plan.start]!;
    const wall = zone.x + zone.width;
    let guard = 0;
    while (b.active && b.dirX > 0 && guard++ < 300) stepSimulation(ctx, DT);
    expect(b.active).toBe(true);
    expect(b.dirX).toBeLessThan(0);
    // The wall is judged from the drawn bullet (the muzzle's offset): it turns within the wall's tile.
    expect(b.x).toBeLessThan(wall + ctx.map.tileSize);
    expect(b.x).toBeGreaterThan(x);
    expect(b.bounces).toBe(0);
    expect(b.pierce).toBe(b.pierceMax);
    expect(y).toBeGreaterThan(0);
  });

  it('Verdugo and Incendiarias roll their chances on a blow, and never with neutral stats', () => {
    const { ctx } = arena(['executioner', 'incendiary']);
    const perks = playerStats(ctx.state.run);
    let crits = 0;
    let fires = 0;
    for (let i = 0; i < 2000; i++) {
      if (critDamage(ctx.state, perks, 1) > 1) crits++;
      if (rollIgnite(ctx.state, perks)) fires++;
    }
    expect(crits / 2000).toBeGreaterThan(0.1);
    expect(crits / 2000).toBeLessThan(0.2);
    expect(fires / 2000).toBeGreaterThan(0.15);
    expect(fires / 2000).toBeLessThan(0.25);
    expect(critDamage(ctx.state, perks, 10)).toBeGreaterThanOrEqual(10);
    const neutral = playerStats(null);
    const seed = ctx.state.rng;
    expect(critDamage(ctx.state, neutral, 7)).toBe(7);
    expect(rollIgnite(ctx.state, neutral)).toBe(false);
    expect(ctx.state.rng).toBe(seed);
  });

  it('Volátiles bursts the dead on the others, wider and burning when it burned; Sanguijuela heals every so many kills', () => {
    const { ctx, x, y } = arena(['volatile', 'leech']);
    const p = ctx.state.players[0]!;
    const heals: GameEvents['dungeon:leech'][] = [];
    ctx.events.on('dungeon:leech', (e) => heals.push(e));
    const a = place(ctx, 'walker', x + 60, y);
    const near = place(ctx, 'walker', x + 90, y);
    const far = place(ctx, 'walker', x + 300, y);
    damageZombie(ctx, a, 1e9, p.id);
    expect(ctx.state.run!.bursts).toHaveLength(1);
    stepSimulation(ctx, DT);
    expect(near.hp).toBe(near.maxHp - UPGRADE_EFFECTS.volatile.damage);
    expect(far.hp).toBe(far.maxHp);
    expect(ctx.state.run!.explosions.length).toBeGreaterThan(0);
    // Burning: the radius grows and the burst lights the others.
    const b = place(ctx, 'walker', x - 60, y);
    const edge = place(ctx, 'walker', x - 60 - UPGRADE_EFFECTS.volatile.radius * 1.3, y);
    b.burn.timer = 1;
    damageZombie(ctx, b, 1e9, p.id);
    stepSimulation(ctx, DT);
    expect(edge.hp).toBe(edge.maxHp - UPGRADE_EFFECTS.volatile.damage);
    expect(isBurning(edge)).toBe(true);
    // Ten kills by the player: five of life.
    p.hp = 50;
    const run = ctx.state.run!;
    const before = run.leechKills;
    for (let i = before; i < UPGRADE_EFFECTS.leech.kills; i++) damageZombie(ctx, place(ctx, 'walker', x + 400, y + 100), 1e9, p.id);
    expect(p.hp).toBe(50 + UPGRADE_EFFECTS.leech.heal);
    expect(heals).toEqual([{ heal: UPGRADE_EFFECTS.leech.heal }]);
    expect(run.leechKills).toBe(0);
  });

  it('Segundo aire allows a second dash before the cooldown; Paso de sombra hurts and leaves fire', () => {
    const { ctx, x, y } = arena(['second_wind', 'shadow_dash']);
    const p = ctx.state.players[0]!;
    const cmd = ctx.commands[0]!;
    const z = place(ctx, 'walker', x + 40, y);
    const hp = z.hp;
    cmd.moveX = 1;
    cmd.special = true;
    stepSimulation(ctx, DT);
    expect(p.dashTimer).toBeGreaterThan(0);
    expect(p.dashUsed).toBe(1);
    cmd.special = false;
    steps(ctx, DASH.duration + DT);
    expect(p.dashTimer).toBe(0);
    expect(p.dashCooldown).toBeGreaterThan(0);
    // Through the walker: once, for its damage.
    expect(z.hp).toBe(hp - UPGRADE_EFFECTS.shadow_dash.damage);
    expect(ctx.state.run!.trails.length).toBeGreaterThan(5);
    // A second one while the cooldown still runs; not a third.
    cmd.special = true;
    stepSimulation(ctx, DT);
    expect(p.dashTimer).toBeGreaterThan(0);
    expect(p.dashUsed).toBe(2);
    cmd.special = false;
    steps(ctx, DASH.duration + DT);
    cmd.special = true;
    stepSimulation(ctx, DT);
    expect(p.dashTimer).toBe(0);
    cmd.special = false;
    cmd.moveX = 0;
    // A zombie on the fire catches it; the fire dies down.
    const trail = ctx.state.run!.trails[0]!;
    const w = place(ctx, 'walker', trail.x, trail.y);
    stepSimulation(ctx, DT);
    expect(isBurning(w)).toBe(true);
    steps(ctx, UPGRADE_EFFECTS.shadow_dash.trail + DT);
    expect(ctx.state.run!.trails).toHaveLength(0);
    // The cooldown over, the dashes come back.
    steps(ctx, DASH.cooldown);
    expect(p.dashUsed).toBe(0);
  });

  it('Amuleto takes the first blow of each room; Filo reaches farther and cuts deeper', () => {
    const { ctx, x, y } = arena(['ward', 'sharp_knife']);
    const p = ctx.state.players[0]!;
    const wards: GameEvents['dungeon:ward'][] = [];
    ctx.events.on('dungeon:ward', (e) => wards.push(e));
    expect(ctx.state.run!.wardReady).toBe(true);
    expect(damagePlayer(ctx, p, 20, x + 10, y)).toBe(false);
    expect(p.hp).toBe(PLAYER.maxHp);
    expect(wards).toHaveLength(1);
    expect(damagePlayer(ctx, p, 20, x + 10, y)).toBe(true);
    expect(p.hp).toBe(PLAYER.maxHp - 20);
    // The knife: a walker just beyond the plain reach is cut, for double.
    const z = place(ctx, 'walker', x + MELEE.range * 1.2, y);
    const hp = z.hp;
    p.facing = 0;
    const cmd = ctx.commands[0]!;
    cmd.melee = true;
    stepSimulation(ctx, DT);
    cmd.melee = false;
    expect(p.meleeRange).toBeCloseTo(MELEE.range * UPGRADE_EFFECTS.sharp_knife.reach);
    expect(hp - z.hp === MELEE.damage * UPGRADE_EFFECTS.sharp_knife.damage || !isZombieAlive(z)).toBe(true);
  });
});
