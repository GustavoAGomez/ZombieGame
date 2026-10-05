import { describe, expect, it } from 'vitest';
import { AUDIO, type AudioBus, type SoundDef, type VolumeLevel } from '../config/audio';
import type { AudioDef } from '../game/assets/manifest';
import { AudioDirector, type AudioSettings } from './AudioDirector';
import type { AudioOutput, PlayOptions, Voice } from './AudioEngine';
import { WebAudioEngine } from './AudioEngine';

/** An engine that records what it is asked to play. */
class FakeEngine implements AudioOutput {
  readonly played: { key: string; options: PlayOptions; stopped: boolean }[] = [];
  readonly gains: Partial<Record<AudioBus, number>> = {};
  unlocked = 0;
  readonly state = 'running';
  load(): void {}
  unlock(): void {
    this.unlocked++;
  }
  play(key: string, options: PlayOptions): Voice {
    const entry = { key, options, stopped: false };
    this.played.push(entry);
    return { stop: () => (entry.stopped = true) };
  }
  setBusGain(bus: AudioBus, gain: number): void {
    this.gains[bus] = gain;
  }
}

class FakeSettings implements AudioSettings {
  private listeners: (() => void)[] = [];
  constructor(
    public sfx: VolumeLevel = 'high',
    public music: VolumeLevel = 'high',
  ) {}
  onChange(listener: () => void): () => void {
    this.listeners.push(listener);
    return () => undefined;
  }
  set(sfx: VolumeLevel, music: VolumeLevel): void {
    this.sfx = sfx;
    this.music = music;
    for (const l of this.listeners) l();
  }
}

const base = { pitchVar: 0, maxVoices: 2, minInterval: 0, priority: 'normal', positional: false, ladder: null, duck: false } as const;
const CATALOG: SoundDef[] = [
  { ...base, id: 'ui.tap', family: 'ui', variants: ['ui_tap'], bus: 'ui', volume: 0.5, pitchVar: 3, minInterval: 0.03, priority: 'low' },
  { ...base, id: 'shot', family: 'hit', variants: ['shot_1', 'shot_2', 'shot_3'], bus: 'sfx', volume: 0.8, maxVoices: 20 },
  { ...base, id: 'low', family: 'hit', variants: ['low_1'], bus: 'sfx', volume: 1, maxVoices: 20, priority: 'low' },
  { ...base, id: 'big', family: 'threat', variants: ['big_1'], bus: 'sfx', volume: 1, maxVoices: 20, priority: 'high' },
  { ...base, id: 'silent', family: 'hit', variants: ['missing'], bus: 'sfx', volume: 1 },
];
const DEFS: Record<string, AudioDef> = Object.fromEntries(
  ['ui_tap', 'shot_1', 'shot_2', 'shot_3', 'low_1', 'big_1'].map((k) => [k, { file: `audio/sfx/${k}.wav`, duration: 0.5, placeholder: false }]),
);

function setup(randoms: number[] = [0.5]) {
  const engine = new FakeEngine();
  const settings = new FakeSettings();
  let now = 0;
  let r = 0;
  const director = new AudioDirector(engine, settings, { clock: () => now, random: () => randoms[r++ % randoms.length] ?? 0.5, catalog: CATALOG });
  director.load(DEFS, 'assets/');
  return { engine, settings, director, advance: (s: number) => (now += s) };
}

