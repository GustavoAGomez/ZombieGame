import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAssets } from './check-assets';
import { applyImport, importAssets, resampleFrames } from './import-pixellab';
import { decodePng } from './lib/png';

const repo = resolve(import.meta.dirname, '..');
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
});

describe('importAssets (end to end on a copy of the repo assets)', () => {
  it('writes the player idle, run and shooting sheets and a manifest that passes assets:check', () => {
    tmp = mkdtempSync(join(tmpdir(), 'zombies-import-'));
    cpSync(join(repo, 'public/assets'), join(tmp, 'public/assets'), { recursive: true });
    cpSync(join(repo, 'art-src/pixellab/player'), join(tmp, 'art-src/pixellab/player'), { recursive: true });
    const lines: string[] = [];
    expect(importAssets(tmp, [], (l) => lines.push(l))).toBe(4);

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
    expect(checkAssets(tmp).errors).toEqual([]);
  });
});

describe('importAssets with one export per subfolder', () => {
  it('imports every export of an asset without them overwriting each other', () => {
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
    // idle/ brings walk, idle, shoot and shoot_walk; walk/ brings another walk, which wins as the later one.
    expect(importAssets(tmp, ['player'], () => undefined)).toBe(5);
    const manifest = JSON.parse(readFileSync(join(tmp, 'public/assets/manifest.json'), 'utf8')) as {
      characters: Record<string, { animations: Record<string, { frames: number; placeholder?: boolean }> }>;
    };
    expect(manifest.characters.player?.animations.walk).toMatchObject({ frames: 2 });
    expect(manifest.characters.player?.animations.walk?.placeholder).toBeUndefined();
    expect(checkAssets(tmp).errors).toEqual([]);
  });
});

describe('resampleFrames', () => {
  it('stretches shorter directions evenly to the longest one', () => {
    expect(resampleFrames(['a', 'b', 'c'], 5)).toEqual(['a', 'a', 'b', 'b', 'c']);
    expect(resampleFrames([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 13)).toHaveLength(13);
    expect(resampleFrames(['a', 'b'], 2)).toEqual(['a', 'b']);
  });
});
