import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUDIO_GEN, SOUND_DEFAULTS, type SoundDef } from '../../../src/config/audio';
import { renderFile } from '../../audio-gen';
import { envValue, fileNameOf, parseArgs } from '../../audio-search';
import { checkAudioSources, type CheckReport } from '../../check-assets';
import { measure } from './analyze';
import { Credits, creditsMarkdown } from './credits';
import { render } from './render';
import { stripCandidates } from './strip-candidates';
import { RecipeError, parseRecipe, parseSoundRecipes } from './recipes';
import { buildReport, type ReportRow } from './report';
import { noteFrequency, SynthError } from './synth';
import { decodeWav, encodeWav } from './wav';

const TAP = {
  type: 'layers',
  layers: [
    { recipe: { type: 'synth', timbre: 'glass', note: 'E6', duration: 0.12 }, gain: 0.8 },
    { recipe: { type: 'synth', timbre: 'air', freq: 500, freqEnd: 300, duration: 0.05, seed: 11 }, gain: 0.5 },
  ],
};
const gen = (json: unknown, channels: 1 | 2 = 1): Uint8Array => renderFile(parseRecipe(json, 'test'), channels);

const sound = (patch: Partial<SoundDef> = {}): SoundDef => ({
  ...SOUND_DEFAULTS,
  id: 'ui.tap',
  family: 'ui',
  variants: ['a', 'b'],
  bus: 'ui',
  volume: 1,
  maxVoices: 1,
  priority: 'low',
  ...patch,
});
const row = (key: string, bytes: Uint8Array, s = sound(), letter = 'A'): ReportRow => ({ key, sound: s, letter, inGame: true, about: '', layer: 'body', measures: measure(decodeWav(bytes)) });

describe('sound workshop (spec 08 §4)', () => {
  it('gives the same bytes for the same recipe, and other bytes for another seed', () => {
    expect(gen(TAP)).toEqual(gen(structuredClone(TAP)));
    const other = structuredClone(TAP);
    other.layers[1]!.recipe.seed = 12;
    expect(gen(other)).not.toEqual(gen(TAP));
  });

  it('writes WAV of 44.1 kHz and 16 bits, mono or stereo', () => {
    expect(decodeWav(gen(TAP)).channels).toHaveLength(1);
    const stereo = decodeWav(gen(TAP, 2));
    expect([stereo.channels.length, stereo.sampleRate, stereo.bitsPerSample]).toEqual([2, 44100, 16]);
  });

  it('applies the common finish: starts at once, peak at −1 dB, faded at the end, nothing under 60 Hz', () => {
    const late = { type: 'layers', layers: [{ recipe: { type: 'synth', timbre: 'bell', note: 'A4', duration: 0.3 }, gain: 1, delay: 0.05 }] };
    const wav = decodeWav(gen(late));
    const m = measure(wav);
    expect(m.leadingSilence).toBeLessThanOrEqual(AUDIO_GEN.maxLeadingSilence);
    expect(m.peakDb).toBeCloseTo(AUDIO_GEN.peakDb, 1);
    expect(Math.abs(wav.channels[0]?.at(-1) ?? 1)).toBeLessThan(0.01);
    // A0 (27.5 Hz) and A5 at the same level: the high-pass at 60 Hz leaves little of the low one.
    const pad = (note: string) => ({ recipe: { type: 'synth', timbre: 'pad', note, duration: 0.5, attack: 0.01, width: 0 }, gain: 1 });
    const m2 = measure(decodeWav(gen({ type: 'layers', layers: [pad('A0'), pad('A5')] })));
    expect(m2.bands[0] ?? 1).toBeLessThan(0.1);
  });

  it('only takes notes of A minor', () => {
    expect(noteFrequency('A4')).toBeCloseTo(440);
    expect(noteFrequency('F5')).toBeCloseTo(698.46, 1);
    expect(() => noteFrequency('C#5')).toThrow(SynthError);
    expect(() => parseRecipe({ type: 'synth', timbre: 'bell', note: 'G#4' }, 'x')).toThrow(RecipeError);
    expect(() => parseRecipe({ type: 'synth', timbre: 'bell' }, 'x')).toThrow(/note/);
  });

  it('reads a sound\'s candidates and the chosen one, A required', () => {
    const file = parseSoundRecipes({ chosen: null, candidates: { A: { variants: [TAP] }, C: { channels: 2, variants: [TAP] } } }, 'ui.tap');
    expect([file.chosen, Object.keys(file.candidates), file.candidates.C?.channels]).toEqual([null, ['A', 'C'], 2]);
    expect(() => parseSoundRecipes({ chosen: 'B', candidates: { A: { variants: [TAP] } } }, 'x')).toThrow(/no hay candidato B/);
    expect(() => parseSoundRecipes({ chosen: null, candidates: { B: { variants: [TAP] } } }, 'x')).toThrow(/candidato A/);
  });
});

