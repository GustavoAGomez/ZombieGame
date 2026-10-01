/**
 * Wall autotile built from a PixelLab Building kit (docs/ASSETS.md §7.2).
 *
 * The kit PNG is not on a grid: its pieces are cut-outs of different sizes
 * on a transparent background, found as connected blobs of the alpha
 * channel (detectPieces). The four kits share one template of 20 pieces in
 * the same places, classified once in KIT_TEMPLATE after reviewing the
 * contact sheets by eye.
 *
 * From those pieces this module composes 16 tiles of 32×32, one per mask
 * of wall neighbours (N=1, E=2, S=4, W=8), following the 3/4 perspective:
 *   - a horizontal wall always shows its front face to the south;
 *   - a wall with a gap to its south shows its face; any other wall shows
 *     only its top edge;
 *   - mirroring horizontally is always allowed; rotating or flipping
 *     vertically only on parts without a front face (top edges, floors).
 *
 * Thick walls (any wall cell inside a 2×2 square of walls: chimneys,
 * columns, double facades, a shed) are not thin lines: they take one of 4
 * solid tiles after the 16 (SOLID_BASE + 2 if the north is open + 1 if the
 * south is open), a wide top edge that shows its face only to the south.
 *
 * Geometry of every tile (measured on the kits):
 *   - vertical top edge: a 12 px strip at x 10..21 (STRIP);
 *   - horizontal top edge: a 7 px band at y 7..13 (BAND), the front face
 *     below it down to the bottom of the cell, 18 px (FACE);
 *   - y 0..6 above a band shows the floor north of the wall, and the sides
 *     of a vertical strip show the floor on each side.
 */
import { detectPieces, type Piece } from './kit';
import { blank, cut, paste, type Frame } from './sheet';

export const TILE = 32;
export const STRIP = { x: 10, width: 12 } as const;
export const BAND = { y: 7, height: 7 } as const;
export const FACE = { y: BAND.y + BAND.height, height: TILE - BAND.y - BAND.height } as const;

/** First of the 4 solid tiles: + SOLID_NORTH_OPEN when no wall is north, + SOLID_SOUTH_OPEN when none is south. */
export const SOLID_BASE = 16;
export const SOLID_NORTH_OPEN = 2;
export const SOLID_SOUTH_OPEN = 1;

/** Bits of the neighbour mask. */
export const N = 1;
export const E = 2;
export const S = 4;
export const W = 8;

export type PieceRole =
  | 'floor'
  | 'wall_h_end'
  | 'wall_h'
  | 'wall_v_end'
  | 'wall_v_short'
  | 'pillar'
  | 'door_frame'
  | 'corner_unused'
  | 'block_top'
  | 'block'
  | 'stairs'
  | 'roof';

export interface TemplatePiece {
  index: number;
  width: number;
  height: number;
  role: PieceRole;
  /** What the piece is, in Spanish (docs/ASSETS.md). */
  label: string;
  /** Rows of the piece, top to bottom: remate (cap), borde superior (top edge), cara (front face). */
  rows?: { cap: number; top: number; face: number };
}

/**
 * The 20 pieces of the Building kit template, in reading order (rows top to
 * bottom, then left to right). Classified on the contact sheets of the four
 * kits (maps/preview/tiles/kit_*-piezas.png): the basement and the fence
 * tell the light top edge from the dark face, and share the sizes and
 * places with the interior and the facade.
 */
