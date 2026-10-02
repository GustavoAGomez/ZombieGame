import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ManifestError, REQUIRED_ANIMATIONS, REQUIRED_OBJECTS, animationDirections, directionRow, parseManifest } from './manifest';

const raw: unknown = JSON.parse(readFileSync(new URL('../../../public/assets/manifest.json', import.meta.url), 'utf8'));

describe('manifest.json', () => {
  const manifest = parseManifest(raw);

  it('parses and declares the minimum animations', () => {
    for (const [character, anims] of Object.entries(REQUIRED_ANIMATIONS)) {
      const def = manifest.characters[character];
      expect(def, character).toBeDefined();
      for (const anim of anims) expect(def?.animations[anim], `${character}.${anim}`).toBeDefined();
    }
  });

  it('declares the room01 map and the window/door objects for both wall orientations', () => {
    expect(manifest.maps.room01).toBe('maps/room01.tmj');
    for (const key of REQUIRED_OBJECTS) expect(manifest.objects[key], key).toBeDefined();
    expect(manifest.objects.window_planks?.frames).toBe(6);
    expect(manifest.objects.window_planks_v?.frames).toBe(6);
    expect(manifest.objects.door?.frames).toBe(2);
    expect(manifest.objects.door_v?.frames).toBe(2);
  });
});

describe('muzzle points', () => {
  it('declares one muzzle point per direction for the player', () => {
    const manifest = parseManifest(raw);
    const player = manifest.characters.player!;
    expect(player.muzzle).toHaveLength(8);
    for (const [x, y] of player.muzzle!) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(player.frameWidth);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(player.frameHeight);
    }
  });

  it('rejects muzzle lists that do not match the directions', () => {
    const bad = { tileSize: 32, characters: { x: { frameWidth: 48, frameHeight: 48, directions: 8, muzzle: [[1, 2]], animations: {} } } };
    expect(() => parseManifest(bad)).toThrow(/muzzle/);
  });

  it('lets an animation declare its own rows (the zombie climb has 4 in an 8-way zombie)', () => {
    const zombie = parseManifest(raw).characters.zombie_walker;
    if (!zombie) throw new Error('zombie_walker missing');
    expect(zombie.directions).toBe(8);
    expect(animationDirections(zombie, 'climb')).toBe(4);
    expect(animationDirections(zombie, 'walk')).toBe(8);
    const bad = { tileSize: 32, characters: { x: { frameWidth: 48, frameHeight: 48, animations: { a: { file: 'a.png', frames: 1, fps: 1, directions: 3 } } } } };
    expect(() => parseManifest(bad)).toThrow(/directions/);
  });
});

describe('parseManifest validation', () => {
  it('rejects bad values', () => {
    expect(() => parseManifest(null)).toThrow(ManifestError);
    expect(() => parseManifest({ tileSize: 0 })).toThrow(/tileSize/);
    expect(() =>
      parseManifest({ tileSize: 32, objects: { x: { file: 'a.png', frameWidth: 32, frameHeight: -1, frames: 1 } } }),
    ).toThrow(/frameHeight/);
  });
});

describe('directionRow', () => {
  it('returns the same row for 8-direction sheets', () => {
    for (let d = 0; d < 8; d++) expect(directionRow(d, 8)).toBe(d);
  });

  it('maps diagonals to the nearest horizontal row for 4-direction sheets', () => {
    // 4-dir rows: 0 south, 1 east, 2 north, 3 west
    expect([0, 1, 2, 3, 4, 5, 6, 7].map((d) => directionRow(d, 4))).toEqual([0, 1, 1, 1, 2, 3, 3, 3]);
  });
});
