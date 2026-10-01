/**
 * npm run map:preview [map…] — renders maps to PNG for review (skill
 * level-design §1.3), in maps/preview/:
 *   <map>.png          the whole built map (public/assets/maps/<map>.tmj) at 1:4
 *   <map>-<zone>.png   each zone at 1:1 (big zones split in parts of up to 40×28 tiles)
 *   <map>-plano.png    the ASCII plan (maps/src/<map>.txt) in flat colours
 *
 * Layers are drawn as the game draws them (floor, decor, decals, walls from
 * their bottom-left corner, sorted by row). Objects whose sprites the game
 * draws at runtime get simple marks: boarded windows, closed doors, closed
 * stairs, red crosses for zombie spawns and a yellow diamond for the player.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { propColor, shade } from '../src/game/assets/propColors';
import { BLOCK_PLAYER, buildCollisionGrid } from '../src/game/map/CollisionGrid';
import { parseMap, tilesetForGid, type MapData, type MapProp, type MapTileset } from '../src/game/map/MapLoader';
import type { TiledMap, TiledObjectLayer } from '../src/game/map/tiled';
import { decorDensity, DECOR_DENSITY, type PlacedDecal } from './lib/decorate';
import { decodePng, encodePng } from './lib/png';
import { blank, type Frame } from './lib/sheet';

const FLIP_H = 0x80000000;
const FLIP_V = 0x40000000;
const GID_MASK = 0x1fffffff;
const CHUNK = { w: 40, h: 28 } as const;

type RGB = readonly [number, number, number];

/** Alpha-blends `src` (or part of it) onto `dst` at (dx, dy). */
function blit(dst: Frame, src: Frame, sx: number, sy: number, w: number, h: number, dx: number, dy: number, flipH = false, flipV = false): void {
  for (let y = 0; y < h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const px = sx + (flipH ? w - 1 - x : x);
      const py = sy + (flipV ? h - 1 - y : y);
      const si = (py * src.width + px) * 4;
      const a = (src.pixels[si + 3] ?? 0) / 255;
      if (a === 0) continue;
      const di = (ty * dst.width + tx) * 4;
      for (let c = 0; c < 3; c++) dst.pixels[di + c] = Math.round((src.pixels[si + c] ?? 0) * a + (dst.pixels[di + c] ?? 0) * (1 - a));
      dst.pixels[di + 3] = 255;
    }
  }
}

function rect(dst: Frame, x0: number, y0: number, w: number, h: number, [r, g, b]: RGB, alpha = 1): void {
  for (let y = Math.max(0, y0); y < Math.min(dst.height, y0 + h); y++) {
    for (let x = Math.max(0, x0); x < Math.min(dst.width, x0 + w); x++) {
      const i = (y * dst.width + x) * 4;
      dst.pixels[i] = Math.round(r * alpha + (dst.pixels[i] ?? 0) * (1 - alpha));
      dst.pixels[i + 1] = Math.round(g * alpha + (dst.pixels[i + 1] ?? 0) * (1 - alpha));
      dst.pixels[i + 2] = Math.round(b * alpha + (dst.pixels[i + 2] ?? 0) * (1 - alpha));
      dst.pixels[i + 3] = 255;
    }
  }
}

function downscale(src: Frame, factor: number): Frame {
  const out = blank(Math.floor(src.width / factor), Math.floor(src.height / factor));
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const sum = [0, 0, 0];
      for (let dy = 0; dy < factor; dy++) {
        for (let dx = 0; dx < factor; dx++) {
          const i = ((y * factor + dy) * src.width + x * factor + dx) * 4;
          for (let c = 0; c < 3; c++) sum[c]! += src.pixels[i + c] ?? 0;
        }
      }
      const o = (y * out.width + x) * 4;
      for (let c = 0; c < 3; c++) out.pixels[o + c] = Math.round(sum[c]! / (factor * factor));
      out.pixels[o + 3] = 255;
    }
  }
  return out;
}

function crop(src: Frame, x0: number, y0: number, w: number, h: number): Frame {
  const out = blank(w, h);
  for (let y = 0; y < h; y++) {
    const from = ((y0 + y) * src.width + x0) * 4;
    out.pixels.set(src.pixels.subarray(from, from + w * 4), y * w * 4);
  }
  return out;
}