export const KIT_TEMPLATE: readonly TemplatePiece[] = [
  { index: 0, width: 32, height: 19, role: 'floor', label: 'suelo (muestra)' },
  { index: 1, width: 32, height: 25, role: 'wall_h_end', label: 'tramo horizontal con cara y remate al este', rows: { cap: 0, top: 7, face: 18 } },
  { index: 2, width: 12, height: 37, role: 'wall_v_end', label: 'tramo vertical que acaba al sur, cara doble', rows: { cap: 5, top: 14, face: 18 } },
  { index: 3, width: 12, height: 25, role: 'pillar', label: 'pilar, cara doble', rows: { cap: 7, top: 0, face: 18 } },
  { index: 4, width: 12, height: 31, role: 'door_frame', label: 'marco de puerta largo, cara simple', rows: { cap: 5, top: 8, face: 18 } },
  { index: 5, width: 22, height: 25, role: 'wall_h', label: 'tramo horizontal con cara, sin remates', rows: { cap: 0, top: 7, face: 18 } },
  { index: 6, width: 12, height: 25, role: 'door_frame', label: 'marco de puerta corto, cara simple', rows: { cap: 7, top: 0, face: 18 } },
  { index: 7, width: 32, height: 25, role: 'corner_unused', label: 'esquina NO con la pata como cara (no cumple la 3/4)' },
  { index: 8, width: 32, height: 25, role: 'corner_unused', label: 'esquina NE con la pata como cara (no cumple la 3/4)' },
  { index: 9, width: 12, height: 25, role: 'wall_v_short', label: 'tramo vertical, cara corta, cara doble', rows: { cap: 5, top: 14, face: 6 } },
  { index: 10, width: 12, height: 37, role: 'wall_v_end', label: 'tramo vertical que acaba al sur (igual que #02)', rows: { cap: 5, top: 14, face: 18 } },
  { index: 11, width: 32, height: 28, role: 'block_top', label: 'borde superior ancho (muro grueso), sin cara' },
  { index: 12, width: 32, height: 37, role: 'block', label: 'muro grueso con cara' },
  { index: 13, width: 32, height: 28, role: 'stairs', label: 'escalera, sin cara' },
  { index: 14, width: 32, height: 37, role: 'stairs', label: 'escalera con cara' },
  { index: 15, width: 32, height: 19, role: 'roof', label: 'tejado o segundo suelo (muestra)' },
  { index: 16, width: 12, height: 25, role: 'wall_v_short', label: 'tramo vertical, cara corta, cara simple', rows: { cap: 5, top: 14, face: 6 } },
  { index: 17, width: 12, height: 37, role: 'wall_v_end', label: 'tramo vertical que acaba al sur, cara simple', rows: { cap: 5, top: 14, face: 18 } },
  { index: 18, width: 32, height: 25, role: 'corner_unused', label: 'esquina NO, pata estrecha (no cumple la 3/4)' },
  { index: 19, width: 32, height: 25, role: 'corner_unused', label: 'esquina NE, pata estrecha (no cumple la 3/4)' },
];

/** The pieces of a kit, checked against the template (count and sizes). */
export function kitPieces(img: Frame, name: string): { piece: Piece; frame: Frame }[] {
  const pieces = detectPieces(img, TILE);
  if (pieces.length !== KIT_TEMPLATE.length) {
    throw new Error(`${name}: ${pieces.length} piezas detectadas, la plantilla tiene ${KIT_TEMPLATE.length}`);
  }
  return pieces.map((piece, i) => {
    const t = KIT_TEMPLATE[i];
    if (!t || t.width !== piece.width || t.height !== piece.height) {
      throw new Error(`${name}: la pieza #${i} mide ${piece.width}×${piece.height} y la plantilla espera ${t?.width}×${t?.height}`);
    }
    return { piece, frame: cut(img, piece.x, piece.y, piece.width, piece.height) };
  });
}

export function mirrorX(f: Frame): Frame {
  const out = blank(f.width, f.height);
  for (let y = 0; y < f.height; y++) {
    for (let x = 0; x < f.width; x++) {
      const s = (y * f.width + x) * 4;
      out.pixels.set(f.pixels.subarray(s, s + 4), (y * f.width + (f.width - 1 - x)) * 4);
    }
  }
  return out;
}

/** Vertical flip: only for parts without a front face (top edges, floors). */
export function flipY(f: Frame): Frame {
  const out = blank(f.width, f.height);
  for (let y = 0; y < f.height; y++) out.pixels.set(f.pixels.subarray(y * f.width * 4, (y + 1) * f.width * 4), (f.height - 1 - y) * f.width * 4);
  return out;
}

/** Stacks frames of the same width top to bottom. */
function stackY(frames: Frame[]): Frame {
  const out = blank(frames[0]?.width ?? 0, frames.reduce((h, f) => h + f.height, 0));
  let y = 0;
  for (const f of frames) {
    paste(out, f, 0, y);
    y += f.height;
  }
  return out;
}

/** Joins frames of the same height left to right. */
function joinX(frames: Frame[]): Frame {
  const out = blank(frames.reduce((w, f) => w + f.width, 0), frames[0]?.height ?? 0);
  let x = 0;
  for (const f of frames) {
    paste(out, f, x, 0);
    x += f.width;
  }
  return out;
}

