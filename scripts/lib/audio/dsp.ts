/**
 * Signal processing of the sound workshop (spec 08 §4.2): filters and the
 * common finish every file gets. Pure and deterministic: samples in,
 * samples out, no randomness but a seeded one.
 */
import { AUDIO_GEN } from '../../../src/config/audio';
import { frames, type Audio } from './wav';

export const dbToGain = (db: number): number => 10 ** (db / 20);

/** A small seeded generator (mulberry32), 0..1: the same seed, the same noise. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BiquadKind = 'lowpass' | 'highpass' | 'peak' | 'bandpass';

/** A 2-pole filter (RBJ cookbook) at `freq` Hz; `gainDb` for a peak; `q` 0.707 by default. */
export function biquad(samples: Float32Array, kind: BiquadKind, freq: number, sampleRate: number, q = Math.SQRT1_2, gainDb = 0): Float32Array {
  const out = new Float32Array(samples.length);
  const f = Math.min(freq, sampleRate * 0.49);
  const w0 = (2 * Math.PI * f) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const A = 10 ** (gainDb / 40);
  let b0: number;
  let b1: number;
  let b2: number;
  let a0: number;
  let a1: number;
  let a2: number;
  switch (kind) {
    case 'lowpass':
      [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
      [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
      break;
    case 'highpass':
      [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
      [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
      break;
    case 'bandpass':
      [b0, b1, b2] = [alpha, 0, -alpha];
      [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
      break;
    case 'peak':
      [b0, b1, b2] = [1 + alpha * A, -2 * cos, 1 - alpha * A];
      [a0, a1, a2] = [1 + alpha / A, -2 * cos, 1 - alpha / A];
      break;
  }
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i] ?? 0;
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    out[i] = y;
    x2 = x1;
    x1 = x;
    y2 = y1;
    y1 = y;
  }
  return out;
}

/** Applies `fn` to every channel. */
export function eachChannel(a: Audio, fn: (samples: Float32Array) => Float32Array): Audio {
  return { sampleRate: a.sampleRate, channels: a.channels.map(fn) };
}

function peakOf(a: Audio): number {
  let p = 0;
  for (const ch of a.channels) for (const s of ch) p = Math.max(p, Math.abs(s));
  return p;
}

/** Scales every sample so the loudest is at `db` dBFS. */
export function normalize(a: Audio, db: number): Audio {
  const p = peakOf(a);
  if (p === 0) return a;
  const g = dbToGain(db) / p;
  return eachChannel(a, (ch) => ch.map((s) => s * g));
}

/**
 * The common finish (spec 08 §4.2): nothing under 60 Hz, the silence at
 * both ends trimmed (the sound starts at once), at least 5 ms of fade at
 * the end so it never clicks, and the peak at −1 dB (the relative volume
 * is the catalog's).
 */
export function finish(input: Audio): Audio {
  const a = eachChannel(input, (ch) => biquad(ch, 'highpass', AUDIO_GEN.highpass, input.sampleRate));
  const p = peakOf(a);
  if (p === 0) return { sampleRate: a.sampleRate, channels: a.channels.map(() => new Float32Array(0)) };
  const floor = p * dbToGain(AUDIO_GEN.silenceDb);
  const n = frames(a);
  const loud = (i: number): boolean => a.channels.some((ch) => Math.abs(ch[i] ?? 0) >= floor);
  let start = 0;
  while (start < n && !loud(start)) start++;
  let end = n;
  while (end > start && !loud(end - 1)) end--;
  const fade = Math.min(end - start, Math.round(AUDIO_GEN.fadeOut * a.sampleRate));
  const trimmed = eachChannel(a, (ch) => {
    const out = ch.slice(start, end);
    for (let i = 0; i < fade; i++) out[out.length - 1 - i] = (out[out.length - 1 - i] ?? 0) * (i / fade);
    return out;
  });
  return normalize(trimmed, AUDIO_GEN.peakDb);
}

/** Mixes `src` into `dst` (same channel count, or mono into any) at `offset` frames, scaled by `gain`. */
export function mixInto(dst: Audio, src: Audio, offset: number, gain: number): void {
  dst.channels.forEach((ch, c) => {
    const from = src.channels[Math.min(c, src.channels.length - 1)];
    if (!from) return;
    for (let i = 0; i < from.length && offset + i < ch.length; i++) ch[offset + i] = (ch[offset + i] ?? 0) + (from[i] ?? 0) * gain;
  });
}

/** Silence of `seconds`, with `count` channels. */
export function silence(seconds: number, count: number, sampleRate: number): Audio {
  return { sampleRate, channels: Array.from({ length: count }, () => new Float32Array(Math.max(0, Math.round(seconds * sampleRate)))) };
}
