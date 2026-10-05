/**
 * npm run audio:search "<query>" [--count 5] [--max 3] — searches Freesound
 * for CC0 sounds (spec 08 §5.2) and downloads the best results to
 * audio-src/library/freesound/, each with its record in that folder's
 * credits.json.
 *
 * The key comes from FREESOUND_API_KEY (the environment, or .env, which
 * stays out of git) and is never printed nor written anywhere. With a key
 * alone (token authentication) the API lets you download only the
 * previews: the HQ OGG one, about 192 kbps, is what this keeps. The
 * original files need OAuth2 (docs/DECISIONS.md).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { CreditsFile } from './lib/audio/credits';

const API = 'https://freesound.org/apiv2/search/';
const FIELDS = 'id,name,username,license,duration,previews,url';
const CC0 = 'Creative Commons 0';

export interface SearchOptions {
  query: string;
  count: number;
  /** Longest sound, seconds. */
  max: number;
}

/** The value of `name` in the text of a .env file (KEY=value, quotes optional), or undefined. */
export function envValue(text: string, name: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m || m[1] !== name) continue;
    const value = (m[2] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2');
    return value === '' ? undefined : value;
  }
  return undefined;
}

/** A file name from a sound's id and name: `123456_heavy_door_slam.ogg`. */
export function fileNameOf(id: number, name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\.[a-z0-9]{2,4}$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return `${id}_${slug || 'sound'}.ogg`;
}

export function parseArgs(argv: readonly string[]): SearchOptions {
  const words: string[] = [];
  let count = 5;
  let max = 4;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    if (a === '--count') count = Math.max(1, Math.min(15, Number(argv[++i]) || count));
    else if (a === '--max') max = Math.max(0.1, Number(argv[++i]) || max);
    else words.push(a);
  }
  const query = words.join(' ').trim();
  if (!query) throw new Error('uso: npm run audio:search "<consulta>" [--count 5] [--max 4]');
  return { query, count, max };
}

interface FreesoundResult {
  id: number;
  name: string;
  username: string;
  license: string;
  duration: number;
  url: string;
  previews: Record<string, string>;
}

function readKey(root: string): string {
  const fromEnv = process.env.FREESOUND_API_KEY;
  if (fromEnv) return fromEnv;
  const envPath = resolve(root, '.env');
  const fromFile = existsSync(envPath) ? envValue(readFileSync(envPath, 'utf8'), 'FREESOUND_API_KEY') : undefined;
  if (!fromFile) throw new Error('falta FREESOUND_API_KEY (en el entorno o en .env). Sin clave, pide los archivos con una lista de búsquedas (spec 08 §5.2).');
  return fromFile;
}

async function search(root: string, opts: SearchOptions): Promise<void> {
  const key = readKey(root);
  const params = new URLSearchParams({
    query: opts.query,
    filter: `license:"${CC0}" duration:[0 TO ${opts.max}]`,
    fields: FIELDS,
    page_size: String(opts.count),
  });
  // The key goes in a header, never in a URL that could end up in a log.
  const response = await fetch(`${API}?${params.toString()}`, { headers: { Authorization: `Token ${key}` } });
  if (!response.ok) throw new Error(`Freesound respondió ${response.status} ${response.statusText}`);
  const body = (await response.json()) as { count: number; results: FreesoundResult[] };
  const dir = resolve(root, 'audio-src/library/freesound');
  mkdirSync(dir, { recursive: true });
  const creditsPath = resolve(dir, 'credits.json');
  const credits: CreditsFile = existsSync(creditsPath)
    ? (JSON.parse(readFileSync(creditsPath, 'utf8')) as CreditsFile)
    : { origin: 'Freesound (previsualización HQ OGG)', license: 'CC0 1.0', files: {} };
  credits.files ??= {};
  console.info(`«${opts.query}»: ${body.count} resultados CC0 de hasta ${opts.max} s; descargo ${Math.min(opts.count, body.results.length)}.`);
  for (const r of body.results) {
    // The filter already asks for CC0; checked again before keeping anything.
    if (!/publicdomain\/zero/.test(r.license)) {
      console.warn(`  ⚠ ${r.id} ${r.name}: licencia ${r.license}, descartado`);
      continue;
    }
    const preview = r.previews['preview-hq-ogg'];
    if (!preview) continue;
    const name = fileNameOf(r.id, r.name);
    const path = resolve(dir, name);
    if (!existsSync(path)) {
      const file = await fetch(preview);
      if (!file.ok) {
        console.warn(`  ⚠ ${r.id}: no se pudo descargar (${file.status})`);
        continue;
      }
      writeFileSync(path, new Uint8Array(await file.arrayBuffer()));
    }
    credits.files[name] = { author: r.username, url: r.url, license: 'CC0 1.0' };
    console.info(`  ✓ library/freesound/${name}  ${r.duration.toFixed(2)} s  · ${r.username} · «${r.name}»`);
  }
  credits.files = Object.fromEntries(Object.entries(credits.files).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(creditsPath, `${JSON.stringify(credits, null, 2)}\n`);
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  let opts: SearchOptions;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`✖ ${(err as Error).message}`);
    process.exitCode = 1;
    return;
  }
  search(root, opts).catch((err: unknown) => {
    console.error(`✖ ${(err as Error).message}`);
    process.exitCode = 1;
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
