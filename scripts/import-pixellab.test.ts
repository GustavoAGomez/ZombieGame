import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAssets } from './check-assets';
import { applyImport, importAssets, resampleFrames, rowScale, shareArt } from './import-pixellab';
import { decodePng, encodePng } from './lib/png';

const repo = resolve(import.meta.dirname, '..');
/** End-to-end imports copy every asset and decode real sheets: slow next to the rest of the suite. */
const E2E = { timeout: 30_000 };
let tmp = '';

afterEach(() => {
  if (tmp) rmSync(tmp, { recursive: true, force: true });
  tmp = '';
});

describe('applyImport', () => {
  it('marks the imported animation as real and the rest as placeholders', () => {
    const manifest = {
      characters: {
        hero: {
          placeholder: true,
          directions: 8,
          animations: {
            idle: { file: 'sprites/hero/idle.png', frames: 4, fps: 5, loop: true },
            walk: { file: 'sprites/hero/walk.png', frames: 6, fps: 10, loop: true },
          },
        },
      },
    };
    applyImport(manifest, 'hero', { name: 'idle', frames: 1, directions: 8, file: 'sprites/hero/idle.png' }, () => false);
    const hero = manifest.characters.hero as Record<string, unknown>;
    expect(hero.placeholder).toBe(false);
    expect(hero.animations).toEqual({
      idle: { file: 'sprites/hero/idle.png', frames: 1, fps: 5, loop: true },
      walk: { file: 'sprites/hero/walk.png', frames: 6, fps: 10, loop: true, placeholder: true },
    });
  });

  it('keeps the rows of each animation: an 8-way character with a 4-way climb', () => {
    const manifest = { characters: { z: { placeholder: true, directions: 8, animations: {} } } };
    const real = new Set(['sprites/z/walk.png', 'sprites/z/climb.png']);
    applyImport(manifest, 'z', { name: 'walk', frames: 9, directions: 8, file: 'sprites/z/walk.png' }, (f) => real.has(f));
    applyImport(manifest, 'z', { name: 'climb', frames: 9, directions: 4, file: 'sprites/z/climb.png' }, (f) => real.has(f));
    const z = manifest.characters.z as Record<string, unknown>;
    const anims = z.animations as Record<string, Record<string, unknown>>;
    expect(z.directions).toBe(8);
    expect(anims.walk?.directions).toBeUndefined();
    expect(anims.climb?.directions).toBe(4);
    // Importing the walk again does not change the climb's rows.
    applyImport(manifest, 'z', { name: 'walk', frames: 9, directions: 8, file: 'sprites/z/walk.png' }, (f) => real.has(f));
    expect(anims.climb?.directions).toBe(4);
  });
});

describe('shareArt', () => {
  it('gives another character the same sheets and frame size, keeping its own pace', () => {
    const manifest = {
      characters: {
        walker: {
          frameWidth: 68,
          frameHeight: 68,
          anchor: { x: 0.5, y: 0.75 },
          directions: 8,
          placeholder: false,
          animations: {
            walk: { file: 'sprites/walker/walk.png', frames: 9, fps: 9, loop: true },
            climb: { file: 'sprites/walker/climb.png', frames: 9, fps: 11, loop: false, directions: 4 },
          },
        },
        runner: {
          frameWidth: 48,
          frameHeight: 48,
          placeholder: true,
          animations: { walk: { file: 'sprites/runner/walk.png', frames: 6, fps: 15, loop: true } },
        },
      },
    };
    shareArt(manifest, 'walker', 'runner');
    const runner = manifest.characters.runner as Record<string, unknown>;
    expect(runner.frameWidth).toBe(68);
    expect(runner.placeholder).toBe(false);
    expect(runner.animations).toEqual({
      walk: { file: 'sprites/walker/walk.png', frames: 9, fps: 15, loop: true },
      climb: { file: 'sprites/walker/climb.png', frames: 9, fps: 11, loop: false, directions: 4 },
    });
  });
});