describe('workshop report (spec 08 §4.5)', () => {
  it('warns of a file out of its family\'s length, of clipping, of a stereo positional file and of near-identical variants', () => {
    const long = gen({ type: 'synth', timbre: 'pad', note: 'A4', duration: 0.6, attack: 0.05 });
    const clipped = row('c', gen(TAP));
    clipped.measures = { ...clipped.measures, clippedRuns: 2 };
    const { warnings } = buildReport([
      row('a', long),
      row('b', long),
      clipped,
      row('d', gen(TAP, 2), sound({ id: 'impact.flesh', family: 'hit', positional: true, variants: ['d'] })),
    ]);
    expect(warnings.some((w) => w.startsWith('a: dura') && w.includes('Interfaz'))).toBe(true);
    expect(warnings.some((w) => w.includes('casi idénticas'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('c: saturado'))).toBe(true);
    expect(warnings.some((w) => w.startsWith('d: es estéreo'))).toBe(true);
  });

  it('warns when most of the energy is under 100 Hz, where a phone plays nothing', () => {
    const rumble = gen({ type: 'synth', timbre: 'sub', freq: 70, duration: 0.3 });
    const { warnings } = buildReport([row('r', rumble, sound({ id: 'boss.landed', family: 'threat', variants: ['r'] }))]);
    expect(warnings.some((w) => w.includes('por debajo de 100 Hz'))).toBe(true);
  });
});

/** A scratch audio-src/ with one recorded source: 0.1 s of room noise, then a 440 Hz tone of 0.4 s. */
function scratchSources(credits: unknown = { origin: 'Prueba', author: 'Nadie', license: 'CC0 1.0', url: 'https://example.com' }): string {
  const root = mkdtempSync(join(tmpdir(), 'audio-src-'));
  const sr = AUDIO_GEN.sampleRate;
  const samples = new Float32Array(Math.round(0.5 * sr));
  for (let i = 0; i < samples.length; i++) samples[i] = i < 0.1 * sr ? 0.002 * Math.sin(i * 7.3) : 0.25 * Math.sin((2 * Math.PI * 440 * i) / sr);
  mkdirSync(join(root, 'library/test'), { recursive: true });
  writeFileSync(join(root, 'library/test/tone.wav'), encodeWav({ sampleRate: sr, channels: [samples] }));
  if (credits) writeFileSync(join(root, 'library/test/credits.json'), JSON.stringify(credits));
  return root;
}

describe('recorded sources and the processing chain (spec 08 §4.1, §4.2)', () => {
  const root = scratchSources();
  const file = (process?: unknown) => ({ type: 'file', source: 'library/test/tone.wav', ...(process ? { process } : {}) });
  const render1 = (json: unknown, loop = false) => decodeWav(renderFile(parseRecipe(json, 'test'), 1, root, loop));

  it('decodes a source, starts at its onset (not its room noise) and gives the same bytes every time', () => {
    const wav = render1(file());
    expect(measure(wav).leadingSilence).toBeLessThanOrEqual(AUDIO_GEN.maxLeadingSilence);
    expect(wav.duration).toBeCloseTo(0.4, 2);
    expect(renderFile(parseRecipe(file(), 't'), 1, root)).toEqual(renderFile(parseRecipe(file(), 't'), 1, root));
  });

  it('trims, changes the pitch, slides it and sets the final length', () => {
    expect(render1(file({ start: 0.1, end: 0.3 })).duration).toBeCloseTo(0.2, 2);
    const up = measure(render1(file({ start: 0.1, semitones: 12 })));
    expect(up.duration).toBeCloseTo(0.2, 2);
    expect(up.brightness).toBeGreaterThan(measure(render1(file({ start: 0.1 }))).brightness * 1.6);
    // Sliding down an octave: longer than as it was, shorter than a whole octave down.
    const glide = render1(file({ start: 0.1, glide: -12 })).duration;
    expect(glide).toBeGreaterThan(0.45);
    expect(glide).toBeLessThan(0.8);
    expect(render1(file({ start: 0.1, reverb: 'room', wet: 0.3, length: 0.25, fadeOut: 0.05 })).duration).toBeCloseTo(0.25, 2);
  });

  it('normalizes each recorded source after its trim, so a layer\'s gain is relative to its peak', () => {
    const peak = (process: unknown): number => {
      const a = render(parseRecipe(file(process), 't'), 1, { sampleRate: AUDIO_GEN.sampleRate, sourceRoot: root });
      return Math.max(...(a.channels[0] ?? []).map(Math.abs));
    };
    // The tone was recorded at 0.25.
    expect(peak({ start: 0.1 })).toBeCloseTo(1, 2);
    expect(peak({ start: 0.1, gainDb: -6 })).toBeCloseTo(0.5, 2);
  });

  it('finishes a loop without a seam: its end runs into its start', () => {
    const loop = render1(file({ start: 0.1 }), true);
    const ch = loop.channels[0] ?? new Float32Array(0);
    expect(loop.duration).toBeCloseTo(0.4 - AUDIO_GEN.loopCrossfade, 2);
    // The last sample and the first are neighbours of one 440 Hz wave: at most one step apart.
    const step = 2 * Math.sin((Math.PI * 440) / AUDIO_GEN.sampleRate) * 0.9;
    expect(Math.abs((ch[0] ?? 0) - (ch.at(-1) ?? 0))).toBeLessThan(step * 1.5);
  });

  it('rejects a source outside library/ and generated/', () => {
    expect(() => parseRecipe({ type: 'file', source: '../secret.wav' }, 'x')).toThrow(RecipeError);
    expect(() => parseRecipe({ type: 'file', source: 'library/a/b.txt' }, 'x')).toThrow(RecipeError);
  });
});

describe('licence records (spec 08 §5.1)', () => {
  it('finds a source\'s record in its folder, a file\'s own fields over the folder\'s', () => {
    const root = scratchSources({ origin: 'Freesound', license: 'CC0 1.0', files: { 'tone.wav': { author: 'alguien', url: 'https://freesound.org/s/1/' } } });
    expect(new Credits(root).of('library/test/tone.wav')).toEqual({ credit: { origin: 'Freesound', author: 'alguien', license: 'CC0 1.0', url: 'https://freesound.org/s/1/' } });
    expect(new Credits(root).of('library/test/other.wav')).toHaveProperty('problem', expect.stringContaining('falta author, url'));
  });

  it('takes only CC0 from a library, and asks a generated file for its prompt and model', () => {
    const root = scratchSources({ origin: 'X', author: 'Y', license: 'CC BY 4.0', url: 'https://example.com' });
    expect(new Credits(root).of('library/test/tone.wav')).toHaveProperty('problem', expect.stringContaining('solo vale CC0'));
    expect(new Credits(root).of('generated/a.wav')).toHaveProperty('problem', expect.stringContaining('generated/credits.json'));
  });

  it('makes assets:check fail when a recipe uses a source without a record', () => {
    const root = mkdtempSync(join(tmpdir(), 'repo-'));
    const audioSrc = scratchSources(null);
    renameSync(audioSrc, join(root, 'audio-src'));
    mkdirSync(join(root, 'audio-src/recipes'));
    writeFileSync(join(root, 'audio-src/recipes/ui.tap.json'), JSON.stringify({ chosen: null, candidates: { A: { variants: [{ type: 'file', source: 'library/test/tone.wav' }] } } }));
    const report: CheckReport = { errors: [], warnings: [], info: [] };
    checkAudioSources(root, report);
    expect(report.errors).toEqual([expect.stringContaining('falta audio-src/library/test/credits.json')]);
    writeFileSync(join(root, 'audio-src/library/test/credits.json'), JSON.stringify({ origin: 'P', author: 'A', license: 'CC0 1.0', url: 'https://example.com' }));
    const ok: CheckReport = { errors: [], warnings: [], info: [] };
    checkAudioSources(root, ok);
    expect(ok.errors).toEqual([]);
  });

  it('writes one credits row per source', () => {
    const md = creditsMarkdown([{ source: 'library/test/tone.wav', credit: { origin: 'P', author: 'A|B', license: 'CC0 1.0', url: 'https://x' }, sounds: ['ui.tap'] }]);
    expect(md).toContain('| `library/test/tone.wav` | P | A\\|B | CC0 1.0 | https://x | ui.tap |');
  });
});

describe('audio:search (spec 08 §5.2)', () => {
  it('reads the key from a .env text without printing it, and names files by id and title', () => {
    expect(envValue('# x\nOTHER=1\nFREESOUND_API_KEY="abc123"\n', 'FREESOUND_API_KEY')).toBe('abc123');
    expect(envValue('export FREESOUND_API_KEY=xyz', 'FREESOUND_API_KEY')).toBe('xyz');
    expect(envValue('FREESOUND_API_KEY=', 'FREESOUND_API_KEY')).toBeUndefined();
    expect(fileNameOf(123, 'Heavy Door Slam (2).wav')).toBe('123_heavy_door_slam_2.ogg');
    expect(parseArgs(['pistol', 'shot', '--count', '3', '--max', '2'])).toEqual({ query: 'pistol shot', count: 3, max: 2 });
    expect(() => parseArgs([])).toThrow(/uso/);
  });
});

describe('report: pitch, own lengths, rewards over hits (spec 08 §4.5)', () => {
  it('measures the dominant pitch of a note', () => {
    const a5 = measure(decodeWav(gen({ type: 'synth', timbre: 'pad', note: 'A5', duration: 0.5, attack: 0.01, width: 0 })));
    expect(Math.abs(a5.pitch - 880)).toBeLessThan(25);
  });

  it('holds a sound with its own length to it, and not to its family\'s range', () => {
    const long = gen({ type: 'synth', timbre: 'pad', note: 'A4', duration: 0.6, attack: 0.05 });
    const roll = sound({ id: 'hand.roll', family: 'threat', variants: ['r'], length: 2 });
    expect(buildReport([row('r', long, roll)]).warnings).toEqual([expect.stringMatching(/^r: dura \d+ ms y tiene que durar 2000 ms$/)]);
  });

  it('warns of a reward lower than the hits, judging a streak sound by its shine', () => {
    const low = gen({ type: 'synth', timbre: 'pad', note: 'A3', duration: 0.3, attack: 0.01, width: 0 });
    const high = gen({ type: 'synth', timbre: 'pad', note: 'A6', duration: 0.3, attack: 0.01, width: 0 });
    const hit = sound({ id: 'weapon.pistol.fire', family: 'hit', variants: ['h'] });
    const reward = sound({ id: 'buy.door', family: 'reward', variants: ['d'] });
    const streak = sound({ id: 'reward.kill', family: 'reward', variants: ['k'], shine: ['k_shine'] });
    const rows = [row('h', gen({ type: 'synth', timbre: 'pad', note: 'A4', duration: 0.3, attack: 0.01, width: 0 }), hit), row('d', low, reward), row('k', low, streak), { ...row('k_shine', high, streak), layer: 'shine' as const }];
    const { warnings } = buildReport(rows);
    expect(warnings.filter((w) => w.includes('Premio más grave'))).toEqual([expect.stringMatching(/^buy\.door:/)]);
  });
});

describe('builds without the candidates (spec 08 §8)', () => {
  it('removes the candidates\' files and their manifest entries from the output', () => {
    const out = mkdtempSync(join(tmpdir(), 'dist-'));
    mkdirSync(join(out, 'assets/audio/candidates'), { recursive: true });
    writeFileSync(join(out, 'assets/audio/candidates/ui_tap__a.wav'), '');
    writeFileSync(join(out, 'assets/manifest.json'), JSON.stringify({ audio: { ui_tap: { file: 'audio/sfx/ui_tap.wav' }, ui_tap__a: { file: 'audio/candidates/ui_tap__a.wav', candidate: 'A' } } }));
    expect(stripCandidates(out)).toBe(1);
    expect(existsSync(join(out, 'assets/audio/candidates'))).toBe(false);
    expect(Object.keys((JSON.parse(readFileSync(join(out, 'assets/manifest.json'), 'utf8')) as { audio: object }).audio)).toEqual(['ui_tap']);
  });
});
