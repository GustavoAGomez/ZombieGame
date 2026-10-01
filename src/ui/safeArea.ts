export interface SafePadding {
  /** Left and right (the HUD keeps them symmetric), top and bottom, in CSS px. */
  x: number;
  top: number;
  bottom: number;
}

/**
 * The HUD's safe-area margins (--pad-x, --pad-top, --pad-bottom in
 * global.css) resolved to CSS px, for things drawn on the canvas that must
 * keep clear of notches and rounded corners like the HUD does.
 */
export function measureSafePadding(): SafePadding {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:var(--pad-top) var(--pad-x) var(--pad-bottom)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const px = (v: string): number => Number.parseFloat(v) || 0;
  const padding = { x: px(style.paddingLeft), top: px(style.paddingTop), bottom: px(style.paddingBottom) };
  probe.remove();
  return padding;
}
