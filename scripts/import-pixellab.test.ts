import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkAssets } from './check-assets';
import { applyImport, importAssets } from './import-pixellab';
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
  it('writes the player idle sheet and a manifest that passes assets:check', () => {
    tmp = mkdtempSync(join(tmpdir(), 'zombies-import-'));
    cpSync(join(repo, 'public/assets'), join(tmp, 'public/assets'), { recursive: true });
    cpSync(join(repo, 'art-src/pixellab/player'), join(tmp, 'art-src/pixellab/player'), { recursive: true });
    const lines: string[] = [];
    expect(importAssets(tmp, [], (l) => lines.push(l))).toBe(1);

    const png = decodePng(readFileSync(join(tmp, 'public/assets/sprites/player/idle.png')));
    expect([png.width, png.height]).toEqual([48, 48 * 8]);
    const manifest = JSON.parse(readFileSync(join(tmp, 'public/assets/manifest.json'), 'utf8')) as {
      characters: Record<string, { placeholder: boolean; animations: Record<string, { frames: number; placeholder?: boolean }> }>;
    };
    expect(manifest.characters.player?.placeholder).toBe(false);
    expect(manifest.characters.player?.animations.idle).toMatchObject({ frames: 1 });
    expect(manifest.characters.player?.animations.walk?.placeholder).toBe(true);
    expect(checkAssets(tmp).errors).toEqual([]);
  });
});
