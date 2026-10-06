/**
 * The processing chain of a layer or a final sound (spec 08 §4.2), all of
 * it optional and in this order: trim, reverse, pitch and speed (or a
 * glide), EQ, compression and soft saturation, reverb, stereo width or
 * mono, gain, length and fades. Pure and deterministic.
 */
import { biquad, dbToGain, eachChannel, normalize } from './dsp';
import { frames, type Audio } from './wav';

export interface Peak {
  freq: number;
  gainDb: number;
  q: number;
}

export interface Process {
  /** Keeps start..end seconds of it (end null: to its end). */
  start: number;
  end: number | null;
  /** Played backwards: the magic rises that run into a blow. */
  reverse: boolean;
  /** Pitch and speed together (a tape): semitones up or down. */
  semitones: number;
  /** Semitones more (or less) by the end: a pitch that slides, like a beam breaking or a bell dying away. */
  glide: number;
  /** Cut under / over, Hz (null: none). */
  lowcut: number | null;
  highcut: number | null;
  /** Boosts or dips of a band. */
  peaks: Peak[];
  /** Compression for punch: threshold (dBFS) and ratio (1: off). */
  threshold: number;
  ratio: number;
  /** Soft saturation, 0 (off) to 1. */
  drive: number;
  /** Reverb: none, `room` (short) or `hall` (long), and its wet share. */
  reverb: 'none' | 'room' | 'hall';
  wet: number;
  /** Stereo width: 0 mono, 1 as it is, up to 2 wider. */
  width: number;
  /** Volume change, dB. */
  gainDb: number;
  /** The final length, seconds (null: as it comes): cut, a reverb's tail too, or padded with silence. */
  length: number | null;
  /** Fades at the start and at the end, seconds. */
  fadeIn: number;
  fadeOut: number;
}

export const NO_PROCESS: Readonly<Process> = {
  start: 0,
  end: null,
  reverse: false,
  semitones: 0,
  glide: 0,
  lowcut: null,
  highcut: null,
  peaks: [],
  threshold: 0,
  ratio: 1,
  drive: 0,
  reverb: 'none',
  wet: 0.2,
  width: 1,
  gainDb: 0,
  length: null,
  fadeIn: 0,
  fadeOut: 0,
};

/** Resamples by `rate` (> 1: higher and shorter), with linear interpolation. */
function resample(samples: Float32Array, rate: number): Float32Array {
  const out = new Float32Array(Math.max(1, Math.floor(samples.length / rate)));
  for (let i = 0; i < out.length; i++) {
    const pos = i * rate;
    const j = Math.floor(pos);
    const t = pos - j;
    out[i] = (samples[j] ?? 0) * (1 - t) + (samples[j + 1] ?? 0) * t;
  }
  return out;
}

/** Resamples with a rate that slides from `from` to `to` semitones along the input (a tape speeding up or slowing down). */
function glideResample(samples: Float32Array, from: number, to: number): Float32Array {
  const n = samples.length;
  const out = new Float32Array(Math.ceil(n / 2 ** (Math.min(from, to) / 12)) + 1);
  let pos = 0;
  let i = 0;
  while (pos < n - 1 && i < out.length) {
    const j = Math.floor(pos);
    const t = pos - j;
    out[i++] = (samples[j] ?? 0) * (1 - t) + (samples[j + 1] ?? 0) * t;
    pos += 2 ** ((from + (to - from) * (pos / n)) / 12);
  }
  return out.slice(0, Math.max(1, i));
}

/** A feed-forward compressor on the channels' common level. */
function compress(a: Audio, threshold: number, ratio: number): Audio {
  const n = frames(a);
  const attack = Math.exp(-1 / (0.003 * a.sampleRate));
  const release = Math.exp(-1 / (0.08 * a.sampleRate));
  let env = 0;
  const gains = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let level = 0;
    for (const ch of a.channels) level = Math.max(level, Math.abs(ch[i] ?? 0));
    env = level > env ? attack * env + (1 - attack) * level : release * env + (1 - release) * level;
    const db = 20 * Math.log10(Math.max(env, 1e-9));
    const over = db - threshold;
    gains[i] = over > 0 ? dbToGain(-over * (1 - 1 / ratio)) : 1;
  }
  return eachChannel(a, (ch) => ch.map((s, i) => s * (gains[i] ?? 1)));
}

/**
 * A small Schroeder reverb (4 combs and 2 all-passes per channel, the
 * right one a little detuned for width): `room` is short, `hall` long.
 * The tail is added after the sound.
 */
