/**
 * npm run audio:gen — the sound workshop (spec 08 §4): reads every
 * audio-src/recipes/<sound id>.json and writes, for each sound of the
 * catalog:
 * - the files the game plays (its chosen candidate, or A until one is
 *   chosen) in public/assets/audio/sfx/<key>.wav, and the music's in
 *   public/assets/audio/music/<key>.m4a with its loop points (§7);
 * - while no candidate is chosen, every candidate in
 *   public/assets/audio/candidates/<key>__<letter>.wav (or .m4a), which
 *   only the debug build loads (§8).
 * Then it rewrites the manifest's `audio` section and the report in
 * audio-src/preview/report.md. The same recipes and sources always give
 * the same bytes.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { AUDIO_GEN, SOUNDS, type SoundDef } from '../src/config/audio';
import { measure } from './lib/audio/analyze';
import { Credits, creditsMarkdown, recipeSources, type CreditRow } from './lib/audio/credits';
import { finish, finishLoop, finishMusic } from './lib/audio/dsp';
import { LETTERS, parseSoundRecipes, type Candidate, type Letter, type Recipe } from './lib/audio/recipes';
import { render } from './lib/audio/render';
import { buildReport, type ReportRow } from './lib/audio/report';
import { encodeM4a } from './lib/audio/source';
import { decodeWav, encodeWav, frames, type Audio } from './lib/audio/wav';

/** Duration a placeholder entry declares: no file, so silence (CLAUDE.md rule 5). */
const PLACEHOLDER_DURATION = 0.1;

type Json = Record<string, unknown>;

/** The manifest key of candidate `letter` of a game file. */
export function candidateKey(key: string, letter: Letter): string {
  return `${key}__${letter.toLowerCase()}`;
}

/** A recipe to the bytes of its finished WAV (a loop's, seamless); its sources' paths start at `sourceRoot` (audio-src/). */
export function renderFile(recipe: Recipe, channels: 1 | 2, sourceRoot = '', loop = false): Uint8Array {
  const audio = render(recipe, channels, { sampleRate: AUDIO_GEN.sampleRate, sourceRoot });
  return encodeWav(loop ? finishLoop(audio) : finish(audio));
}

/** A music recipe to its M4A bytes, the audio in it and its loop points (§7). */
export function renderMusic(recipe: Recipe, channels: 1 | 2, sourceRoot = ''): { bytes: Uint8Array; audio: Audio; loopStart: number; loopEnd: number } {
  const finished = finishMusic(render(recipe, channels, { sampleRate: AUDIO_GEN.sampleRate, sourceRoot }));
  return { bytes: encodeM4a(finished.audio, AUDIO_GEN.music.bitrate), ...finished };
}

export interface GenerateResult {
  generated: number;
  warnings: string[];
}