/** Colour distance between column `a` of one frame and column `b` of another (how visible the seam would be). */
function columnSeam(f: Frame, a: number, g: Frame, b: number): number {
  let sum = 0;
  for (let y = 0; y < Math.min(f.height, g.height); y++) {
    for (let c = 0; c < 3; c++) sum += Math.abs((f.pixels[(y * f.width + a) * 4 + c] ?? 0) - (g.pixels[(y * g.width + b) * 4 + c] ?? 0));
  }
  return sum;
}

/** The building blocks every tile is cut from. */
export interface WallParts {
  /** Plain horizontal wall, 32 px wide and tileable: band (7) + face (18). */
  horizontal: Frame;
  /** Horizontal wall ending at its east edge (with its trim or end post), 32×25. */
  horizontalEnd: Frame;
  /** Top edge of a vertical wall, without cap or face, 12×32 (tiles with itself vertically). */
  verticalTop: Frame;
  /** Cap that closes a vertical top edge at its north end, 12×5. */
  verticalCap: Frame;
  /** Front face at the south end of a vertical wall, 12×18. */
  verticalFace: Frame;
  /** A free-standing pillar: cap (7) + face (18), 12×25. */
  pillar: Frame;
  /** Wide top edge of a thick wall, without face, 32×32 (tiles with itself vertically). */
  blockTop: Frame;
}

/**
 * Picks the parts out of the kit pieces:
 *   - horizontal: the plain piece #05 (22 px) widened to 32 with the
 *     10 columns of itself that leave the least visible seams;
 *   - horizontalEnd: #01, whose right edge closes the wall;
 *   - vertical top edge: the face-free rows of #02, mirrored vertically
 *     (allowed: no face) until they cover 32 rows;
 *   - cap and face of a vertical wall: the first and last rows of #02;
 *   - pillar: #03.
 */
export function wallParts(pieces: readonly { frame: Frame }[]): WallParts {
  const at = (i: number): Frame => {
    const f = pieces[i]?.frame;
    if (!f) throw new Error(`falta la pieza #${i} del kit`);
    return f;
  };
  const plain = at(5);
  let best = { cost: Infinity, offset: 0 };
  for (let offset = 0; offset + (TILE - plain.width) <= plain.width; offset++) {
    const last = offset + TILE - plain.width - 1;
    const cost = columnSeam(plain, plain.width - 1, plain, offset) + columnSeam(plain, last, plain, 0);
    if (cost < best.cost) best = { cost, offset };
  }
  const horizontal = joinX([plain, cut(plain, best.offset, 0, TILE - plain.width, plain.height)]);

  const v = at(2);
  const rows = KIT_TEMPLATE[2]?.rows ?? { cap: 5, top: 14, face: 18 };
  const top = cut(v, 0, rows.cap, v.width, rows.top);
  const parts: Frame[] = [];
  let height = 0;
  for (let i = 0; height < TILE; i++) {
    const f = i % 2 === 0 ? top : flipY(top);
    parts.push(f);
    height += f.height;
  }
  const verticalTop = cut(stackY(parts), 0, 0, v.width, TILE);

  return {
    horizontal,
    horizontalEnd: at(1),
    verticalTop,
    verticalCap: cut(v, 0, 0, v.width, rows.cap),
    verticalFace: cut(v, 0, rows.cap + rows.top, v.width, rows.face),
    pillar: at(3),
    blockTop: cut(stackY([at(11), flipY(at(11))]), 0, 0, TILE, TILE),
  };
}

/** Copies columns [x0, x1] and rows [y0, y1] of `src` to the same place in `dst`. */
function copyRegion(dst: Frame, src: Frame, srcX: number, srcY: number, w: number, h: number, dstX: number, dstY: number): void {
  if (w <= 0 || h <= 0) return;
  paste(dst, cut(src, srcX, srcY, w, h), dstX, dstY);
}

