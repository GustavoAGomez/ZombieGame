import { describe, expect, it } from 'vitest';
import { HAND } from '../../config/balance';
import { EMERGE_DELAY, HOLE_TIME, handRise, holeLook } from './HandView';

/** `n + 1` evenly spaced instants of a phase lasting `length` s. */
const instants = (length: number, n = 60): number[] => Array.from({ length: n + 1 }, (_, i) => (i * length) / n);

describe('holeLook', () => {
  it('is sealed by its crust while waiting and while the hand is away', () => {
    expect(holeLook('idle', 0)).toEqual({ anim: 'crust', progress: 0 });
    expect(holeLook('away', 1)).toEqual({ anim: 'crust', progress: 0 });
  });

  it('breaks open as the hand starts rising and stays open onto the fire', () => {
    expect(holeLook('rising', 0)).toEqual({ anim: 'opening', progress: 0 });
    expect(holeLook('rising', HOLE_TIME / 2)).toEqual({ anim: 'opening', progress: 0.5 });
    expect(holeLook('rising', HOLE_TIME)).toEqual({ anim: 'fire', progress: 1 });
    for (const phase of ['rolling', 'offering', 'empty', 'mocking'] as const) expect(holeLook(phase, 0.5).anim).toBe('fire');
  });

  it('closes back in the last moments of sinking', () => {
    expect(holeLook('sinking', 0).anim).toBe('fire');
    expect(holeLook('sinking', HAND.sinkingTime - HOLE_TIME / 2)).toEqual({ anim: 'opening', progress: 0.5 });
    expect(holeLook('sinking', HAND.sinkingTime)).toEqual({ anim: 'opening', progress: 0 });
  });
});

describe('handRise', () => {
  it('comes out of the floor only once the hole is half open, all the way by the end of rising', () => {
    let last = 0;
    for (const t of instants(HAND.risingTime)) {
      const rise = handRise('rising', t);
      expect(rise).toBeGreaterThanOrEqual(last);
      if (t <= EMERGE_DELAY) expect(rise).toBe(0);
      if (rise > 0) expect(holeLook('rising', t).progress).toBeGreaterThanOrEqual(0.5);
      last = rise;
    }
    expect(handRise('rising', HAND.risingTime)).toBe(1);
  });

  it('sinks all the way before the hole starts closing', () => {
    let last = 1;
    for (const t of instants(HAND.sinkingTime)) {
      const rise = handRise('sinking', t);
      expect(rise).toBeLessThanOrEqual(last);
      if (holeLook('sinking', t).anim !== 'fire') expect(rise).toBe(0);
      last = rise;
    }
    expect(handRise('sinking', 0)).toBe(1);
  });

  it('is out while it rolls, offers, stays empty or mocks, and hidden while waiting or away', () => {
    for (const phase of ['rolling', 'offering', 'empty', 'mocking'] as const) expect(handRise(phase, 0.3)).toBe(1);
    expect(handRise('idle', 0)).toBe(0);
    expect(handRise('away', 0.5)).toBe(0);
  });
});
