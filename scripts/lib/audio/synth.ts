/**
 * Renders a recipe to raw samples (spec 08 §4.1), before the common finish.
 * Deterministic: no randomness and no clock, so the same recipe always
 * gives the same samples.
 */
import { lowpass } from './dsp';
import { noteFrequency, type NotesRecipe, type Recipe, type Wave } from './recipes';

/** Seconds each note fades out at its end, so a note cut off does not click. */
const NOTE_RELEASE = 0.002;

function oscillator(wave: Wave, phase: number): number {
  // phase in 0..1
  switch (wave) {
    case 'sine':
      return Math.sin(2 * Math.PI * phase);
    case 'triangle':
      return phase < 0.5 ? 4 * phase - 1 : 3 - 4 * phase;
    case 'square':
      return phase < 0.5 ? 1 : -1;
  }
}

/** A `notes` recipe: each note in turn, with its attack and exponential decay. */
export function renderNotes(recipe: NotesRecipe, sampleRate: number): Float32Array {
  const total = recipe.notes.reduce((sum, n) => sum + n.duration, 0);
  const out = new Float32Array(Math.ceil(total * sampleRate));
  let offset = 0;
  for (const step of recipe.notes) {
    const length = Math.round(step.duration * sampleRate);
    if (step.note !== null) {
      const freq = noteFrequency(step.note);
      const release = Math.round(NOTE_RELEASE * sampleRate);
      let phase = 0;
      for (let i = 0; i < length && offset + i < out.length; i++) {
        const t = i / sampleRate;
        let env = t < recipe.attack ? t / recipe.attack : recipe.decay === null ? 1 : Math.exp(-(t - recipe.attack) / recipe.decay);
        const fromEnd = length - 1 - i;
        if (fromEnd < release) env *= fromEnd / release;
        out[offset + i] = oscillator(recipe.wave, phase) * env * step.gain;
        phase = (phase + freq / sampleRate) % 1;
      }
    }
    offset += length;
  }
  return recipe.lowpass === null ? out : lowpass(out, recipe.lowpass, sampleRate);
}

export function render(recipe: Recipe, sampleRate: number): Float32Array {
  return renderNotes(recipe, sampleRate);
}