/** Renders the built map at 1:1. */
export function renderMap(mapPath: string): { image: Frame; map: MapData } {
  const raw = JSON.parse(readFileSync(mapPath, 'utf8')) as TiledMap;
  const map = parseMap(raw);
  const ts = map.tileSize;
  const images = new Map<string, Frame>();
  for (const t of raw.tilesets) {
    const path = resolve(dirname(mapPath), t.image);
    if (existsSync(path)) images.set(t.name, decodePng(readFileSync(path)));
  }
  const image = blank(map.width * ts, map.height * ts);
  rect(image, 0, 0, image.width, image.height, [10, 10, 12]);

  const drawGid = (rawGid: number, x: number, bottom: number): void => {
    const gid = rawGid & GID_MASK;
    const t: MapTileset | undefined = tilesetForGid(map.tilesets, gid);
    const sheet = t && images.get(t.name);
    if (!t || !sheet) return;
    const local = gid - t.firstGid;
    const sx = (local % t.columns) * t.tileWidth;
    const sy = Math.floor(local / t.columns) * t.tileHeight;
    blit(image, sheet, sx, sy, t.tileWidth, t.tileHeight, Math.round(x), Math.round(bottom - t.tileHeight), (rawGid & FLIP_H) !== 0, (rawGid & FLIP_V) !== 0);
  };
  for (const layer of [map.floor, map.decor, map.shadows]) {
    for (let y = 0; y < map.height; y++) for (let x = 0; x < map.width; x++) drawGid(layer[y * map.width + x] ?? 0, x * ts, (y + 1) * ts);
  }
  const decals = raw.layers.find((l) => l.name === 'decals') as TiledObjectLayer | undefined;
  for (const d of decals?.objects ?? []) if (d.gid) drawGid(d.gid, d.x, d.y);
  const drawProp = (prop: MapProp): void => {
    const base = propColor(prop.key);
    const { x, y, width: w, height: h } = prop;
    rect(image, x, y, w, h, shade(base, 0.55));
    rect(image, x + 1, y + 1, w - 2, h - 2, shade(base, 1));
    rect(image, x + 1, y + 1, w - 2, 2, shade(base, 1.3));
    rect(image, x + 1, y + h - 3, w - 2, 2, shade(base, 0.75));
    if (w >= 12 && h >= 12) rect(image, x + 4, y + 5, w - 8, h - 10, shade(base, 0.85));
  };
  for (const prop of map.props) if (!prop.collides) drawProp(prop);

  // Gameplay objects drawn by the game at runtime: simple marks.
  for (const portal of map.portals) {
    for (const t of portal.tiles) {
      for (let i = 0; i < 4; i++) rect(image, t.x * ts + 2, t.y * ts + i * 8, ts - 4, 7, i % 2 ? [74, 65, 55] : [58, 51, 43]);
      rect(image, t.x * ts + 14, t.y * ts + 14, 4, 4, [232, 176, 74]);
    }
  }
  for (const door of map.doors) {
    for (const t of door.tiles) {
      rect(image, t.x * ts, t.y * ts, ts, ts, [43, 61, 71]);
      rect(image, t.x * ts + 14, t.y * ts + 14, 4, 4, [232, 176, 74]);
    }
  }
  for (const w of map.windows) {
    const x0 = w.tileX * ts;
    const y0 = w.tileY * ts;
    rect(image, x0, y0, ts, ts, w.kind === 'fence' ? [70, 52, 34] : [20, 18, 15]);
    for (let i = 0; i < 3; i++) {
      if (w.axis === 'horizontal') rect(image, x0 + 2, y0 + 6 + i * 9, ts - 4, 5, [140, 98, 58]);
      else rect(image, x0 + 6 + i * 9, y0 + 2, 5, ts - 4, [140, 98, 58]);
    }
  }

  // Walls, other tall tiles and furniture with collision, y-sorted like the game does with actors.
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      drawGid(map.walls[y * map.width + x] ?? 0, x * ts, (y + 1) * ts);
      drawGid(map.wallFaces[y * map.width + x] ?? 0, x * ts, (y + 1) * ts);
      drawGid(map.wallJoins[y * map.width + x] ?? 0, x * ts, (y + 1) * ts);
    }
    for (const prop of map.props) if (prop.collides && prop.y + prop.height === (y + 1) * ts) drawProp(prop);
  }

  const cross = (cx: number, cy: number, color: RGB): void => {
    for (let i = -5; i <= 5; i++) {
      rect(image, Math.round(cx + i) - 1, Math.round(cy + i) - 1, 3, 3, color);
      rect(image, Math.round(cx + i) - 1, Math.round(cy - i) - 1, 3, 3, color);
    }
  };
  for (const s of map.zombieSpawns) cross(s.x, s.y, [200, 40, 40]);
  for (const s of map.openSpawns) {
    cross(s.x, s.y, [255, 60, 60]);
    rect(image, Math.round(s.x) - 9, Math.round(s.y) - 9, 18, 2, [255, 60, 60]);
    rect(image, Math.round(s.x) - 9, Math.round(s.y) + 7, 18, 2, [255, 60, 60]);
  }
  for (let i = 0; i <= 8; i++) rect(image, Math.round(map.playerSpawn.x) - i, Math.round(map.playerSpawn.y) - 8 + i, i * 2 + 1, 1, [255, 230, 40]);
  for (let i = 0; i < 8; i++) rect(image, Math.round(map.playerSpawn.x) - 7 + i, Math.round(map.playerSpawn.y) + 1 + i, 15 - i * 2, 1, [255, 230, 40]);
  return { image, map };
}