export function generateAudio(root: string, log: (line: string) => void): GenerateResult {
  const at = (p: string): string => resolve(root, p);
  const recipesDir = at('audio-src/recipes');
  const sfxDir = at('public/assets/audio/sfx');
  const musicDir = at('public/assets/audio/music');
  const candidatesDir = at('public/assets/audio/candidates');
  // The three folders are the workshop's output: written again from scratch.
  for (const dir of [sfxDir, musicDir, candidatesDir]) {
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
  }
  const manifestPath = at('public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Json;
  // Every entry of the workshop's folders is written again; anything else in the section stays.
  const audio = Object.fromEntries(
    Object.entries((manifest.audio ?? {}) as Record<string, Json>).filter(([, def]) => typeof def.file === 'string' && !/^audio\/(sfx|music|candidates)\//.test(def.file)),
  );
  const rows: ReportRow[] = [];
  const warnings: string[] = [];
  const byId = new Map<string, SoundDef>(SOUNDS.map((s) => [s.id, s]));
  const done = new Set<string>();
  const names = existsSync(recipesDir) ? readdirSync(recipesDir).filter((f) => f.endsWith('.json')).sort() : [];

  const round = (s: number): number => Math.round(s * 10000) / 10000;
  const write = (dir: string, key: string, bytes: Uint8Array, entry: Json, ext = 'wav', duration = decodeWav(bytes).duration): void => {
    const file = `audio/${dir}/${key}.${ext}`;
    writeFileSync(at(`public/assets/${file}`), bytes);
    audio[key] = { file, duration: round(duration), placeholder: false, ...entry };
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
      // A streak sound has a shine layer per variant, whose pitch alone climbs (§3.4).
      if (candidate.shine.length !== sound.shine.length) {
        throw new Error(`${name}: el candidato ${letter} tiene ${candidate.shine.length} capas de brillo ("shine") y el catálogo pide ${sound.shine.length}`);
      }
      const inGame = letter === playing;
      // A chosen sound's other candidates stay in the recipes, out of the game (§4.4).
      if (!inGame && recipes.chosen !== null) continue;
      const files = [
        ...candidate.variants.map((recipe, i) => ({ recipe, key: sound.variants[i] ?? '', layer: 'body' as const })),
        ...candidate.shine.map((recipe, i) => ({ recipe, key: sound.shine[i] ?? '', layer: 'shine' as const })),
      ];
      const pick = recipes.chosen === null ? { picked: letter, pending: true } : { picked: letter };
      // Until one is chosen, every candidate (A too) goes to the debug build's folder.
      const shownKey = (key: string): string => (recipes.chosen === null ? candidateKey(key, letter) : key);
      files.forEach(({ recipe, key, layer }) => {
        if (sound.bus === 'music') {
          // The music (§7): M4A, with its loop and the margins that keep it clean.
          const music = renderMusic(recipe, candidate.channels, at('audio-src'));
          // To the microsecond: at 0.1 ms the loop could be a sample long or short, a click at each turn.
          const exact = (t: number): number => Math.round(t * 1e6) / 1e6;
          const loop = { loopStart: exact(music.loopStart), loopEnd: exact(music.loopEnd) };
          const duration = frames(music.audio) / music.audio.sampleRate;
          if (inGame) write('music', key, music.bytes, { ...pick, ...loop }, 'm4a', duration);
          if (recipes.chosen === null) write('candidates', shownKey(key), music.bytes, { candidate: letter, ...loop }, 'm4a', duration);
          rows.push({ key: shownKey(key), sound, letter, inGame, about: candidate.about, layer, measures: measure(music.audio), loop: music.loopEnd - music.loopStart });
          return;
        }
        const bytes = renderFile(recipe, candidate.channels, at('audio-src'), sound.loop);
        if (inGame) write('sfx', key, bytes, pick);
        if (recipes.chosen === null) write('candidates', shownKey(key), bytes, { candidate: letter });
        rows.push({ key: shownKey(key), sound, letter, inGame, about: candidate.about, layer, measures: measure(decodeWav(bytes)) });
      });
    }
    done.add(id);
    log(`  ✓ ${id}: ${recipes.chosen ? `elegido ${recipes.chosen}` : `${Object.keys(recipes.candidates).length} candidatos, suena A`}`);
  }

  // Every variant of the catalog has its entry: without a recipe yet, a placeholder (silence).
  for (const sound of SOUNDS) {
    if (done.has(sound.id)) continue;
    const file = (key: string): string => (sound.bus === 'music' ? `audio/music/${key}.m4a` : `audio/sfx/${key}.wav`);
    for (const key of [...sound.variants, ...sound.shine]) audio[key] = { file: file(key), duration: PLACEHOLDER_DURATION, placeholder: true };
    warnings.push(`${sound.id}: sin receta en audio-src/recipes/, suena como silencio`);
  }

  manifest.audio = Object.fromEntries(Object.entries(audio).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const report = buildReport(rows);
  warnings.push(...report.warnings);

  // The licence of every source (§5.1): docs/AUDIO-CREDITS.md; assets:check fails on a source without one.
  const credits = new Credits(at('audio-src'));
  const creditRows: CreditRow[] = [];
  for (const [source, sounds] of recipeSources(recipesDir)) {
    const found = credits.of(source);
    if ('problem' in found) warnings.push(found.problem);
    else creditRows.push({ source, credit: found.credit, sounds });
  }
  writeFileSync(at('docs/AUDIO-CREDITS.md'), creditsMarkdown(creditRows));
  const size = (dir: string): number => readdirSync(dir).reduce((sum, f) => sum + statSync(resolve(dir, f)).size, 0);
  const sfxBytes = size(sfxDir);
  if (sfxBytes > AUDIO_GEN.budgetBytes) warnings.push(`los efectos ocupan ${(sfxBytes / 1048576).toFixed(2)} MB, más que el presupuesto de ${AUDIO_GEN.budgetBytes / 1048576} MB`);
  mkdirSync(at('audio-src/preview'), { recursive: true });
  writeFileSync(at('audio-src/preview/report.md'), report.markdown);
  log(`  ✓ informe → audio-src/preview/report.md (${rows.length} archivos; efectos ${(sfxBytes / 1024).toFixed(0)} KB, música ${(size(musicDir) / 1024).toFixed(0)} KB, candidatos ${(size(candidatesDir) / 1024).toFixed(0)} KB)`);
  log(`  ✓ créditos → docs/AUDIO-CREDITS.md (${creditRows.length} archivos de origen)`);
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
