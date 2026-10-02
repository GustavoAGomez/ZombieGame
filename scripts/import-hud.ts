/**
 * npm run hud:import — cleans the HUD pieces generated in PixelLab
 * (art-src/pixellab/hud/, export with metadata.json) and writes them to
 * public/assets/ui/, registered in the manifest's `ui` section, plus a
 * before/after review sheet in maps/preview/hud/.
 *
 *   Icon_button (big) and Icon_button-2 (medium): round buttons. The metal
 *     ring and its bone-white inner border stay; everything inside becomes
 *     the button's dark face (the icons go). The medium one is halved
 *     exactly (2:1) to fit the small HUD buttons at 1× scale. Tinted copies:
 *     the big one red (fire), the medium one amber (special, weapon in hand).
 *   Button: rectangular button for 9-slice; its "CRAFT" text is painted over
 *     with the face colour.
 *   Health_bar: frame and the cross on the left stay; the orange fill is
 *     emptied to the black trough (the game draws the segments over it).
 *   Panel: as it comes, for 9-slice (the merchant's shop).
 *
 * Every piece is cropped to its opaque bounds. Pieces are found by colour
 * and shape, not by fixed coordinates, so a regenerated export still works.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { contactSheet, type SheetEntry } from './lib/contact-sheet';
import { decodePng, encodePng } from './lib/png';
import { cut, opaqueBounds, type Frame } from './lib/sheet';

type Rgb = readonly [number, number, number];

const RED: Rgb = [201, 58, 43];
const AMBER: Rgb = [232, 176, 74];
/** How much of the tint replaces the metal's own colour (the rest keeps its scratches and rivets readable). */
const TINT_STRENGTH = 0.7;
/** 9-slice insets (px of the cropped image): corners with their rivets and the bevel stay whole. */
const BUTTON_SLICE = 12;
const PANEL_SLICE = 20;

export interface UiPiece {
  file: string;
  width: number;
  height: number;
  /** 9-slice inset, the same on every side. */
  slice?: number;
  /** The health bar's empty trough, where the game draws the segments (px of the image). */
  trough?: { x: number; y: number; width: number; height: number };
}

const at = (f: Frame, x: number, y: number): number => (y * f.width + x) * 4;
const alpha = (f: Frame, x: number, y: number): number => f.pixels[at(f, x, y) + 3] ?? 0;
const rgb = (f: Frame, x: number, y: number): Rgb => {
  const i = at(f, x, y);
  return [f.pixels[i] ?? 0, f.pixels[i + 1] ?? 0, f.pixels[i + 2] ?? 0];
};
const luma = ([r, g, b]: Rgb): number => (r * 3 + g * 6 + b) / 10;
const isBone = (c: Rgb): boolean => luma(c) > 185 && Math.max(...c) - Math.min(...c) < 40;
const isOrange = ([r, g, b]: Rgb): boolean => r > 140 && g > 70 && r - b > 70;
const isNearBlack = (c: Rgb): boolean => luma(c) < 14;
const set = (f: Frame, x: number, y: number, c: Rgb): void => {
  f.pixels.set([c[0], c[1], c[2], 255], at(f, x, y));
};

function readFrame(path: string): Frame {
  const png = decodePng(readFileSync(path));
  return { width: png.width, height: png.height, pixels: png.pixels };
}

function cropToBounds(f: Frame): Frame {
  const b = opaqueBounds(f);
  if (!b) throw new Error('pieza vacía');
  return cut(f, b.minX, b.minY, b.maxX - b.minX + 1, b.maxY - b.minY + 1);
}

