import { describe, expect, it } from 'vitest';
import { BULLETS, WEAPONS, ZOMBIES } from '../../config/balance';
import { command, createTestContext, placeZombie, player, runTicks } from '../../test/fixtures';
import { updateBullets } from './BulletSystem';
import { bodyEntry, hurtboxOf } from './shotGeometry';
import { stepSimulation } from './Simulation';

function fireOnce(ctx: ReturnType<typeof createTestContext>, aimX: number, aimY: number): void {
  const cmd = command(ctx);
  cmd.fire = true;
  cmd.aimManual = true;
  cmd.aimX = aimX;
  cmd.aimY = aimY;
  stepSimulation(ctx, 1 / 60);
  cmd.fire = false;
}

describe('BulletSystem', () => {
  it('damages the first zombie it hits and disappears', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const near = placeZombie(ctx, 0, p.x + 60, p.y, 100);
    const far = placeZombie(ctx, 1, p.x + 120, p.y, 100);
    fireOnce(ctx, 1, 0);
    runTicks(ctx, 30, stepSimulation);
    expect(near.hp).toBe(100 - WEAPONS.pistol.damage);
    expect(far.hp).toBe(100);
    expect(ctx.state.bullets.some((b) => b.active)).toBe(false);
  });

  it('sprays blood where the bullet visibly touches the zombie, along the shot, to the zombie\'s feet', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 60, p.y, 2);
    const hits: { x: number; y: number; groundY: number; dirX: number; dirY: number; killed: boolean }[] = [];
    ctx.events.on('zombie:hit', (e) => hits.push(e));
    fireOnce(ctx, 1, 0);
    runTicks(ctx, 30, stepSimulation);
    fireOnce(ctx, 1, 0);
    runTicks(ctx, 30, stepSimulation);
    expect(hits.map((h) => h.killed)).toEqual([false, true]);
    const [first] = hits;
    // On the zombie's drawn body, at the bullet's height above its feet.
    expect(first?.x).toBeGreaterThanOrEqual(z.x - ZOMBIES.hurtbox.width / 2 - 1);
    expect(first?.x).toBeLessThanOrEqual(z.x + ZOMBIES.hurtbox.width / 2 + 1);
    expect(first?.y).toBeLessThan(z.y);
    expect(first?.y).toBeGreaterThan(z.y - ZOMBIES.hurtbox.height);
    expect(first?.groundY).toBe(z.y);
    // Along the shot (the pistol's spread is a few degrees).
    expect(first?.dirX).toBeGreaterThan(0.99);
  });

  it('does not skip a zombie thinner than one tick of travel', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const z = placeZombie(ctx, 0, p.x + 40, p.y + 5, 100);
    fireOnce(ctx, 1, 0);
    runTicks(ctx, 20, stepSimulation);
    expect(z.hp).toBe(100 - WEAPONS.pistol.damage);
  });

  it('stops at walls and closed doors', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const d1 = ctx.map.doors[0]!;
    p.x = d1.center.x;
    p.y = d1.y - 30;
    const behind = placeZombie(ctx, 0, d1.center.x, d1.y + 60, 100);
    fireOnce(ctx, 0, 1);
    runTicks(ctx, 60, stepSimulation);
    expect(behind.hp).toBe(100);
    expect(ctx.state.bullets.some((b) => b.active)).toBe(false);
  });

  it('flies through windows to hit zombies outside', () => {
    const ctx = createTestContext();
    const p = player(ctx);
    const w1 = ctx.map.windows[0]!;
    p.x = w1.center.x;
    p.y = w1.center.y + 60;
    const outside = placeZombie(ctx, 0, w1.exterior.x, w1.exterior.y, 100);
    fireOnce(ctx, 0, -1);
    runTicks(ctx, 30, stepSimulation);
    expect(outside.hp).toBe(100 - WEAPONS.pistol.damage);
  });

  it('expires after the weapon range', () => {
    const ctx = createTestContext();
    fireOnce(ctx, 1, 0);
    const bullet = ctx.state.bullets.find((b) => b.active)!;
    // Park it in open space and let it travel its remaining distance.
    bullet.x = 5 * 32;
    bullet.y = 6 * 32;
    bullet.dirX = 1;
    bullet.dirY = 0;
    bullet.remaining = 100;
    let ticks = 0;
    while (bullet.active && ticks < 100) {
      updateBullets(ctx, 1 / 60);
      ticks++;
    }
    expect(bullet.active).toBe(false);
    expect(bullet.x - 5 * 32).toBeCloseTo(100, 0);
  });
});

