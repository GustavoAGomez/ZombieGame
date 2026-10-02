import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { directionRows, nearestDirection, normaliseAnimationName, parsePixelLabMetadata, resolveTakes, selectAnimations, type ExportAnimation } from './pixellab';

const realMetadata: unknown = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../art-src/pixellab/player/metadata.json'), 'utf8'),
);

describe('parsePixelLabMetadata', () => {
  it('reads the real player export: death, run, idle, shooting standing and walking', () => {
    const parsed = parsePixelLabMetadata(realMetadata, { shoot_walk: { north: 'north-36c131c0', 'south-east': 'south-east-805cba59' } });
    expect(parsed.version).toBe('3.1');
    expect(parsed.warnings).toEqual([]);
    expect(parsed.animations.map((a) => a.name)).toEqual(['death', 'walk', 'idle', 'shoot', 'shoot_walk']);
    // The death comes in south, west and two takes of east; the rest is filled in when importing.
    expect([...(parsed.animations[0]?.frames.keys() ?? [])].sort()).toEqual(['east', 'south', 'west']);
    const idle = parsed.animations[2]!;
    expect(idle.frames.get('south')).toEqual(['Idle/rotations/south.png']);
    const shootWalk = parsed.animations[4]!;
    expect([...shootWalk.frames.keys()].sort()).toEqual([
      'east', 'north', 'north-east', 'north-west', 'south', 'south-east', 'south-west', 'west',
    ]);
    expect(shootWalk.frames.get('north')?.[0]).toContain('north-36c131c0');
    expect(shootWalk.frames.get('south-east')?.[0]).toContain('south-east-805cba59');
    expect(shootWalk.notes).toHaveLength(2);

    const { selected, skipped } = selectAnimations(parsed.animations);
    expect(selected.map((a) => a.name)).toEqual(['death', 'walk', 'idle', 'shoot', 'shoot_walk']);
    expect(skipped).toEqual([]);
  });

  it('turns a rotations-only state into a 1-frame animation named after it', () => {
    const parsed = parsePixelLabMetadata({
      export_version: '3.1',
      states: [{ character: { name: 'Idle', size: { width: 48, height: 48 } }, folder: 'Idle', frames: { rotations: { south: 's.png' }, animations: {} } }],
    });
    expect(parsed.animations.map((a) => a.name)).toEqual(['idle']);
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
    // The animation, plus the rotations as the state's still pose ("Walking" → walk is taken, so no extra).
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
    expect(normaliseAnimationName('Knife attack')).toBe('melee');
    expect(normaliseAnimationName('Stabbing with a knife')).toBe('melee');
    expect(normaliseAnimationName('Bite attack')).toBe('attack');
    expect(normaliseAnimationName('Zombie bite')).toBe('attack');
    expect(normaliseAnimationName('Falling Dead')).toBe('death');
    expect(normaliseAnimationName('Wave Hello!')).toBe('wave_hello');
  });

  it('recognises shooting while walking, also from the state name (names are truncated)', () => {
    expect(normaliseAnimationName('firing_a_handgun_in_the_exact_direction_the_charac')).toBe('shoot');
    expect(normaliseAnimationName('walking_forward_in_the_exact_direction_the_charact', 'standing in a firing')).toBe('shoot_walk');
    expect(normaliseAnimationName('Walking and shooting')).toBe('shoot_walk');
    expect(normaliseAnimationName('standing in a firing')).toBe('shoot');
    expect(normaliseAnimationName('Running', 'Idle')).toBe('walk');
    expect(normaliseAnimationName('Soldier firing')).toBe('shoot');
  });

  it('reads the zombie and death exports: crawling, claws on the ground, staggering to death', () => {
    expect(normaliseAnimationName('walking', 'Idle')).toBe('walk');
    expect(normaliseAnimationName('a_vicious_claw_swipe_in_the_exact_direction_the_ch', 'Idle')).toBe('attack');
    expect(normaliseAnimationName('climb', 'Idle')).toBe('climb');
    expect(normaliseAnimationName('dragging_itself_forward', 'the same zombie craw')).toBe('crawl');
    expect(normaliseAnimationName('ground-level_claw', 'the same zombie craw')).toBe('crawl_attack');
    expect(normaliseAnimationName('the same zombie craw')).toBe('crawl');
    // "…drops the handgun" must not become a shot.
    expect(normaliseAnimationName('the_character_is_hit_staggers_and_drops_the_handgu', 'Idle')).toBe('death');
    expect(normaliseAnimationName('the character is hit and drops the handgun', 'Idle')).not.toBe('death');
    expect(normaliseAnimationName('Zombie dies')).toBe('death');
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

  it('fills the missing directions of a partial export with the nearest one, on the same side', () => {
    const { directions, rows, filled } = directionRows(all(['south', 'east', 'west']));
    expect(directions).toBe(8);
    expect(rows.map((r) => r[0])).toEqual([
      'south.png',
      'east.png', // south-east: as near as south, but on the east side
      'east.png',
      'east.png', // north-east
      'east.png', // north: east and west tie, east comes first
      'west.png', // north-west
      'west.png',
      'west.png', // south-west
    ]);
    expect(filled).toContain('north ← east');
    expect(nearestDirection('north', ['south', 'west'])).toBe('west');
    expect(nearestDirection('south-east', ['south', 'north'])).toBe('south');
  });
});

describe('selectAnimations', () => {
  const DIRS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west'];
  const anim = (sourceName: string, name: string, dirs: string[]): ExportAnimation => ({
    name,
    sourceName,
    width: 48,
    height: 48,
    frames: new Map(dirs.map((d) => [d, [`${d}.png`]])),
  });

  it('imports the rotations as idle next to the animations (real export shape)', () => {
    const parsed = parsePixelLabMetadata({
      export_version: '3.1',
      states: [
        {
          character: { name: 'Idle', size: { width: 48, height: 48 } },
          folder: 'Idle',
          frames: {
            rotations: Object.fromEntries(DIRS.map((d) => [d, `Idle/rotations/${d}.png`])),
            animations: {
              Running: Object.fromEntries(DIRS.map((d) => [d, [`r/${d}/0.png`, `r/${d}/1.png`]])),
              Walking: { south: ['w/south/0.png'] },
            },
          },
        },
      ],
    });
    const { selected, skipped } = selectAnimations(parsed.animations);
    expect(selected.map((a) => [a.name, a.sourceName])).toEqual([
      ['walk', 'Running'],
      ['idle', 'Idle (rotaciones)'],
    ]);
    expect(skipped).toEqual(['"Walking": solo tiene south; se omite']);
  });

  it('prefers a run over a walk when both are complete', () => {
    const { selected, skipped } = selectAnimations([anim('Walking', 'walk', DIRS), anim('Running', 'walk', DIRS)]);
    expect(selected.map((a) => a.sourceName)).toEqual(['Running']);
    expect(skipped).toHaveLength(1);
  });
});

describe('resolveTakes', () => {
  const frames = new Map([
    ['south', ['s.png']],
    ['north-36c131c0', ['a.png']],
    ['north-e16e1c8c', ['b.png']],
  ]);

  it('keeps the first take of a duplicated direction by default', () => {
    const { frames: out, notes } = resolveTakes(frames);
    expect(out.get('north')).toEqual(['a.png']);
    expect(out.get('south')).toEqual(['s.png']);
    expect(notes).toHaveLength(1);
  });

  it('uses the take chosen in import.json', () => {
    expect(resolveTakes(frames, { north: 'north-e16e1c8c' }).frames.get('north')).toEqual(['b.png']);
  });

  it('falls back to the first take when the chosen one does not exist', () => {
    const { frames: out, notes } = resolveTakes(frames, { north: 'north-deadbeef' });
    expect(out.get('north')).toEqual(['a.png']);
    expect(notes[0]).toContain('no existe');
  });
});
