import { describe, expect, it } from 'vitest';
import { AUDIO_GEN, type SoundDef } from '../../../src/config/audio';
import { measure } from './analyze';
import { finish } from './dsp';
import { renderFile } from '../../audio-gen';
import { RecipeError, noteFrequency, parseRecipe, parseRecipeFile } from './recipes';
import { buildReport } from './report';
import { SFXR_DEFAULTS, sfxrFromLink, type SfxrParams } from './sfxr';
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
    const tap: SoundDef = { id: 'ui.tap', family: 'ui', variants: ['a', 'b'], bus: 'ui', volume: 1, pitchVar: 0, maxVoices: 1, minInterval: 0, priority: 'low', positional: false, ladder: null, duck: false, loop: false };
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

describe('audio:gen recipes sfxr and layers (spec 08 §4.1)', () => {
  const SHOT = { type: 'sfxr', seed: 3, params: { wave_type: 3, p_base_freq: 0.45, p_env_sustain: 0.05, p_env_decay: 0.17 } };

  it('renders sfxr with a seeded noise: the same seed, the same bytes; another seed, another file', () => {
    expect(generate(SHOT)).toEqual(generate(structuredClone(SHOT)));
    expect(generate({ ...SHOT, seed: 4 })).not.toEqual(generate(SHOT));
    // sustain 0.05² + decay 0.17² × 100000 samples at 44.1 kHz.
    expect(decodeWav(generate(SHOT)).duration).toBeLessThan((0.05 ** 2 + 0.17 ** 2) * 100000 / SR + 0.001);
  });

  it('reads an sfxr.me link: the wave type in a byte, then each parameter as a float', () => {
    const params = { ...SFXR_DEFAULTS, wave_type: 3, p_base_freq: 0.45, p_freq_ramp: -0.35, p_env_decay: 0.17 };
    const link = `https://sfxr.me/#${toB58(params)}`;
    const back = sfxrFromLink(link);
    for (const [name, value] of Object.entries(params)) expect(back[name as keyof SfxrParams], name).toBeCloseTo(value, 6);
    const fromLink = parseRecipe({ type: 'sfxr', params: link }, 'x');
    expect(fromLink.type === 'sfxr' && fromLink.params.p_freq_ramp).toBeCloseTo(-0.35, 6);
  });

  it('mixes layers at their delay and gain', () => {
    const click = { type: 'notes', wave: 'square', attack: 0.001, decay: null, notes: [['A5', 0.02]], lowpass: null };
    const mix = render(parseRecipe({ type: 'layers', layers: [{ recipe: click }, { recipe: click, gain: 0.5, delay: 0.05 }] }, 'x'), SR);
    expect(mix.length).toBe(Math.round(0.05 * SR) + Math.round(0.02 * SR));
    const peakAt = (from: number, to: number): number => Math.max(...Array.from(mix.subarray(from, to), Math.abs));
    expect(peakAt(Math.round(0.055 * SR), Math.round(0.065 * SR))).toBeCloseTo(peakAt(0, Math.round(0.015 * SR)) / 2, 1);
  });

  it('cuts a loop without trimming nor fading it, its end crossfaded into its start', () => {
    const hum = { type: 'notes', wave: 'sine', attack: 0, decay: null, notes: [['A3', 0.5]], lowpass: null };
    const samples = renderFile(parseRecipeFile({ ...hum, loop: true, crossfade: 0.05 }, 'x'));
    expect(samples.length).toBe(Math.round(0.45 * SR));
    // The wrap from the last sample to the first is as smooth as any step of a 220 Hz sine.
    const step = Math.abs((samples[0] ?? 0) - (samples[samples.length - 1] ?? 0));
    expect(step).toBeLessThan((2 * Math.PI * 220) / SR + 0.01);
    expect(renderFile(parseRecipeFile({ ...hum, loop: true, length: 0.8 }, 'x')).length).toBe(Math.round(0.8 * SR));
  });
});

/** jsfxr's encoder (Params.toB58), to test the reader against it. */
function toB58(params: SfxrParams): string {
  const bytes: number[] = [];
  const view = new DataView(new ArrayBuffer(4));
  for (const [name, value] of Object.entries(params) as [string, number][]) {
    if (name === 'wave_type') {
      bytes.push(value);
      continue;
    }
    view.setFloat32(0, value);
    const bits = view.getUint32(0);
    bytes.push(bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff);
  }
  const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  const digits: number[] = [];
  let out = '';
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i] ?? 0;
    if (carry === 0 && out.length === i) out += '1';
    for (let j = 0; j < digits.length || carry; j++) {
      const n = (digits[j] ?? 0) * 256 + carry;
      carry = (n / 58) | 0;
      digits[j] = n % 58;
    }
  }
  for (let j = digits.length - 1; j >= 0; j--) out += alphabet[digits[j] ?? 0];
  return out;
}
