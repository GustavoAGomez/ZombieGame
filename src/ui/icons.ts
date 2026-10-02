/**
 * Pixel icons as inline SVG with crisp edges (HUD "Propuesta A"). Each icon
 * is a list of [x, y, w, h, color?] rects on a small grid.
 */
export type IconName =
  | 'heart'
  | 'bullet'
  | 'infinity'
  | 'crosshair'
  | 'bolt'
  | 'pause'
  | 'reload'
  | 'knife'
  | 'pistol'
  | 'rifle'
  | 'shotgun'
  | 'katana'
  | 'laser'
  | 'hammer'
  | 'door'
  | 'stairs'
  | 'wizard'
  | 'x2'
  | 'star'
  | 'living_heart'
  | 'worn_wand'
  | 'mark_ammo'
  | 'mark_rate'
  | 'mark_damage';

export type IconRect = readonly [number, number, number, number, string?];
type Rect = IconRect;

export interface IconDef {
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
  // The HUD symbols (bullet, crosshair, bolt, pause, reload) share a 12×12 grid and a 2-unit stroke.
  bullet: {
    w: 12, h: 12, fill: 'var(--amber)',
    rects: [[5, 0, 2, 1], [4, 1, 4, 2], [4, 3, 4, 5], [3, 8, 6, 1, 'var(--amber-dark)'], [4, 9, 4, 3, 'var(--amber-dark)']],
  },
  // Where the ammo would go for a weapon that spends none (the katana).
  infinity: {
    w: 9, h: 5, fill: 'var(--amber)',
    rects: [[1, 0, 2, 1], [6, 0, 2, 1], [0, 1, 1, 3], [3, 1, 1, 1], [5, 1, 1, 1], [8, 1, 1, 3], [4, 2, 1, 1], [3, 3, 1, 1], [5, 3, 1, 1], [1, 4, 2, 1], [6, 4, 2, 1]],
  },
  crosshair: {
    w: 12, h: 12, fill: 'var(--bone)',
    rects: [[5, 0, 2, 4], [5, 8, 2, 4], [0, 5, 4, 2], [8, 5, 4, 2], [5, 5, 2, 2, 'var(--red)']],
  },
  bolt: {
    w: 12, h: 12, fill: 'var(--amber)',
    rects: [[7, 0, 3, 2], [5, 2, 3, 2], [3, 4, 7, 2], [5, 6, 3, 2], [3, 8, 3, 2], [2, 10, 2, 2]],
  },
  pause: {
    w: 12, h: 12, fill: 'var(--bone)',
    rects: [[3, 2, 2, 8], [7, 2, 2, 8]],
  },
  // Provisional weapon and action icons (final art later): side views pointing right.
  pistol: {
    w: 12, h: 9, fill: 'var(--bone)',
    rects: [[1, 1, 10, 3], [9, 0, 1, 1], [1, 4, 4, 1, 'var(--amber-dark)'], [1, 5, 3, 4, 'var(--amber-dark)'], [5, 4, 3, 1], [7, 5, 1, 1]],
  },
  // Hunting shotgun: long double barrel and a wooden stock.
  shotgun: {
    w: 16, h: 7, fill: 'var(--bone)',
    rects: [
      [0, 2, 4, 3, 'var(--amber-dark)'], [4, 2, 3, 2, 'var(--amber-dark)'], [7, 1, 9, 1], [7, 2, 9, 1],
      [5, 4, 2, 2, 'var(--amber-dark)'], [8, 3, 3, 1, 'var(--amber-dark)'],
    ],
  },
  // Katana: long slightly curved blade, round guard and a wrapped handle.
  katana: {
    w: 16, h: 5, fill: 'var(--bone)',
    rects: [[0, 2, 4, 2, 'var(--amber-dark)'], [4, 1, 1, 3, 'var(--amber)'], [5, 2, 9, 1], [6, 1, 8, 1], [14, 1, 1, 1], [15, 0, 1, 1]],
  },
  // Laser: a chunky gun with a coil along the barrel and a red emitter.
  laser: {
    w: 14, h: 8, fill: 'var(--bone)',
    rects: [[1, 1, 9, 3], [10, 2, 2, 1], [12, 1, 2, 3, 'var(--red)'], [3, 0, 5, 1, 'var(--muted)'], [2, 4, 3, 4, 'var(--amber-dark)'], [6, 4, 2, 1], [3, 2, 1, 1, 'var(--red)'], [5, 2, 1, 1, 'var(--red)'], [7, 2, 1, 1, 'var(--red)']],
  },
  rifle: {
    w: 16, h: 8, fill: 'var(--bone)',
    rects: [
      [0, 2, 3, 3, 'var(--amber-dark)'], [3, 2, 8, 2], [11, 2, 5, 1], [6, 1, 3, 1],
      [4, 4, 2, 3, 'var(--amber-dark)'], [7, 4, 2, 4], [15, 1, 1, 1],
    ],
  },
  hammer: {
    w: 12, h: 12, fill: 'var(--bone)',
    rects: [[1, 1, 9, 3], [10, 2, 1, 1], [0, 2, 1, 2], [5, 4, 2, 8, 'var(--amber-dark)']],
  },
  door: {
    w: 10, h: 12, fill: 'var(--door)',
    rects: [[1, 0, 8, 12], [2, 1, 6, 10, 'var(--ink)'], [3, 2, 4, 9], [6, 6, 1, 1, 'var(--amber)']],
  },
  stairs: {
    w: 12, h: 12, fill: 'var(--bone)',
    rects: [[8, 0, 4, 3], [5, 3, 7, 3], [2, 6, 10, 3], [0, 9, 12, 3]],
  },
  // A knife on the diagonal: blade up to the right, guard, handle down to the left.
  knife: {
    w: 12, h: 12, fill: 'var(--bone)',
    rects: [
      [10, 0, 2, 2], [9, 1, 2, 2], [8, 2, 2, 2], [7, 3, 2, 2], [6, 4, 2, 2],
      [4, 5, 2, 1, 'var(--amber)'], [6, 7, 1, 2, 'var(--amber)'], [5, 6, 2, 1, 'var(--amber)'],
      [4, 7, 2, 2, 'var(--amber-dark)'], [3, 8, 2, 2, 'var(--amber-dark)'], [2, 9, 2, 2, 'var(--amber-dark)'], [1, 10, 2, 2, 'var(--amber-dark)'],
    ],
  },
  // Provisional merchant: a pointed wizard hat with a band (coloured per merchant).
  wizard: {
    w: 12, h: 12, fill: 'var(--bone)',
    rects: [[6, 0, 2, 2], [5, 2, 3, 2], [4, 4, 5, 2], [3, 6, 6, 2], [2, 8, 8, 1, 'var(--amber)'], [0, 9, 12, 2], [5, 4, 1, 1, 'var(--amber)']],
  },
  // A weapon's upgrade level, one per level next to its name.
  star: {
    w: 7, h: 7, fill: 'var(--amber)',
    rects: [[3, 0, 1, 2], [0, 2, 7, 1], [1, 3, 5, 1], [2, 4, 3, 1], [1, 5, 2, 1], [4, 5, 2, 1], [0, 6, 2, 1], [5, 6, 2, 1]],
  },
  // The weapon's upgrade marks on the HUD (7×7, one per kind: ammo, fire rate, damage), drawn at 1×.
  mark_ammo: {
    w: 7, h: 7, fill: 'var(--amber)',
    rects: [[3, 0, 1, 1], [2, 1, 3, 4], [2, 5, 3, 2, 'var(--amber-dark)']],
  },
  mark_rate: {
    w: 7, h: 7, fill: 'var(--amber)',
    rects: [[4, 0, 2, 1], [3, 1, 2, 1], [2, 2, 4, 1], [3, 3, 2, 1], [2, 4, 2, 1], [1, 5, 2, 1], [1, 6, 1, 1]],
  },
  mark_damage: {
    w: 7, h: 7, fill: 'var(--bone)',
    rects: [[3, 0, 1, 2], [3, 5, 1, 2], [0, 3, 2, 1], [5, 3, 2, 1], [3, 3, 1, 1, 'var(--red)']],
  },
  // Provisional double damage: "x2".
  x2: {
    w: 11, h: 7, fill: 'var(--boost-damage)',
    rects: [
      [0, 1, 1, 1], [4, 1, 1, 1], [1, 2, 1, 1], [3, 2, 1, 1], [2, 3, 1, 1], [1, 4, 1, 1], [3, 4, 1, 1], [0, 5, 1, 1], [4, 5, 1, 1],
      [7, 0, 3, 1], [6, 1, 1, 1], [10, 1, 1, 2], [9, 3, 1, 1], [8, 4, 1, 1], [7, 5, 1, 1], [6, 6, 5, 1],
    ],
  },
  // Special items (spec 05): placeholders on a 12×12 grid in their catalogue colours (items.ts), plain
  // colours so the floor sprite can be drawn from the same data on a canvas (assets/placeholders.ts).
  living_heart: {
    w: 12, h: 10, fill: '#c93a2b',
    rects: [
      [2, 0, 3, 1], [7, 0, 3, 1], [1, 1, 10, 1], [0, 2, 12, 3], [1, 5, 10, 1], [2, 6, 8, 1], [3, 7, 6, 1], [4, 8, 4, 1], [5, 9, 2, 1],
      [2, 2, 2, 1, '#e8503a'], [2, 3, 1, 1, '#e8503a'], [7, 6, 2, 1, '#7a1f17'], [6, 7, 2, 1, '#7a1f17'],
    ],
  },
  // Provisional wand: a plain stick leaning to the right (the final design comes later).
  worn_wand: {
    w: 12, h: 12, fill: '#8a6a3f',
    rects: [[9, 1, 2, 1], [8, 2, 2, 1], [7, 3, 2, 1], [6, 4, 2, 1], [5, 5, 2, 1], [4, 6, 2, 1], [3, 7, 2, 1], [2, 8, 2, 1], [1, 9, 2, 1], [0, 10, 2, 1]],
  },
  // A ring open at the top right, with the arrow head pointing down into it.
  reload: {
    w: 12, h: 12, fill: 'var(--bone)',
    rects: [
      [3, 0, 6, 2], [1, 1, 2, 2], [0, 3, 2, 6], [1, 9, 2, 2], [3, 10, 6, 2], [9, 9, 2, 2], [10, 6, 2, 3],
      [7, 2, 5, 1, 'var(--amber)'], [8, 3, 3, 1, 'var(--amber)'], [9, 4, 1, 1, 'var(--amber)'],
    ],
  },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Creates an icon whose longest side measures `size` CSS px; `fill` replaces its main colour. */
/** Icon `name`'s grid and rects, to draw it elsewhere than an SVG (the special items' floor sprite). */
export function iconDef(name: IconName): Readonly<IconDef> {
  return ICONS[name];
}

/** The size (px of its longest side) that draws icon `name` at `scale`× its grid: whole pixels. */
export function iconSize(name: IconName, scale: number): number {
  const def = ICONS[name];
  return Math.max(def.w, def.h) * scale;
}

export function pixelIcon(name: IconName, size: number, fill?: string): SVGSVGElement {
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
    rect.setAttribute('fill', color ?? fill ?? def.fill);
    svg.appendChild(rect);
  }
  return svg;
}
