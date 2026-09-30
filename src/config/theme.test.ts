import { describe, expect, it } from 'vitest';
import { COLORS, cssVarName, hexToInt } from './theme';

describe('theme', () => {
  it('maps tokens to kebab-case CSS variables', () => {
    expect(cssVarName('ink')).toBe('--ink');
    expect(cssVarName('redDark')).toBe('--red-dark');
    expect(cssVarName('amberDark')).toBe('--amber-dark');
  });

  it('converts hex colors to numbers', () => {
    expect(hexToInt(COLORS.amber)).toBe(0xe8b04a);
  });
});
