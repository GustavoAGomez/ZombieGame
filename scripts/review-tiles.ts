/**
 * npm run tiles:review — review sheets for the wall kits and the Wang
 * tilesets, to open and check by eye before importing (docs/ASSETS.md §7).
 * It only writes review files, never the game's assets:
 *
 *   art-src/pixellab/<kit>/pieces/<kit>-NN.png   every piece of a kit, by connected components
 *   maps/preview/tiles/<kit>-piezas.png          contact sheet of the pieces, numbered and classified
 *   maps/preview/tiles/<kit>-autotile.png        the 16 wall cases (mask N/E/S/O)
 *   maps/preview/tiles/<kit>-prueba.png          a test plan: L-shaped room, T junctions, a cross, door gaps, a pillar, thick walls
 *   maps/preview/tiles/<tileset>-wang.png        Wang tiles with their measured corners
 *   maps/preview/tiles/<tileset>-wang-prueba.png terrain drawn by vertices with the measured table
 *   maps/preview/tiles/floors_interior-celdas.png the 16 floor cells: kept area, 32×32 tile and a 3×3 repeat
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { blitScaled, contactSheet, drawText, fillRect, textWidth, type Rgb } from './lib/contact-sheet';
import { floorCells } from './lib/floor-cells';
import { decodePng, encodePng } from './lib/png';
import { blank, cut, paste, type Frame } from './lib/sheet';
import { KIT_TEMPLATE, SOLID_BASE, SOLID_NORTH_OPEN, SOLID_SOUTH_OPEN, TILE, kitPieces, solidCells, tileLabel, wallAutotile, wallMask, wallParts } from './lib/wall-autotile';
import { measureWangSheet, orderTerrains, type TerrainRule, type WangMeasurement } from './lib/wang';

export const REVIEW_KITS = ['kit_interior', 'kit_exterior', 'kit_basement', 'kit_fence'] as const;
export const REVIEW_WANG: readonly { group: string; terrains: readonly [string, string]; first: TerrainRule }[] = [
  { group: 'tileset_street', terrains: ['asfalto', 'acera'], first: 'darker' },
  { group: 'tileset_pool', terrains: ['agua', 'cubierta'], first: 'darker' },
  { group: 'tileset_garden', terrains: ['patio', 'cesped'], first: 'lessSaturated' },
];

/** Test plan for the walls: # = wall, . = floor. */
export const WALL_TEST_PLAN = [
  '##########......',
  '#....#...#..###.',
  '#....#...#..###.',
  '#........#......',
  '#....#...######.',
  '#....#........#.',
  '##...#........#.',
  '##...##..######.',
  '#....#....###...',
  '#######....#.#..',
];

function readFrame(path: string): Frame {
  const png = decodePng(readFileSync(path));
  return { width: png.width, height: png.height, pixels: png.pixels };
}

function write(path: string, f: Frame): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, encodePng(f.width, f.height, f.pixels));
}

/** Solid background for the 16 cases, so each shape reads clearly. */
function solidTile(rgb: Rgb): Frame {
  const out = blank(TILE, TILE);
  fillRect(out, 0, 0, TILE, TILE, rgb);
  return out;
}

/** Floor for the test plan: a real floor of the game that contrasts with the kit (grass for the fence, wood elsewhere). */
function testFloor(root: string, kit: string): Frame {
  const [file, id] = kit === 'kit_fence' ? ['tileset_garden', 16] : ['floors_interior', 0];
  const sheet = readFrame(resolve(root, 'public/assets/tiles', `${file}.png`));
  const cols = Math.floor(sheet.width / TILE);
  return cut(sheet, (id % cols) * TILE, Math.floor(id / cols) * TILE, TILE, TILE);
}

function over(base: Frame, top: Frame): Frame {
  const out = blank(base.width, base.height);
  paste(out, base, 0, 0);
  blitScaled(out, top, 0, 0, 1);
  return out;
}

