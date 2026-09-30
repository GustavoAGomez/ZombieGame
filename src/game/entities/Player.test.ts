import { describe, expect, it } from 'vitest';
import { createTestContext, player } from '../../test/fixtures';
import { isMovingBackwards, pickAnimation } from './Player';

describe('player animation choice', () => {
  it('picks shoot standing, shoot_walk moving, walk running and idle', () => {
    const p = player(createTestContext());
    expect(pickAnimation(p)).toBe('idle');
    p.firing = true;
    expect(pickAnimation(p)).toBe('shoot');
    p.moving = true;
    expect(pickAnimation(p)).toBe('shoot_walk');
    expect(pickAnimation(p, false)).toBe('walk');
    p.firing = false;
    expect(pickAnimation(p)).toBe('walk');
    p.dashTimer = 0.1;
    expect(pickAnimation(p)).toBe('dash');
    p.hp = 0;
    expect(pickAnimation(p)).toBe('death');
  });

  it('detects moving backwards against the aim', () => {
    const p = player(createTestContext());
    p.facing = 0; // aiming east
    p.moveX = -1;
    p.moveY = 0;
    expect(isMovingBackwards(p)).toBe(true);
    p.moveX = 1;
    expect(isMovingBackwards(p)).toBe(false);
    p.moveX = -0.2;
    p.moveY = 0.98; // strafing slightly back
    expect(isMovingBackwards(p)).toBe(true);
  });
});
