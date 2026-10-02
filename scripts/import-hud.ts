/**
 * npm run hud:import — the HUD kit generated in PixelLab
 * (art-src/pixellab/hud/), into public/assets/ui/ and the manifest's `ui`
 * section, with a contact sheet of the pieces (names and sizes) in
 * maps/preview/hud/hud-kit.png.
 *
 * Pieces: a big and a medium round ring, a panel, a rectangular plate and a
 * health bar frame with a heart on the left. They come either as an export
 * with elements/ (one PNG each) or as a single sheet: then every piece is cut
 * by its bounding box over the alpha channel (connected opaque pixels) and
 * told apart by shape. Each piece is cropped to its bounding box.
 *
 * Nothing is repainted: the rings are tinted at runtime (src/ui/skin.ts), the
 * panel and the plate are drawn with 9-slice, and the game draws the health
 * segments inside the bar's trough and makes the heart beat. The only new
 * image is the small ring: the medium one halved exactly (2:1), so the small
 * buttons are drawn at 1× too.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contactSheet, type SheetEntry } from './lib/contact-sheet';
import { decodePng, encodePng } from './lib/png';
import { cut, opaqueBounds, type Frame } from './lib/sheet';

type Rgb = readonly [number, number, number];

/**
 * 9-slice insets [top, right, bottom, left] (px of the cropped piece). The
 * panel's are wide so its corners keep whole the slanted ends of the plates
 * at the middle of each side; what repeats in between is their flat part.
 */
const PANEL_SLICE: Slice = [35, 45, 35, 45];
const PLATE_SLICE: Slice = [8, 8, 8, 8];

export type Slice = [number, number, number, number];
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiPiece {
  file: string;
  width: number;
  height: number;
  slice?: Slice;
  /** The health bar's trough, where the game draws the segments, and its heart (px of the image). */
  trough?: Rect;
  heart?: Rect;
}

type PieceName = 'ringLarge' | 'ringMedium' | 'panel' | 'plate' | 'healthFrame';
type OutputName = PieceName | 'ringSmall';

const LABELS: Record<OutputName, string> = {
  ringLarge: 'ARO GRANDE',
  ringMedium: 'ARO MEDIANO',
  ringSmall: 'ARO PEQUENO (MITAD)',
  panel: 'PANEL',
  plate: 'PLACA',
  healthFrame: 'BARRA DE VIDA',
};

const at = (f: Frame, x: number, y: number): number => (y * f.width + x) * 4;
const alpha = (f: Frame, x: number, y: number): number => f.pixels[at(f, x, y) + 3] ?? 0;
const rgb = (f: Frame, x: number, y: number): Rgb => {
  const i = at(f, x, y);
  return [f.pixels[i] ?? 0, f.pixels[i + 1] ?? 0, f.pixels[i + 2] ?? 0];
};
const luma = ([r, g, b]: Rgb): number => (r * 3 + g * 6 + b) / 10;
const isNearBlack = (c: Rgb): boolean => luma(c) < 22;

function readFrame(path: string): Frame {
  const png = decodePng(readFileSync(path));
  return { width: png.width, height: png.height, pixels: png.pixels };
}

export function cropToBounds(f: Frame): Frame {
  const b = opaqueBounds(f);
  if (!b) throw new Error('pieza vacía');
  return cut(f, b.minX, b.minY, b.maxX - b.minX + 1, b.maxY - b.minY + 1);
}

/** Bounding boxes of the connected opaque regions of a sheet (8-neighbours), big enough to be pieces. */
export function splitSheet(sheet: Frame, minPixels = 200): Frame[] {
  const { width: w, height: h } = sheet;
  const seen = new Uint8Array(w * h);
  const pieces: Frame[] = [];
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || (sheet.pixels[s * 4 + 3] ?? 0) === 0) continue;
    let x0 = w;
    let y0 = h;
    let x1 = -1;
    let y1 = -1;
    let n = 0;
    const stack = [s];
    seen[s] = 1;
    while (stack.length > 0) {
      const i = stack.pop()!;
      const x = i % w;
      const y = Math.floor(i / w);
      n++;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (!seen[j] && (sheet.pixels[j * 4 + 3] ?? 0) > 0) {
            seen[j] = 1;
            stack.push(j);
          }
        }
      }
    }
    if (n >= minPixels) pieces.push(cut(sheet, x0, y0, x1 - x0 + 1, y1 - y0 + 1));
  }
  return pieces;
}

