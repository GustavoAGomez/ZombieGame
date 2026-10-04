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
 * Pieces from other exports (a later kit with a native small ring and the
 * hexagon and octagon buttons) are named in art-src/pixellab/hud/import.json:
 * `{ "pieces": { "<name>": "<PNG path from art-src/pixellab/hud/>" } }`, or
 * `{ "from": "<sheet PNG>", "rect": [x, y, width, height] }` to cut a piece
 * out of a whole sheet when PixelLab's own element came cropped too tight
 * (the health bar lost its top, bottom and right border). They are cropped
 * the same way and replace or add to the kit's pieces.
 *
 * Nothing is repainted: the rings are tinted at runtime (src/ui/skin.ts), the
 * panel and the plate are drawn with 9-slice, and the game draws the health
 * segments inside the bar's trough and makes the heart beat. Without a small
 * ring in import.json, the medium one is halved (2:1) to make one; pixel art
 * does not survive a reduction cleanly, so a native piece is better.
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
  /** A bar's trough, where the game draws its fill (the health segments), and the health bar's heart (px of the image). */
  trough?: Rect;
  heart?: Rect;
}

type PieceName = 'ringLarge' | 'ringMedium' | 'panel' | 'plate' | 'healthFrame';
/** Pieces that only come from import.json: the polygon buttons and the boss's and the weapon's bars. */
type ExtraName = 'hexagon' | 'octagon' | 'bossFrame' | 'gaugeFrame';
type OutputName = PieceName | 'ringSmall' | ExtraName;
const OUTPUT_NAMES: readonly OutputName[] = ['ringLarge', 'ringMedium', 'ringSmall', 'hexagon', 'octagon', 'panel', 'plate', 'healthFrame', 'bossFrame', 'gaugeFrame'];
/** Bars measured for their trough (the game draws their fill in it). */
const BARS: readonly OutputName[] = ['bossFrame', 'gaugeFrame'];

const LABELS: Record<OutputName, string> = {
  ringLarge: 'ARO GRANDE',
  ringMedium: 'ARO MEDIANO',
  ringSmall: 'ARO PEQUENO',
  hexagon: 'HEXAGONO',
  octagon: 'OCTOGONO',
  panel: 'PANEL',
  plate: 'PLACA',
  healthFrame: 'BARRA DE VIDA',
  bossFrame: 'BARRA DEL BOSS',
  gaugeFrame: 'MEDIDOR DEL ARMA',
};