/** Renders a plan of walls with the autotile, plus the same plan with each wall's mask written on it. */
function renderWallTest(tiles: Frame[], floor: Frame, plan: readonly string[]): Frame {
  const h = plan.length;
  const w = Math.max(...plan.map((r) => r.length));
  const isWall = (x: number, y: number): boolean => plan[y]?.[x] === '#';
  const solid = solidCells(w, h, isWall);
  const tileAt = (x: number, y: number): number =>
    solid[y * w + x]
      ? SOLID_BASE + (isWall(x, y - 1) ? 0 : SOLID_NORTH_OPEN) + (isWall(x, y + 1) ? 0 : SOLID_SOUTH_OPEN)
      : wallMask(isWall, x, y);
  const scale = 3;
  const gap = 24;
  const out = blank(w * TILE * scale * 2 + gap, h * TILE * scale + 40);
  fillRect(out, 0, 0, out.width, out.height, [24, 22, 26]);
  drawText(out, 'PLANO DE PRUEBA', 4, 4, [240, 200, 120], 3);
  drawText(out, 'MASCARA (N=1 E=2 S=4 O=8)', w * TILE * scale + gap, 4, [240, 200, 120], 3);
  const map = blank(w * TILE, h * TILE);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) paste(map, floor, x * TILE, y * TILE);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isWall(x, y)) continue;
      const tile = tiles[tileAt(x, y)];
      if (tile) blitScaled(map, tile, x * TILE, y * TILE, 1);
    }
  }
  blitScaled(out, map, 0, 40, scale);
  blitScaled(out, map, w * TILE * scale + gap, 40, scale);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!isWall(x, y)) continue;
      const label = String(tileAt(x, y));
      const px = w * TILE * scale + gap + x * TILE * scale + (TILE * scale - textWidth(label, 3)) / 2;
      const py = 40 + y * TILE * scale + (TILE * scale - 15) / 2;
      fillRect(out, px - 3, py - 3, textWidth(label, 3) + 6, 21, [0, 0, 0]);
      drawText(out, label, px, py, [255, 230, 90], 3);
    }
  }
  return out;
}

export function reviewKit(root: string, kit: string): { pieces: number } {
  const img = readFrame(resolve(root, 'art-src/pixellab', kit, `${kit}.png`));
  const pieces = kitPieces(img, kit);
  pieces.forEach(({ frame }, i) => write(resolve(root, 'art-src/pixellab', kit, 'pieces', `${kit}-${String(i).padStart(2, '0')}.png`), frame));
  const out = resolve(root, 'maps/preview/tiles');
  write(
    resolve(out, `${kit}-piezas.png`),
    contactSheet(
      pieces.map(({ piece, frame }, i) => {
        const t = KIT_TEMPLATE[i];
        const rows = t?.rows ? `REM ${t.rows.cap} BORDE ${t.rows.top} CARA ${t.rows.face}` : '';
        return { frame, caption: [`#${String(i).padStart(2, '0')} ${piece.width}X${piece.height}`, t?.role ?? '', rows] };
      }),
      { columns: 5, scale: 5, title: `${kit}: piezas por componentes conexos` },
    ),
  );
  const tiles = wallAutotile(wallParts(pieces));
  const background = solidTile([46, 70, 84]);
  write(
    resolve(out, `${kit}-autotile.png`),
    contactSheet(
      tiles.map((tile, i) => ({ frame: over(background, tile), caption: [i < SOLID_BASE ? `MASCARA ${i}` : `TILE ${i}`, tileLabel(i)] })),
      { columns: 4, scale: 5, title: `${kit}: 16 casos de pared (N E S O) y 4 de muro grueso` },
    ),
  );
  write(resolve(out, `${kit}-prueba.png`), renderWallTest(tiles, testFloor(root, kit), WALL_TEST_PLAN));
  return { pieces: pieces.length };
}

const rgbOf = (color: string): Rgb => [1, 3, 5].map((i) => Number.parseInt(color.slice(i, i + 2), 16)) as unknown as Rgb;

/** The measured corner table: code "NWNESWSE" → tile ids. */
export function wangTable(m: WangMeasurement): Map<string, number[]> {
  const table = new Map<string, number[]>();
  for (const t of m.tiles) table.set(t.corners.join(''), [...(table.get(t.corners.join('')) ?? []), t.id]);
  return table;
}

/** Test terrain defined by vertices (11×9): an irregular blob of terrain 0 inside terrain 1. */
export const WANG_TEST_VERTICES = [
  '11111111111',
  '11100111111',
  '11000011111',
  '11000001111',
  '11100000011',
  '11110000011',
  '11110011111',
  '11111011111',
  '11111111111',
];

function renderWangTest(img: Frame, m: WangMeasurement): Frame {
  const table = wangTable(m);
  const vy = WANG_TEST_VERTICES.length;
  const vx = WANG_TEST_VERTICES[0]?.length ?? 0;
  const map = blank((vx - 1) * TILE, (vy - 1) * TILE);
  const cols = Math.floor(img.width / TILE);
  for (let y = 0; y < vy - 1; y++) {
    for (let x = 0; x < vx - 1; x++) {
      const v = (cx: number, cy: number): string => WANG_TEST_VERTICES[cy]?.[cx] ?? '1';
      const code = `${v(x, y)}${v(x + 1, y)}${v(x, y + 1)}${v(x + 1, y + 1)}`;
      const ids = table.get(code) ?? [];
      const id = ids[(x * 7 + y * 3) % Math.max(1, ids.length)] ?? 0;
      paste(map, cut(img, (id % cols) * TILE, Math.floor(id / cols) * TILE, TILE, TILE), x * TILE, y * TILE);
    }
  }
  const scale = 3;
  const out = blank(map.width * scale, map.height * scale + 40);
  fillRect(out, 0, 0, out.width, out.height, [24, 22, 26]);
  drawText(out, 'TERRENO POR VERTICES (TABLA MEDIDA)', 4, 4, [240, 200, 120], 3);
  blitScaled(out, map, 0, 40, scale);
  return out;
}

