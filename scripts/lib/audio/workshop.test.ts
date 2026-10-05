import { describe, expect, it } from 'vitest';
import { AUDIO_GEN, type SoundDef } from '../../../src/config/audio';
import { renderFile } from '../../audio-gen';
import { measure } from './analyze';
import { RecipeError, parseRecipe, parseSoundRecipes } from './recipes';
import { buildReport, type ReportRow } from './report';
import { noteFrequency, SynthError } from './synth';
import { decodeWav } from './wav';

const TAP = {
  type: 'layers',
  layers: [
    { recipe: { type: 'synth', timbre: 'glass', note: 'E6', duration: 0.12 }, gain: 0.8 },
    { recipe: { type: 'synth', timbre: 'air', freq: 500, freqEnd: 300, duration: 0.05, seed: 11 }, gain: 0.5 },
  ],
};
const gen = (json: unknown, channels: 1 | 2 = 1): Uint8Array => renderFile(parseRecipe(json, 'test'), channels);

const sound = (patch: Partial<SoundDef> = {}): SoundDef => ({
  id: 'ui.tap',
  family: 'ui',
  variants: ['a', 'b'],
  bus: 'ui',
  volume: 1,
  pitchVar: 0,
  maxVoices: 1,
  minInterval: 0,
  priority: 'low',
  positional: false,
  ladder: null,
  duck: false,
  ...patch,
});
const row = (key: string, bytes: Uint8Array, s = sound(), letter = 'A'): ReportRow => ({ key, sound: s, letter, inGame: true, about: '', measures: measure(decodeWav(bytes)) });

describe('sound workshop (spec 08 §4)', () => {
  it('gives the same bytes for the same recipe, and other bytes for another seed', () => {
    expect(gen(TAP)).toEqual(gen(structuredClone(TAP)));
    const other = structuredClone(TAP);
    other.layers[1]!.recipe.seed = 12;
    expect(gen(other)).not.toEqual(gen(TAP));
  });

  it('writes WAV of 44.1 kHz and 16 bits, mono or stereo', () => {
    expect(decodeWav(gen(TAP)).channels).toHaveLength(1);
    const stereo = decodeWav(gen(TAP, 2));
    expect([stereo.channels.length, stereo.sampleRate, stereo.bitsPerSample]).toEqual([2, 44100, 16]);
  });

  it('applies the common finish: starts at once, peak at −1 dB, faded at the end, nothing under 60 Hz', () => {
    const late = { type: 'layers', layers: [{ recipe: { type: 'synth', timbre: 'bell', note: 'A4', duration: 0.3 }, gain: 1, delay: 0.05 }] };
    const wav = decodeWav(gen(late));
    const m = measure(wav);
    expect(m.leadingSilence).toBeLessThanOrEqual(AUDIO_GEN.maxLeadingSilence);
    expect(m.peakDb).toBeCloseTo(AUDIO_GEN.peakDb, 1);
    expect(Math.abs(wav.channels[0]?.at(-1) ?? 1)).toBeLessThan(0.01);
    // A0 (27.5 Hz) and A5 at the same level: the high-pass at 60 Hz leaves little of the low one.
    const pad = (note: string) => ({ recipe: { type: 'synth', timbre: 'pad', note, duration: 0.5, attack: 0.01, width: 0 }, gain: 1 });
    const m2 = measure(decodeWav(gen({ type: 'layers', layers: [pad('A0'), pad('A5')] })));
    expect(m2.bands[0] ?? 1).toBeLessThan(0.1);
  });

  it('only takes notes of A minor', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440);
    expect(noteFrequency('F5')).toBeCloseTo(698.46, 1);
    expect(() => noteFrequency('C#5')).toThrow(SynthError);
    expect(() => parseRecipe({ type: 'synth', timbre: 'bell', note: 'G#4' }, 'x')).toThrow(RecipeError);
    expect(() => parseRecipe({ type: 'synth', timbre: 'bell' }, 'x')).toThrow(/note/);
  });

  it('reads a sound\'s candidates and the chosen one, A required', () => {
    const file = parseSoundRecipes({ chosen: null, candidates: { A: { variants: [TAP] }, C: { channels: 2, variants: [TAP] } } }, 'ui.tap');
    expect([file.chosen, Object.keys(file.candidates), file.candidates.C?.channels]).toEqual([null, ['A', 'C'], 2]);
    expect(() => parseSoundRecipes({ chosen: 'B', candidates: { A: { variants: [TAP] } } }, 'x')).toThrow(/no hay candidato B/);
    expect(() => parseSoundRecipes({ chosen: null, candidates: { B: { variants: [TAP] } } }, 'x')).toThrow(/candidato A/);
  });
});

describe('workshop report (spec 08 §4.5)', () => {
  it('warns of a file out of its family\'s length, of clipping, of a stereo positional file and of near-identical variants', () => {
    const long = gen({ type: 'synth', timbre: 'pad', note: 'A4', duration: 0.6, attack: 0.05 });
    const clipped = row('c', gen(TAP));
    clipped.measures = { ...clipped.measures, clippedRuns: 2 };
    const { warnings } = buildReport([
      row('a', long),
      row('b', long),
      clipped,
      row('d', gen(TAP, 2), sound({ id: 'impact.flesh', family: 'hit', positional: true, variants: ['d'] })),
    ]);
    expect(warnings.some((w) => w.startsWith('a: dura') && w.includes('Interfaz'))).toBe(true);
    expect(warnings.some((w) => w.includes('casi idénticas'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('c: saturado'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('d: es estéreo'))).toBe(true);
  });

  it('warns when most of the energy is under 100 Hz, where a phone plays nothing', () => {
    const rumble = gen({ type: 'synth', timbre: 'sub', freq: 70, duration: 0.3 });
    const { warnings } = buildReport([row('r', rumble, sound({ id: 'boss.landed', family: 'threat', variants: ['r'] }))]);
    expect(warnings.some((w) => w.includes('por debajo de 100 Hz'))).toBe(true);
  });
});