const FILES: Record<OutputName, string> = {
  ringLarge: 'ring_large.png',
  ringMedium: 'ring_medium.png',
  ringSmall: 'ring_small.png',
  hexagon: 'hexagon.png',
  octagon: 'octagon.png',
  panel: 'panel.png',
  plate: 'plate.png',
  healthFrame: 'health_frame.png',
  bossFrame: 'boss_frame.png',
  gaugeFrame: 'gauge_frame.png',
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
 * A health bar ready for the game: with its trough, where the segments go,
 * and its heart. A bar whose trough is framed by a bone-white border comes
 * from PixelLab partly filled (a mock-up of a bar in use): its trough, all
 * the pixels the dark outline inside that border encloses, is emptied row by
 * row with the colour of its empty right end. The heart is then the biggest
 * coloured blob left of the trough, with its outline. A bar without that
 * border is measured as before (measureHealthBar), untouched.
 */
export function prepareHealthBar(f: Frame): { frame: Frame; trough: Rect; heart: Rect } {
  const found = boneRimTrough(f);
  if (!found) return { frame: f, ...measureHealthBar(f) };
  const { inside, trough } = found;
  const { x: x0, y: y0 } = trough;
  const x1 = x0 + trough.width - 1;
  const y1 = y0 + trough.height - 1;
  const out: Frame = { width: f.width, height: f.height, pixels: f.pixels.slice() };
  // Each row of the trough takes the colour of its empty end (one pixel in from its rightmost pixel).
  for (let y = y0; y <= y1; y++) {
    let right = -1;
    for (let rx = x1; rx >= x0 && right < 0; rx--) if (inside[y * f.width + rx]) right = rx;
    if (right < 0) continue;
    const ref = inside[y * f.width + right - 1] ? right - 1 : right;
    const colour = f.pixels.slice(at(f, ref, y), at(f, ref, y) + 4);
    for (let rx = x0; rx <= right; rx++) if (inside[y * f.width + rx]) out.pixels.set(colour, at(out, rx, y));
  }
  return { frame: out, trough, heart: colouredHeart(out, x0) ?? measureHealthBar(f).heart };
}

/**
 * A bar's trough: what a bone-white border encloses, coming in from its
 * right end past that border and the dark outline inside it, every pixel
 * neither as dark as the outline nor as light as the border. Null for a bar
 * without that border.
 */
function boneRimTrough(f: Frame): { inside: Uint8Array; trough: Rect } | null {
  const midY = Math.floor(f.height / 2);
  const isBone = (x: number, y: number): boolean => alpha(f, x, y) > 0 && luma(rgb(f, x, y)) > 170;
  let x = f.width - 1;
  while (x > f.width / 2 && !isBone(x, midY)) x--;
  if (x <= f.width / 2) return null;
  // Past the border and the dark outline inside it: the first pixel of the trough.
  while (x > 0 && (isBone(x, midY) || luma(rgb(f, x, midY)) < 22)) x--;
  const inside = new Uint8Array(f.width * f.height);
  const stack: [number, number][] = [[x, midY]];
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  while (stack.length > 0) {
    const [px, py] = stack.pop()!;
    if (px < 0 || py < 0 || px >= f.width || py >= f.height || inside[py * f.width + px]) continue;
    const l = luma(rgb(f, px, py));
    if (alpha(f, px, py) === 0 || l < 22 || l > 170) continue;
    if (px === 0 || py === 0 || px === f.width - 1 || py === f.height - 1) throw new Error('el hueco de la barra no está cerrado');
    inside[py * f.width + px] = 1;
    x0 = Math.min(x0, px);
    y0 = Math.min(y0, py);
    x1 = Math.max(x1, px);
    y1 = Math.max(y1, py);
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  return { inside, trough: { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 } };
}

/** The trough of an empty bar (the boss's, the weapon's gauge), where the game draws its fill. */
export function measureTrough(f: Frame): Rect {
  const found = boneRimTrough(f);
  if (!found) throw new Error('no encuentro el hueco de la barra (sin borde claro alrededor)');
  return found.trough;
}

/** The biggest blob of coloured pixels (8-neighbours) left of `beforeX`, grown by one pixel for its outline; null without one. */
function colouredHeart(f: Frame, beforeX: number): Rect | null {
  const coloured = (x: number, y: number): boolean => {
    if (alpha(f, x, y) === 0) return false;
    const [r, g, b] = rgb(f, x, y);
    return Math.max(r, g, b) - Math.min(r, g, b) > 30;
  };
  const seen = new Uint8Array(f.width * f.height);
  let best: Rect | null = null;
  let bestCount = 20; // smaller blobs are rust, not a heart
  for (let sy = 0; sy < f.height; sy++) {
    for (let sx = 0; sx < beforeX - 1; sx++) {
      if (seen[sy * f.width + sx] || !coloured(sx, sy)) continue;
      let n = 0;
      let bx0 = sx;
      let by0 = sy;
      let bx1 = sx;
      let by1 = sy;
      const stack: [number, number][] = [[sx, sy]];
      seen[sy * f.width + sx] = 1;
      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        n++;
        bx0 = Math.min(bx0, x);
        by0 = Math.min(by0, y);
        bx1 = Math.max(bx1, x);
        by1 = Math.max(by1, y);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= beforeX - 1 || ny >= f.height || seen[ny * f.width + nx] || !coloured(nx, ny)) continue;
            seen[ny * f.width + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (n > bestCount) {
        bestCount = n;
        best = { x: Math.max(0, bx0 - 1), y: Math.max(0, by0 - 1), width: 0, height: 0 };
        best.width = Math.min(f.width - 1, bx1 + 1) - best.x + 1;
        best.height = Math.min(f.height - 1, by1 + 1) - best.y + 1;
      }
    }
  }
  return best;
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

/** A piece in import.json: a PNG of its own, or a rectangle cut out of a sheet. */
type PieceSource = string | { from: string; rect: [number, number, number, number] };

/** The pieces named in import.json (next to the kit), cropped; none without the file. */
export function readExtraPieces(dir: string): Partial<Record<OutputName, Frame>> {
  const configPath = join(dir, 'import.json');
  if (!existsSync(configPath)) return {};
  const config = JSON.parse(readFileSync(configPath, 'utf8')) as { pieces?: Record<string, PieceSource> };
  const pieces: Partial<Record<OutputName, Frame>> = {};
  for (const [name, source] of Object.entries(config.pieces ?? {})) {
    if (!(OUTPUT_NAMES as readonly string[]).includes(name)) throw new Error(`import.json: pieza desconocida "${name}" (válidas: ${OUTPUT_NAMES.join(', ')})`);
    const file = typeof source === 'string' ? source : source.from;
    const path = join(dir, file);
    if (!existsSync(path)) throw new Error(`import.json: no existe ${file}`);
    const image = readFrame(path);
    if (typeof source === 'string') {
      pieces[name as OutputName] = cropToBounds(image);
      continue;
    }
    const [x, y, width, height] = source.rect;
    if (x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > image.width || y + height > image.height) {
      throw new Error(`import.json: el rectángulo de "${name}" se sale de ${file} (${image.width}×${image.height})`);
    }
    pieces[name as OutputName] = cropToBounds(cut(image, x, y, width, height));
  }
  return pieces;
}

export function importHud(root: string, log: (line: string) => void): Record<string, UiPiece> {
  const dir = resolve(root, 'art-src/pixellab/hud');
  const named = namePieces(readKit(dir));
  const extra = readExtraPieces(dir);
  const kit: Partial<Record<OutputName, Frame>> = { ...named, ringSmall: extra.ringSmall ?? halve(named.ringMedium), ...extra };
  if (!extra.ringSmall) log('  · sin aro pequeño en import.json: se reduce el mediano a la mitad');
  const outDir = resolve(root, 'public/assets/ui');
  mkdirSync(outDir, { recursive: true });
  const bar = prepareHealthBar(kit.healthFrame ?? named.healthFrame);
  kit.healthFrame = bar.frame;
  const props: Partial<Record<OutputName, Partial<UiPiece>>> = {
    panel: { slice: PANEL_SLICE },
    plate: { slice: PLATE_SLICE },
    healthFrame: { trough: bar.trough, heart: bar.heart },
  };
  for (const name of BARS) {
    const frame = kit[name];
    if (!frame) continue;
    const trough = measureTrough(frame);
    props[name] = { trough };
    log(`  · ${LABELS[name].toLowerCase()}: hueco x ${trough.x}, y ${trough.y}, ${trough.width}×${trough.height}`);
  }
  const pieces: Record<string, UiPiece> = {};
  const review: SheetEntry[] = [];
  for (const name of OUTPUT_NAMES) {
    const frame = kit[name];
    if (!frame) continue;
    writeFileSync(join(outDir, FILES[name]), encodePng(frame.width, frame.height, frame.pixels));
    pieces[name] = { file: `ui/${FILES[name]}`, width: frame.width, height: frame.height, ...props[name] };
    review.push({ frame, caption: [LABELS[name], `${frame.width}X${frame.height}`] });
    log(`  ✓ ${LABELS[name]} → ui/${FILES[name]} (${frame.width}×${frame.height})`);
  }
  log(`  · barra: hueco x ${bar.trough.x}, y ${bar.trough.y}, ${bar.trough.width}×${bar.trough.height}; corazón x ${bar.heart.x}, y ${bar.heart.y}, ${bar.heart.width}×${bar.heart.height}`);

  const previewDir = resolve(root, 'maps/preview/hud');
  mkdirSync(previewDir, { recursive: true });
  const sheet = contactSheet(review, { columns: 4, scale: 3, title: 'KIT DEL HUD' });
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
