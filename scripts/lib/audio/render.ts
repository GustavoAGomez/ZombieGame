/**
 * Renders a recipe to samples (spec 08 §4.1, §4.2), before the common
 * finish: its source or its synth layer, or its layers mixed, and then its
 * processing chain. Deterministic: no randomness but seeded noise.
 */
import { resolve } from 'node:path';
import { mixInto, silence } from './dsp';
import { applyProcess } from './process';
import type { Recipe } from './recipes';
import { decodeSource } from './source';
import { renderSynth } from './synth';
import { frames, type Audio } from './wav';

export interface RenderContext {
  sampleRate: number;
  /** audio-src/, where the sources' paths start. */
  sourceRoot: string;
}

/** A recipe to audio with `channels` channels (a mono layer goes to every channel). */
export function render(recipe: Recipe, channels: 1 | 2, ctx: RenderContext): Audio {
  const { sampleRate } = ctx;
  let out: Audio;
  let recorded = false;
  switch (recipe.type) {
    case 'synth': {
      const mono = renderSynth(recipe.params, sampleRate);
      out = { sampleRate, channels: Array.from({ length: channels }, () => mono.slice()) };
      break;
    }
    case 'file':
      out = decodeSource(resolve(ctx.sourceRoot, recipe.source), channels, sampleRate);
      recorded = true;
      break;
    case 'layers': {
      const parts = recipe.layers.map((layer) => ({ audio: render(layer.recipe, channels, ctx), gain: layer.gain, offset: Math.round(layer.delay * sampleRate) }));
      const length = Math.max(0, ...parts.map((p) => p.offset + frames(p.audio)));
      out = silence(length / sampleRate, channels, sampleRate);
      for (const p of parts) mixInto(out, p.audio, p.offset, p.gain);
      break;
    }
  }
  return applyProcess(out, recipe.process, recorded);
}