/** Most common opaque colour among the pixels `keep` accepts. */
function modeColour(f: Frame, keep: (x: number, y: number, c: Rgb) => boolean): Rgb {
  const counts = new Map<number, number>();
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      if (alpha(f, x, y) === 0) continue;
      const c = rgb(f, x, y);
      if (!keep(x, y, c)) continue;
      const key = (c[0] << 16) | (c[1] << 8) | c[2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  let best = 0;
  let bestCount = -1;
  for (const [key, n] of counts) if (n > bestCount) [best, bestCount] = [key, n];
  return [(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff];
}

/**
 * Round button: per direction from the centre, the first bone-white pixel
 * met coming from outside is the ring's inner border. Inside it, the 1 px
 * dark line right against the border stays; everything else is painted with
 * the face colour. Returns the cleaned ring and which pixels are the face.
 */
export function cleanRing(src: Frame): { ring: Frame; face: Uint8Array; faceColour: Rgb } {
  const f = cropToBounds(src);
  const cx = (f.width - 1) / 2;
  const cy = (f.height - 1) / 2;
  const maxR = Math.hypot(cx, cy);
  const BINS = 360;
  const inner = new Float32Array(BINS).fill(0);
  for (let bin = 0; bin < BINS; bin++) {
    const a = (bin / BINS) * Math.PI * 2;
    for (let r = maxR; r > 0; r -= 0.25) {
      const x = Math.round(cx + Math.cos(a) * r);
      const y = Math.round(cy + Math.sin(a) * r);
      if (x < 0 || y < 0 || x >= f.width || y >= f.height || alpha(f, x, y) === 0) continue;
      if (isBone(rgb(f, x, y))) {
        inner[bin] = r;
        break;
      }
    }
  }
  // Where the border is broken (a rivet or a tab over it) a direction misses it or finds it far
  // off: those take the typical radius, so they never leave a streak of the icon behind.
  const found = [...inner].filter((r) => r > 0).sort((a, b) => a - b);
  const typical = found[Math.floor(found.length / 2)] ?? 0;
  for (let bin = 0; bin < BINS; bin++) if (Math.abs((inner[bin] ?? 0) - typical) > 2) inner[bin] = typical;
  const radiusAt = (x: number, y: number): number => {
    const bin = Math.round(((Math.atan2(y - cy, x - cx) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2) * BINS) % BINS;
    return Math.min(inner[bin] ?? 0, inner[(bin + 1) % BINS] ?? 0, inner[(bin + BINS - 1) % BINS] ?? 0);
  };
  const face = new Uint8Array(f.width * f.height);
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const r = radiusAt(x, y);
      const d = Math.hypot(x - cx, y - cy);
      if (r > 0 && d < r - 0.5 && !(isNearBlack(rgb(f, x, y)) && d >= r - 1.8)) face[y * f.width + x] = 1;
    }
  }
  // The face colour: the commonest dark, non-orange colour inside.
  const faceColour = modeColour(f, (x, y, c) => face[y * f.width + x] === 1 && !isOrange(c) && !isNearBlack(c));
  for (let i = 0; i < face.length; i++) if (face[i]) set(f, i % f.width, Math.floor(i / f.width), faceColour);
  return { ring: f, face, faceColour };
}

/** Multiplies the metal (not the face) by `tint`, keeping its light and dark. */
export function tintRing(ring: Frame, face: Uint8Array, tint: Rgb): Frame {
  const out: Frame = { width: ring.width, height: ring.height, pixels: ring.pixels.slice() };
  for (let y = 0; y < ring.height; y++) {
    for (let x = 0; x < ring.width; x++) {
      if (alpha(ring, x, y) === 0 || face[y * ring.width + x]) continue;
      const c = rgb(ring, x, y);
      const l = luma(c) / 255;
      const tinted = tint.map((t) => Math.min(255, t * l * 1.35));
      const mixed = c.map((v, k) => Math.round(v * (1 - TINT_STRENGTH) + (tinted[k] ?? 0) * TINT_STRENGTH)) as unknown as Rgb;
      set(out, x, y, mixed);
    }
  }
  return out;
}

/** Exactly half the size: each pixel is the commonest colour of its 2×2 block (a light border wins ties, so it survives). */
export function halve(src: Frame, face: Uint8Array): { frame: Frame; face: Uint8Array } {
  const w = Math.ceil(src.width / 2);
  const h = Math.ceil(src.height / 2);
  const out: Frame = { width: w, height: h, pixels: new Uint8Array(w * h * 4) };
  const outFace = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const counts = new Map<number, number>();
      let faceVotes = 0;
      let cells = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx;
          const sy = y * 2 + dy;
          if (sx >= src.width || sy >= src.height) continue;
          cells++;
          if (face[sy * src.width + sx]) faceVotes++;
          const key = alpha(src, sx, sy) === 0 ? -1 : (() => { const c = rgb(src, sx, sy); return (c[0] << 16) | (c[1] << 8) | c[2]; })();
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      let best = -1;
      let bestCount = -1;
      for (const [key, n] of counts) {
        const light = (k: number): number => (k < 0 ? -1 : luma([(k >> 16) & 0xff, (k >> 8) & 0xff, k & 0xff]));
        if (n > bestCount || (n === bestCount && light(key) > light(best))) [best, bestCount] = [key, n];
      }
      if (best >= 0) out.pixels.set([(best >> 16) & 0xff, (best >> 8) & 0xff, best & 0xff, 255], (y * w + x) * 4);
      outFace[y * w + x] = faceVotes * 2 > cells ? 1 : 0;
    }
  }
  return { frame: out, face: outFace };
}

/** Rectangular button: the orange text (and the pixel around it) painted with the face's own colour. */
export function cleanButton(src: Frame): Frame {
  const f = cropToBounds(src);
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      if (alpha(f, x, y) === 0 || !isOrange(rgb(f, x, y))) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return f;
  const inText = (x: number, y: number): boolean => x >= x0 - 1 && x <= x1 + 1 && y >= y0 - 1 && y <= y1 + 1;
  // The face: the commonest colour well inside the frame, away from the text.
  const faceColour = modeColour(f, (x, y, c) => !inText(x, y) && x > f.width * 0.15 && x < f.width * 0.85 && y > f.height * 0.25 && y < f.height * 0.75 && !isBone(c));
  for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) set(f, x, y, faceColour);
  return f;
}

