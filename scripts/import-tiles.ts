/**
 * npm run tiles:import — turns the PixelLab tile exports in
 * art-src/pixellab/<group>/<group>.png (see that folder's README.md) into
 *   - clean sheets in public/assets/tiles/<tileset>.png, and
 *   - Tiled tilesets in art-src/tiled/tilesets/<tileset>.tsj
 *     (wangsets, collides / water / void / material / piece properties),
 * and registers every tileset in public/assets/manifest.json.
 * Formats are measured on every run (docs/specs/02-mapa-mansion.md §1).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { detectPieces } from './lib/kit';
import { decodePng, encodePng } from './lib/png';
import { blank, cut, downscaleByMode, fillTransparent, opaqueBounds, paste, type Frame } from './lib/sheet';
import { prop, tileset, type Tsj } from './lib/tiled-tileset';
import { cornerWangId, cornersOf, measureWangSheet } from './lib/wang';

const TILE = 32;

/** Terrain names in measured order: terrain 0 is the plain tile at (0,3). */
export const WANG_SETS = [
  { group: 'tileset_street', terrains: ['asfalto', 'acera'] as const, water: -1 },
  { group: 'tileset_pool', terrains: ['agua', 'cubierta'] as const, water: 0 },
  { group: 'tileset_garden', terrains: ['patio', 'cesped'] as const, water: -1 },
] as const;

/** Tiles with at least this many water corners block bodies (but not bullets). */
export const WATER_MIN_CORNERS = 2;

export const FLOOR_MATERIALS = ['madera', 'linoleo', 'bano', 'hormigon'] as const;

export const KITS = ['kit_interior', 'kit_exterior', 'kit_basement', 'kit_fence'] as const;
export const KIT_CELL = { width: 32, height: 48, columns: 5 } as const;

/** Role of each piece in reading order (the four kits share this template). */
export const KIT_PIECES: readonly { piece: string; collides: boolean }[] = [
  { piece: 'floor_persp', collides: false },
  { piece: 'wall_h', collides: true },
  { piece: 'wall_v_long', collides: true },
  { piece: 'wall_v_end', collides: true },
  { piece: 'wall_v', collides: true },
  { piece: 'door_jamb', collides: true },
  { piece: 'pillar', collides: true },
  { piece: 'corner_tl', collides: true },
  { piece: 'corner_tr', collides: true },
  { piece: 'pillar', collides: true },
  { piece: 'wall_v_long', collides: true },
  { piece: 'wall_low', collides: true },
  { piece: 'wall_high', collides: true },
  { piece: 'stairs', collides: false },
  { piece: 'stairs', collides: false },
  { piece: 'roof_persp', collides: false },
  { piece: 'pillar', collides: true },
  { piece: 'wall_v_long', collides: true },
  { piece: 'corner_bl', collides: true },
  { piece: 'corner_br', collides: true },
];

export const DECALS = ['decals_asphalt', 'decals_grass'] as const;

/** Grid of the floors and decals sheets: cells of 48 px with 1 px gaps. */
const GRID48 = { cell: 48, pitch: 49, columns: 4, rows: 4 } as const;

interface Paths {
  root: string;
  source: (group: string) => string;
  sheet: (name: string) => string;
  tsj: (name: string) => string;
}

function paths(root: string): Paths {
  return {
    root,
    source: (group) => resolve(root, 'art-src/pixellab', group, `${group}.png`),
    sheet: (name) => resolve(root, 'public/assets/tiles', `${name}.png`),
    tsj: (name) => resolve(root, 'art-src/tiled/tilesets', `${name}.tsj`),
  };
}

function readFrame(path: string): Frame {
  const png = decodePng(readFileSync(path));
  return { width: png.width, height: png.height, pixels: png.pixels };
}

function writeSheet(p: Paths, name: string, frame: Frame): void {
  mkdirSync(dirname(p.sheet(name)), { recursive: true });
  writeFileSync(p.sheet(name), encodePng(frame.width, frame.height, frame.pixels));
}

function writeTsj(p: Paths, tsj: Tsj): void {
  mkdirSync(dirname(p.tsj(tsj.name)), { recursive: true });
  writeFileSync(p.tsj(tsj.name), `${JSON.stringify(tsj, null, 2)}\n`);
}

/** Image path as written inside the .tsj (relative, so Tiled finds it). */
function imagePath(p: Paths, name: string): string {
  return relative(dirname(p.tsj(name)), p.sheet(name)).split('\\').join('/');
}

export interface ImportedTileset {
  name: string;
  tileWidth: number;
  tileHeight: number;
}

