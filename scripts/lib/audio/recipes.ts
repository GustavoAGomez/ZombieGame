/**
 * The recipes of the generated sounds (spec 08 §4.1), one JSON file per
 * manifest key in audio-src/recipes/. A recipe keeps every parameter: the
 * same recipe always gives the same file.
 */
import { AUDIO_GEN } from '../../../src/config/audio';
import { SFXR_DEFAULTS, sfxrFromLink, type SfxrParams } from './sfxr';

export type Wave = 'square' | 'triangle' | 'sine';

/** One step of a `notes` recipe: a note of the scale (or null, a rest) for `duration` seconds. */
export interface NoteStep {
  note: string | null;
  duration: number;
  /** 0..1, against the other notes. */
  gain: number;
}

/** A sequence of notes of the scale (§4.1): a small synthesizer of our own. */
export interface NotesRecipe {
  type: 'notes';
  wave: Wave;
  /** Seconds each note takes to reach its full volume. */
  attack: number;
  /** Seconds for each note to fall to a third (exponential), or null to hold it to its end. */
  decay: number | null;
  notes: NoteStep[];
  /** Low-pass cutoff in Hz (§3.2 rule 4), or null for none. */
  lowpass: number | null;
}

/** A retro sound by jsfxr's parameters (§4.1): it opens in sfxr.me. */
export interface SfxrRecipe {
  type: 'sfxr';
  params: SfxrParams;
  /** Seed of its noise: a fixed result, and another seed for another variant of the same noise. */
  seed: number;
  lowpass: number | null;
}

/** One layer of a mix, `delay` seconds in, at `gain`. */
export interface Layer {
  recipe: Recipe;
  gain: number;
  delay: number;
}

/** A mix of several recipes (§4.1): body for a sound, e.g. a click, a low blow and a tail. */
export interface LayersRecipe {
  type: 'layers';
  layers: Layer[];
  lowpass: number | null;
}

export type Recipe = NotesRecipe | SfxrRecipe | LayersRecipe;

/** A recipe file: the recipe and how its file is cut. */
export interface RecipeFile {
  recipe: Recipe;
  /** A loop (the laser, the flamethrower, the heartbeat): no trimming nor fade, its end crossfaded into its start. */
  loop: boolean;
  /** Seconds the file lasts (silence added or the end cut), or null for the recipe's own length. */
  length: number | null;
  /** Seconds of a loop's end crossfaded into its start, so it repeats without a jump. */
  crossfade: number;
}

export class RecipeError extends Error {
  override name = 'RecipeError';
}

