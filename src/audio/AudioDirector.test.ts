import { describe, expect, it } from 'vitest';
import { AUDIO, SOUNDS, type AudioBus, type SoundDef, type VolumeLevel } from '../config/audio';
import { BOSS, HAND, ITEMS } from '../config/balance';
import { EventBus } from '../core/EventBus';
import type { AudioDef } from '../game/assets/manifest';
import { AudioDirector, QUIET_SNAPSHOT, type AudioSettings } from './AudioDirector';
import type { AudioOutput, PlayOptions, Voice } from './AudioEngine';
import { WebAudioEngine } from './AudioEngine';

/** An engine that records what it is asked to play. */
class FakeEngine implements AudioOutput {
  readonly played: { key: string; options: PlayOptions; stopped: boolean; rate: number; ramp?: [number, number]; gain: number; pan: number }[] = [];
  readonly gains: Partial<Record<AudioBus, number>> = {};
  unlocked = 0;
  readonly state = 'running';
  load(): void {}
  unlock(): void {
    this.unlocked++;
  }
  play(key: string, options: PlayOptions): Voice {
    const entry: FakeEngine['played'][number] = { key, options, stopped: false, rate: options.rate, gain: options.gain, pan: options.pan };
    this.played.push(entry);
    return {
      stop: () => (entry.stopped = true),
      setRate: (r) => (entry.rate = r),
      rampRate: (r, s) => (entry.ramp = [r, s]),
      setGain: (g) => (entry.gain = g),
      setPan: (p) => (entry.pan = p),
    };
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
  const scheduled: [() => void, number][] = [];
  const director = new AudioDirector(engine, new FakeSettings(), events, {
    clock: () => now,
    random: () => 0.5,
    schedule: (run, seconds) => scheduled.push([run, seconds]),
  });
  const defs: Record<string, AudioDef> = {};
  for (const s of SOUNDS) for (const v of s.variants) defs[v] = { file: `audio/sfx/${v}.wav`, duration: 0.2, placeholder: false };
  director.load(defs, 'assets/');
  const keys = (): string[] => engine.played.map((p) => p.key);
  return { engine, events, director, keys, scheduled, advance: (seconds: number) => (now += seconds) };
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

  it('does not play the local player\'s own sounds for another player; their shots sound where they are', () => {
    const { engine, events, keys, director } = gameSetup();
    director.update({ ...QUIET_SNAPSHOT, level: 0, listenerX: 0, listenerY: 0 });
    events.emit('weapon:reload', { playerId: 1, weapon: 'pistol', phase: 'start' });
    events.emit('player:damaged', { playerId: 1, hp: 50, maxHp: 100, x: 0, y: 0, fromX: 1, fromY: 0 });
    events.emit('player:dash', { playerId: 2, x: 0, y: 0 });
    expect(keys()).toEqual([]);
    events.emit('weapon:fired', { playerId: 1, weapon: 'pistol', x: -480, y: 0 });
    expect(keys()).toHaveLength(1);
    expect(engine.played[0]?.options.pan).toBeCloseTo(-AUDIO.positional.maxPan);
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

describe('AudioDirector: rewards, the hand, banners and menus (spec 08 §5.2–5.6)', () => {
  it('asks each event for its sound', () => {
    const { events, keys, advance } = gameSetup();
    const cases: [() => void, string][] = [
      [() => events.emit('points:gained', { playerId: 0, amount: 10, reason: 'hit' }), 'reward_hit'],
      [() => events.emit('points:gained', { playerId: 0, amount: 60, reason: 'kill' }), 'reward_kill'],
      [() => events.emit('barricade:repaired', { playerId: 0, x: 0, y: 0 }), 'reward_repair'],
      [() => events.emit('pickup:collected', { playerId: 0, kind: 'ammo' }), 'pickup_ammo'],
      [() => events.emit('pickup:collected', { playerId: 0, kind: 'health' }), 'pickup_health'],
      [() => events.emit('item:picked', { playerId: 0, item: 'worn_wand' }), 'pickup_item'],
      [() => events.emit('money:spent', { playerId: 0, amount: 750, source: 'shop' }), 'buy_cash'],
      [() => events.emit('door:opened', { doorId: 'd1', playerId: 0, x: 0, y: 0 }), 'buy_door'],
      [() => events.emit('portal:opened', { portalId: 'p1', playerId: 0, x: 0, y: 0 }), 'buy_door'],
      [() => events.emit('zone:unlocked', { zone: 'cocina' }), 'buy_zone'],
      [() => events.emit('weaponCase:purchase', { playerId: 0, weapon: 'smg', ammo: false }), 'buy_weapon'],
      [() => events.emit('merchant:purchase', { playerId: 0, merchant: 'blue', item: 'max_ammo' }), 'buy_merchant'],
      [() => events.emit('merchant:purchase', { playerId: 0, merchant: 'red', item: 'upgrade_damage', level: 2 }), 'buy_upgrade'],
      [() => events.emit('merchant:purchase', { playerId: 0, merchant: 'gold', item: 'weapon_special' }), 'buy_special'],
      [() => events.emit('boost:activated', { playerId: 0, boost: 'speed' }), 'boost_on'],
      [() => events.emit('action:denied', { playerId: 0 }), 'denied'],
      [() => events.emit('item:cantUse', { playerId: 0, slot: 0 }), 'denied'],
      [() => events.emit('item:thrown', { playerId: 0, item: 'worn_wand', activation: 'summon_red_merchant', fromX: 0, fromY: 0, toX: 0, toY: 0, time: 0 }), 'item_splash'],
      [() => events.emit('activation:completed', { playerId: 0, activation: 'summon_red_merchant', effect: { kind: 'summon_merchant', merchant: 'red' } }), 'ritual_done'],
      [() => events.emit('merchant:moved', { merchant: 'blue', first: true }), 'merchant_arrive'],
      [() => events.emit('hand:paid', { playerId: 0, blood: false, mock: true }), 'hand_pay_money'],
      [() => events.emit('hand:paid', { playerId: 0, blood: true, mock: true }), 'hand_pay_blood'],
      [() => events.emit('hand:offer', { weapon: 'smg', special: false }), 'hand_offer'],
      [() => events.emit('hand:offer', { weapon: 'laser', special: true }), 'hand_offer_special'],
      [() => events.emit('hand:taken', { playerId: 0, weapon: 'smg' }), 'hand_taken'],
      [() => events.emit('hand:refunded', { playerId: 0, blood: false, amount: 950 }), 'hand_refund'],
      [() => events.emit('hand:moved', { zone: 'cocina' }), 'hand_moved'],
      [() => events.emit('round:changed', { round: 2, boss: false }), 'jingle_round_start'],
      [() => events.emit('round:changed', { round: 5, boss: true }), 'jingle_round_boss'],
      [() => events.emit('round:cleared', { round: 2 }), 'jingle_round_clear'],
      [() => events.emit('boss:killed', { x: 0, y: 0, boss: 'butcher', variant: 'base' }), 'jingle_boss_dead'],
      [() => events.emit('game:over', { round: 3, score: 100 }), 'jingle_gameover'],
    ];
    for (const [emit, key] of cases) {
      advance(1);
      const before = keys().length;
      emit();
      expect(keys().slice(before).join(), key).toMatch(new RegExp(`^${key}`));
    }
  });

  it('starts the draw\'s ticks after the fist rises, the fanfare after the bolt and the splash where the item lands', () => {
    const { engine, events } = gameSetup();
    events.emit('hand:paid', { playerId: 0, blood: false, mock: false });
    events.emit('zone:unlocked', { zone: 'cocina' });
    events.emit('item:thrown', { playerId: 0, item: 'worn_wand', activation: 'summon_red_merchant', fromX: 0, fromY: 0, toX: 0, toY: 0, time: 0 });
    const delays = Object.fromEntries(engine.played.map((p) => [p.key, p.options.delay ?? 0]));
    expect(delays).toMatchObject({ hand_pay_money: 0, hand_roll: HAND.risingTime, buy_zone: AUDIO.zoneFanfareDelay, item_splash: ITEMS.throwTime });
  });

  it('leaves the till to the shops and cases: the hand has its own coins', () => {
    const { events, keys } = gameSetup();
    events.emit('money:spent', { playerId: 0, amount: 950, source: 'hand' });
    events.emit('money:spent', { playerId: 1, amount: 750, source: 'shop' });
    expect(keys()).toEqual([]);
  });

  it('sounds the shop panel only when it opens and when it closes', () => {
    const { events, keys } = gameSetup();
    const open = { merchant: 'blue' as const, rows: [] };
    events.emit('shop:state', open);
    events.emit('shop:state', open);
    events.emit('shop:state', { merchant: null, rows: [] });
    expect(keys()).toEqual(['ui_shop_open', 'ui_shop_close']);
  });
});

describe('AudioDirector: streaks (spec 08 §3.3)', () => {
  const semitones = (rate: number): number => Math.round(12 * Math.log2(rate));

  it('raises a kill a step per kill in a row, stays on the last step and starts again after its window', () => {
    const { engine, events, advance } = gameSetup();
    const kill = (): void => events.emit('points:gained', { playerId: 0, amount: 60, reason: 'kill' });
    for (let i = 0; i < 10; i++) {
      kill();
      advance(0.5);
    }
    expect(engine.played.map((p) => semitones(p.rate))).toEqual([0, 3, 5, 7, 10, 12, 15, 17, 17, 17]);
    advance(AUDIO.ladderWindows.kill + 0.1);
    kill();
    expect(semitones(engine.played.at(-1)?.rate ?? 0)).toBe(0);
  });

  it('keeps the repair streak for 2 s, and climbs the upgrade one by the level bought', () => {
    const { engine, events, advance } = gameSetup();
    events.emit('barricade:repaired', { playerId: 0, x: 0, y: 0 });
    advance(1.9);
    events.emit('barricade:repaired', { playerId: 0, x: 0, y: 0 });
    expect(semitones(engine.played.at(-1)?.rate ?? 0)).toBe(3);
    for (const level of [1, 2, 3]) {
      advance(1);
      events.emit('merchant:purchase', { playerId: 0, merchant: 'red', item: 'upgrade_ammo', level });
    }
    expect(engine.played.slice(-3).map((p) => semitones(p.rate))).toEqual([0, 3, 5]);
  });

  it('SIMULAR RACHA schedules 8 kills a quarter of a second apart', () => {
    const { director, scheduled, keys } = gameSetup();
    director.simulateStreak();
    expect(scheduled.map(([, s]) => s)).toEqual([0, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75]);
    scheduled[0]?.[0]();
    expect(keys()).toEqual(['reward_kill']);
  });
});

describe('AudioDirector: threats, position and levels (spec 08 §3.4, §5.4)', () => {
  /** The ear at (0, 0) on level 0; the map's levels: x ≥ 2000 is the basement (level 1). */
  function placed() {
    const g = gameSetup();
    g.director.setWorld((x) => (x >= 2000 ? 1 : 0));
    const at = (patch: Partial<typeof QUIET_SNAPSHOT> = {}) => g.director.update({ ...QUIET_SNAPSHOT, level: 0, ...patch });
    at();
    return { ...g, at };
  }
  const flesh = SOUNDS.find((s) => s.id === 'impact.flesh')?.volume ?? 0;
  const hit = (x: number, y: number) => ({ x, y, groundY: y, dirX: 1, dirY: 0, killed: false });

  it('plays a positional sound at full volume up close, quieter in a straight line to 25 % at 480 px, panned by side', () => {
    const { engine, events, advance } = placed();
    for (const x of [100, 320, 1000, -320]) {
      advance(1);
      events.emit('zombie:hit', hit(x, 0));
    }
    const [near, mid, far, left] = engine.played;
    expect(near?.options.gain).toBeCloseTo(flesh);
    expect(mid?.options.gain).toBeCloseTo(flesh * (1 - 0.75 * 0.5));
    expect(far?.options.gain).toBeCloseTo(flesh * AUDIO.positional.farGain);
    expect(mid?.options.pan).toBeCloseTo((320 / 480) * AUDIO.positional.maxPan);
    expect(left?.options.pan).toBeCloseTo(-(mid?.options.pan ?? 0));
  });

  it('is silent for what happens on another level, except the boss\'s warning', () => {
    const { events, keys } = placed();
    events.emit('zombie:hit', hit(2500, 0));
    events.emit('boss:landed', { x: 2500, y: 0 });
    expect(keys()).toEqual([]);
    events.emit('boss:warning', { x: 2500, y: 0 });
    expect(keys()).toEqual(['boss_warning']);
  });

  it('groans one zombie at a time, every 2 to 5 s, only with zombies near, where the nearest is', () => {
    const { engine, at, advance, keys } = placed();
    at({ zombiesNear: 0 });
    advance(10);
    at({ zombiesNear: 0 });
    expect(keys()).toEqual([]);
    const groans: number[] = [];
    for (let t = 0; t < 20; t += 0.1) {
      advance(0.1);
      const before = keys().length;
      at({ zombiesNear: 6, zombieX: 200, zombieY: 0 });
      if (keys().length > before) groans.push(t);
    }
    const gaps = groans.slice(1).map((t, i) => t - (groans[i] ?? 0));
    expect(groans.length).toBeGreaterThanOrEqual(4);
    for (const gap of gaps) expect(gap).toBeGreaterThanOrEqual(AUDIO.groanEvery[0] - 0.01);
    expect(engine.played.every((p) => p.key.startsWith('zombie_groan') && p.options.pan > 0)).toBe(true);
  });

  it('beats the heart for 5 s when health falls low, and not again until it rises and falls again', () => {
    const { engine, at, advance, keys } = placed();
    at({ lowHealth: true });
    expect(keys()).toEqual(['player_heartbeat']);
    advance(AUDIO.heartbeatSeconds + 0.1);
    at({ lowHealth: true });
    expect(engine.played[0]?.stopped).toBe(true);
    advance(10);
    at({ lowHealth: true });
    expect(keys()).toHaveLength(1);
    at({ lowHealth: false });
    at({ lowHealth: true });
    expect(keys()).toEqual(['player_heartbeat', 'player_heartbeat']);
  });

  it('whistles the boss\'s fall for the 3 s of its warning, falling an octave', () => {
    const { engine, events, at, advance } = placed();
    events.emit('boss:warning', { x: 100, y: 0 });
    expect(engine.played[0]?.ramp).toEqual([AUDIO.warningEndRate, BOSS.warningTime]);
    advance(BOSS.warningTime + 0.05);
    at();
    expect(engine.played[0]?.stopped).toBe(true);
  });

  it('tells the three windups apart, and loops the charge and the dizziness following the boss', () => {
    const { engine, events, at, keys, advance } = placed();
    for (const attack of ['charge', 'slam', 'leap'] as const) {
      advance(1);
      events.emit('boss:windup', { attack, x: 0, y: 0 });
    }
    expect(keys()).toEqual(['boss_windup_charge', 'boss_windup_slam', 'boss_windup_leap']);
    at({ bossCharging: true, bossX: 100, bossY: 0 });
    at({ bossCharging: true, bossX: 400, bossY: 0 });
    const charge = engine.played[3];
    expect(charge?.key).toBe('boss_charge_loop');
    expect(charge?.pan).toBeCloseTo((400 / 480) * AUDIO.positional.maxPan);
    at({ bossStunned: true, bossX: 400, bossY: 0 });
    expect(charge?.stopped).toBe(true);
    expect(keys().at(-1)).toBe('boss_stunned_loop');
    at();
    expect(engine.played.at(-1)?.stopped).toBe(true);
  });

  it('does not clip with 20 zombies and the SMG: never more than 12 voices, the limits dropping the rest', () => {
    const { director, events, advance } = placed();
    let most = 0;
    for (let frame = 0; frame < 120; frame++) {
      advance(1 / 60);
      if (frame % 5 === 0) events.emit('weapon:fired', { playerId: 0, weapon: 'smg', x: 0, y: 0 });
      // 20 zombies: hits, blows wound up, groans, a plank torn now and then.
      if (frame % 5 === 0) for (let z = 0; z < 3; z++) events.emit('zombie:hit', hit(50 + z * 10, 0));
      if (frame % 7 === 0) events.emit('zombie:attack', { x: 40, y: 0 });
      if (frame % 30 === 0) events.emit('barricade:plankBroken', { x: 200, y: 0 });
      if (frame % 6 === 0) events.emit('points:gained', { playerId: 0, amount: 10, reason: 'hit' });
      director.update({ ...QUIET_SNAPSHOT, level: 0, zombiesNear: 20, zombieX: 40, zombieY: 0 });
      most = Math.max(most, director.stats().voices);
    }
    expect(most).toBeLessThanOrEqual(AUDIO.maxVoices);
    expect(director.stats().dropped).toBeGreaterThan(0);
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
