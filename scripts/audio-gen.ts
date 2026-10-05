/**
 * npm run audio:gen — the sound effects from their recipes (spec 08 §4):
 * reads audio-src/recipes/<key>.json, writes public/assets/audio/sfx/<key>.wav
 * (WAV mono, 44.1 kHz, 16 bits, with the common finish), updates the
 * manifest's `audio` section and writes the report in
 * audio-src/preview/report.md. The same recipes always give the same bytes.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUDIO_GEN, SOUNDS } from '../src/config/audio';
import { measure } from './lib/audio/analyze';
import { finish, finishLoop, fitLength } from './lib/audio/dsp';
import { parseRecipeFile, type RecipeFile } from './lib/audio/recipes';
import { buildReport, type ReportRow } from './lib/audio/report';
import { render } from './lib/audio/synth';
import { decodeWav, encodeWav } from './lib/audio/wav';

const KEY = /^[a-z][a-z0-9_]*$/;
/** Duration a placeholder entry declares: no file, so silence (CLAUDE.md rule 5). */
const PLACEHOLDER_DURATION = 0.1;

type Json = Record<string, unknown>;

/** A recipe file to its finished samples: the common finish, or a loop's. */
export function renderFile(file: RecipeFile): Float32Array {
  const sr = AUDIO_GEN.sampleRate;
  let samples = render(file.recipe, sr);
  if (file.length !== null) samples = fitLength(samples, file.length, sr);
  if (file.loop) return finishLoop(samples, file.crossfade, sr);
  const finished = finish(samples, sr);
  // A fixed length keeps its silence at the end (the hand's draw lasts exactly as the draw).
  return file.length === null ? finished : fitLength(finished, file.length, sr);
}

export interface GenerateResult {
  generated: number;
  warnings: string[];
}

export function generateAudio(root: string, log: (line: string) => void): GenerateResult {
  const at = (p: string): string => resolve(root, p);
  const recipesDir = at('audio-src/recipes');
  const outDir = at('public/assets/audio/sfx');
  mkdirSync(outDir, { recursive: true });
  const names = readdirSync(recipesDir).filter((f) => f.endsWith('.json')).sort();
  const manifestPath = at('public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Json;
  const audio = (manifest.audio ?? {}) as Record<string, Json>;
  const rows: ReportRow[] = [];
  const warnings: string[] = [];

  for (const name of names) {
    const key = basename(name, '.json');
    if (!KEY.test(key)) throw new Error(`audio-src/recipes/${name}: el nombre tiene que ser la clave del manifiesto en snake_case`);
    const samples = renderFile(parseRecipeFile(JSON.parse(readFileSync(resolve(recipesDir, name), 'utf8')), name));
    if (samples.length === 0) throw new Error(`audio-src/recipes/${name}: la receta no suena (todo silencio)`);
    const bytes = encodeWav(samples, AUDIO_GEN.sampleRate);
    const file = `audio/sfx/${key}.wav`;
    writeFileSync(at(`public/assets/${file}`), bytes);
    // Measured on what is on disk (16 bits), not on the floats.
    const wav = decodeWav(bytes);
    const measures = measure(wav.samples, wav.sampleRate);
    audio[key] = { file, duration: Math.round(wav.duration * 10000) / 10000, placeholder: false };
    rows.push({ key, measures });
    log(`  ✓ ${key} → ${file} (${Math.round(wav.duration * 1000)} ms)`);
  }

  // Every variant of the catalog has its entry: without a recipe yet, a placeholder (silence).
  for (const sound of SOUNDS) {
    if (sound.bus === 'music') continue;
    for (const key of sound.variants) {
      if (audio[key]) continue;
      audio[key] = { file: `audio/sfx/${key}.wav`, duration: PLACEHOLDER_DURATION, placeholder: true };
      warnings.push(`${key} (${sound.id}): sin receta en audio-src/recipes/, suena como silencio`);
    }
  }

  manifest.audio = Object.fromEntries(Object.entries(audio).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const report = buildReport(rows, SOUNDS);
  warnings.push(...report.warnings);
  const bytes = readdirSync(outDir).reduce((sum, f) => sum + statSync(resolve(outDir, f)).size, 0);
  if (bytes > AUDIO_GEN.budgetBytes) warnings.push(`los efectos ocupan ${(bytes / 1048576).toFixed(2)} MB, más que el presupuesto de ${AUDIO_GEN.budgetBytes / 1048576} MB`);
  mkdirSync(at('audio-src/preview'), { recursive: true });
  writeFileSync(at('audio-src/preview/report.md'), report.markdown);
  log(`  ✓ informe → audio-src/preview/report.md (${rows.length} archivos, ${(bytes / 1024).toFixed(0)} KB en total)`);
  return { generated: rows.length, warnings };
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    const { warnings } = generateAudio(root, (line) => console.info(line));
    for (const w of warnings) console.warn(`  ⚠ ${w}`);
    console.info(warnings.length === 0 ? '\naudio:gen OK, sin avisos.' : `\naudio:gen OK (${warnings.length} avisos).`);
  } catch (err) {
    console.error(`✖ ${(err as Error).message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
