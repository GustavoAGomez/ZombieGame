import { describe, expect, it } from 'vitest';
import { AUDIO, SOUNDS, type AudioBus, type SoundDef, type VolumeLevel } from '../config/audio';
import { EventBus } from '../core/EventBus';
import type { AudioDef } from '../game/assets/manifest';
import { AudioDirector, QUIET_SNAPSHOT, type AudioSettings } from './AudioDirector';
import type { AudioOutput, PlayOptions, Voice } from './AudioEngine';
import { WebAudioEngine } from './AudioEngine';

/** An engine that records what it is asked to play. */
class FakeEngine implements AudioOutput {
  readonly played: { key: string; options: PlayOptions; stopped: boolean; rate: number }[] = [];
  readonly gains: Partial<Record<AudioBus, number>> = {};
  unlocked = 0;
  readonly state = 'running';
  load(): void {}
  unlock(): void {
    this.unlocked++;
  }
  play(key: string, options: PlayOptions): Voice {
    const entry = { key, options, stopped: false, rate: options.rate };
    this.played.push(entry);
    return { stop: () => (entry.stopped = true), setRate: (r) => (entry.rate = r) };
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

const base = { pitchVar: 0, maxVoices: 2, minInterval: 0, priority: 'normal', positional: false, ladder: null, duck: false, loop: false } as const;
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
  const director = new AudioDirector(engine, settings, null, { clock: () => now, random: () => randoms[r++ % randoms.length] ?? 0.5, catalog: CATALOG });
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
    director.update({ ...QUIET_SNAPSHOT, paused: true });
    expect(engine.played[0]?.stopped).toBe(true);
    expect(engine.gains).toEqual({ sfx: 0, ui: 1, music: AUDIO.musicGain * AUDIO.pausedMusic });
    director.test('shot');
    director.playUi('ui.tap');
    expect(engine.played.map((p) => p.options.bus)).toEqual(['sfx', 'ui']);
    director.update(QUIET_SNAPSHOT);
    expect(engine.gains.sfx).toBe(1);
  });

  it('unlocks the engine on the JUGAR tap', () => {
    const { engine, director } = setup();
    director.unlock();
    expect(engine.unlocked).toBe(1);
  });
});

/** The real catalog with every file present, listening to a bus. */
function gameSetup() {
  const engine = new FakeEngine();
  const events = new EventBus();
  let now = 0;
  const director = new AudioDirector(engine, new FakeSettings(), events, { clock: () => now, random: () => 0.5 });
  const defs: Record<string, AudioDef> = {};
  for (const s of SOUNDS) for (const v of s.variants) defs[v] = { file: `audio/sfx/${v}.wav`, duration: 0.2, placeholder: false };
  director.load(defs, 'assets/');
  const keys = (): string[] => engine.played.map((p) => p.key);
  return { engine, events, director, keys, advance: (seconds: number) => (now += seconds) };
}

