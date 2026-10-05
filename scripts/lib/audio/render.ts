/**
 * Renders a recipe to samples (spec 08 §4.1), before the common finish.
 * Deterministic: no randomness but seeded noise, and no clock.
 */
import { mixInto, silence } from './dsp';
import type { Recipe } from './recipes';
import { renderSynth } from './synth';
import { frames, type Audio } from './wav';

/** A recipe to audio with `channels` channels (a mono layer goes to every channel). */
export function render(recipe: Recipe, channels: 1 | 2, sampleRate: number): Audio {
  switch (recipe.type) {
    case 'synth': {
      const mono = renderSynth(recipe.params, sampleRate);
      return { sampleRate, channels: Array.from({ length: channels }, () => mono.slice()) };
    }
    case 'layers': {
      const parts = recipe.layers.map((layer) => ({ audio: render(layer.recipe, channels, sampleRate), gain: layer.gain, offset: Math.round(layer.delay * sampleRate) }));
      const length = Math.max(0, ...parts.map((p) => p.offset + frames(p.audio)));
      const out = silence(length / sampleRate, channels, sampleRate);
      for (const p of parts) mixInto(out, p.audio, p.offset, p.gain);
      return out;
    }
  }
}
