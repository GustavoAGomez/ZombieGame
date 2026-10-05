import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseManifest } from '../game/assets/manifest';
import { AUDIO, SOUNDS, nextVolumeLevel } from './audio';
import { HAND } from './balance';

const manifest = parseManifest(JSON.parse(readFileSync(new URL('../../public/assets/manifest.json', import.meta.url), 'utf8')));

describe('sound catalog (spec 08 §1.1)', () => {
  it('has no repeated id, and every variant is in the manifest', () => {
    const ids = SOUNDS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SOUNDS) for (const key of s.variants) expect(manifest.audio[key], `${s.id}: ${key}`).toBeDefined();
  });

  it('keeps every number in range', () => {
    for (const s of SOUNDS) {
      expect(s.variants.length, s.id).toBeGreaterThanOrEqual(1);
      expect(s.variants.length, s.id).toBeLessThanOrEqual(4);
      expect(s.volume, s.id).toBeGreaterThan(0);
      expect(s.volume, s.id).toBeLessThanOrEqual(1);
      expect(s.pitchVar, s.id).toBeGreaterThanOrEqual(0);
      expect(s.maxVoices, s.id).toBeGreaterThanOrEqual(1);
      expect(s.minInterval, s.id).toBeGreaterThanOrEqual(0);
    }
  });

  it('makes the hand\'s draw last as long as the draw (spec 08 §5.3)', () => {
    expect(manifest.audio.hand_roll?.duration).toBeCloseTo(HAND.rollingTime, 2);
  });

  it('rotates the volume setting ALTO → MEDIO → BAJO → NO → ALTO', () => {
    expect(AUDIO.levelOrder.map(nextVolumeLevel)).toEqual(['medium', 'low', 'off', 'high']);
  });
});
