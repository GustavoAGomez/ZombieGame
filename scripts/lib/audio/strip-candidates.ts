/**
 * The candidates are only for the debug build's sound test (spec 08 §8):
 * the game itself carries only the chosen files. After `vite build`, this
 * removes public/assets/audio/candidates/ from the output and their
 * entries from its manifest.
 */
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function stripCandidates(outDir: string): number {
  rmSync(resolve(outDir, 'assets/audio/candidates'), { recursive: true, force: true });
  const path = resolve(outDir, 'assets/manifest.json');
  if (!existsSync(path)) return 0;
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { audio?: Record<string, { candidate?: string }> };
  const entries = Object.entries(manifest.audio ?? {});
  manifest.audio = Object.fromEntries(entries.filter(([, def]) => !def.candidate));
  writeFileSync(path, JSON.stringify(manifest));
  return entries.length - Object.keys(manifest.audio).length;
}
