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
 * The common finish (spec 08 §4.2): nothing under 60 Hz, trimmed at both
 * ends (it starts at its onset, so at once), at least 5 ms of fade at the
 * end so it never clicks, and the peak at −1 dB (the relative volume is
 * the catalog's).
 */
export function finish(input: Audio): Audio {
  const a = eachChannel(input, (ch) => biquad(ch, 'highpass', AUDIO_GEN.highpass, input.sampleRate));
  const p = peakOf(a);
  if (p === 0) return { sampleRate: a.sampleRate, channels: a.channels.map(() => new Float32Array(0)) };
  const n = frames(a);
  const above = (i: number, floor: number): boolean => a.channels.some((ch) => Math.abs(ch[i] ?? 0) >= floor);
  // It starts where it first reaches onsetDb (whatever came before is room noise), after a short fade-in…
  const onset = p * dbToGain(AUDIO_GEN.onsetDb);
  let start = 0;
  while (start < n && !above(start, onset)) start++;
  const fadeIn = Math.min(start, Math.round(AUDIO_GEN.onsetFade * a.sampleRate));
  start -= fadeIn;
  // …and ends where it falls under silenceDb for good, with a fade-out.
  const floor = p * dbToGain(AUDIO_GEN.silenceDb);
  let end = n;
  while (end > start && !above(end - 1, floor)) end--;
  const fade = Math.min(end - start, Math.round(AUDIO_GEN.fadeOut * a.sampleRate));
  const trimmed = eachChannel(a, (ch) => {
    const out = ch.slice(start, end);
    for (let i = 0; i < fadeIn; i++) out[i] = (out[i] ?? 0) * (i / fadeIn);
    for (let i = 0; i < fade; i++) out[out.length - 1 - i] = (out[out.length - 1 - i] ?? 0) * (i / fade);
    return out;
  });
  return normalize(trimmed, AUDIO_GEN.peakDb);
}

/**
 * The finish of a loop (the laser, the flamethrower, the heartbeat): nothing
 * under 60 Hz and the peak at −1 dB like any file, but no trim nor fades.
 * Its last `AUDIO_GEN.loopCrossfade` seconds are blended into its start
 * (equal power), so its end runs into its start without a seam or a click.
 */
export function finishLoop(input: Audio): Audio {
  const sr = input.sampleRate;
  const a = eachChannel(input, (ch) => biquad(ch, 'highpass', AUDIO_GEN.highpass, sr));
  const n = frames(a);
  const x = Math.min(Math.floor(n / 2), Math.round(AUDIO_GEN.loopCrossfade * sr));
  const looped = eachChannel(a, (ch) => {
    const out = ch.slice(0, n - x);
    for (let i = 0; i < x; i++) {
      const t = (i / x) * (Math.PI / 2);
      out[i] = (ch[i] ?? 0) * Math.sin(t) + (ch[n - x + i] ?? 0) * Math.cos(t);
    }
    return out;
  });
  return normalize(looped, AUDIO_GEN.peakDb);
}

/**
 * The music's finish (§7): nothing under AUDIO_GEN.music.highpass, its
 * silent ends trimmed, its last `crossfade` s blended into its start (the
 * loop, with no seam), and `margin` s of the loop on each side, so a
 * decoder that shifts the audio by less than that still loops between
 * `loopStart` and `loopEnd` without a jump. Every track equally loud on
 * average (`rmsDb`), unless its peak would pass −1 dB.
 */
export function finishMusic(input: Audio): { audio: Audio; loopStart: number; loopEnd: number } {
  const sr = input.sampleRate;
  const { highpass, crossfade, margin } = AUDIO_GEN.music;
  const a = eachChannel(input, (ch) => biquad(ch, 'highpass', highpass, sr));
  const p = peakOf(a);
  const floor = p * dbToGain(AUDIO_GEN.silenceDb);
  const above = (i: number): boolean => a.channels.some((ch) => Math.abs(ch[i] ?? 0) >= floor);
  let start = 0;
  let end = frames(a);
  while (start < end && !above(start)) start++;
  while (end > start && !above(end - 1)) end--;
  const n = end - start;
  const x = Math.min(Math.floor(n / 4), Math.round(crossfade * sr));
  const period = n - x;
  const m = Math.min(Math.round(margin * sr), period);
  // The same music at both ends (a source that already loops, its start appended): a linear fade adds up to it exactly.
  let both = 0;
  let head = 0;
  let tail = 0;
  for (const ch of a.channels) {
    for (let i = 0; i < x; i++) {
      const h = ch[start + i] ?? 0;
      const t = ch[start + period + i] ?? 0;
      both += h * t;
      head += h * h;
      tail += t * t;
    }
  }
  const linear = head > 0 && tail > 0 && both / Math.sqrt(head * tail) > AUDIO_GEN.music.sameMaterial;
  const looped = eachChannel(a, (ch) => {
    const body = ch.slice(start, start + period);
    for (let i = 0; i < x; i++) {
      const t = (i / x) * (Math.PI / 2);
      const [fadeIn, fadeOut] = linear ? [i / x, 1 - i / x] : [Math.sin(t), Math.cos(t)];
      body[i] = (ch[start + i] ?? 0) * fadeIn + (ch[start + period + i] ?? 0) * fadeOut;
    }
    // The loop's own end before it and its own start after it.
    const out = new Float32Array(period + 2 * m);
    out.set(body.subarray(period - m), 0);
    out.set(body, m);
    out.set(body.subarray(0, m), m + period);
    return out;
  });
  let sum = 0;
  for (const ch of looped.channels) for (let i = m; i < m + period; i++) sum += (ch[i] ?? 0) ** 2;
  const rms = Math.sqrt(sum / Math.max(1, period * looped.channels.length));
  const gain = Math.min(rms > 0 ? dbToGain(AUDIO_GEN.music.rmsDb) / rms : 1, dbToGain(AUDIO_GEN.peakDb) / Math.max(peakOf(looped), 1e-9));
  return { audio: eachChannel(looped, (ch) => ch.map((v) => v * gain)), loopStart: m / sr, loopEnd: (m + period) / sr };
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