/**
 * Names the five pieces by shape: the two square ones are the rings (the
 * bigger, the big ring); of the wide ones, the flattest is the health bar,
 * the next the plate, and the tallest the panel.
 */
export function namePieces(pieces: readonly Frame[]): Record<PieceName, Frame> {
  const square = pieces.filter((p) => Math.abs(p.width - p.height) <= 2).sort((a, b) => b.width - a.width);
  const wide = pieces.filter((p) => p.width - p.height > 2).sort((a, b) => b.width / b.height - a.width / a.height);
  const [ringLarge, ringMedium] = square;
  const [healthFrame, plate, panel] = wide;
  if (!ringLarge || !ringMedium || !healthFrame || !plate || !panel) {
    throw new Error(`se esperaban 2 aros y 3 piezas anchas; hay ${square.length} cuadradas y ${wide.length} anchas`);
  }
  return { ringLarge, ringMedium, panel, plate, healthFrame };
}

/**
 * The health bar's trough is the dark connected region at its right end
 * (bounded by its near-black edge); its inside, one pixel in, is where the
 * segments go. The heart is the near-black outline left of the trough,
 * inside the frame's own border.
 */
export function measureHealthBar(f: Frame): { trough: Rect; heart: Rect } {
  const midY = Math.floor(f.height / 2);
  // The trough's right edge: the first near-black pixel coming in from the right, past the frame.
  let edgeX = -1;
  for (let x = f.width - 4; x > f.width / 2 && edgeX < 0; x--) if (isNearBlack(rgb(f, x, midY))) edgeX = x;
  if (edgeX < 0) throw new Error('no encuentro el hueco de la barra de vida');
  const seen = new Uint8Array(f.width * f.height);
  const stack: [number, number][] = [[edgeX, midY]];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  while (stack.length > 0) {
    const [x, y] = stack.pop()!;
    if (x < 0 || y < 0 || x >= f.width || y >= f.height || seen[y * f.width + x]) continue;
    if (alpha(f, x, y) === 0 || !isNearBlack(rgb(f, x, y))) continue;
    seen[y * f.width + x] = 1;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) stack.push([x + dx, y + dy]);
  }
  const trough = { x: x0 + 1, y: y0 + 1, width: x1 - x0 - 1, height: y1 - y0 - 1 };
  // The heart: near-black outline pixels between the frame's border (3 px) and the trough.
  let hx0 = Infinity;
  let hy0 = Infinity;
  let hx1 = -1;
  let hy1 = -1;
  // Only the black outline itself (darker than the trough's edge test): the frame's dark shading stays out.
  for (let y = 2; y < f.height - 2; y++) {
    for (let x = 3; x < x0 - 2; x++) {
      if (alpha(f, x, y) === 0 || luma(rgb(f, x, y)) >= 16) continue;
      // The frame's own outline touches the transparent outside; the heart never does.
      let outline = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (alpha(f, x + dx, y + dy) === 0) outline = true;
      if (outline) continue;
      hx0 = Math.min(hx0, x);
      hy0 = Math.min(hy0, y);
      hx1 = Math.max(hx1, x);
      hy1 = Math.max(hy1, y);
    }
  }
  if (hx1 < 0) throw new Error('no encuentro el corazón de la barra de vida');
  return { trough, heart: { x: hx0, y: hy0, width: hx1 - hx0 + 1, height: hy1 - hy0 + 1 } };
}

/**
 * Exactly half the size: each pixel takes the commonest colour of its 2×2
 * block; on a tie the lighter one wins, so the thin bone-white border of a
 * ring survives. An odd size rounds up (the last row and column count alone).
 */