describe('importAssets (end to end on a copy of the repo assets)', () => {
  it('writes the player idle, run, shooting and death sheets and a manifest that passes assets:check', E2E, () => {
    tmp = mkdtempSync(join(tmpdir(), 'zombies-import-'));
    cpSync(join(repo, 'public/assets'), join(tmp, 'public/assets'), { recursive: true });
    cpSync(join(repo, 'art-src/pixellab/player'), join(tmp, 'art-src/pixellab/player'), { recursive: true });
    const lines: string[] = [];
    expect(importAssets(tmp, [], (l) => lines.push(l))).toBe(5);

    const png = decodePng(readFileSync(join(tmp, 'public/assets/sprites/player/idle.png')));
    expect([png.width, png.height]).toEqual([48, 48 * 8]);
    const run = decodePng(readFileSync(join(tmp, 'public/assets/sprites/player/walk.png')));
    expect([run.width, run.height]).toEqual([48 * 6, 48 * 8]);
    expect(lines.some((l) => l.includes('56×56'))).toBe(true);
    for (const anim of ['shoot', 'shoot_walk']) {
      const sheet = decodePng(readFileSync(join(tmp, `public/assets/sprites/player/${anim}.png`)));
      expect([sheet.width, sheet.height], anim).toEqual([48 * 13, 48 * 8]);
    }
    expect(lines.some((l) => l.includes('se remuestrean a 13'))).toBe(true);
    expect(lines.some((l) => l.includes('south-east-805cba59') && l.includes('import.json'))).toBe(true);
    const manifest = JSON.parse(readFileSync(join(tmp, 'public/assets/manifest.json'), 'utf8')) as {
      characters: Record<string, { placeholder: boolean; animations: Record<string, { frames: number; placeholder?: boolean }> }>;
    };
    expect(manifest.characters.player?.placeholder).toBe(false);
    expect(manifest.characters.player?.animations.idle).toMatchObject({ frames: 1 });
    expect(manifest.characters.player?.animations.walk).toMatchObject({ frames: 6 });
    expect(manifest.characters.player?.animations.walk?.placeholder).toBeUndefined();
    expect(manifest.characters.player?.animations.shoot?.placeholder).toBeUndefined();
    expect(manifest.characters.player?.animations.shoot_walk).toMatchObject({ frames: 13 });
    expect(manifest.characters.player?.animations.dash?.placeholder).toBe(true);
    // Death: south, east and west, the other five directions filled with the nearest.
    const death = decodePng(readFileSync(join(tmp, 'public/assets/sprites/player/death.png')));
    expect([death.width, death.height]).toEqual([48 * 11, 48 * 8]);
    expect(manifest.characters.player?.animations.death?.placeholder).toBeUndefined();
    expect(lines.some((l) => l.includes('north ← east'))).toBe(true);
    expect(checkAssets(tmp).errors).toEqual([]);
  });
});

describe('importAssets (the zombie export)', () => {
  it('imports walk, strikes, the 4-way climb and the crawl, and shares them with the other kinds', E2E, () => {
    tmp = mkdtempSync(join(tmpdir(), 'zombies-import-'));
    cpSync(join(repo, 'public/assets'), join(tmp, 'public/assets'), { recursive: true });
    cpSync(join(repo, 'art-src/pixellab/zombie_walker'), join(tmp, 'art-src/pixellab/zombie_walker'), { recursive: true });
    const lines: string[] = [];
    expect(importAssets(tmp, ['zombie_walker'], (l) => lines.push(l))).toBe(6);
    const size = (anim: string): number[] => {
      const png = decodePng(readFileSync(join(tmp, `public/assets/sprites/zombie_walker/${anim}.png`)));
      return [png.width, png.height];
    };
    // 9 frames per row: the two diagonals with 11 are squeezed (import.json), not the rest stretched.
    expect(size('walk')).toEqual([68 * 9, 68 * 8]);
    expect(size('climb')).toEqual([68 * 9, 68 * 4]);
    expect(size('crawl')).toEqual([68 * 9, 68 * 8]);
    expect(size('crawl_attack')).toEqual([68 * 9, 68 * 8]);
    const manifest = JSON.parse(readFileSync(join(tmp, 'public/assets/manifest.json'), 'utf8')) as {
      characters: Record<string, { placeholder: boolean; animations: Record<string, { file: string; fps: number; directions?: number; placeholder?: boolean }> }>;
    };
    const walker = manifest.characters.zombie_walker;
    const runner = manifest.characters.zombie_runner;
    expect(walker?.animations.climb?.directions).toBe(4);
    expect(walker?.animations.death?.placeholder).toBe(true);
    expect(runner?.placeholder).toBe(false);
    expect(runner?.animations.crawl?.file).toBe('sprites/zombie_walker/crawl.png');
    // Each kind keeps its own pace.
    expect(runner?.animations.walk?.fps).toBeGreaterThan(walker?.animations.walk?.fps ?? Infinity);
    expect(lines.some((l) => l.includes('zombie_sprinter usa el arte de zombie_walker'))).toBe(true);
    // The crawl was drawn 1.5× bigger: brought down to the standing zombie's size.
    expect(lines.some((l) => l.includes('dragging_itself_forward') && l.includes('escalado'))).toBe(true);
    expect(checkAssets(tmp).errors).toEqual([]);
  });
});