const PLAN_COLORS: Record<string, RGB> = {
  '#': [120, 104, 88], H: [235, 230, 220], F: [140, 96, 52], '.': [150, 105, 62], k: [205, 196, 160], b: [170, 200, 210],
  c: [128, 128, 124], g: [96, 140, 64], p: [180, 172, 150], d: [125, 92, 60], a: [52, 52, 56], s: [170, 170, 165],
  w: [60, 130, 170], e: [200, 175, 140], r: [110, 100, 96], _: [12, 12, 14], W: [90, 200, 255], D: [255, 170, 40],
  o: [175, 125, 80], '<': [220, 60, 220], P: [255, 255, 0], Z: [230, 40, 40],
};

/** The ASCII plan in flat colours, 8 px per tile. */
export function renderPlan(text: string): Frame {
  const blankLine = text.search(/\n\s*\n/);
  const rows = (blankLine >= 0 ? text.slice(0, blankLine) : text).split('\n');
  const S = 8;
  const image = blank(Math.max(...rows.map((r) => r.length)) * S, rows.length * S);
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      const [r, g, b] = PLAN_COLORS[ch] ?? [255, 0, 255];
      rect(image, x * S, y * S, S, S, [r * 0.92, g * 0.92, b * 0.92]);
      rect(image, x * S + 1, y * S + 1, S - 1, S - 1, [r, g, b]);
    }),
  );
  return image;
}

/** Share of each zone's floor with a decal or a prop (skill §4.7: 15–25 %). */
export function zoneDensities(map: MapData): { zone: string; density: number }[] {
  const grid = buildCollisionGrid(map, map.doors.map(() => true));
  const ts = map.tileSize;
  const propCells = new Set<number>();
  for (const prop of map.props) for (const t of prop.tiles) propCells.add(t.y * map.width + t.x);
  const decals: PlacedDecal[] = map.decals.map((d) => {
    const size = tilesetForGid(map.tilesets, d.gid)?.tileWidth ?? ts;
    return { tileset: '', local: 0, cx: d.x + size / 2, cy: d.y - size / 2, flipX: d.flipX, flipY: d.flipY };
  });
  const density = decorDensity(decals, {
    width: map.width,
    height: map.height,
    tileSize: ts,
    zoneAt: (x, y) => (x >= 0 && y >= 0 && x < map.width && y < map.height ? (map.cellZone[y * map.width + x] ?? -1) : -1),
    zoneCount: map.zones.length,
    blocked: (x, y) => ((grid.cells[y * map.width + x] ?? 0) & BLOCK_PLAYER) !== 0,
    propCells,
  });
  return map.zones.map((z, i) => ({ zone: z.id, density: density[i] ?? 0 }));
}

