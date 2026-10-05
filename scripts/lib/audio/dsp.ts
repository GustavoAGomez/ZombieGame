/**
 * Signal processing of the sound generator (spec 08 §4): the low-pass that
 * keeps frequent sounds from shrieking, and the finish every file gets.
 * Pure: samples in, samples out.
 */
import { AUDIO_GEN } from '../../../src/config/audio';

const dbToGain = (db: number): number => 10 ** (db / 20);

/** A 2-pole low-pass (RBJ cookbook, Q = 0.707) at `cutoff` Hz. */
export function lowpass(samples: Float32Array, cutoff: number, sampleRate: number): Float32Array {
  const out = new Float32Array(samples.length);
  if (cutoff >= sampleRate / 2) {
    out.set(samples);
    return out;
  }
  const w0 = (2 * Math.PI * cutoff) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 - cos) / 2 / a0;
  const b1 = (1 - cos) / a0;
  const b2 = b0;
  const a1 = (-2 * cos) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] ?? 0;
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

function peak(samples: Float32Array): number {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

/**
 * The common finish (spec 08 §4.2): the silence at both ends trimmed (the
 * sound starts at once), a 5 ms fade at the end so it never clicks, and
 * the peak at −1 dB (the relative volume is the catalog's).
 */
export function finish(samples: Float32Array, sampleRate: number): Float32Array {
  const p = peak(samples);
  if (p === 0) return new Float32Array(0);
  const floor = p * dbToGain(AUDIO_GEN.silenceDb);
  let start = 0;
  while (start < samples.length && Math.abs(samples[start] ?? 0) < floor) start++;
  let end = samples.length;
  while (end > start && Math.abs(samples[end - 1] ?? 0) < floor) end--;
  const out = samples.slice(start, end);
  const gain = dbToGain(AUDIO_GEN.peakDb) / p;
  const fade = Math.min(out.length, Math.round(AUDIO_GEN.fadeOut * sampleRate));
  for (let i = 0; i < out.length; i++) {
    const fromEnd = out.length - 1 - i;
    const f = fromEnd < fade ? fromEnd / fade : 1;
    out[i] = (out[i] ?? 0) * gain * f;
  }
  return out;
}
