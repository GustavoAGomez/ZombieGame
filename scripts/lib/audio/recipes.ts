/**
 * The recipes of the sound workshop (spec 08 §4.1, §4.4): one JSON file per
 * sound in audio-src/recipes/<sound id>.json, with up to three candidates
 * (A, B, C) and which one was chosen. A recipe keeps every parameter: the
 * same recipes and sources always give the same files.
 */
import { noteFrequency, SynthError, type Strike, type SynthParams, type Timbre } from './synth';

export const LETTERS = ['A', 'B', 'C'] as const;
export type Letter = (typeof LETTERS)[number];

/** A layer made by code (§4.3). */
export interface SynthRecipe {
  type: 'synth';
  params: SynthParams;
}

/** One layer of a mix, `delay` seconds in, at `gain`. */
export interface Layer {
  recipe: Recipe;
  gain: number;
  delay: number;
}

/** A mix of several recipes (§4.1): the final sound, attack, body, shine and tail. */
export interface LayersRecipe {
  type: 'layers';
  layers: Layer[];
}

export type Recipe = SynthRecipe | LayersRecipe;

/** One candidate of a sound: what it tries, and its files. */
export interface Candidate {
  /** A line on what makes it different, for the report and the sound test. */
  about: string;
  /** 1 mono (positional and frequent sounds) or 2 stereo (big, not positional ones), §2. */
  channels: 1 | 2;
  /** One recipe per variant of the catalog. */
  variants: Recipe[];
  /** A streak sound's shine layer, one per variant (§3.4): the director raises its pitch alone. */
  shine: Recipe[];
}

/** A sound's recipes: its candidates and the one chosen (null: not yet, A plays meanwhile). */
export interface SoundRecipes {
  chosen: Letter | null;
  candidates: Partial<Record<Letter, Candidate>>;
}

export class RecipeError extends Error {
  override name = 'RecipeError';
}

const TIMBRES: readonly Timbre[] = ['bell', 'glass', 'sub', 'air', 'pad'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function num(value: unknown, where: string, fallback: number, min = 0): number {
  const v = value === undefined ? fallback : value;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min) throw new RecipeError(`${where}: tiene que ser un número ≥ ${min}`);
  return v;
}

function strikes(json: Record<string, unknown>, where: string): Strike[] {
  // "note": "E6", or "notes": [[note, step], [note, step, gain], …].
  if (typeof json.note === 'string') return [{ note: json.note, step: 0, gain: 1 }];
  if (!Array.isArray(json.notes)) return [];
  return json.notes.map((raw: unknown, i) => {
    const at = `${where}.notes[${i}]`;
    const fields: readonly unknown[] = Array.isArray(raw) ? (raw as unknown[]) : [];
    const [note, step, gain] = fields;
    if (typeof note !== 'string') throw new RecipeError(`${at}: [nota, segundos hasta la siguiente, volumen]`);
    return { note, step: num(step, `${at}.step`, 0), gain: num(gain, `${at}.gain`, 1) };
  });
}

function synth(json: Record<string, unknown>, where: string): SynthRecipe {
  const timbre = json.timbre;
  if (typeof timbre !== 'string' || !(TIMBRES as readonly string[]).includes(timbre)) throw new RecipeError(`${where}.timbre: ${TIMBRES.join(', ')}`);
  const notes = strikes(json, where);
  try {
    for (const n of notes) noteFrequency(n.note);
  } catch (err) {
    if (err instanceof SynthError) throw new RecipeError(`${where}: ${err.message}`);
    throw err;
  }
  const tonal = timbre === 'bell' || timbre === 'glass' || timbre === 'pad';
  if (tonal && notes.length === 0) throw new RecipeError(`${where}: «${timbre}» necesita "note" o "notes"`);
  return {
    type: 'synth',
    params: {
      timbre: timbre as Timbre,
      notes,
      duration: num(json.duration, `${where}.duration`, 0.3, 0.005),
      attack: num(json.attack, `${where}.attack`, 0.002),
      freq: num(json.freq, `${where}.freq`, 150, 20),
      freqEnd: num(json.freqEnd, `${where}.freqEnd`, num(json.freq, `${where}.freq`, 150, 20), 20),
      width: num(json.width, `${where}.width`, timbre === 'pad' ? 8 : 1),
      seed: num(json.seed, `${where}.seed`, 1),
    },
  };
}

/** Validates a recipe's JSON; throws RecipeError with what is wrong and where. */
export function parseRecipe(json: unknown, where: string): Recipe {
  if (!isRecord(json)) throw new RecipeError(`${where}: la receta tiene que ser un objeto JSON`);
  switch (json.type) {
    case 'synth':
      return synth(json, where);
    case 'layers': {
      if (!Array.isArray(json.layers) || json.layers.length === 0) throw new RecipeError(`${where}.layers: hace falta al menos una capa`);
      const layers = json.layers.map((raw: unknown, i): Layer => {
        const at = `${where}.layers[${i}]`;
        if (!isRecord(raw)) throw new RecipeError(`${at}: { "recipe": {…}, "gain": 1, "delay": 0 }`);
        return { recipe: parseRecipe(raw.recipe, `${at}.recipe`), gain: num(raw.gain, `${at}.gain`, 1), delay: num(raw.delay, `${at}.delay`, 0) };
      });
      return { type: 'layers', layers };
    }
    default:
      throw new RecipeError(`${where}: tipo de receta «${String(json.type)}» desconocido (synth o layers)`);
  }
}

function candidate(json: unknown, where: string): Candidate {
  if (!isRecord(json)) throw new RecipeError(`${where}: { "about": "…", "variants": [ … ] }`);
  if (!Array.isArray(json.variants) || json.variants.length === 0) throw new RecipeError(`${where}.variants: hace falta al menos una variante`);
  const channels = json.channels ?? 1;
  if (channels !== 1 && channels !== 2) throw new RecipeError(`${where}.channels: 1 (mono) o 2 (estéreo)`);
  const shine = json.shine ?? [];
  if (!Array.isArray(shine)) throw new RecipeError(`${where}.shine: una receta por variante`);
  return {
    about: typeof json.about === 'string' ? json.about : '',
    channels,
    variants: json.variants.map((v: unknown, i) => parseRecipe(v, `${where}.variants[${i}]`)),
    shine: shine.map((v: unknown, i) => parseRecipe(v, `${where}.shine[${i}]`)),
  };
}

/** A sound's recipe file: its candidates A, B and C, and the chosen one. */
export function parseSoundRecipes(json: unknown, where: string): SoundRecipes {
  if (!isRecord(json) || !isRecord(json.candidates)) throw new RecipeError(`${where}: { "chosen": null, "candidates": { "A": {…} } }`);
  const chosen = json.chosen ?? null;
  if (chosen !== null && !(LETTERS as readonly unknown[]).includes(chosen)) throw new RecipeError(`${where}.chosen: null, "A", "B" o "C"`);
  const candidates: Partial<Record<Letter, Candidate>> = {};
  for (const [letter, raw] of Object.entries(json.candidates)) {
    if (!(LETTERS as readonly string[]).includes(letter)) throw new RecipeError(`${where}.candidates.${letter}: los candidatos son A, B y C`);
    candidates[letter as Letter] = candidate(raw, `${where}.candidates.${letter}`);
  }
  if (!candidates.A) throw new RecipeError(`${where}: hace falta al menos el candidato A`);
  if (chosen !== null && !candidates[chosen as Letter]) throw new RecipeError(`${where}.chosen: no hay candidato ${chosen as Letter}`);
  return { chosen: chosen as Letter | null, candidates };
}