export function reviewWang(root: string, set: (typeof REVIEW_WANG)[number]): WangMeasurement {
  const img = readFrame(resolve(root, 'art-src/pixellab', set.group, `${set.group}.png`));
  const m = orderTerrains(measureWangSheet(img, TILE), set.first);
  const cols = Math.floor(img.width / TILE);
  const colors = m.colors.map(rgbOf);
  const entries = m.tiles.map((t) => {
    const frame = blank(TILE + 8, TILE + 8);
    fillRect(frame, 0, 0, frame.width, frame.height, [24, 22, 26]);
    paste(frame, cut(img, (t.id % cols) * TILE, Math.floor(t.id / cols) * TILE, TILE, TILE), 4, 4);
    // A marker at each corner, in the measured terrain's colour with a contrasting rim.
    [
      [0, 0],
      [TILE + 2, 0],
      [0, TILE + 2],
      [TILE + 2, TILE + 2],
    ].forEach(([x = 0, y = 0], k) => {
      const terrain = t.corners[k] ?? 0;
      fillRect(frame, x, y, 6, 6, terrain === 0 ? [255, 255, 255] : [0, 0, 0]);
      fillRect(frame, x + 1, y + 1, 4, 4, colors[terrain] ?? [255, 0, 255]);
    });
    const name = (c: number): string => (set.terrains[c] ?? '?').slice(0, 3);
    return {
      frame,
      caption: [`#${t.id} (${t.col},${t.row}) ${t.corners.join('')}`, `${name(t.corners[0])} ${name(t.corners[1])}`, `${name(t.corners[2])} ${name(t.corners[3])}`],
    };
  });
  const out = resolve(root, 'maps/preview/tiles');
  write(
    resolve(out, `${set.group}-wang.png`),
    contactSheet(entries, { columns: 6, scale: 4, title: `${set.group}: 0=${set.terrains[0]} 1=${set.terrains[1]} (NO NE SO SE)` }),
  );
  write(resolve(out, `${set.group}-wang-prueba.png`), renderWangTest(img, m));
  return m;
}

/** Floor cells: the kept area marked on the export, the tile, and the tile repeated 3×3 (a grid would show here). */
export function reviewFloors(root: string): number {
  const img = readFrame(resolve(root, 'art-src/pixellab/floors_interior/floors_interior.png'));
  const cells = floorCells(img);
  const entries = cells.map((c, i) => {
    const source = cut(img, c.source.x, c.source.y, c.source.width, c.source.height);
    const frame = blank(48 + 8 + TILE * 3, Math.max(48, TILE * 3));
    fillRect(frame, 0, 0, frame.width, frame.height, [24, 22, 26]);
    paste(frame, source, 0, 0);
    // The kept area: everything outside it is darkened.
    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const inside = x >= c.kept.x - c.source.x && x < c.kept.x - c.source.x + c.kept.width && y >= c.kept.y - c.source.y && y < c.kept.y - c.source.y + c.kept.height;
        if (!inside) fillRect(frame, x, y, 1, 1, [255, 0, 160]);
      }
    }
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 3; tx++) paste(frame, c.tile, 56 + tx * TILE, ty * TILE);
    const material = ['MADERA', 'LINOLEO', 'BANO', 'HORMIGON'][Math.floor(i / 4)] ?? '';
    return { frame, caption: [`#${i} ${material} V${i % 4}`, `${c.source.width}X${c.source.height} -> ${c.kept.width}X${c.kept.height}`] };
  });
  write(
    resolve(root, 'maps/preview/tiles/floors_interior-celdas.png'),
    contactSheet(entries, { columns: 4, scale: 3, title: 'floors_interior: celda (rosa = descartado), baldosa y repeticion 3x3' }),
  );
  return cells.length;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  for (const kit of REVIEW_KITS) {
    const r = reviewKit(root, kit);
    console.info(`✓ ${kit}: ${r.pieces} piezas → maps/preview/tiles/${kit}-{piezas,autotile,prueba}.png`);
  }
  console.info(`✓ floors_interior: ${reviewFloors(root)} celdas → maps/preview/tiles/floors_interior-celdas.png`);
  for (const set of REVIEW_WANG) {
    const m = reviewWang(root, set);
    const table = [...wangTable(m)].sort(([a], [b]) => a.localeCompare(b)).map(([code, ids]) => `${code}→${ids.join('/')}`);
    console.info(`✓ ${set.group}: ${m.missing.length === 0 ? '16/16' : `faltan ${m.missing.join(', ')}`} · ${table.join(' ')}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