function importWang(p: Paths, set: (typeof WANG_SETS)[number], log: (l: string) => void): ImportedTileset {
  const img = readFrame(p.source(set.group));
  if (img.width % TILE || img.height % TILE) throw new Error(`${set.group}: ${img.width}×${img.height} no es múltiplo de ${TILE}`);
  const m = measureWangSheet(img, TILE);
  if (m.missing.length > 0) throw new Error(`${set.group}: faltan combinaciones de esquinas ${m.missing.join(', ')}`);
  writeSheet(p, set.group, img);
  const tsj = tileset(set.group, imagePath(p, set.group), img.width, img.height, TILE, TILE);
  const water: number[] = [];
  tsj.tiles = m.tiles.map((t) => {
    const isWater = set.water >= 0 && cornersOf(t.corners, set.water) >= WATER_MIN_CORNERS;
    if (isWater) water.push(t.id);
    return { id: t.id, properties: [prop('terrain_corners', t.corners.join('')), ...(isWater ? [prop('water', true)] : [])] };
  });
  tsj.wangsets = [
    {
      name: `${set.terrains[0]}-${set.terrains[1]}`,
      type: 'corner',
      tile: -1,
      colors: set.terrains.map((name, i) => ({ name, color: m.colors[i] ?? '#000000', probability: 1, tile: -1 })),
      wangtiles: m.tiles.map((t) => ({ tileid: t.id, wangid: cornerWangId(t.corners) })),
    },
  ];
  writeTsj(p, tsj);
  log(`  ✓ ${set.group}: ${m.tiles.length} tiles, 16/16 combinaciones de esquinas${water.length ? `, agua en ${water.join(', ')}` : ''}`);
  return { name: set.group, tileWidth: TILE, tileHeight: TILE };
}

function importFloors(p: Paths, log: (l: string) => void): ImportedTileset {
  const name = 'floors_interior';
  const img = readFrame(p.source(name));
  const out = blank(GRID48.columns * TILE, GRID48.rows * TILE);
  let filled = 0;
  let cropped = 0;
  for (let row = 0; row < GRID48.rows; row++) {
    for (let col = 0; col < GRID48.columns; col++) {
      let cell = cut(img, col * GRID48.pitch, row * GRID48.pitch, GRID48.cell, GRID48.cell);
      // Some cells come smaller than the grid (transparent margins): use just their content.
      const b = opaqueBounds(cell);
      if (b && (b.maxX - b.minX + 1 < GRID48.cell || b.maxY - b.minY + 1 < GRID48.cell)) {
        cell = cut(cell, b.minX, b.minY, b.maxX - b.minX + 1, b.maxY - b.minY + 1);
        cropped++;
      }
      filled += fillTransparent(cell);
      paste(out, downscaleByMode(cell, TILE, TILE), col * TILE, row * TILE);
    }
  }
  writeSheet(p, name, out);
  const tsj = tileset(name, imagePath(p, name), out.width, out.height, TILE, TILE);
  tsj.tiles = Array.from({ length: 16 }, (_, id) => ({ id, properties: [prop('material', FLOOR_MATERIALS[Math.floor(id / 4)] ?? 'madera')] }));
  writeTsj(p, tsj);
  log(
    `  ⚠ ${name}: celdas de ${GRID48.cell}×${GRID48.cell} reducidas a ${TILE}×${TILE} (provisional)` +
      `${cropped ? `; ${cropped} celdas más pequeñas que la rejilla, recortadas a su contenido` : ''}` +
      `${filled ? `; ${filled} píxeles transparentes rellenados` : ''}`,
  );
  return { name, tileWidth: TILE, tileHeight: TILE };
}

function importKit(p: Paths, name: string, log: (l: string) => void): ImportedTileset {
  const img = readFrame(p.source(name));
  const pieces = detectPieces(img, TILE);
  if (pieces.length !== KIT_PIECES.length) {
    throw new Error(`${name}: ${pieces.length} piezas detectadas, se esperaban ${KIT_PIECES.length} (plantilla de los kits)`);
  }
  const rows = Math.ceil(pieces.length / KIT_CELL.columns);
  const out = blank(KIT_CELL.columns * KIT_CELL.width, rows * KIT_CELL.height);
  for (const piece of pieces) {
    const col = piece.index % KIT_CELL.columns;
    const row = Math.floor(piece.index / KIT_CELL.columns);
    // Bottom-aligned in its cell, keeping its place inside the column (flush left or centred).
    const x = col * KIT_CELL.width + Math.min(piece.columnOffset, KIT_CELL.width - piece.width);
    const y = row * KIT_CELL.height + KIT_CELL.height - piece.height;
    paste(out, cut(img, piece.x, piece.y, piece.width, piece.height), x, y);
  }
  writeSheet(p, name, out);
  const tsj = tileset(name, imagePath(p, name), out.width, out.height, KIT_CELL.width, KIT_CELL.height);
  tsj.objectalignment = 'bottomleft';
  tsj.tiles = KIT_PIECES.map((role, id) => ({
    id,
    properties: [prop('piece', role.piece), ...(role.collides ? [prop('collides', true)] : [])],
  }));
  writeTsj(p, tsj);
  log(`  ✓ ${name}: ${pieces.length} piezas por caja delimitadora → celdas de ${KIT_CELL.width}×${KIT_CELL.height}`);
  return { name, tileWidth: KIT_CELL.width, tileHeight: KIT_CELL.height };
}