const WAVES: readonly Wave[] = ['square', 'triangle', 'sine'];
const NOTE = /^([A-G])([#b]?)(\d)$/;
const SEMITONES: Readonly<Record<string, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Frequency of a note of the scale (A4 = 440 Hz); throws if it is not in A minor pentatonic (§3.2 rule 1). */
export function noteFrequency(name: string): number {
  const m = NOTE.exec(name);
  if (!m) throw new RecipeError(`nota «${name}» no válida (ejemplo: A4, C5, E6)`);
  const [, letter = '', accidental = '', octave = '4'] = m;
  if (accidental || !(AUDIO_GEN.scale as readonly string[]).includes(letter)) {
    throw new RecipeError(`la nota «${name}» está fuera de La menor pentatónica (${AUDIO_GEN.scale.join(', ')})`);
  }
  const midi = 12 * (Number(octave) + 1) + (SEMITONES[letter] ?? 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function seconds(value: unknown, where: string, min = 0): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) throw new RecipeError(`${where}: tiene que ser un número de segundos ≥ ${min}`);
  return value;
}

function gainOf(value: unknown, where: string): number {
  const g = value === undefined ? 1 : value;
  if (typeof g !== 'number' || g < 0 || g > 1) throw new RecipeError(`${where}: el volumen va de 0 a 1`);
  return g;
}

function lowpassOf(value: unknown, where: string, fallback: number | null): number | null {
  const lowpass = value === undefined ? fallback : value;
  if (lowpass !== null && (typeof lowpass !== 'number' || lowpass <= 0)) throw new RecipeError(`${where}.lowpass: Hz o null`);
  return lowpass;
}

function noteStep(raw: unknown, where: string): NoteStep {
  // [note, duration] or [note, duration, gain], or { note, duration, gain }.
  const fields: readonly unknown[] = Array.isArray(raw) ? (raw as unknown[]) : isRecord(raw) ? [raw.note, raw.duration, raw.gain] : [];
  const [note, duration, gain] = fields;
  if (note !== null && typeof note !== 'string') throw new RecipeError(`${where}: la nota tiene que ser un texto como "E5" o null (silencio)`);
  if (typeof note === 'string') noteFrequency(note);
  return { note, duration: seconds(duration, `${where}.duration`, 0.001), gain: gainOf(gain, where) };
}

/**
 * jsfxr's parameters: its JSON as sfxr.me gives it (extra fields such as
 * sound_vol are ignored; missing ones take jsfxr's defaults), or an
 * sfxr.me link or its base58 code.
 */
function sfxrParams(raw: unknown, where: string): SfxrParams {
  if (typeof raw === 'string') {
    try {
      return sfxrFromLink(raw);
    } catch (err) {
      throw new RecipeError(`${where}: ${(err as Error).message}`);
    }
  }
  if (!isRecord(raw)) throw new RecipeError(`${where}: el JSON de sfxr.me o su enlace`);
  const params = { ...SFXR_DEFAULTS };
  for (const name of Object.keys(SFXR_DEFAULTS) as (keyof SfxrParams)[]) {
    const value = raw[name];
    if (value === undefined) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RecipeError(`${where}.${name}: tiene que ser un número`);
    params[name] = value;
  }
  if (![0, 1, 2, 3].includes(params.wave_type)) throw new RecipeError(`${where}.wave_type: 0 cuadrada, 1 sierra, 2 seno o 3 ruido`);
  return params;
}

/** Validates a recipe's JSON; throws RecipeError with what is wrong and where. */
export function parseRecipe(json: unknown, where: string): Recipe {
  if (!isRecord(json)) throw new RecipeError(`${where}: la receta tiene que ser un objeto JSON`);
  switch (json.type) {
    case 'notes': {
      const wave = json.wave ?? 'square';
      if (typeof wave !== 'string' || !(WAVES as readonly string[]).includes(wave)) throw new RecipeError(`${where}.wave: ${WAVES.join(', ')}`);
      if (!Array.isArray(json.notes) || json.notes.length === 0) throw new RecipeError(`${where}.notes: hace falta al menos una nota`);
      return {
        type: 'notes',
        wave: wave as Wave,
        attack: seconds(json.attack ?? 0.002, `${where}.attack`),
        decay: json.decay === null ? null : seconds(json.decay ?? 0.1, `${where}.decay`, 0.001),
        notes: json.notes.map((n, i) => noteStep(n, `${where}.notes[${i}]`)),
        lowpass: lowpassOf(json.lowpass, where, AUDIO_GEN.lowpass),
      };
    }
    case 'sfxr': {
      const seed = json.seed ?? 1;
      if (typeof seed !== 'number' || !Number.isInteger(seed) || seed < 0) throw new RecipeError(`${where}.seed: un entero ≥ 0`);
      return { type: 'sfxr', params: sfxrParams(json.params, `${where}.params`), seed, lowpass: lowpassOf(json.lowpass, where, AUDIO_GEN.lowpass) };
    }
    case 'layers': {
      if (!Array.isArray(json.layers) || json.layers.length === 0) throw new RecipeError(`${where}.layers: hace falta al menos una capa`);
      const layers = json.layers.map((raw, i): Layer => {
        const at = `${where}.layers[${i}]`;
        if (!isRecord(raw)) throw new RecipeError(`${at}: { "recipe": {…}, "gain": 1, "delay": 0 }`);
        return { recipe: parseRecipe(raw.recipe, `${at}.recipe`), gain: gainOf(raw.gain, at), delay: seconds(raw.delay ?? 0, `${at}.delay`) };
      });
      // Each layer is already filtered: the mix adds no low-pass of its own unless it asks for one.
      return { type: 'layers', layers, lowpass: lowpassOf(json.lowpass, where, null) };
    }
    default:
      throw new RecipeError(`${where}: tipo de receta «${String(json.type)}» desconocido (notes, sfxr o layers)`);
  }
}

/** A recipe file: the recipe, and `loop`, `length` and `crossfade` for how the file is cut. */
export function parseRecipeFile(json: unknown, where: string): RecipeFile {
  const recipe = parseRecipe(json, where);
  const raw = json as Record<string, unknown>;
  const loop = raw.loop === true;
  return {
    recipe,
    loop,
    length: raw.length === undefined ? null : seconds(raw.length, `${where}.length`, 0.001),
    crossfade: seconds(raw.crossfade ?? 0, `${where}.crossfade`),
  };
}
