/**
 * The support layers made by code (spec 08 §4.3): a small synthesizer with
 * five timbres, never square waves nor 8-bit: `bell`, `glass`, `sub`, `air`
 * and `pad`. Deterministic: the same parameters (and seed) always give the
 * same samples.
 */
import { AUDIO_GEN } from '../../../src/config/audio';
import { biquad, seeded } from './dsp';

export type Timbre = 'bell' | 'glass' | 'sub' | 'air' | 'pad';

/** One struck note of a melody: its pitch, when it starts after the previous one, and its gain. */
export interface Strike {
  note: string;
  /** Seconds to the next strike. */
  step: number;
  gain: number;
}

export interface SynthParams {
  timbre: Timbre;
  /** The notes struck in turn (bell, glass, pad); one for a single note. */
  notes: Strike[];
  /** Seconds each note rings (bell, glass) or holds (pad); a sub's or an air's length. */
  duration: number;
  /** Seconds to full volume. */
  attack: number;
  /** sub: Hz it falls to (it starts an octave over); air: band centre at the start and at the end, Hz. */
  freq: number;
  freqEnd: number;
  /** air: band width (Q); pad: detune in cents. */
  width: number;
  /** air: its noise. */
  seed: number;
}

const NOTE = /^([A-G])([#b]?)(\d)$/;
const SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export class SynthError extends Error {
  override name = 'SynthError';
}

/** Frequency of a note of A minor (A4 = 440 Hz); throws on a note out of the key (§3.3 rule 2). */
export function noteFrequency(name: string): number {
  const m = NOTE.exec(name);
  if (!m) throw new SynthError(`nota «${name}» no válida (ejemplo: A4, C5, E6)`);
  const [, letter = '', accidental = '', octave = '4'] = m;
  if (accidental || !(AUDIO_GEN.scale as readonly string[]).includes(letter)) {
    throw new SynthError(`la nota «${name}» está fuera de La menor (${AUDIO_GEN.scale.join(', ')})`);
  }
  const midi = 12 * (Number(octave) + 1) + (SEMITONES[letter] ?? 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

/** A bell's partials: frequency ratio, level and how fast it dies (×: higher dies sooner). */
const BELL = [
  [0.5, 0.35, 0.6],
  [1, 1, 1],
  [1.19, 0.45, 1.3],
  [1.5, 0.3, 1.6],
  [2, 0.4, 2],
  [2.51, 0.18, 2.6],
  [3, 0.12, 3.2],
  [4.07, 0.08, 4],
] as const;
/** Glass: few inharmonic partials, high and short. */
const GLASS = [
  [1, 1, 1],
  [2.76, 0.4, 2.2],
  [5.4, 0.2, 3.5],
  [8.93, 0.08, 5],
] as const;

/** Struck partials of one note, `ring` s to fall to −60 dB for the fundamental. */
function strike(out: Float32Array, at: number, freq: number, partials: readonly (readonly [number, number, number])[], ring: number, attack: number, gain: number, sr: number): void {
  const attackN = Math.max(1, Math.round(attack * sr));
  for (const [ratio, level, speed] of partials) {
    const f = freq * ratio;
    if (f >= sr / 2) continue;
    // −60 dB over ring / speed seconds.
    const k = Math.log(1000) / ((ring / speed) * sr);
    for (let i = 0; at + i < out.length; i++) {
      const env = Math.exp(-k * i) * (i < attackN ? i / attackN : 1);
      if (env < 1e-4 && i > attackN) break;
      out[at + i] = (out[at + i] ?? 0) + Math.sin((2 * Math.PI * f * i) / sr) * level * env * gain;
    }
  }
}

function lengthOf(p: SynthParams): number {
  const steps = p.notes.reduce((sum, n, i) => sum + (i < p.notes.length - 1 ? n.step : 0), 0);
  return steps + p.duration;
}

/** Renders a synth layer to mono samples. */
export function renderSynth(p: SynthParams, sr: number): Float32Array {
  const out = new Float32Array(Math.ceil(lengthOf(p) * sr));
  switch (p.timbre) {
    case 'bell':
    case 'glass': {
      const partials = p.timbre === 'bell' ? BELL : GLASS;
      let at = 0;
      for (const n of p.notes) {
        strike(out, Math.round(at * sr), noteFrequency(n.note), partials, p.duration, p.attack, n.gain, sr);
        at += n.step;
      }
      return out;
    }
    case 'pad': {
      // Detuned sines with a slow attack, held and released over the last third.
      let at = 0;
      for (const n of p.notes) {
        const f = noteFrequency(n.note);
        const start = Math.round(at * sr);
        const len = Math.round(p.duration * sr);
        const attackN = Math.max(1, Math.round(p.attack * sr));
        const releaseN = Math.max(1, Math.round(len / 3));
        for (const cents of [-p.width, 0, p.width]) {
          const fc = f * 2 ** (cents / 1200);
          for (let i = 0; i < len && start + i < out.length; i++) {
            const env = Math.min(1, i / attackN) * Math.min(1, (len - i) / releaseN);
            out[start + i] = (out[start + i] ?? 0) + (Math.sin((2 * Math.PI * fc * i) / sr) * env * n.gain) / 3;
          }
        }
        at += n.step;
      }
      return out;
    }
    case 'sub': {
      // A sine falling from an octave over `freq` to it, quickly, and dying over `duration`.
      const n = out.length;
      const attackN = Math.max(1, Math.round(p.attack * sr));
      let phase = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const f = p.freq * (1 + Math.exp(-t / 0.03));
        phase += (2 * Math.PI * f) / sr;
        const env = Math.min(1, i / attackN) * Math.exp((-5 * t) / p.duration);
        out[i] = Math.sin(phase) * env;
      }
      return out;
    }
    case 'air': {
      // Seeded noise through a band that sweeps from `freq` to `freqEnd`, rising and falling.
      const random = seeded(p.seed);
      const n = out.length;
      const attackN = Math.max(1, Math.round(p.attack * sr));
      const noise = new Float32Array(n);
      for (let i = 0; i < n; i++) noise[i] = random() * 2 - 1;
      // The sweep in 8 slices, each filtered at its own centre, crossfaded.
      const slices = 8;
      for (let s = 0; s < slices; s++) {
        const f = p.freq * (p.freqEnd / p.freq) ** (s / (slices - 1));
        const band = biquad(noise, 'bandpass', f, sr, Math.max(0.3, p.width));
        for (let i = 0; i < n; i++) {
          const pos = (i / n) * (slices - 1);
          const w = Math.max(0, 1 - Math.abs(pos - s));
          if (w === 0) continue;
          const env = Math.min(1, i / attackN) * Math.min(1, (n - i) / Math.max(1, n - attackN));
          out[i] = (out[i] ?? 0) + (band[i] ?? 0) * w * env;
        }
      }
      return out;
    }
  }
}
