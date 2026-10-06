/**
 * The recorded sources of the workshop (spec 08 §4.2, §5): files of
 * audio-src/library/ and audio-src/generated/, decoded with ffmpeg
 * (ffmpeg-static, a dev dependency) to floats at the game's rate. The
 * libraries come in OGG, which iOS does not decode well: the game always
 * gets WAV.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { frames, type Audio } from './wav';

const require = createRequire(import.meta.url);
const cache = new Map<string, Audio>();

function ffmpegPath(): string {
  const path = require('ffmpeg-static') as string | null;
  if (!path || !existsSync(path)) throw new Error('falta ffmpeg (npm install: ffmpeg-static)');
  return path;
}

/** Decodes `path` to `channels` channels of floats at `sampleRate` (cached: a source is read once per run). */
export function decodeSource(path: string, channels: 1 | 2, sampleRate: number): Audio {
  const id = `${path}|${channels}|${sampleRate}`;
  const hit = cache.get(id);
  if (hit) return { sampleRate, channels: hit.channels.map((c) => c.slice()) };
  if (!existsSync(path)) throw new Error(`no existe la fuente ${path}`);
  const raw = execFileSync(ffmpegPath(), ['-v', 'error', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-ac', String(channels), '-ar', String(sampleRate), '-'], {
    maxBuffer: 1 << 28,
  });
  const all = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
  const n = Math.floor(all.length / channels);
  const out = Array.from({ length: channels }, () => new Float32Array(n));
  for (let i = 0; i < n; i++) for (let c = 0; c < channels; c++) (out[c] as Float32Array)[i] = all[i * channels + c] ?? 0;
  const audio = { sampleRate, channels: out };
  cache.set(id, audio);
  return { sampleRate, channels: out.map((c) => c.slice()) };
}

/**
 * Encodes audio as M4A (AAC at `bitrate`), the music's format (§7): it
 * decodes on iOS and Android alike. Bit-exact and without metadata, so the
 * same audio always gives the same bytes.
 */
export function encodeM4a(audio: Audio, bitrate: string): Uint8Array {
  const n = frames(audio);
  const count = audio.channels.length;
  const interleaved = new Float32Array(n * count);
  for (let i = 0; i < n; i++) for (let c = 0; c < count; c++) interleaved[i * count + c] = audio.channels[c]?.[i] ?? 0;
  const dir = mkdtempSync(join(tmpdir(), 'music-'));
  const out = join(dir, 'out.m4a');
  try {
    execFileSync(
      ffmpegPath(),
      ['-v', 'error', '-f', 'f32le', '-ar', String(audio.sampleRate), '-ac', String(count), '-i', 'pipe:0', '-c:a', 'aac', '-b:a', bitrate, '-map_metadata', '-1', '-fflags', '+bitexact', '-flags:a', '+bitexact', '-movflags', '+faststart', '-y', out],
      { input: Buffer.from(interleaved.buffer), maxBuffer: 1 << 28 },
    );
    return new Uint8Array(readFileSync(out));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

