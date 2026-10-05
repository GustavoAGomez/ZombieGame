/**
 * npm run audio:gen — the sound workshop (spec 08 §4): reads every
 * audio-src/recipes/<sound id>.json and writes, for each sound of the
 * catalog:
 * - the files the game plays (its chosen candidate, or A until one is
 *   chosen) in public/assets/audio/sfx/<key>.wav;
 * - while no candidate is chosen, every candidate in
 *   public/assets/audio/candidates/<key>__<letter>.wav, which only the
 *   debug build loads (§8).
 * Then it rewrites the effects of the manifest's `audio` section and the
 * report in audio-src/preview/report.md. The same recipes and sources
 * always give the same bytes.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUDIO_GEN, SOUNDS, type SoundDef } from '../src/config/audio';
import { measure } from './lib/audio/analyze';
import { finish } from './lib/audio/dsp';
import { LETTERS, parseSoundRecipes, type Candidate, type Letter, type Recipe } from './lib/audio/recipes';
import { render } from './lib/audio/render';
import { buildReport, type ReportRow } from './lib/audio/report';
import { decodeWav, encodeWav } from './lib/audio/wav';

/** Duration a placeholder entry declares: no file, so silence (CLAUDE.md rule 5). */
const PLACEHOLDER_DURATION = 0.1;

type Json = Record<string, unknown>;

/** The manifest key of candidate `letter` of a game file. */
export function candidateKey(key: string, letter: Letter): string {
  return `${key}__${letter.toLowerCase()}`;
}

/** A recipe to the bytes of its finished WAV. */
export function renderFile(recipe: Recipe, channels: 1 | 2): Uint8Array {
  return encodeWav(finish(render(recipe, channels, AUDIO_GEN.sampleRate)));
}

export interface GenerateResult {
  generated: number;
  warnings: string[];
}

export function generateAudio(root: string, log: (line: string) => void): GenerateResult {
  const at = (p: string): string => resolve(root, p);
  const recipesDir = at('audio-src/recipes');
  const sfxDir = at('public/assets/audio/sfx');
  const candidatesDir = at('public/assets/audio/candidates');
  // Both folders are the workshop's output: written again from scratch.
  for (const dir of [sfxDir, candidatesDir]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  const manifestPath = at('public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Json;
  // The music's entries stay; the effects' are written again.
  const audio = Object.fromEntries(
    Object.entries((manifest.audio ?? {}) as Record<string, Json>).filter(([, def]) => typeof def.file === 'string' && !/^audio\/(sfx|candidates)\//.test(def.file)),
  );
  const rows: ReportRow[] = [];
  const warnings: string[] = [];
  const byId = new Map<string, SoundDef>(SOUNDS.map((s) => [s.id, s]));
  const done = new Set<string>();
  const names = existsSync(recipesDir) ? readdirSync(recipesDir).filter((f) => f.endsWith('.json')).sort() : [];

  const write = (dir: string, key: string, bytes: Uint8Array, entry: Json): number => {
    const file = `audio/${dir}/${key}.wav`;
    writeFileSync(at(`public/assets/${file}`), bytes);
    const wav = decodeWav(bytes);
    audio[key] = { file, duration: Math.round(wav.duration * 10000) / 10000, placeholder: false, ...entry };
    return wav.duration;
  };

  for (const name of names) {
    const id = basename(name, '.json');
    const sound = byId.get(id);
    if (!sound) throw new Error(`audio-src/recipes/${name}: no hay ningún sonido «${id}» en el catálogo (src/config/audio.ts)`);
    const recipes = parseSoundRecipes(JSON.parse(readFileSync(resolve(recipesDir, name), 'utf8')), name);
    const playing: Letter = recipes.chosen ?? 'A';
    for (const letter of LETTERS) {
      const candidate: Candidate | undefined = recipes.candidates[letter];
      if (!candidate) continue;
      if (candidate.variants.length !== sound.variants.length) {
        throw new Error(`${name}: el candidato ${letter} tiene ${candidate.variants.length} variantes y el catálogo ${sound.variants.length}`);
      }
      const inGame = letter === playing;
      // A chosen sound's other candidates stay in the recipes, out of the game (§4.4).
      if (!inGame && recipes.chosen !== null) continue;
      candidate.variants.forEach((recipe, i) => {
        const key = sound.variants[i] ?? '';
        const bytes = renderFile(recipe, candidate.channels);
        if (inGame) write('sfx', key, bytes, recipes.chosen === null ? { picked: letter, pending: true } : { picked: letter });
        // Until one is chosen, every candidate (A too) goes to the debug build's folder.
        const shown = recipes.chosen === null ? candidateKey(key, letter) : key;
        if (recipes.chosen === null) write('candidates', shown, bytes, { candidate: letter });
        rows.push({ key: shown, sound, letter, inGame, about: candidate.about, measures: measure(decodeWav(bytes)) });
      });
    }
    done.add(id);
    log(`  ✓ ${id}: ${recipes.chosen ? `elegido ${recipes.chosen}` : `${Object.keys(recipes.candidates).length} candidatos, suena A`}`);
  }

  // Every variant of the catalog has its entry: without a recipe yet, a placeholder (silence).
  for (const sound of SOUNDS) {
    if (sound.bus === 'music' || done.has(sound.id)) continue;
    for (const key of sound.variants) audio[key] = { file: `audio/sfx/${key}.wav`, duration: PLACEHOLDER_DURATION, placeholder: true };
    warnings.push(`${sound.id}: sin receta en audio-src/recipes/, suena como silencio`);
  }

  manifest.audio = Object.fromEntries(Object.entries(audio).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const report = buildReport(rows);
  warnings.push(...report.warnings);
  const size = (dir: string): number => readdirSync(dir).reduce((sum, f) => sum + statSync(resolve(dir, f)).size, 0);
  const sfxBytes = size(sfxDir);
  if (sfxBytes > AUDIO_GEN.budgetBytes) warnings.push(`los efectos ocupan ${(sfxBytes / 1048576).toFixed(2)} MB, más que el presupuesto de ${AUDIO_GEN.budgetBytes / 1048576} MB`);
  mkdirSync(at('audio-src/preview'), { recursive: true });
  writeFileSync(at('audio-src/preview/report.md'), report.markdown);
  log(`  ✓ informe → audio-src/preview/report.md (${rows.length} archivos; efectos ${(sfxBytes / 1024).toFixed(0)} KB, candidatos ${(size(candidatesDir) / 1024).toFixed(0)} KB)`);
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