function writePng(path: string, frame: Frame): void {
  writeFileSync(path, encodePng(frame.width, frame.height, frame.pixels));
}

export function previewMap(root: string, name: string): string[] {
  const outDir = resolve(root, 'maps/preview');
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f === `${name}.png` || f.startsWith(`${name}-`)) rmSync(resolve(outDir, f));
  const written: string[] = [];
  const plan = resolve(root, 'maps/src', `${name}.txt`);
  if (existsSync(plan)) {
    writePng(resolve(outDir, `${name}-plano.png`), renderPlan(readFileSync(plan, 'utf8')));
    written.push(`${name}-plano.png`);
  }
  const mapPath = resolve(root, 'public/assets/maps', `${name}.tmj`);
  if (!existsSync(mapPath)) throw new Error(`no existe ${mapPath}: ejecuta npm run map:build -- ${name}`);
  const { image, map } = renderMap(mapPath);
  writePng(resolve(outDir, `${name}.png`), downscale(image, 4));
  written.push(`${name}.png`);

  const ts = map.tileSize;
  map.zones.forEach((zone, zi) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    map.cellZone.forEach((z, i) => {
      if (z !== zi) return;
      const x = i % map.width;
      const y = (i - x) / map.width;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
    if (!Number.isFinite(minX)) return;
    // Two tiles of margin so the walls, windows and doors around the zone show.
    minX = Math.max(0, minX - 2);
    minY = Math.max(0, minY - 2);
    maxX = Math.min(map.width - 1, maxX + 2);
    maxY = Math.min(map.height - 1, maxY + 2);
    const cols = Math.ceil((maxX - minX + 1) / CHUNK.w);
    const rows = Math.ceil((maxY - minY + 1) / CHUNK.h);
    let part = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x0 = minX + c * CHUNK.w;
        const y0 = minY + r * CHUNK.h;
        const w = Math.min(CHUNK.w, maxX - x0 + 1);
        const h = Math.min(CHUNK.h, maxY - y0 + 1);
        let inZone = 0;
        for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (map.cellZone[y * map.width + x] === zi) inZone++;
        if (inZone < w * h * 0.1) continue;
        part++;
        const file = cols * rows > 1 ? `${name}-${zone.id}-${part}.png` : `${name}-${zone.id}.png`;
        writePng(resolve(outDir, file), crop(image, x0 * ts, y0 * ts, w * ts, h * ts));
        written.push(file);
      }
    }
  });
  return written;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const only = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const built = existsSync(resolve(root, 'public/assets/maps'))
    ? readdirSync(resolve(root, 'public/assets/maps'))
        .filter((f) => f.endsWith('.tmj'))
        .map((f) => basename(f, '.tmj'))
    : [];
  const names = only.length > 0 ? only : built.filter((n) => existsSync(resolve(root, 'maps/src', `${n}.txt`)));
  if (names.length === 0) {
    console.error('✖ No hay mapas que previsualizar (npm run map:preview -- <mapa>)');
    process.exitCode = 1;
    return;
  }
  for (const name of names) {
    try {
      const files = previewMap(root, name);
      console.info(`✓ ${name}: ${files.length} imágenes en maps/preview/ (${files.join(', ')})`);
      const map = parseMap(JSON.parse(readFileSync(resolve(root, 'public/assets/maps', `${name}.tmj`), 'utf8')));
      const line = zoneDensities(map).map(({ zone, density }) => {
        const pct = Math.round(density * 100);
        const ok = density >= DECOR_DENSITY.min && density <= DECOR_DENSITY.max + 0.005;
        return `${zone} ${pct} %${ok ? '' : ' ⚠'}`;
      });
      console.info(`  densidad de decoración (objetivo 15–25 %): ${line.join(' · ')}`);
    } catch (err) {
      console.error(`✖ ${name}: ${(err as Error).message}`);
      process.exitCode = 1;
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
