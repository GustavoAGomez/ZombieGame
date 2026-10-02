import type { UiPieceDef, UiRect } from '../game/assets/manifest';
import './skin.css';

/** The pieces the skin needs; without any of them the HUD keeps its CSS-only look. */
const REQUIRED = ['ringLarge', 'ringSmall', 'panel', 'plate', 'healthFrame'] as const;
/** The health bar's segments (as in Hud.ts) and the gap between them (px). */
const SEGMENTS = 10;
const SEGMENT_GAP = 2;
/**
 * State tints, by code (no extra art): the fire button red, the special and
 * the weapon in hand amber, the stored boost in the blue merchant's colour.
 */
type Rgb = readonly [number, number, number];
const RED: Rgb = [201, 58, 43];
const AMBER: Rgb = [232, 176, 74];
const BLUE: Rgb = [58, 111, 216];
/** Share of the tint over the metal's own colour: its light, scratches and rivets stay readable. */
const TINT_STRENGTH = 0.7;

/**
 * HUD skin from PixelLab (npm run hud:import): passes the manifest's `ui`
 * pieces to CSS as custom properties and turns on `.has-ui-skin`
 * (skin.css). The rings are tinted here, on a canvas, and their faces
 * measured, so the reload veil and the icons fit inside. Everything is
 * drawn at whole-pixel scales (pixelated). DOM only, never Phaser
 * (CLAUDE.md rule 4).
 */
export async function applyUiSkin(ui: Readonly<Record<string, UiPieceDef>>, assetsBase: string, root: HTMLElement = document.documentElement): Promise<boolean> {
  if (!REQUIRED.every((key) => ui[key])) return false;
  const ringLarge = ui.ringLarge;
  const ringSmall = ui.ringSmall;
  const panel = ui.panel;
  const plate = ui.plate;
  const health = ui.healthFrame;
  if (!ringLarge || !ringSmall || !panel || !plate || !health) return false;
  // Absolute URLs: a relative url() inside a custom property may resolve against the stylesheet.
  const href = (piece: UiPieceDef): string => new URL(assetsBase + piece.file, document.baseURI).href;
  const url = (src: string): string => `url("${src}")`;
  const px = (n: number): string => `${n}px`;

  // Weapon slots and abilities on their own shapes; without them, on the small ring like the rest.
  const hexagon = ui.hexagon ?? ringSmall;
  const octagon = ui.octagon ?? ringSmall;
  const [large, small, hex, oct] = await Promise.all([ringLarge, ringSmall, hexagon, octagon].map((piece) => loadImage(href(piece))));
  const style = root.style;
  const tintedUrl = (img: HTMLImageElement | null | undefined, piece: UiPieceDef, tint: Rgb): string => url(img ? tinted(img, tint) ?? href(piece) : href(piece));
  style.setProperty('--ui-ring-large', tintedUrl(large, ringLarge, RED));
  style.setProperty('--ui-ring-large-size', px(ringLarge.width));
  style.setProperty('--ui-ring-small', url(href(ringSmall)));
  style.setProperty('--ui-ring-small-size', px(ringSmall.width));
  // Weapon slots: the hexagon, amber for the weapon in hand.
  style.setProperty('--ui-hexagon', url(href(hexagon)));
  style.setProperty('--ui-hexagon-amber', tintedUrl(hex, hexagon, AMBER));
  style.setProperty('--ui-hexagon-w', px(hexagon.width));
  style.setProperty('--ui-hexagon-h', px(hexagon.height));
  // Abilities: the octagon, amber for the special, blue for the stored boost.
  style.setProperty('--ui-octagon', url(href(octagon)));
  style.setProperty('--ui-octagon-amber', tintedUrl(oct, octagon, AMBER));
  style.setProperty('--ui-octagon-blue', tintedUrl(oct, octagon, BLUE));
  style.setProperty('--ui-octagon-w', px(octagon.width));
  style.setProperty('--ui-octagon-h', px(octagon.height));
  // The veil that empties while reloading covers only the small ring's face.
  const face = small ? faceRadius(small) : ringSmall.width / 2 - 4;
  style.setProperty('--ui-ring-small-face-inset', px(Math.ceil(ringSmall.width / 2 - face)));

  style.setProperty('--ui-panel', url(href(panel)));
  style.setProperty('--ui-panel-slice', sliceNumbers(panel));
  style.setProperty('--ui-panel-width', slicePx(panel));
  style.setProperty('--ui-plate', url(href(plate)));
  style.setProperty('--ui-plate-slice', sliceNumbers(plate));
  style.setProperty('--ui-plate-width', slicePx(plate));
  style.setProperty('--ui-plate-width-2x', slicePx(plate, 2));

  style.setProperty('--ui-health', url(href(health)));
  style.setProperty('--ui-health-w', px(health.width));
  style.setProperty('--ui-health-h', px(health.height));
  style.setProperty('--ui-health-pad', healthPadding(health));
  const heart: UiRect = health.heart ?? { x: 0, y: 0, width: 1, height: 1 };
  style.setProperty('--ui-heart-x', px(heart.x));
  style.setProperty('--ui-heart-y', px(heart.y));
  style.setProperty('--ui-heart-w', px(heart.width));
  style.setProperty('--ui-heart-h', px(heart.height));
  root.classList.add('has-ui-skin');
  return true;
}

