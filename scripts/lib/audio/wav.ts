/**
 * WAV files of the sound effects (spec 08 §2): PCM, 16 bits, mono or
 * stereo. Nothing but the samples goes in (no dates or tags), so the same
 * sound always gives the same bytes.
 */

/** A sound: one Float32Array per channel (−1..1), all the same length. */
export interface Audio {
  sampleRate: number;
  channels: Float32Array[];
}

export function frames(a: Audio): number {
  return a.channels[0]?.length ?? 0;
}

/** Float samples to a 16-bit PCM WAV, interleaved. */
export function encodeWav(a: Audio): Uint8Array {
  const count = a.channels.length;
  const n = frames(a);
  const dataBytes = n * count * 2;
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
  view.setUint16(22, count, true);
  view.setUint32(24, a.sampleRate, true);
  view.setUint32(28, a.sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < count; c++) {
      const s = Math.max(-1, Math.min(1, a.channels[c]?.[i] ?? 0));
      view.setInt16(44 + (i * count + c) * 2, Math.round(s < 0 ? s * 32768 : s * 32767), true);
    }
  }
  return out;
}

export interface WavInfo extends Audio {
  bitsPerSample: number;
  /** Seconds. */
  duration: number;
}

/** Reads a 16-bit PCM WAV (any chunk order); throws on anything else. */
export function decodeWav(bytes: Uint8Array): WavInfo {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number): string => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('no es un WAV');
  let count = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;
  let format = 0;
  let data: { offset: number; length: number } | null = null;
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === 'fmt ') {
      format = view.getUint16(offset + 8, true);
      count = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
    } else if (id === 'data') {
      data = { offset: offset + 8, length: Math.min(size, bytes.length - offset - 8) };
    }
    offset += 8 + size + (size % 2);
  }
  if (format !== 1 || !data || count < 1 || bitsPerSample !== 16) throw new Error('solo PCM de 16 bits');
  const n = Math.floor(data.length / (2 * count));
  const channels = Array.from({ length: count }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < count; c++) {
      const ch = channels[c];
      if (ch) ch[i] = view.getInt16(data.offset + (i * count + c) * 2, true) / 32768;
    }
  }
  return { sampleRate, channels, bitsPerSample, duration: n / sampleRate };
}
