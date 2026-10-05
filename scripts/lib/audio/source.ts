/**
 * The recorded sources of the workshop (spec 08 §4.2, §5): files of
 * audio-src/library/ and audio-src/generated/, decoded with ffmpeg
 * (ffmpeg-static, a dev dependency) to floats at the game's rate. The
 * libraries come in OGG, which iOS does not decode well: the game always
 * gets WAV.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import type { Audio } from './wav';

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