export function halve(src: Frame): Frame {
  const w = Math.ceil(src.width / 2);
  const h = Math.ceil(src.height / 2);
  const out: Frame = { width: w, height: h, pixels: new Uint8Array(w * h * 4) };
  const keyAt = (x: number, y: number): number => {
    if (alpha(src, x, y) === 0) return -1;
    const [r, g, b] = rgb(src, x, y);
    return (r << 16) | (g << 8) | b;
  };
  const light = (k: number): number => (k < 0 ? -1 : luma([(k >> 16) & 0xff, (k >> 8) & 0xff, k & 0xff]));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const counts = new Map<number, number>();
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          const sy = y * 2 + dy;
          if (sx < src.width && sy < src.height) counts.set(keyAt(sx, sy), (counts.get(keyAt(sx, sy)) ?? 0) + 1);
        }
      }
      let best = -1;
      let bestCount = -1;
      for (const [key, n] of counts) if (n > bestCount || (n === bestCount && light(key) > light(best))) [best, bestCount] = [key, n];
      if (best >= 0) out.pixels.set([(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff, 255], (y * w + x) * 4);
    }
  }
  return out;
}

/** The kit's pieces: elements/ of a PixelLab export, or else the one PNG sheet in the folder. */
function readKit(dir: string): Frame[] {
  for (const name of readdirSync(dir)) {
    const sub = join(dir, name);
    if (statSync(sub).isDirectory() && existsSync(join(sub, 'elements'))) {
      const elements = join(sub, 'elements');
      return readdirSync(elements)
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => cropToBounds(readFrame(join(elements, f))));
    }
  }
  const sheet = readdirSync(dir).find((f) => f.endsWith('.png'));
  if (!sheet) throw new Error(`no hay piezas en ${dir}`);
  return splitSheet(readFrame(join(dir, sheet)));
}

export function importHud(root: string, log: (line: string) => void): Record<string, UiPiece> {
  const named = namePieces(readKit(resolve(root, 'art-src/pixellab/hud')));
  const kit: Record<OutputName, Frame> = { ...named, ringSmall: halve(named.ringMedium) };
  const outDir = resolve(root, 'public/assets/ui');
  mkdirSync(outDir, { recursive: true });
  const files: Record<OutputName, string> = {
    ringLarge: 'ring_large.png',
    ringMedium: 'ring_medium.png',
    ringSmall: 'ring_small.png',
    panel: 'panel.png',
    plate: 'plate.png',
    healthFrame: 'health_frame.png',
  };
  const bar = measureHealthBar(kit.healthFrame);
  const extra: Partial<Record<OutputName, Partial<UiPiece>>> = {
    panel: { slice: PANEL_SLICE },
    plate: { slice: PLATE_SLICE },
    healthFrame: { trough: bar.trough, heart: bar.heart },
  };
  const pieces: Record<string, UiPiece> = {};
  const review: SheetEntry[] = [];
  for (const name of Object.keys(files) as OutputName[]) {
    const frame = kit[name];
    writeFileSync(join(outDir, files[name]), encodePng(frame.width, frame.height, frame.pixels));
    pieces[name] = { file: `ui/${files[name]}`, width: frame.width, height: frame.height, ...extra[name] };
    review.push({ frame, caption: [LABELS[name], `${frame.width}X${frame.height}`] });
    log(`  ✓ ${LABELS[name]} → ui/${files[name]} (${frame.width}×${frame.height})`);
  }
  log(`  · barra: hueco x ${bar.trough.x}, y ${bar.trough.y}, ${bar.trough.width}×${bar.trough.height}; corazón x ${bar.heart.x}, y ${bar.heart.y}, ${bar.heart.width}×${bar.heart.height}`);

  const previewDir = resolve(root, 'maps/preview/hud');
  mkdirSync(previewDir, { recursive: true });
  const sheet = contactSheet(review, { columns: 3, scale: 3, title: 'KIT DEL HUD' });
  writeFileSync(join(previewDir, 'hud-kit.png'), encodePng(sheet.width, sheet.height, sheet.pixels));
  log('  ✓ hoja de contactos → maps/preview/hud/hud-kit.png');

  const manifestPath = resolve(root, 'public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
  manifest.ui = pieces;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  log('  ✓ manifiesto: sección ui');
  return pieces;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    importHud(root, (line) => console.info(line));
  } catch (err) {
    console.error(`✖ ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