/**
 * Health bar: the trough is the black connected region at the right end of
 * the bar (the empty part); its bounding box, one pixel in, is emptied to
 * black. The cross on the left lies outside it and stays.
 */
export function cleanHealthBar(src: Frame): { frame: Frame; trough: { x: number; y: number; width: number; height: number } } {
  const f = cropToBounds(src);
  // Start from the empty black part of the trough: near-black, towards the right, at mid height.
  let seed: [number, number] | null = null;
  const midY = Math.floor(f.height / 2);
  for (let x = Math.floor(f.width * 0.9); x > f.width / 2 && !seed; x--) {
    if (alpha(f, x, midY) > 0 && isNearBlack(rgb(f, x, midY))) seed = [x, midY];
  }
  if (!seed) throw new Error('no encuentro el canal negro de la barra de vida');
  const seen = new Uint8Array(f.width * f.height);
  const stack = [seed];
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
    // Diagonals too: the trough's left edge only touches its top and bottom edges at a corner.
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) stack.push([x + dx, y + dy]);
  }
  const black = modeColour(f, (x, y) => seen[y * f.width + x] === 1);
  const trough = { x: x0 + 1, y: y0 + 1, width: x1 - x0 - 1, height: y1 - y0 - 1 };
  for (let y = trough.y; y < trough.y + trough.height; y++) for (let x = trough.x; x < trough.x + trough.width; x++) set(f, x, y, black);
  return { frame: f, trough };
}

function findExport(dir: string): string {
  for (const name of readdirSync(dir)) {
    const sub = join(dir, name);
    if (statSync(sub).isDirectory() && existsSync(join(sub, 'elements'))) return join(sub, 'elements');
  }
  throw new Error(`no encuentro la carpeta elements/ en ${dir}`);
}

export function importHud(root: string, log: (line: string) => void): Record<string, UiPiece> {
  const elements = findExport(resolve(root, 'art-src/pixellab/hud'));
  const outDir = resolve(root, 'public/assets/ui');
  mkdirSync(outDir, { recursive: true });
  const pieces: Record<string, UiPiece> = {};
  const review: SheetEntry[] = [];
  const write = (key: string, file: string, frame: Frame, extra: Partial<UiPiece> = {}): void => {
    writeFileSync(join(outDir, file), encodePng(frame.width, frame.height, frame.pixels));
    pieces[key] = { file: `ui/${file}`, width: frame.width, height: frame.height, ...extra };
    log(`  ✓ ${key} → ui/${file} (${frame.width}×${frame.height})`);
  };
  const before = (name: string): Frame => {
    const f = readFrame(join(elements, name));
    review.push({ frame: f, caption: [`${name.replace('.png', '')} ANTES`] });
    return f;
  };
  const after = (frame: Frame, caption: string): void => {
    review.push({ frame, caption: [caption] });
  };

  const big = cleanRing(before('Icon_button.png'));
  const bigRed = tintRing(big.ring, big.face, RED);
  write('ringLarge', 'ring_large.png', big.ring);
  write('ringLargeRed', 'ring_large_red.png', bigRed);
  after(big.ring, 'ARO GRANDE');
  after(bigRed, 'ROJO (DISPARO)');

  const medium = cleanRing(before('Icon_button-2.png'));
  const half = halve(medium.ring, medium.face);
  const halfAmber = tintRing(half.frame, half.face, AMBER);
  write('ringMedium', 'ring_medium.png', half.frame);
  write('ringMediumAmber', 'ring_medium_amber.png', halfAmber);
  after(medium.ring, 'ARO MEDIANO');
  after(half.frame, 'MITAD (HUD)');
  after(halfAmber, 'AMBAR');

  const button = cleanButton(before('Button.png'));
  write('button', 'button.png', button, { slice: BUTTON_SLICE });
  after(button, 'BOTON SIN TEXTO');

  const bar = cleanHealthBar(before('Health_bar.png'));
  write('healthFrame', 'health_frame.png', bar.frame, { trough: bar.trough });
  after(bar.frame, 'BARRA VACIA');
  log(`  · canal de la barra: x ${bar.trough.x}, y ${bar.trough.y}, ${bar.trough.width}×${bar.trough.height}`);

  const panel = cropToBounds(before('Panel.png'));
  write('panel', 'panel.png', panel, { slice: PANEL_SLICE });
  after(panel, 'PANEL (TAL CUAL)');

  const previewDir = resolve(root, 'maps/preview/hud');
  mkdirSync(previewDir, { recursive: true });
  const sheet = contactSheet(review, { columns: 4, scale: 3, title: 'HUD PIXELLAB: ANTES Y DESPUES' });
  writeFileSync(join(previewDir, 'hud-antes-despues.png'), encodePng(sheet.width, sheet.height, sheet.pixels));
  log('  ✓ hoja de revisión → maps/preview/hud/hud-antes-despues.png');

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
