import { describe, expect, it } from 'vitest';
import { fireStickAim, joystickVector, type AimOutput, type StickOutput } from './stickMath';

const T = { maxTravel: 44, deadZone: 0.12, minSpeed: 0.35, maxSpeed: 1 };
const out = (): StickOutput => ({ x: 0, y: 0, knobX: 0, knobY: 0 });

describe('joystickVector', () => {
  it('outputs nothing inside the 12 % dead zone', () => {
    const o = joystickVector(5, 0, T, out()); // 5 px < 5.28 px
    expect(o.x).toBe(0);
    expect(o.y).toBe(0);
    expect(o.knobX).toBe(5);
  });

  it('starts at 35 % speed just outside the dead zone', () => {
    const o = joystickVector(44 * 0.12 + 0.001, 0, T, out());
    expect(o.x).toBeCloseTo(0.35, 3);
  });

  it('reaches 100 % at full travel and clamps beyond it', () => {
    const full = joystickVector(0, -44, T, out());
    expect(full.y).toBeCloseTo(-1);
    const beyond = joystickVector(0, -200, T, out());
    expect(beyond.y).toBeCloseTo(-1);
    expect(beyond.knobY).toBeCloseTo(-44);
  });

  it('keeps the direction and ramps linearly', () => {
    // Midway through the ramp (magnitude 0.56) the speed is midway: 0.675.
    const d = 44 * 0.56;
    const o = joystickVector(d / Math.SQRT2, d / Math.SQRT2, T, out());
    expect(Math.atan2(o.y, o.x)).toBeCloseTo(Math.PI / 4);
    expect(Math.hypot(o.x, o.y)).toBeCloseTo(0.675);
  });

  it('handles the exact centre', () => {
    const o = joystickVector(0, 0, T, out());
    expect([o.x, o.y, o.knobX, o.knobY]).toEqual([0, 0, 0, 0]);
  });
});

describe('fireStickAim', () => {
  const aim = (): AimOutput => ({ manual: false, x: 0, y: 0, knobX: 0, knobY: 0 });

  it('uses auto-aim for drags of 12 px or less', () => {
    expect(fireStickAim(8, 8, 12, 34, aim()).manual).toBe(false);
  });

  it('uses the drag direction beyond 12 px', () => {
    const a = fireStickAim(0, 20, 12, 34, aim());
    expect(a.manual).toBe(true);
    expect([a.x, a.y]).toEqual([0, 1]);
  });

  it('clamps the knob to its travel', () => {
    const a = fireStickAim(100, 0, 12, 34, aim());
    expect(a.knobX).toBe(34);
  });
});
