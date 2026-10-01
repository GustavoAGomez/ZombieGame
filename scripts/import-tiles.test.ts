import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAssets } from './check-assets';
import { importTiles } from './import-tiles';
import { decodePng } from './lib/png';
import type { Tsj } from './lib/tiled-tileset';

const repo = resolve(import.meta.dirname, '..');
let tmp = '';
afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = '';
});

describe('importTiles (end to end on a copy of the repo)', () => {
  it('writes sheets, .tsj tilesets with wangsets and properties, and registers them', () => {
    tmp = mkdtempSync(join(tmpdir(), 'zombies-tiles-'));
    cpSync(join(repo, 'public/assets'), join(tmp, 'public/assets'), { recursive: true });
    cpSync(join(repo, 'art-src/pixellab'), join(tmp, 'art-src/pixellab'), { recursive: true });
    const lines: string[] = [];
    const imported = importTiles(tmp, (l) => lines.push(l));
    expect(imported).toHaveLength(14);

    const tsj = (name: string) => JSON.parse(readFileSync(join(tmp, `art-src/tiled/tilesets/${name}.tsj`), 'utf8')) as Tsj;
    const pool = tsj('tileset_pool');
    expect(pool.wangsets?.[0]?.type).toBe('corner');
    expect(pool.wangsets?.[0]?.colors.map((c) => c.name)).toEqual(['agua', 'cubierta']);
    expect(pool.wangsets?.[0]?.wangtiles).toHaveLength(17);
    const water = (pool.tiles ?? []).filter((t) => t.properties?.some((p) => p.name === 'water')).map((t) => t.id);
    expect(water).toEqual([1, 3, 4, 5, 6, 7, 8, 9, 11, 13, 14, 15]);
    expect(pool.image).toBe('../../../public/assets/tiles/tileset_pool.png');

    const kit = tsj('kit_interior');
    expect([kit.tilewidth, kit.tileheight, kit.tilecount]).toEqual([32, 48, 20]);
    expect(kit.tiles?.[1]?.properties).toContainEqual({ name: 'collides', type: 'bool', value: true });
    expect(tsj('map_special').tiles?.[0]?.properties).toContainEqual({ name: 'void', type: 'bool', value: true });

    const floors = decodePng(readFileSync(join(tmp, 'public/assets/tiles/floors_interior.png')));
    expect([floors.width, floors.height]).toEqual([128, 128]);
    // No transparent pixels left in the floors.
    expect(floors.pixels.some((v, i) => i % 4 === 3 && v === 0)).toBe(false);
    expect(existsSync(join(tmp, 'public/assets/tiles/decals_grass.png'))).toBe(true);

    // Shadows: four bands plus the one right of a vertical wall's strip.
    expect(tsj('map_shadows').tilecount).toBe(5);
    // Floor halves: the right half of every floor tile, naming its source.
    const halves = tsj('floor_halves');
    const sources = (halves.tiles ?? []).map((t) => Object.fromEntries((t.properties ?? []).map((q) => [q.name, q.value])));
    expect(sources).toContainEqual({ tileset: 'floors_interior', tile: 15 });
    expect(sources).toContainEqual({ tileset: 'map_special', tile: 1 });
    expect(sources.filter((x) => x.tileset === 'tileset_pool').length).toBeGreaterThan(0);
    const halfSheet = decodePng(readFileSync(join(tmp, 'public/assets/tiles/floor_halves.png')));
    const alphaAt = (x: number, y: number) => halfSheet.pixels[(y * halfSheet.width + x) * 4 + 3];
    expect([alphaAt(5, 10), alphaAt(25, 10)]).toEqual([0, 255]);

    const manifest = JSON.parse(readFileSync(join(tmp, 'public/assets/manifest.json'), 'utf8')) as { tilesets: Record<string, unknown> };
    expect(manifest.tilesets.kit_fence).toEqual({ file: 'tiles/kit_fence.png', tileWidth: 32, tileHeight: 48 });
    expect(checkAssets(tmp).errors).toEqual([]);
  });
});