describe('AudioDirector (spec 08 §1)', () => {
  it('plays a menu sound on the ui bus, its pitch within its variation', () => {
    const { engine, director } = setup([1]);
    director.playUi('ui.tap');
    expect(engine.played).toHaveLength(1);
    const [p] = engine.played;
    expect(p?.key).toBe('ui_tap');
    expect(p?.options.bus).toBe('ui');
    expect(p?.options.gain).toBe(0.5);
    expect(p?.options.rate).toBeCloseTo(1.03);
  });

  it('is silence, not an error, for an unknown id or a sound with no file', () => {
    const { engine, director } = setup();
    director.test('nope');
    director.test('silent');
    expect(engine.played).toHaveLength(0);
  });

  it('drops a play sooner than minInterval, and past maxVoices', () => {
    const { engine, director, advance } = setup();
    director.playUi('ui.tap');
    advance(0.01);
    director.playUi('ui.tap');
    advance(0.03);
    director.playUi('ui.tap');
    advance(0.03);
    director.playUi('ui.tap');
    // The second came too soon; the fourth found its 2 voices still playing.
    expect(engine.played).toHaveLength(2);
    expect(director.stats().dropped).toBe(2);
    expect(director.stats().lastDropped).toBe('ui.tap');
  });

  it('never picks the same variant twice in a row', () => {
    const { engine, director, advance } = setup([0.1, 0.1, 0.1, 0.9, 0.9]);
    for (let i = 0; i < 5; i++) {
      director.test('shot');
      advance(1);
    }
    const keys = engine.played.map((p) => p.key);
    for (let i = 1; i < keys.length; i++) expect(keys[i]).not.toBe(keys[i - 1]);
  });

  it('with the global limit full, cuts the lowest priority, oldest voice, and drops what everything outranks', () => {
    const { engine, director, advance } = setup();
    director.test('low');
    advance(0.001);
    for (let i = 1; i < AUDIO.maxVoices; i++) {
      director.test('shot');
      advance(0.001);
    }
    expect(director.stats().voices).toBe(AUDIO.maxVoices);
    director.test('shot');
    expect(engine.played[0]?.stopped).toBe(true);
    // Now every voice is normal: the oldest shot goes for a high one, but a low one is dropped.
    director.test('big');
    expect(engine.played[1]?.stopped).toBe(true);
    director.test('low');
    expect(engine.played.at(-1)?.key).toBe('big_1');
    expect(director.stats().voices).toBe(AUDIO.maxVoices);
  });

  it('frees the voices of the sounds that ended', () => {
    const { director, advance } = setup();
    director.test('shot');
    expect(director.stats().voices).toBe(1);
    advance(0.6);
    expect(director.stats().voices).toBe(0);
  });

  it('sets the buses from the settings: the menus follow the effects, the music sits under them', () => {
    const { engine, settings } = setup();
    expect(engine.gains).toEqual({ sfx: 1, ui: 1, music: AUDIO.musicGain });
    settings.set('low', 'off');
    expect(engine.gains).toEqual({ sfx: AUDIO.levels.low, ui: AUDIO.levels.low, music: 0 });
  });

  it('in pause, stops the effects and keeps the menus, the music at 40 %', () => {
    const { engine, director } = setup();
    director.test('shot');
    director.update({ paused: true });
    expect(engine.played[0]?.stopped).toBe(true);
    expect(engine.gains).toEqual({ sfx: 0, ui: 1, music: AUDIO.musicGain * AUDIO.pausedMusic });
    director.test('shot');
    director.playUi('ui.tap');
    expect(engine.played.map((p) => p.options.bus)).toEqual(['sfx', 'ui']);
    director.update({ paused: false });
    expect(engine.gains.sfx).toBe(1);
  });

  it('unlocks the engine on the JUGAR tap', () => {
    const { engine, director } = setup();
    director.unlock();
    expect(engine.unlocked).toBe(1);
  });
});

describe('WebAudioEngine without Web Audio', () => {
  it('stays silent and never throws: the game runs the same', () => {
    const engine = new WebAudioEngine();
    expect(() => {
      engine.load(DEFS, 'assets/');
      engine.unlock();
      engine.setBusGain('sfx', 0.5, 0.05);
      engine.suspend();
      engine.resume();
    }).not.toThrow();
    expect(engine.play('ui_tap', { bus: 'ui', gain: 1, rate: 1, pan: 0 })).toBeNull();
    expect(engine.state).toBe('sin Web Audio');
  });
});