/** The tile for one neighbour mask (N=1, E=2, S=4, W=8), 32×32 with transparency. */
export function wallTile(parts: WallParts, mask: number): Frame {
  const out = blank(TILE, TILE);
  const n = (mask & N) !== 0;
  const e = (mask & E) !== 0;
  const s = (mask & S) !== 0;
  const w = (mask & W) !== 0;
  const sx = STRIP.x;
  const sw = STRIP.width;
  const top = parts.verticalTop;

  if (!e && !w) {
    if (!n && !s) {
      paste(out, parts.pillar, sx, BAND.y);
      return out;
    }
    // A vertical wall: its top edge, closed by a cap at the north end and by its face at the south end.
    const y0 = n ? 0 : BAND.y;
    const y1 = s ? TILE : FACE.y;
    copyRegion(out, top, 0, y0, sw, y1 - y0, sx, y0);
    if (!n) paste(out, parts.verticalCap, sx, BAND.y);
    if (!s) paste(out, parts.verticalFace, sx, FACE.y);
    return out;
  }

  // Horizontal arms: band + face across the arms; the strip continues north and south as top edge.
  if (n) copyRegion(out, top, 0, 0, sw, BAND.y, sx, 0);
  if (s) copyRegion(out, top, 0, FACE.y, sw, TILE - FACE.y, sx, FACE.y);
  const h = parts.horizontal;
  const bandX0 = w ? 0 : sx;
  const bandX1 = e ? TILE : sx + sw;
  copyRegion(out, h, bandX0, 0, bandX1 - bandX0, BAND.height, bandX0, BAND.y);
  const faceSpans: [number, number][] = [];
  if (w) faceSpans.push([0, sx]);
  if (!s) faceSpans.push([sx, sx + sw]);
  if (e) faceSpans.push([sx + sw, TILE]);
  for (const [x0, x1] of faceSpans) copyRegion(out, h, x0, BAND.height, x1 - x0, FACE.height, x0, FACE.y);
  // Where the wall ends without turning (no south strip), its face and band close with the end piece.
  if (!s) {
    const end = parts.horizontalEnd;
    const endWidth = TILE - sx;
    if (!e) copyRegion(out, end, TILE - endWidth, 0, endWidth, end.height, 0, BAND.y);
    if (!w) copyRegion(out, mirrorX(end), 0, 0, endWidth, end.height, sx, BAND.y);
  }
  return out;
}

/**
 * A solid tile of a thick wall: wide top edge; with the north open it
 * starts at the band's height (the floor north shows above), with the south
 * open it ends in the band's front edge and the face.
 */
export function solidTile(parts: WallParts, northOpen: boolean, southOpen: boolean): Frame {
  const out = blank(TILE, TILE);
  const y0 = northOpen ? BAND.y : 0;
  const y1 = southOpen ? BAND.y : TILE;
  copyRegion(out, parts.blockTop, 0, y0, TILE, y1 - y0, 0, y0);
  if (southOpen) copyRegion(out, parts.horizontal, 0, 0, TILE, parts.horizontal.height, 0, BAND.y);
  return out;
}

/** The 20 tiles: index = mask for the 16 thin walls, then the 4 solid tiles of thick walls. */
export function wallAutotile(parts: WallParts): Frame[] {
  const thin = Array.from({ length: 16 }, (_, mask) => wallTile(parts, mask));
  const solid = Array.from({ length: 4 }, (_, i) => solidTile(parts, (i & SOLID_NORTH_OPEN) !== 0, (i & SOLID_SOUTH_OPEN) !== 0));
  return [...thin, ...solid];
}

/** Caption of a tile of the autotile. */
export function tileLabel(index: number): string {
  if (index < SOLID_BASE) return maskLabel(index);
  const i = index - SOLID_BASE;
  return `MACIZO ${i & SOLID_NORTH_OPEN ? 'N' : '-'}${i & SOLID_SOUTH_OPEN ? 'S' : '-'}`;
}

/** Cells of a plan that belong to a thick wall: inside some 2×2 square of walls. */
export function solidCells(width: number, height: number, isWall: (x: number, y: number) => boolean): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y + 1 < height; y++) {
    for (let x = 0; x + 1 < width; x++) {
      if (isWall(x, y) && isWall(x + 1, y) && isWall(x, y + 1) && isWall(x + 1, y + 1)) {
        out[y * width + x] = out[y * width + x + 1] = out[(y + 1) * width + x] = out[(y + 1) * width + x + 1] = 1;
      }
    }
  }
  return out;
}

/** "N E S W" with a dash for each missing neighbour, e.g. "N-S-". */
export function maskLabel(mask: number): string {
  return `${mask & N ? 'N' : '-'}${mask & E ? 'E' : '-'}${mask & S ? 'S' : '-'}${mask & W ? 'O' : '-'}`;
}

/** Mask of a wall cell from a predicate that says which cells are walls. */
export function wallMask(isWall: (x: number, y: number) => boolean, x: number, y: number): number {
  return (isWall(x, y - 1) ? N : 0) | (isWall(x + 1, y) ? E : 0) | (isWall(x, y + 1) ? S : 0) | (isWall(x - 1, y) ? W : 0);
}
