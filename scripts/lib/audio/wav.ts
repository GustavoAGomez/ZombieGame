/**
 * WAV files of the generated effects (spec 08 §2): PCM, mono, 16 bits.
 * Nothing but the samples goes in (no dates or tags), so the same sound
 * always gives the same bytes.
 */

/** Float samples (−1..1) to a 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const ascii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++) out[offset + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(s < 0 ? s * 32768 : s * 32767), true);
  }
  return out;
}

export interface WavInfo {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  /** Seconds. */
  duration: number;
  /** The samples as floats (mono, or the first channel). */
  samples: Float32Array;
}

/** Reads a PCM WAV (any chunk order); throws on anything else. */
export function decodeWav(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('no es un WAV');
  let channels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let format = 0;
  let data: { offset: number; length: number } | null = null;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      format = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === 'data') {
      data = { offset: offset + 8, length: Math.min(size, bytes.length - offset - 8) };
    }
    offset += 8 + size + (size % 2);
  }
  if (format !== 1 || !data || channels < 1 || bitsPerSample !== 16) throw new Error('solo PCM de 16 bits');
  const frames = Math.floor(data.length / (2 * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) samples[i] = view.getInt16(data.offset + i * 2 * channels, true) / 32768;
  return { channels, sampleRate, bitsPerSample, duration: frames / sampleRate, samples };
}