function reverb(a: Audio, kind: 'room' | 'hall', wet: number): Audio {
  const sr = a.sampleRate;
  const room = kind === 'room';
  const feedback = room ? 0.72 : 0.86;
  const damp = room ? 0.35 : 0.25;
  const tail = Math.round((room ? 0.35 : 1.4) * sr);
  const combs = [1116, 1188, 1277, 1356].map((d) => Math.round((d * sr) / 44100 / (room ? 1.6 : 1)));
  const allpasses = [556, 441].map((d) => Math.round((d * sr) / 44100));
  return eachChannel({ sampleRate: sr, channels: a.channels }, (input) => {
    const spread = a.channels.indexOf(input) === 1 ? 23 : 0;
    const n = input.length + tail;
    const wetOut = new Float32Array(n);
    for (const base of combs) {
      const d = base + spread;
      const buf = new Float32Array(d);
      let idx = 0;
      let low = 0;
      for (let i = 0; i < n; i++) {
        const y = buf[idx] ?? 0;
        low = y * (1 - damp) + low * damp;
        buf[idx] = (input[i] ?? 0) + low * feedback;
        wetOut[i] = (wetOut[i] ?? 0) + y / combs.length;
        idx = (idx + 1) % d;
      }
    }
    let x = wetOut;
    for (const base of allpasses) {
      const d = base + spread;
      const buf = new Float32Array(d);
      const out = new Float32Array(n);
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const b = buf[idx] ?? 0;
        const v = x[i] ?? 0;
        out[i] = -v + b;
        buf[idx] = v + b * 0.5;
        idx = (idx + 1) % d;
      }
      x = out;
    }
    const mixed = new Float32Array(n);
    for (let i = 0; i < n; i++) mixed[i] = (input[i] ?? 0) * (1 - wet * 0.5) + (x[i] ?? 0) * wet;
    return mixed;
  });
}

/**
 * Applies a processing chain. A recorded source is normalized to full scale
 * right after its trim (`normalizeSource`), so a layer's gain means the same
 * whatever level it was recorded at.
 */
export function applyProcess(input: Audio, p: Readonly<Process>, normalizeSource = false): Audio {
  const sr = input.sampleRate;
  let a = input;
  if (p.start > 0 || p.end !== null) {
    const from = Math.round(p.start * sr);
    const to = p.end === null ? frames(a) : Math.min(frames(a), Math.round(p.end * sr));
    a = eachChannel(a, (ch) => ch.slice(from, Math.max(from, to)));
  }
  if (normalizeSource) a = normalize(a, 0);
  if (p.reverse) a = eachChannel(a, (ch) => ch.slice().reverse());
  if (p.glide !== 0) a = eachChannel(a, (ch) => glideResample(ch, p.semitones, p.semitones + p.glide));
  else if (p.semitones !== 0) a = eachChannel(a, (ch) => resample(ch, 2 ** (p.semitones / 12)));
  if (p.lowcut !== null) a = eachChannel(a, (ch) => biquad(ch, 'highpass', p.lowcut ?? 20, sr));
  if (p.highcut !== null) a = eachChannel(a, (ch) => biquad(ch, 'lowpass', p.highcut ?? 20000, sr));
  for (const peak of p.peaks) a = eachChannel(a, (ch) => biquad(ch, 'peak', peak.freq, sr, peak.q, peak.gainDb));
  if (p.ratio > 1) a = compress(a, p.threshold, p.ratio);
  if (p.drive > 0) {
    const k = 1 + p.drive * 6;
    a = eachChannel(a, (ch) => ch.map((s) => Math.tanh(s * k) / Math.tanh(k)));
  }
  if (p.reverb !== 'none') a = reverb(a, p.reverb, p.wet);
  if (a.channels.length === 2 && p.width !== 1) {
    const [l, r] = a.channels as [Float32Array, Float32Array];
    const nl = new Float32Array(l.length);
    const nr = new Float32Array(r.length);
    for (let i = 0; i < l.length; i++) {
      const mid = ((l[i] ?? 0) + (r[i] ?? 0)) / 2;
      const side = (((l[i] ?? 0) - (r[i] ?? 0)) / 2) * p.width;
      nl[i] = mid + side;
      nr[i] = mid - side;
    }
    a = { sampleRate: sr, channels: [nl, nr] };
  }
  if (p.length !== null) {
    const n = Math.max(1, Math.round(p.length * sr));
    a = eachChannel(a, (ch) => {
      const out = new Float32Array(n);
      out.set(ch.subarray(0, n));
      return out;
    });
  }
  const g = dbToGain(p.gainDb);
  const fadeIn = Math.round(p.fadeIn * sr);
  const fadeOut = Math.round(p.fadeOut * sr);
  if (g !== 1 || fadeIn > 0 || fadeOut > 0) {
    a = eachChannel(a, (ch) => {
      const out = ch.slice();
      for (let i = 0; i < out.length; i++) {
        let f = g;
        if (i < fadeIn) f *= i / fadeIn;
        const fromEnd = out.length - 1 - i;
        if (fromEnd < fadeOut) f *= fromEnd / fadeOut;
        out[i] = (out[i] ?? 0) * f;
      }
      return out;
    });
  }
  return a;
}
