/**
 * Objective measures of a sound file (spec 08 §4.5), since nobody here can
 * hear it: length, peak, average loudness, brightness (spectral centroid),
 * tail, energy by bands, silence at the start, clipping and channels.
 */
import { AUDIO_GEN } from '../../../src/config/audio';
import { dbToGain } from './dsp';
import { frames, type Audio } from './wav';

export interface SoundMeasures {
  /** Seconds. */
  duration: number;
  /** dBFS. */
  peakDb: number;
  /** RMS over the whole sound, dBFS. */
  loudnessDb: number;
  /** Spectral centroid, Hz, weighted by each window's energy: higher is brighter. */
  brightness: number;
  /** Seconds after the last moment the sound is within AUDIO_GEN.tailDb of its peak. */
  tail: number;
  /** Share of the energy in each band (AUDIO_GEN.bands): under 100 Hz, 100–250, 250–1k, 1k–5k, over 5k. */
  bands: number[];
  /** Seconds before the sound reaches 40 dB under its peak. */
  leadingSilence: number;
  /** Runs of samples stuck at full scale (a clipped waveform). */
  clippedRuns: number;
  channels: number;
}

const toDb = (gain: number): number => (gain > 0 ? 20 * Math.log10(gain) : -Infinity);

/** In-place radix-2 FFT (re, im of a power-of-2 length). */
function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j] ?? 0, re[i] ?? 0];
      [im[i], im[j]] = [im[j] ?? 0, im[i] ?? 0];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k);
        const wi = Math.sin(ang * k);
        const a = i + k;
        const b = a + len / 2;
        const xr = (re[b] ?? 0) * wr - (im[b] ?? 0) * wi;
        const xi = (re[b] ?? 0) * wi + (im[b] ?? 0) * wr;
        re[b] = (re[a] ?? 0) - xr;
        im[b] = (im[a] ?? 0) - xi;
        re[a] = (re[a] ?? 0) + xr;
        im[a] = (im[a] ?? 0) + xi;
      }
    }
  }
}

/** The channels mixed down to one. */
function mono(a: Audio): Float32Array {
  const n = frames(a);
  const out = new Float32Array(n);
  for (const ch of a.channels) for (let i = 0; i < n; i++) out[i] = (out[i] ?? 0) + (ch[i] ?? 0) / a.channels.length;
  return out;
}

/** Brightness and energy by bands over Hann windows of AUDIO_GEN.fftSize with half overlap. */
function spectrum(samples: Float32Array, sampleRate: number): { brightness: number; bands: number[] } {
  const n = AUDIO_GEN.fftSize;
  const hop = n / 2;
  const edges = AUDIO_GEN.bands;
  const bandEnergy = new Array<number>(edges.length + 1).fill(0);
  let weighted = 0;
  let energy = 0;
  for (let start = 0; start < Math.max(1, samples.length - hop); start += hop) {
    const re = new Float64Array(n);
    const im = new Float64Array(n);
    for (let i = 0; i < n; i++) re[i] = (samples[start + i] ?? 0) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)));
    fft(re, im);
    let num = 0;
    let den = 0;
    for (let k = 1; k < n / 2; k++) {
      const f = (k * sampleRate) / n;
      const mag = Math.hypot(re[k] ?? 0, im[k] ?? 0);
      num += mag * f;
      den += mag;
      let band = edges.findIndex((edge) => f < edge);
      if (band < 0) band = edges.length;
      bandEnergy[band] = (bandEnergy[band] ?? 0) + mag * mag;
    }
    if (den === 0) continue;
    const e = den * den;
    weighted += (num / den) * e;
    energy += e;
  }
  const total = bandEnergy.reduce((a, b) => a + b, 0);
  return { brightness: energy === 0 ? 0 : weighted / energy, bands: bandEnergy.map((e) => (total === 0 ? 0 : e / total)) };
}

/** The tail: what follows the last 10 ms window within AUDIO_GEN.tailDb of the loudest one. */
function tailOf(samples: Float32Array, sampleRate: number): number {
  const win = Math.max(1, Math.round(0.01 * sampleRate));
  const levels: number[] = [];
  for (let start = 0; start < samples.length; start += win) {
    let sum = 0;
    const end = Math.min(samples.length, start + win);
    for (let i = start; i < end; i++) sum += (samples[i] ?? 0) ** 2;
    levels.push(Math.sqrt(sum / Math.max(1, end - start)));
  }
  const loudest = Math.max(0, ...levels);
  const floor = loudest * dbToGain(AUDIO_GEN.tailDb);
  let last = 0;
  levels.forEach((level, i) => {
    if (level >= floor) last = i;
  });
  return Math.max(0, samples.length / sampleRate - ((last + 1) * win) / sampleRate);
}

export function measure(a: Audio): SoundMeasures {
  const samples = mono(a);
  let peak = 0;
  let sum = 0;
  for (const ch of a.channels) for (const s of ch) peak = Math.max(peak, Math.abs(s));
  for (const s of samples) sum += s * s;
  const threshold = peak * 10 ** (-40 / 20);
  let lead = 0;
  while (lead < samples.length && !a.channels.some((ch) => Math.abs(ch[lead] ?? 0) >= threshold)) lead++;
  // Clipping: AUDIO_GEN.clipRun samples or more in a row at full scale.
  let clippedRuns = 0;
  for (const ch of a.channels) {
    let run = 0;
    for (const s of ch) {
      run = Math.abs(s) >= 32766 / 32768 ? run + 1 : 0;
      if (run === AUDIO_GEN.clipRun) clippedRuns++;
    }
  }
  const { brightness, bands } = spectrum(samples, a.sampleRate);
  return {
    duration: samples.length / a.sampleRate,
    peakDb: toDb(peak),
    loudnessDb: samples.length > 0 ? toDb(Math.sqrt(sum / samples.length)) : -Infinity,
    brightness,
    tail: tailOf(samples, a.sampleRate),
    bands,
    leadingSilence: lead / a.sampleRate,
    clippedRuns,
    channels: a.channels.length,
  };
}

/** Two variants so alike they are not worth two files (spec 08 §4.5). */
export function almostIdentical(a: SoundMeasures, b: SoundMeasures): boolean {
  const rel = (x: number, y: number): number => Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1e-9);
  const s = AUDIO_GEN.similar;
  return rel(a.duration, b.duration) < s.duration && rel(a.brightness, b.brightness) < s.brightness && Math.abs(a.loudnessDb - b.loudnessDb) < s.loudnessDb;
}
