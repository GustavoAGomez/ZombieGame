/**
 * The recipes of the generated sounds (spec 08 §4.1), one JSON file per
 * manifest key in audio-src/recipes/. A recipe keeps every parameter: the
 * same recipe always gives the same file.
 */
import { AUDIO_GEN } from '../../../src/config/audio';

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

export type Recipe = NotesRecipe;

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

function noteStep(raw: unknown, where: string): NoteStep {
  // [note, duration] or [note, duration, gain], or { note, duration, gain }.
  const fields: readonly unknown[] = Array.isArray(raw) ? (raw as unknown[]) : isRecord(raw) ? [raw.note, raw.duration, raw.gain] : [];
  const [note, duration, gain] = fields;
  if (note !== null && typeof note !== 'string') throw new RecipeError(`${where}: la nota tiene que ser un texto como "E5" o null (silencio)`);
  if (typeof note === 'string') noteFrequency(note);
  const g = gain === undefined ? 1 : gain;
  if (typeof g !== 'number' || g < 0 || g > 1) throw new RecipeError(`${where}: el volumen de la nota va de 0 a 1`);
  return { note, duration: seconds(duration, `${where}.duration`, 0.001), gain: g };
}

/** Validates a recipe's JSON; throws RecipeError with what is wrong and where. */
export function parseRecipe(json: unknown, where: string): Recipe {
  if (!isRecord(json)) throw new RecipeError(`${where}: la receta tiene que ser un objeto JSON`);
  if (json.type !== 'notes') throw new RecipeError(`${where}: tipo de receta «${String(json.type)}» desconocido (notes)`);
  const wave = json.wave ?? 'square';
  if (typeof wave !== 'string' || !(WAVES as readonly string[]).includes(wave)) throw new RecipeError(`${where}.wave: ${WAVES.join(', ')}`);
  if (!Array.isArray(json.notes) || json.notes.length === 0) throw new RecipeError(`${where}.notes: hace falta al menos una nota`);
  const lowpass = json.lowpass === undefined ? AUDIO_GEN.lowpass : json.lowpass;
  if (lowpass !== null && (typeof lowpass !== 'number' || lowpass <= 0)) throw new RecipeError(`${where}.lowpass: Hz o null`);
  return {
    type: 'notes',
    wave: wave as Wave,
    attack: seconds(json.attack ?? 0.002, `${where}.attack`),
    decay: json.decay === null ? null : seconds(json.decay ?? 0.1, `${where}.decay`, 0.001),
    notes: json.notes.map((n, i) => noteStep(n, `${where}.notes[${i}]`)),
    lowpass,
  };
}