function importDecals(p: Paths, name: string, log: (l: string) => void): ImportedTileset {
  const img = readFrame(p.source(name));
  const out = blank(GRID48.columns * GRID48.cell, GRID48.rows * GRID48.cell);
  for (let row = 0; row < GRID48.rows; row++) {
    for (let col = 0; col < GRID48.columns; col++) {
      paste(out, cut(img, col * GRID48.pitch, row * GRID48.pitch, GRID48.cell, GRID48.cell), col * GRID48.cell, row * GRID48.cell);
    }
  }
  writeSheet(p, name, out);
  writeTsj(p, tileset(name, imagePath(p, name), out.width, out.height, GRID48.cell, GRID48.cell));
  log(`  ✓ ${name}: 16 decals de ${GRID48.cell}×${GRID48.cell} (sin separaciones)`);
  return { name, tileWidth: GRID48.cell, tileHeight: GRID48.cell };
}

/** Deterministic value noise in [0, 1) for the generated dirt tile. */
function hashNoise(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/**
 * Generated by us (no PixelLab art yet):
 *   id 0 = void (blocks bodies), id 1 = dark ground under walls,
 *   id 2 = trodden dirt, a provisional tile until there is a dirt tileset
 *   (docs/ASSETS-TODO.md). It tiles seamlessly: the noise wraps every 32 px.
 */
function importSpecial(p: Paths, log: (l: string) => void): ImportedTileset {
  const name = 'map_special';
  const out = blank(TILE * 3, TILE);
  const dirt = [
    [92, 70, 48],
    [104, 80, 55],
    [80, 61, 42],
    [116, 92, 64],
  ] as const;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE * 3; x++) {
      let color: readonly number[];
      if (x < TILE) color = [9, 8, 7];
      else if (x < TILE * 2) color = [21, 19, 16];
      else {
        // 4×4 clumps plus single-pixel grit, in a 4-colour brown ramp.
        const lx = x - TILE * 2;
        const clump = hashNoise(Math.floor(lx / 4), Math.floor(y / 4));
        const grit = hashNoise(lx + 101, y + 57);
        const index = grit > 0.93 ? 3 : grit < 0.05 ? 2 : clump > 0.66 ? 1 : 0;
        color = dirt[index] ?? dirt[0];
      }
      out.pixels.set([...color, 255], (y * out.width + x) * 4);
    }
  }
  writeSheet(p, name, out);
  const tsj = tileset(name, imagePath(p, name), out.width, out.height, TILE, TILE);
  tsj.tiles = [
    { id: 0, properties: [prop('void', true)] },
    { id: 1, properties: [prop('material', 'tierra')] },
    { id: 2, properties: [prop('material', 'tierra'), prop('placeholder', true)] },
  ];
  writeTsj(p, tsj);
  log(`  ✓ ${name}: vacío, suelo oscuro y tierra provisional (generados)`);
  return { name, tileWidth: TILE, tileHeight: TILE };
}

function registerInManifest(root: string, imported: readonly ImportedTileset[]): void {
  const path = resolve(root, 'public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { tilesets: Record<string, unknown> };
  for (const t of imported) {
    manifest.tilesets[t.name] = { file: `tiles/${t.name}.png`, tileWidth: t.tileWidth, tileHeight: t.tileHeight };
  }
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function importTiles(root: string, log: (line: string) => void): ImportedTileset[] {
  const p = paths(root);
  if (!existsSync(resolve(root, 'art-src/palette.hex'))) log('  ⚠ sin art-src/palette.hex: no se cuantiza');
  const imported: ImportedTileset[] = [];
  for (const set of WANG_SETS) imported.push(importWang(p, set, log));
  imported.push(importFloors(p, log));
  for (const kit of KITS) imported.push(importKit(p, kit, log));
  for (const decals of DECALS) imported.push(importDecals(p, decals, log));
  imported.push(importSpecial(p, log));
  registerInManifest(root, imported);
  log(`\n${imported.length} tilesets en public/assets/tiles/ y art-src/tiled/tilesets/; manifiesto actualizado.`);
  return imported;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    importTiles(root, (line) => console.info(line));
  } catch (err) {
    console.error(`✖ ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