function sliceOf(piece: UiPieceDef): [number, number, number, number] {
  return piece.slice ?? [8, 8, 8, 8];
}

function sliceNumbers(piece: UiPieceDef): string {
  return sliceOf(piece).join(' ');
}

/** The slices as border widths, at a whole scale: corners and edges drawn `scale` times bigger. */
function slicePx(piece: UiPieceDef, scale = 1): string {
  return sliceOf(piece)
    .map((n) => `${n * scale}px`)
    .join(' ');
}

/**
 * Padding that puts the segments inside the trough with whole-pixel widths:
 * a margin of at least 2 px at each rounded end, grown until the segments
 * divide evenly (the right one takes the odd pixel), and 1 px above and below.
 */
export function healthPadding(health: UiPieceDef): string {
  const t = health.trough ?? { x: 0, y: 0, width: health.width, height: health.height };
  let margins = 4;
  while (margins < 16 && (t.width - margins - (SEGMENTS - 1) * SEGMENT_GAP) % SEGMENTS !== 0) margins++;
  const top = t.y + 1;
  const left = t.x + Math.floor(margins / 2);
  const right = health.width - (t.x + t.width) + Math.ceil(margins / 2);
  const bottom = health.height - (t.y + t.height) + 1;
  return `${top}px ${right}px ${bottom}px ${left}px`;
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function pixelsOf(img: HTMLImageElement): { ctx: CanvasRenderingContext2D; data: ImageData } | null {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  return { ctx, data: ctx.getImageData(0, 0, canvas.width, canvas.height) };
}

/**
 * Radius of a ring's face: from the centre outwards, the first light pixel
 * (its bone-white inner border), the closest of the four directions.
 */
export function faceRadius(img: HTMLImageElement): number {
  const px = pixelsOf(img);
  if (!px) return img.naturalWidth / 2 - 8;
  const { data } = px;
  const cx = Math.floor(data.width / 2);
  const cy = Math.floor(data.height / 2);
  let best = Infinity;
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    for (let r = 0; r < data.width / 2; r++) {
      const i = ((cy + dy * r) * data.width + (cx + dx * r)) * 4;
      const luma = ((data.data[i] ?? 0) * 3 + (data.data[i + 1] ?? 0) * 6 + (data.data[i + 2] ?? 0)) / 10;
      if (luma > 170) {
        best = Math.min(best, r);
        break;
      }
    }
  }
  return Number.isFinite(best) ? best : data.width / 2 - 8;
}

/**
 * The face of a button (ring or polygon): every pixel its bone-white inner
 * border encloses, flooding from the centre (4-neighbours, so a diagonal
 * one-pixel border holds). Null when the flood leaks out: no closed border.
 */
function faceMask(data: ImageData): Uint8Array | null {
  const { width: w, height: h, data: d } = data;
  const mask = new Uint8Array(w * h);
  const stack = [Math.floor(h / 2) * w + Math.floor(w / 2)];
  while (stack.length > 0) {
    const i = stack.pop()!;
    if (mask[i]) continue;
    const x = i % w;
    const y = Math.floor(i / w);
    const opaque = (d[i * 4 + 3] ?? 0) > 0;
    if (opaque && ((d[i * 4] ?? 0) * 3 + (d[i * 4 + 1] ?? 0) * 6 + (d[i * 4 + 2] ?? 0)) / 10 > 170) continue;
    if (!opaque || x === 0 || y === 0 || x === w - 1 || y === h - 1) return null;
    mask[i] = 1;
    stack.push(i + 1, i - 1, i + w, i - w);
  }
  return mask;
}

/**
 * The button with its metal tinted (outside the face: the face keeps its
 * own colour), as a data URL; null without a 2D canvas.
 */
function tinted(img: HTMLImageElement, tint: Rgb): string | null {
  const px = pixelsOf(img);
  if (!px) return null;
  const { ctx, data } = px;
  const mask = faceMask(data);
  const face = faceRadius(img);
  const cx = (data.width - 1) / 2;
  const cy = (data.height - 1) / 2;
  const inFace = (x: number, y: number): boolean => (mask ? mask[y * data.width + x] === 1 : Math.hypot(x - cx, y - cy) < face - 0.5);
  const d = data.data;
  for (let y = 0; y < data.height; y++) {
    for (let x = 0; x < data.width; x++) {
      const i = (y * data.width + x) * 4;
      if ((d[i + 3] ?? 0) === 0 || inFace(x, y)) continue;
      const r = d[i] ?? 0;
      const g = d[i + 1] ?? 0;
      const b = d[i + 2] ?? 0;
      const l = (r * 3 + g * 6 + b) / 10 / 255;
      d[i] = Math.round(r * (1 - TINT_STRENGTH) + Math.min(255, tint[0] * l * 1.35) * TINT_STRENGTH);
      d[i + 1] = Math.round(g * (1 - TINT_STRENGTH) + Math.min(255, tint[1] * l * 1.35) * TINT_STRENGTH);
      d[i + 2] = Math.round(b * (1 - TINT_STRENGTH) + Math.min(255, tint[2] * l * 1.35) * TINT_STRENGTH);
    }
  }
  ctx.putImageData(data, 0, 0);
  return ctx.canvas.toDataURL('image/png');
}