describe('AudioDirector: weapons and the player (spec 08 §5.1)', () => {
  it('asks each event for its sound', () => {
    const cases: [() => void, string][] = [];
    const { events, keys, advance } = gameSetup();
    cases.push(
      [() => events.emit('weapon:fired', { playerId: 0, weapon: 'pistol', x: 0, y: 0 }), 'weapon_pistol_fire'],
      [() => events.emit('weapon:fired', { playerId: 0, weapon: 'smg', x: 0, y: 0 }), 'weapon_smg_fire'],
      [() => events.emit('weapon:fired', { playerId: 0, weapon: 'shotgun', x: 0, y: 0 }), 'weapon_shotgun_fire'],
      [() => events.emit('weapon:fired', { playerId: 0, weapon: 'katana', x: 0, y: 0 }), 'weapon_katana_swing'],
      [() => events.emit('zombie:hit', { x: 0, y: 0, groundY: 0, dirX: 1, dirY: 0, killed: false, weapon: 'katana' }), 'weapon_katana_hit'],
      [() => events.emit('weapon:overheat', { playerId: 0, weapon: 'laser' }), 'weapon_laser_overheat'],
      [() => events.emit('fire:blast', { x: 0, y: 0 }), 'weapon_flame_blast'],
      [() => events.emit('knife:swing', { playerId: 0, x: 0, y: 0, hit: false }), 'weapon_knife'],
      [() => events.emit('weapon:reload', { playerId: 0, weapon: 'pistol', phase: 'start' }), 'weapon_reload_start'],
      [() => events.emit('weapon:reload', { playerId: 0, weapon: 'pistol', phase: 'end' }), 'weapon_reload_end'],
      [() => events.emit('weapon:empty', { playerId: 0, weapon: 'pistol' }), 'weapon_empty'],
      [() => events.emit('weapon:switched', { playerId: 0, weapon: 'smg' }), 'weapon_switch'],
      [() => events.emit('weapon:broken', { playerId: 0, weapon: 'katana', lost: false }), 'weapon_broken'],
      [() => events.emit('zombie:hit', { x: 0, y: 0, groundY: 0, dirX: 1, dirY: 0, killed: false }), 'impact_flesh'],
      [() => events.emit('player:dash', { playerId: 0, x: 0, y: 0 }), 'player_dash'],
      [() => events.emit('player:damaged', { playerId: 0, hp: 50, maxHp: 100, x: 0, y: 0, fromX: 1, fromY: 0 }), 'player_hurt'],
      [() => events.emit('player:died', { playerId: 0 }), 'player_death'],
    );
    for (const [emit, key] of cases) {
      advance(1);
      const before = keys().length;
      emit();
      expect(keys().slice(before).join(), key).toMatch(new RegExp(`^${key}`));
    }
  });

  it('does not play the local player\'s own sounds for another player', () => {
    const { events, keys } = gameSetup();
    events.emit('weapon:fired', { playerId: 1, weapon: 'pistol', x: 0, y: 0 });
    events.emit('weapon:reload', { playerId: 1, weapon: 'pistol', phase: 'start' });
    events.emit('player:damaged', { playerId: 1, hp: 50, maxHp: 100, x: 0, y: 0, fromX: 1, fromY: 0 });
    events.emit('player:dash', { playerId: 2, x: 0, y: 0 });
    expect(keys()).toEqual([]);
  });

  it('loops the laser while it fires, its pitch rising with the heat, and stops it with the trigger or the pause', () => {
    const { engine, director, keys } = gameSetup();
    director.update({ ...QUIET_SNAPSHOT, continuous: 'laser', heat: 0 });
    expect(keys()).toEqual(['weapon_laser_loop']);
    const loop = engine.played[0];
    expect(loop?.options.loop).toBe(true);
    director.update({ ...QUIET_SNAPSHOT, continuous: 'laser', heat: 1 });
    expect(loop?.rate).toBeCloseTo(AUDIO.laserHotRate);
    expect(keys()).toHaveLength(1);
    director.update({ ...QUIET_SNAPSHOT, continuous: 'laser', heat: 1, paused: true });
    expect(loop?.stopped).toBe(true);
    // Back from the pause, still firing: it starts again.
    director.update({ ...QUIET_SNAPSHOT, continuous: 'laser', heat: 0.5 });
    expect(keys()).toEqual(['weapon_laser_loop', 'weapon_laser_loop']);
    director.update({ ...QUIET_SNAPSHOT, continuous: 'flamethrower' });
    expect(engine.played[1]?.stopped).toBe(true);
    expect(keys().at(-1)).toBe('weapon_flame_loop');
    director.update(QUIET_SNAPSHOT);
    expect(engine.played[2]?.stopped).toBe(true);
  });

  it('in the sound test, a loop starts and stops on the next tap', () => {
    const { engine, director } = gameSetup();
    director.test('weapon.flame.loop');
    director.test('weapon.flame.loop');
    expect(engine.played).toHaveLength(1);
    expect(engine.played[0]?.stopped).toBe(true);
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
