import type { UiPieceDef } from '../game/assets/manifest';
import './skin.css';

/** The pieces the skin needs; without any of them the HUD keeps its CSS-only look. */
const REQUIRED = ['ringLargeRed', 'ringMedium', 'ringMediumAmber', 'button', 'healthFrame', 'panel'] as const;
/** The health bar's segments (as in Hud.ts) and the gap between them (px). */
const SEGMENTS = 10;
const SEGMENT_GAP = 2;

/**
 * HUD skin from PixelLab (spec: HUD pieces, npm run hud:import): passes the
 * manifest's `ui` pieces to CSS as custom properties and turns on
 * `.has-ui-skin` (skin.css). Images are drawn at 1× (pixelated): sizes are
 * whole art pixels. DOM only, never Phaser (CLAUDE.md rule 4).
 */
export function applyUiSkin(ui: Readonly<Record<string, UiPieceDef>>, assetsBase: string, root: HTMLElement = document.documentElement): boolean {
  if (!REQUIRED.every((key) => ui[key])) return false;
  const style = root.style;
  // Absolute URLs: a relative url() inside a custom property may resolve against the stylesheet.
  const url = (key: string): string => `url("${new URL(assetsBase + (ui[key]?.file ?? ''), document.baseURI).href}")`;
  const px = (n: number): string => `${n}px`;
  const ringLarge = ui.ringLargeRed;
  const ringMedium = ui.ringMedium;
  const button = ui.button;
  const health = ui.healthFrame;
  const panel = ui.panel;
  if (!ringLarge || !ringMedium || !button || !health || !panel) return false;

  style.setProperty('--ui-ring-large', url('ringLargeRed'));
  style.setProperty('--ui-ring-large-size', px(ringLarge.width));
  style.setProperty('--ui-ring-medium', url('ringMedium'));
  style.setProperty('--ui-ring-medium-amber', url('ringMediumAmber'));
  style.setProperty('--ui-ring-medium-size', px(ringMedium.width));
  style.setProperty('--ui-button', url('button'));
  style.setProperty('--ui-button-slice', String(button.slice ?? 8));
  style.setProperty('--ui-button-border', px(button.slice ?? 8));
  style.setProperty('--ui-panel', url('panel'));
  style.setProperty('--ui-panel-slice', String(panel.slice ?? 16));
  style.setProperty('--ui-panel-border', px(panel.slice ?? 16));
  style.setProperty('--ui-health', url('healthFrame'));
  style.setProperty('--ui-health-w', px(health.width));
  style.setProperty('--ui-health-h', px(health.height));
  style.setProperty('--ui-health-pad', healthPadding(health));
  root.classList.add('has-ui-skin');
  return true;
}

/**
 * Padding that puts the segments inside the trough with whole-pixel widths:
 * a margin of at least 2 px at the rounded ends, grown until the segments
 * divide evenly, and 1 px above and below.
 */
export function healthPadding(health: UiPieceDef): string {
  const t = health.trough ?? { x: 0, y: 0, width: health.width, height: health.height };
  let margin = 2;
  while (margin < 8 && (t.width - 2 * margin - (SEGMENTS - 1) * SEGMENT_GAP) % SEGMENTS !== 0) margin++;
  const top = t.y + 1;
  const left = t.x + margin;
  const right = health.width - (t.x + t.width) + margin;
  const bottom = health.height - (t.y + t.height) + 1;
  return `${top}px ${right}px ${bottom}px ${left}px`;
}
