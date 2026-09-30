/**
 * Visual tokens from HUD "Propuesta A". Single source of truth: the CSS
 * variables used by the DOM HUD are injected from here at startup.
 */
export const COLORS = {
  ink: '#0f0e0c',
  panel: '#1a1714',
  bone: '#efe6d2',
  muted: '#b8ad97',
  dim: '#8a8070',
  wall: '#5a4636',
  floor: '#3b332a',
  red: '#c93a2b',
  redDark: '#3a1511',
  redLow: '#e8503a',
  amber: '#e8b04a',
  amberDark: '#b07a2a',
  door: '#3f5866',
  wood: '#8a6a3f',
} as const;

export type ColorToken = keyof typeof COLORS;

export const FONTS = {
  /** Numbers and titles. Use sizes that are multiples of 2. */
  display: "'Press Start 2P', monospace",
  /** Labels. */
  label: "'Silkscreen', monospace",
} as const;

/** '#rrggbb' -> 0xrrggbb, for Phaser APIs that take numeric colors. */
export function hexToInt(hex: string): number {
  return Number.parseInt(hex.slice(1), 16);
}

/** 'redDark' -> '--red-dark' */
export function cssVarName(token: ColorToken): string {
  return `--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

/** Writes every color token as a CSS custom property on :root. */
export function applyThemeTokens(root: HTMLElement = document.documentElement): void {
  for (const token of Object.keys(COLORS) as ColorToken[]) {
    root.style.setProperty(cssVarName(token), COLORS[token]);
  }
  root.style.setProperty('--font-display', FONTS.display);
  root.style.setProperty('--font-label', FONTS.label);
}
