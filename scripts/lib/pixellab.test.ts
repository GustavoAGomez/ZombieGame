import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { directionRows, normaliseAnimationName, parsePixelLabMetadata } from './pixellab';

const realMetadata: unknown = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../art-src/pixellab/player/metadata.json'), 'utf8'),
);

describe('parsePixelLabMetadata', () => {
  it('turns a rotations-only state into a 1-frame animation named after it', () => {
    const parsed = parsePixelLabMetadata(realMetadata);
    expect(parsed.version).toBe('3.1');
    expect(parsed.warnings).toEqual([]);
    expect(parsed.animations).toHaveLength(1);
    const idle = parsed.animations[0]!;
    expect(idle.name).toBe('idle');
    expect([idle.width, idle.height]).toEqual([48, 48]);
    expect(idle.frames.get('south')).toEqual(['Idle/rotations/south.png']);
    expect(idle.frames.size).toBe(8);
  });

  it('reads animations given as frame lists per direction', () => {
    const parsed = parsePixelLabMetadata({
      export_version: '3.1',
      states: [
        {
          character: { name: 'Walking', size: { width: 48, height: 48 } },
          folder: 'Walking',
          frames: {
            rotations: { south: 'Walking/rotations/south.png' },
            animations: { 'walking-6-frames': { south: ['a.png', 'b.png'], east: { frames: ['c.png'] } } },
          },
        },
      ],
    });
    expect(parsed.animations.map((a) => a.name)).toEqual(['walk']);
    expect(parsed.animations[0]!.frames.get('south')).toEqual(['a.png', 'b.png']);
    expect(parsed.animations[0]!.frames.get('east')).toEqual(['c.png']);
  });

  it('warns about unknown versions and unrecognised animation shapes', () => {
    const parsed = parsePixelLabMetadata({
      export_version: '4.0',
      states: [{ character: { name: 'X' }, frames: { animations: { weird: 42 } } }],
    });
    expect(parsed.warnings).toHaveLength(2);
    expect(parsed.animations).toEqual([]);
  });

  it('rejects files that are not PixelLab metadata', () => {
    expect(() => parsePixelLabMetadata({ foo: 1 })).toThrow(/states/);
  });
});

describe('normaliseAnimationName', () => {
  it('maps export names onto the manifest vocabulary', () => {
    expect(normaliseAnimationName('Idle')).toBe('idle');
    expect(normaliseAnimationName('Walking 6 frames')).toBe('walk');
    expect(normaliseAnimationName('Running')).toBe('walk');
    expect(normaliseAnimationName('Shooting pistol')).toBe('shoot');
    expect(normaliseAnimationName('Zombie bite')).toBe('attack');
    expect(normaliseAnimationName('Falling Dead')).toBe('death');
    expect(normaliseAnimationName('Wave Hello!')).toBe('wave_hello');
  });
});

describe('directionRows', () => {
  const all = (names: readonly string[]) => new Map(names.map((n) => [n, [`${n}.png`]]));

  it('orders 8 directions as sheet rows', () => {
    const { directions, rows } = directionRows(
      all(['west', 'north', 'east', 'south', 'south-east', 'north-east', 'north-west', 'south-west']),
    );
    expect(directions).toBe(8);
    expect(rows.map((r) => r[0])).toEqual([
      'south.png',
      'south-east.png',
      'east.png',
      'north-east.png',
      'north.png',
      'north-west.png',
      'west.png',
      'south-west.png',
    ]);
  });

  it('accepts 4-direction exports and rejects incomplete ones', () => {
    expect(directionRows(all(['south', 'east', 'north', 'west'])).directions).toBe(4);
    expect(() => directionRows(all(['south', 'east']))).toThrow(/north/);
  });
});
