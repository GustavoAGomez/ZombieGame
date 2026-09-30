/**
 * Pixel icons as inline SVG with crisp edges (HUD "Propuesta A"). Each icon
 * is a list of [x, y, w, h, color?] rects on a small grid.
 */
export type IconName = 'heart' | 'bullet' | 'crosshair' | 'swap' | 'bolt' | 'pause';

type Rect = readonly [number, number, number, number, string?];

interface IconDef {
  w: number;
  h: number;
  fill: string;
  rects: readonly Rect[];
}

const ICONS: Record<IconName, IconDef> = {
  heart: {
    w: 7, h: 6, fill: 'var(--red)',
    rects: [[1, 0, 2, 1], [4, 0, 2, 1], [0, 1, 7, 2], [1, 3, 5, 1], [2, 4, 3, 1], [3, 5, 1, 1]],
  },
  bullet: {
    w: 3, h: 7, fill: 'var(--amber)',
    rects: [[1, 0, 1, 1], [0, 1, 3, 3], [0, 4, 3, 3, 'var(--amber-dark)']],
  },
  crosshair: {
    w: 12, h: 12, fill: 'var(--bone)',
    rects: [[5, 0, 2, 4], [5, 8, 2, 4], [0, 5, 4, 2], [8, 5, 4, 2], [5, 5, 2, 2, 'var(--red)']],
  },
  swap: {
    w: 12, h: 12, fill: 'var(--bone)',
    rects: [[1, 3, 7, 2], [8, 2, 1, 4], [9, 3, 1, 2], [4, 8, 7, 2], [3, 7, 1, 4], [2, 8, 1, 2]],
  },
  bolt: {
    w: 12, h: 12, fill: 'var(--amber)',
    rects: [[6, 0, 3, 2], [5, 2, 3, 2], [4, 4, 3, 1], [3, 5, 6, 2], [5, 7, 3, 1], [4, 8, 3, 2], [3, 10, 3, 2]],
  },
  pause: {
    w: 8, h: 8, fill: 'var(--bone)',
    rects: [[1, 1, 2, 6], [5, 1, 2, 6]],
  },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Creates an icon whose longest side measures `size` CSS px. */
export function pixelIcon(name: IconName, size: number): SVGSVGElement {
  const def = ICONS[name];
  const scale = size / Math.max(def.w, def.h);
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${def.w} ${def.h}`);
  svg.setAttribute('width', String(Math.round(def.w * scale)));
  svg.setAttribute('height', String(Math.round(def.h * scale)));
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('pixel-icon', `pixel-icon--${name}`);
  for (const [x, y, w, h, color] of def.rects) {
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(w));
    rect.setAttribute('height', String(h));
    rect.setAttribute('fill', color ?? def.fill);
    svg.appendChild(rect);
  }
  return svg;
}