describe('bullets hit what they visibly touch (drawn path vs the zombie rectangle)', () => {
  const ZX = 352;
  const ZY = 256;
  const half = ZOMBIES.hurtbox.width / 2;
  const top = ZY - ZOMBIES.hurtbox.height;

  /**
   * Fires one bullet whose drawn path goes through (drawnX, drawnY), drawn at
   * (drawX, drawY) from its logical position (the real east offset of the
   * player art by default).
   */
  function shootThrough(drawnX: number, drawnY: number, dirX: number, dirY: number, drawX = 11, drawY = -23) {
    const ctx = createTestContext();
    const z = placeZombie(ctx, 0, ZX, ZY, 100);
    const len = Math.hypot(dirX, dirY);
    const dx = dirX / len;
    const dy = dirY / len;
    const b = ctx.state.bullets[0]!;
    const lx = drawnX - drawX - dx * 80;
    const ly = drawnY - drawY - dy * 80;
    Object.assign(b, { active: true, owner: 0, x: lx, y: ly, prevX: lx, prevY: ly, dirX: dx, dirY: dy, speed: 520, damage: 20, remaining: 200, drawX, drawY });
    runTicks(ctx, 30, updateBullets);
    return z.hp < 100;
  }

  it('hits a horizontal shot aimed slightly down that crosses the zombie (it used to go through)', () => {
    expect(shootThrough(ZX, ZY - 4, 1, 0.15)).toBe(true);
    expect(shootThrough(ZX, ZY - 2, 1, 0.25)).toBe(true);
    expect(shootThrough(ZX, ZY - 4, -1, 0.15, -12, -23)).toBe(true);
  });

  it('hits anywhere on the rectangle and nowhere outside it', () => {
    expect(shootThrough(ZX, ZY - 1, 1, 0)).toBe(true); // feet
    expect(shootThrough(ZX, top + 1, 1, 0)).toBe(true); // head
    expect(shootThrough(ZX, ZY + 4, 1, 0)).toBe(false); // below the feet
    expect(shootThrough(ZX, top - 4, 1, 0)).toBe(false); // above the head
  });

  it('hits diagonal shots that cross the side of the body and misses the ones that clear it', () => {
    expect(shootThrough(ZX + half - 2, ZY - 14, 1, -1, 10, -27)).toBe(true);
    expect(shootThrough(ZX - half + 2, ZY - 14, -1, -1, -11, -27)).toBe(true);
    expect(shootThrough(ZX + half + 20, ZY - 14, 1, -1, 10, -27)).toBe(false);
  });

  it('measures the entry along the drawn path', () => {
    expect(bodyEntry(ZX - 50, ZY - 10, 1, 0, 100, ZX, ZY)).toBeCloseTo(50 - half - BULLETS.radius);
    expect(bodyEntry(ZX, ZY - 10, 1, 0, 10, ZX, ZY)).toBe(0);
    expect(bodyEntry(ZX - 50, ZY - 10, 1, 0, 20, ZX, ZY)).toBe(Infinity);
  });
});

describe('legless hurtbox', () => {
  it('is lower once the zombie crawls, so a shot over its back flies on', () => {
    const ZX = 200;
    const ZY = 200;
    const standing = hurtboxOf({ hp: 5 });
    const legless = hurtboxOf({ hp: ZOMBIES.crawlAtHp });
    expect(standing).toBe(ZOMBIES.hurtbox);
    expect(legless).toBe(ZOMBIES.crawlHurtbox);
    expect(hurtboxOf({ hp: 0 })).toBe(ZOMBIES.hurtbox);
    // A shot across at chest height of a standing zombie, above a crawling one.
    const y = ZY - (ZOMBIES.crawlHurtbox.height + ZOMBIES.hurtbox.height) / 2;
    expect(bodyEntry(ZX - 50, y, 1, 0, 100, ZX, ZY, standing)).toBeLessThan(Infinity);
    expect(bodyEntry(ZX - 50, y, 1, 0, 100, ZX, ZY, legless)).toBe(Infinity);
    // Low shots still hit it on the ground.
    expect(bodyEntry(ZX - 50, ZY - 8, 1, 0, 100, ZX, ZY, legless)).toBeLessThan(Infinity);
  });
});
