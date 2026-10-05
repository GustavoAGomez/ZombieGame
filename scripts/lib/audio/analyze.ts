/**
 * Objective measures of a sound file (spec 08 §4.4), since nobody here can
 * hear it: length, peak, average loudness, brightness (spectral centroid),
 * silence at the start and clipping.
 */
import { AUDIO_GEN } from '../../../src/config/audio';

export interface SoundMeasures {
  /** Seconds. */
  duration: number;
  /** dBFS. */
  peakDb: number;
  /** RMS over the whole sound, dBFS. */
  loudnessDb: number;
  /** Spectral centroid, Hz, weighted by each window's energy: higher is brighter. */
  brightness: number;
  /** Seconds before the sound reaches 40 dB under its peak. */
  leadingSilence: number;
  /** Runs of samples stuck at full scale (a clipped waveform). */
  clippedRuns: number;
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

/** Energy-weighted spectral centroid over Hann windows of AUDIO_GEN.fftSize with half overlap. */
function brightness(samples: Float32Array, sampleRate: number): number {
  const n = AUDIO_GEN.fftSize;
  const hop = n / 2;
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
      const mag = Math.hypot(re[k] ?? 0, im[k] ?? 0);
      num += mag * ((k * sampleRate) / n);
      den += mag;
    }
    if (den === 0) continue;
    const e = den * den;
    weighted += (num / den) * e;
    energy += e;
  }
  return energy === 0 ? 0 : weighted / energy;
}

export function measure(samples: Float32Array, sampleRate: number): SoundMeasures {
  let peak = 0;
  let sum = 0;
  for (const s of samples) {
    peak = Math.max(peak, Math.abs(s));
    sum += s * s;
  }
  const threshold = peak * 10 ** (-40 / 20);
  let lead = 0;
  while (lead < samples.length && Math.abs(samples[lead] ?? 0) < threshold) lead++;
  // Clipping: AUDIO_GEN.clipRun samples or more in a row at full scale.
  let clippedRuns = 0;
  let run = 0;
  for (const s of samples) {
    run = Math.abs(s) >= 32766 / 32768 ? run + 1 : 0;
    if (run === AUDIO_GEN.clipRun) clippedRuns++;
  }
  return {
    duration: samples.length / sampleRate,
    peakDb: toDb(peak),
    loudnessDb: samples.length > 0 ? toDb(Math.sqrt(sum / samples.length)) : -Infinity,
    brightness: brightness(samples, sampleRate),
    leadingSilence: lead / sampleRate,
    clippedRuns,
  };
}

/** Two variants so alike they are not worth two files (spec 08 §4.4). */
export function almostIdentical(a: SoundMeasures, b: SoundMeasures): boolean {
  const rel = (x: number, y: number): number => Math.abs(x - y) / Math.max(Math.abs(x), Math.abs(y), 1e-9);
  const s = AUDIO_GEN.similar;
  return rel(a.duration, b.duration) < s.duration && rel(a.brightness, b.brightness) < s.brightness && Math.abs(a.loudnessDb - b.loudnessDb) < s.loudnessDb;
}