describe('importAssets with one export per subfolder', () => {
  it('imports every export of an asset without them overwriting each other', E2E, () => {
    tmp = mkdtempSync(join(tmpdir(), 'zombies-import-'));
    cpSync(join(repo, 'public/assets'), join(tmp, 'public/assets'), { recursive: true });
    // idle export in a subfolder, plus a fake "walk" export reusing the same PNGs.
    cpSync(join(repo, 'art-src/pixellab/player'), join(tmp, 'art-src/pixellab/player/idle'), { recursive: true });
    cpSync(join(repo, 'art-src/pixellab/player/Idle'), join(tmp, 'art-src/pixellab/player/walk/Idle'), { recursive: true });
    const dirs = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
    const walk = Object.fromEntries(dirs.map((d) => [d, [`Idle/rotations/${d}.png`, `Idle/rotations/${d}.png`]]));
    writeFileSync(
      join(tmp, 'art-src/pixellab/player/walk/metadata.json'),
      JSON.stringify({
        export_version: '3.1',
        states: [{ character: { name: 'Walk', size: { width: 48, height: 48 } }, folder: 'Idle', frames: { rotations: {}, animations: { walking: walk } } }],
      }),
    );
    // idle/ brings death, walk, idle, shoot and shoot_walk; walk/ brings another walk, which wins as the later one.
    expect(importAssets(tmp, ['player'], () => undefined)).toBe(6);
    const manifest = JSON.parse(readFileSync(join(tmp, 'public/assets/manifest.json'), 'utf8')) as {
      characters: Record<string, { animations: Record<string, { frames: number; placeholder?: boolean }> }>;
    };
    expect(manifest.characters.player?.animations.walk).toMatchObject({ frames: 2 });
    expect(manifest.characters.player?.animations.walk?.placeholder).toBeUndefined();
    expect(checkAssets(tmp).errors).toEqual([]);
  });
});

describe('importAssets (objects)', () => {
  /** A frame of `w`×`h` filled with one opaque colour, but for a half-transparent pixel at the top left. */
  function solid(w: number, h: number, r: number): Buffer {
    const px = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) px.set([r, 0, 0, 255], i * 4);
    px[3] = 100;
    return encodePng(w, h, px);
  }

  function setUp(): string {
    tmp = mkdtempSync(join(tmpdir(), 'zombies-import-'));
    mkdirSync(join(tmp, 'public/assets'), { recursive: true });
    const manifest = { objects: { claw: { file: 'sprites/objects/claw.png', frameWidth: 4, frameHeight: 6, frames: 1, placeholder: true } } };
    writeFileSync(join(tmp, 'public/assets/manifest.json'), JSON.stringify(manifest));
    const dir = join(tmp, 'art-src/pixellab/objects/claw');
    mkdirSync(join(dir, 'retouched'), { recursive: true });
    writeFileSync(join(dir, 'open.png'), solid(4, 6, 200));
    writeFileSync(join(dir, 'retouched/fist.png'), solid(2, 2, 50));
    return dir;
  }

  it('lays the frames of import.json left to right at the declared size and marks the object as real art', () => {
    const dir = setUp();
    writeFileSync(join(dir, 'import.json'), JSON.stringify({ frames: ['retouched/fist.png', 'open.png'] }));
    const lines: string[] = [];
    expect(importAssets(tmp, [], (l) => lines.push(l))).toBe(1);

    const png = decodePng(readFileSync(join(tmp, 'public/assets/sprites/objects/claw.png')));
    expect([png.width, png.height]).toEqual([8, 6]);
    const at = (x: number, y: number): number[] => [...png.pixels.subarray((y * 8 + x) * 4, (y * 8 + x) * 4 + 4)];
    // The 2×2 fist is centred in its 4×6 frame; its half-transparent corner becomes fully transparent.
    expect(at(1, 2)).toEqual([0, 0, 0, 0]);
    expect(at(2, 3)).toEqual([50, 0, 0, 255]);
    expect(at(0, 0)).toEqual([0, 0, 0, 0]);
    expect(at(5, 5)).toEqual([200, 0, 0, 255]);
    expect(lines.some((l) => l.includes('2×2, centrado en 4×6'))).toBe(true);

    const manifest = JSON.parse(readFileSync(join(tmp, 'public/assets/manifest.json'), 'utf8')) as { objects: Record<string, unknown> };
    expect(manifest.objects.claw).toEqual({ file: 'sprites/objects/claw.png', frameWidth: 4, frameHeight: 6, frames: 2, placeholder: false });
  });

  it('imports only the objects asked for, and skips one without import.json', () => {
    setUp();
    const lines: string[] = [];
    expect(importAssets(tmp, ['player'], (l) => lines.push(l))).toBe(0);
    expect(importAssets(tmp, ['claw'], (l) => lines.push(l))).toBe(0);
    expect(lines.some((l) => l.includes('falta import.json'))).toBe(true);
  });
});

describe('resampleFrames', () => {
  it('stretches shorter directions evenly to the longest one', () => {
    expect(resampleFrames(['a', 'b', 'c'], 5)).toEqual(['a', 'a', 'b', 'b', 'c']);
    expect(resampleFrames([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 13)).toHaveLength(13);
    expect(resampleFrames(['a', 'b'], 2)).toEqual(['a', 'b']);
  });
});

describe('rowScale', () => {
  it('takes one factor for every row, or one per direction with "*" for the rest', () => {
    expect(rowScale(0.8, 'south')).toBe(0.8);
    const perDirection = { '*': 0.8, south: 0.7, 'south-east': 0.7 };
    expect(rowScale(perDirection, 'south')).toBe(0.7);
    expect(rowScale(perDirection, 'south-east')).toBe(0.7);
    expect(rowScale(perDirection, 'north')).toBe(0.8);
    expect(rowScale({ south: 0.7 }, 'north')).toBe(1);
  });
});
