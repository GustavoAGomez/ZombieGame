import { describe, expect, it } from 'vitest';
import { nextCoat } from './merchantCoat';

describe('nextCoat', () => {
  it('opens with the shop, holds it open and closes it when the shop closes', () => {
    expect(nextCoat('closed', false, true)).toBe('closed');
    expect(nextCoat('closed', true, true)).toBe('opening');
    expect(nextCoat('opening', true, false)).toBe('opening');
    expect(nextCoat('opening', true, true)).toBe('open');
    expect(nextCoat('open', true, true)).toBe('open');
    expect(nextCoat('open', false, true)).toBe('closing');
    expect(nextCoat('closing', false, false)).toBe('closing');
    expect(nextCoat('closing', false, true)).toBe('closed');
  });

  it('turns back halfway if the shop is closed while opening, or reopened while closing', () => {
    expect(nextCoat('opening', false, false)).toBe('closing');
    expect(nextCoat('closing', true, false)).toBe('opening');
  });
});
