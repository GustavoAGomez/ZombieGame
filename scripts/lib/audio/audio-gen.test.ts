import { describe, expect, it } from 'vitest';
import { AUDIO_GEN, type SoundDef } from '../../../src/config/audio';
import { measure } from './analyze';
import { finish } from './dsp';
import { RecipeError, noteFrequency, parseRecipe } from './recipes';
import { buildReport } from './report';
import { render } from './synth';
import { decodeWav, encodeWav } from './wav';

const SR = AUDIO_GEN.sampleRate;
const TAP = { type: 'notes', wave: 'triangle', attack: 0.001, decay: 0.012, notes: [['E6', 0.04]] };

function generate(json: unknown): Uint8Array {
  return encodeWav(finish(render(parseRecipe(json, 'test'), SR), SR), SR);
}

describe('audio:gen (spec 08 §4)', () => {
  it('gives the same bytes for the same recipe', () => {
    expect(generate(TAP)).toEqual(generate(structuredClone(TAP)));
  });

  it('writes WAV mono, 44.1 kHz, 16 bits, that reads back', () => {
    const wav = decodeWav(generate(TAP));
    expect([wav.channels, wav.sampleRate, wav.bitsPerSample]).toEqual([1, 44100, 16]);
    expect(wav.duration).toBeGreaterThan(0.03);
  });

  it('applies the common finish: starts at once, peak at −1 dB, faded to silence at the end', () => {
    // A note after 50 ms of rest: the rest is trimmed.
    const { samples } = decodeWav(generate({ ...TAP, notes: [[null, 0.05], ['A4', 0.1]], decay: null }));
    const m = measure(samples, SR);
    expect(m.leadingSilence).toBeLessThanOrEqual(AUDIO_GEN.maxLeadingSilence);
    expect(m.peakDb).toBeCloseTo(AUDIO_GEN.peakDb, 1);
    expect(Math.abs(samples[samples.length - 1] ?? 1)).toBeLessThan(0.01);
  });

  it('only takes notes of A minor pentatonic', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440);
    expect(noteFrequency('E6')).toBeCloseTo(1318.51, 1);
    expect(() => noteFrequency('F4')).toThrow(RecipeError);
    expect(() => noteFrequency('C#5')).toThrow(RecipeError);
    expect(() => parseRecipe({ ...TAP, notes: [['B3', 0.1]] }, 'x')).toThrow(/La menor pentatónica/);
  });

  it('measures a brighter sound as brighter', () => {
    const low = measure(decodeWav(generate({ ...TAP, notes: [['A3', 0.2]], decay: null })).samples, SR);
    const high = measure(decodeWav(generate({ ...TAP, notes: [['A6', 0.2]], decay: null })).samples, SR);
    expect(high.brightness).toBeGreaterThan(low.brightness * 2);
  });

  it('warns of a file out of its family range, of clipping and of near-identical variants', () => {
    const tap: SoundDef = { id: 'ui.tap', family: 'ui', variants: ['a', 'b'], bus: 'ui', volume: 1, pitchVar: 0, maxVoices: 1, minInterval: 0, priority: 'low', positional: false, ladder: null, duck: false };
    const long = measure(decodeWav(generate({ ...TAP, notes: [['E6', 0.5]], decay: null })).samples, SR);
    const clipped = new Float32Array(4410).fill(1);
    const { warnings } = buildReport(
      [
        { key: 'a', measures: long },
        { key: 'b', measures: long },
        { key: 'c', measures: measure(clipped, SR) },
      ],
      [tap],
    );
    expect(warnings.some((w) => w.startsWith('a: dura') && w.includes('Interfaz'))).toBe(true);
    expect(warnings.some((w) => w.includes('casi idénticas'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('c: no lo usa'))).toBe(true);
    const report = buildReport([{ key: 'a', measures: measure(clipped, SR) }], [tap]);
    expect(report.warnings.some((w) => w.includes('saturado'))).toBe(true);
  });
});
