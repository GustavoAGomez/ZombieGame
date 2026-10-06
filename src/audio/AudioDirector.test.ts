import { describe, expect, it } from 'vitest';
import { AUDIO, SOUND_DEFAULTS, SOUNDS, type AudioBus, type SoundDef, type VolumeLevel } from '../config/audio';
import { WEAPONS } from '../config/weapons';
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
  loaded: string[] = [];
  /** The files that wait for prepare() (the music). */
  lazy: string[] = [];
  /** Before the first tap: nothing can play yet. */
  muted = false;
  load(defs: Record<string, AudioDef>, _baseUrl: string, lazy: ReadonlySet<string> = new Set()): void {
    this.loaded = Object.keys(defs);
    this.lazy = [...lazy];
  }
  unlock(): void {
    this.unlocked++;
  }
  play(key: string, options: PlayOptions): Voice | null {
    if (this.muted) return null;
    const entry = { key, options, stopped: false, rate: options.rate };
    this.played.push(entry);
    return { stop: () => (entry.stopped = true), setRate: (r) => (entry.rate = r), place: () => undefined };
  }
  setBusGain(bus: AudioBus, gain: number): void {
    this.gains[bus] = gain;
  }
  /** What prepare() was last asked for, and the low-pass of the music. */
  prepared: string[] = [];
  filter = 20000;
  private readonly running: (() => void)[] = [];
  prepare(keys: readonly string[]): Promise<void> {
    this.prepared = [...keys];
    return Promise.resolve();
  }
  setMusicFilter(frequency: number): void {
    this.filter = frequency;
  }
  whenRunning(listener: () => void): void {
    this.running.push(listener);
  }
  /** The context starts running (an unlock). */
  run(): void {
    for (const l of this.running) l();
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

const base = SOUND_DEFAULTS;
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

describe('AudioDirector: candidates (spec 08 §4.4, §8)', () => {
  const defs: Record<string, AudioDef> = {
    ui_tap: { file: 'audio/sfx/ui_tap.wav', duration: 0.1, placeholder: false, picked: 'A', pending: true },
    ui_tap__a: { file: 'audio/candidates/ui_tap__a.wav', duration: 0.1, placeholder: false, candidate: 'A' },
    ui_tap__b: { file: 'audio/candidates/ui_tap__b.wav', duration: 0.1, placeholder: false, candidate: 'B' },
  };

  it('loads the candidates only with the debug on, and plays the one asked for', () => {
    const { engine, director } = setup();
    director.load(defs, 'assets/');
    expect(engine.loaded).toEqual(['ui_tap']);
    expect(director.candidatesOf('ui.tap')).toEqual([]);
    expect(director.pickOf('ui.tap')).toEqual({ letter: 'A', pending: true });
    director.load(defs, 'assets/', true);
    expect(engine.loaded).toEqual(['ui_tap', 'ui_tap__a', 'ui_tap__b']);
    expect(director.candidatesOf('ui.tap')).toEqual(['A', 'B']);
    director.testCandidate('ui.tap', 'B');
    expect(engine.played.at(-1)?.key).toBe('ui_tap__b');
  });
});

/** The real catalog with every file present, listening to a bus. */
function gameSetup() {
  const engine = new FakeEngine();
  const events = new EventBus();
  let now = 0;
  // What is scheduled (a room's bells after the bolt, the splash after the throw) plays at once.
  const director = new AudioDirector(engine, new FakeSettings(), events, { clock: () => now, random: () => 0.5, schedule: (_, run) => run() });
  const defs: Record<string, AudioDef> = {};
  for (const s of SOUNDS) for (const v of [...s.variants, ...s.shine]) defs[v] = { file: `audio/sfx/${v}.wav`, duration: 0.2, placeholder: false };
  director.load(defs, 'assets/');
  const keys = (): string[] => engine.played.map((p) => p.key);
  return { engine, events, director, keys, advance: (seconds: number) => (now += seconds) };
}

describe('AudioDirector: weapons and the player (spec 08 §6.1)', () => {
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
      // §6.2 to §6.6.
      [() => events.emit('barricade:repaired', { playerId: 0, x: 0, y: 0 }), 'reward_repair,reward_repair_shine'],
      [() => events.emit('pickup:collected', { playerId: 0, kind: 'ammo' }), 'pickup_ammo'],
      [() => events.emit('pickup:collected', { playerId: 0, kind: 'health' }), 'pickup_health'],
      [() => events.emit('item:picked', { playerId: 0, item: 'worn_wand' }), 'pickup_item'],
      [() => events.emit('money:spent', { playerId: 0, amount: 750 }), 'buy_cash'],
      [() => events.emit('door:opened', { doorId: 'D1', playerId: 0, x: 0, y: 0 }), 'buy_door'],
      [() => events.emit('portal:opened', { portalId: 'P1', playerId: 0, x: 0, y: 0 }), 'buy_door'],
      [() => events.emit('zone:unlocked', { zone: 'cocina' }), 'buy_zone'],
      [() => events.emit('weaponCase:purchase', { playerId: 0, weapon: 'smg', ammo: false }), 'buy_weapon'],
      [() => events.emit('weaponCase:purchase', { playerId: 0, weapon: 'smg', ammo: true }), 'pickup_ammo'],
      [() => events.emit('merchant:purchase', { playerId: 0, merchant: 'red', item: 'max_ammo' }), 'buy_merchant_red'],
      [() => events.emit('merchant:purchase', { playerId: 0, merchant: 'red', item: 'upgrade_damage', level: 2 }), 'buy_upgrade,buy_upgrade_shine'],
      [() => events.emit('merchant:purchase', { playerId: 0, merchant: 'gold', item: 'weapon_special' }), 'buy_special'],
      [() => events.emit('boost:activated', { playerId: 0, boost: 'speed' }), 'boost_on'],
      [() => events.emit('action:denied', { playerId: 0 }), 'denied'],
      [() => events.emit('item:cantUse', { playerId: 0, slot: 0 }), 'item_cant_use'],
      [() => events.emit('item:thrown', { playerId: 0, item: 'worn_wand', activation: 'summon_red_merchant', fromX: 0, fromY: 0, toX: 0, toY: 0, time: 0 }), 'item_splash'],
      [() => events.emit('activation:completed', { playerId: 0, activation: 'summon_red_merchant', effect: { kind: 'summon_merchant', merchant: 'red' } }), 'ritual_done'],
      [() => events.emit('merchant:moved', { merchant: 'gold', first: true }), 'merchant_arrive_gold'],
      [() => events.emit('hand:paid', { playerId: 0, blood: false }), 'hand_pay_money'],
      [() => events.emit('hand:paid', { playerId: 0, blood: true }), 'hand_pay_blood'],
      [() => events.emit('hand:rolling', { playerId: 0 }), 'hand_roll'],
      [() => events.emit('hand:offer', { weapon: 'smg', special: false }), 'hand_offer'],
      [() => events.emit('hand:offer', { weapon: 'laser', special: true }), 'hand_offer_special'],
      [() => events.emit('hand:taken', { playerId: 0, weapon: 'smg' }), 'hand_taken'],
      [() => events.emit('hand:refunded', { playerId: 0, blood: false, amount: 950 }), 'hand_refund'],
      [() => events.emit('hand:moved', { zone: 'salon' }), 'hand_moved'],
      [() => events.emit('round:changed', { round: 2, boss: false }), 'jingle_round_start'],
      [() => events.emit('round:changed', { round: 5, boss: true }), 'jingle_round_boss'],
      [() => events.emit('round:cleared', { round: 2 }), 'jingle_round_clear'],
      [() => events.emit('game:over', { round: 3, score: 100 }), 'jingle_gameover'],
      [() => events.emit('shop:state', { merchant: 'blue', rows: [] }), 'ui_shop_open_blue'],
      [() => events.emit('shop:state', { merchant: null, rows: [] }), 'ui_shop_close_blue'],
      // §6.4.
      [() => events.emit('zombie:attack', { x: 0, y: 0 }), 'zombie_attack'],
      [() => events.emit('zombie:crippled', { x: 0, y: 0 }), 'zombie_crawl'],
      [() => events.emit('barricade:plankBroken', { x: 0, y: 0 }), 'barricade_break'],
      [() => events.emit('boss:warning', { x: 0, y: 0 }), 'boss_warning'],
      [() => events.emit('boss:landed', { x: 0, y: 0 }), 'boss_landed'],
      [() => events.emit('boss:roar', { x: 0, y: 0 }), 'boss_roar'],
      [() => events.emit('boss:windup', { x: 0, y: 0, attack: 'charge' }), 'boss_windup_charge'],
      [() => events.emit('boss:windup', { x: 0, y: 0, attack: 'slam' }), 'boss_windup_slam'],
      [() => events.emit('boss:windup', { x: 0, y: 0, attack: 'leap' }), 'boss_windup_leap'],
      [() => events.emit('boss:slam', { x: 0, y: 0 }), 'boss_slam'],
      [() => events.emit('boss:stunned', { x: 0, y: 0 }), 'boss_stunned'],
      [() => events.emit('boss:killed', { x: 0, y: 0, boss: 'butcher', variant: 'base' }), 'boss_killed,jingle_boss_dead'],
    );
    for (const [emit, key] of cases) {
      advance(1);
      const before = keys().length;
      emit();
      expect(keys().slice(before).join(), key).toMatch(new RegExp(`^${key}(_\\d)?$`));
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

  it('SIMULAR COMBATE fires the SMG for a few seconds, with hits', () => {
    const engine = new FakeEngine();
    const runs: { at: number; run: () => void }[] = [];
    const director = new AudioDirector(engine, new FakeSettings(), null, { clock: () => 0, random: () => 0.5, schedule: (at, run) => runs.push({ at, run }) });
    const defs: Record<string, AudioDef> = {};
    for (const s of SOUNDS) for (const v of s.variants) defs[v] = { file: `audio/sfx/${v}.wav`, duration: 0.05, placeholder: false };
    director.load(defs, 'assets/');
    director.simulateCombat();
    expect(runs.at(-1)?.at).toBeLessThan(AUDIO.combatTest.seconds);
    expect(runs).toHaveLength(Math.round(AUDIO.combatTest.seconds * WEAPONS.smg.fireRate));
    for (const r of runs) r.run();
    const keys = engine.played.map((p) => p.key);
    expect(keys.filter((k) => k.startsWith('weapon_smg_fire')).length).toBeGreaterThan(0);
    expect(keys.filter((k) => k.startsWith('impact_flesh')).length).toBeGreaterThan(0);
  });

  it('never goes past the global limit with the SMG among 20 zombies (§9, S4)', () => {
    const engine = new FakeEngine();
    let now = 0;
    const runs: { at: number; run: () => void }[] = [];
    let r = 0;
    const director = new AudioDirector(engine, new FakeSettings(), null, { clock: () => now, random: () => (r = (r * 9301 + 49297) % 233280) / 233280, schedule: (at, run) => runs.push({ at, run }) });
    const defs: Record<string, AudioDef> = {};
    for (const s of SOUNDS) for (const v of [...s.variants, ...s.shine]) defs[v] = { file: `audio/sfx/${v}.wav`, duration: 0.5, placeholder: false };
    director.load(defs, 'assets/');
    director.update({ ...QUIET_SNAPSHOT, x: 500, y: 500, level: 0, zombiesNear: 20, nearestZombieX: 560, nearestZombieY: 500 });
    director.simulateCombat();
    let most = 0;
    for (const run of runs.sort((a, b) => a.at - b.at)) {
      now = run.at;
      run.run();
      director.update({ ...QUIET_SNAPSHOT, x: 500, y: 500, level: 0, zombiesNear: 20, nearestZombieX: 560, nearestZombieY: 500 });
      most = Math.max(most, director.stats().voices);
    }
    expect(most).toBeLessThanOrEqual(AUDIO.maxVoices);
    expect(engine.played.some((p) => p.key.startsWith('zombie_attack'))).toBe(true);
    // The low priority ones (impacts, groans) give way first: the shots go on.
    expect(engine.played.filter((p) => p.key.startsWith('weapon_smg_fire')).length).toBeGreaterThan(20);
  });

  it('in the sound test, a loop starts and stops on the next tap', () => {
    const { engine, director } = gameSetup();
    director.test('weapon.flame.loop');
    director.test('weapon.flame.loop');
    expect(engine.played).toHaveLength(1);
    expect(engine.played[0]?.stopped).toBe(true);
  });
});

describe('AudioDirector: rewards, streaks, the hand and the banners (spec 08 §3.4, §6.2 to §6.6)', () => {
  /** The rate each shine of a streak sound played at, over its body's (any of its variants). */
  const shineSteps = (engine: FakeEngine, body: string): number[] => {
    const out: number[] = [];
    engine.played.forEach((p, i) => {
      const shine = engine.played[i + 1];
      if (p.key.startsWith(body) && !p.key.endsWith('_shine') && shine?.key === `${p.key}_shine`) out.push(Math.round(12 * Math.log2(shine.options.rate / p.options.rate)));
    });
    return out;
  };

  it('plays nothing for a hit or a kill: the impact alone sounds (the user\'s choice)', () => {
    const { events, keys } = gameSetup();
    events.emit('points:gained', { playerId: 0, amount: 10, reason: 'hit' });
    events.emit('points:gained', { playerId: 0, amount: 60, reason: 'kill' });
    expect(keys()).toEqual([]);
  });

  it('climbs the repair streak on the shine layer only: a rung per plank, staying on the last, back to the first past its window', () => {
    const { engine, events, advance } = gameSetup();
    const plank = (): void => events.emit('barricade:repaired', { playerId: 0, x: 0, y: 0 });
    for (let i = 0; i < 10; i++) {
      plank();
      advance(AUDIO.ladder.windows.repair / 2);
    }
    advance(AUDIO.ladder.windows.repair + 0.1);
    plank();
    expect(shineSteps(engine, 'reward_repair')).toEqual([...AUDIO.ladder.steps, 17, 17, 0]);
    // The body never changes its pitch.
    expect(new Set(engine.played.filter((p) => p.key.startsWith('reward_repair') && !p.key.endsWith('_shine')).map((p) => p.options.rate))).toEqual(new Set([1]));
  });

  it('climbs the repair streak with each plank, and the upgrade one by the level bought', () => {
    const { engine, events, advance } = gameSetup();
    for (let i = 0; i < 3; i++) {
      events.emit('barricade:repaired', { playerId: 0, x: 0, y: 0 });
      advance(1);
    }
    for (const level of [1, 3, 2]) {
      events.emit('merchant:purchase', { playerId: 0, merchant: 'red', item: 'upgrade_ammo', level });
      advance(1);
    }
    expect(shineSteps(engine, 'reward_repair')).toEqual([0, 3, 5]);
    expect(shineSteps(engine, 'buy_upgrade')).toEqual([0, 5, 3]);
  });

  it('gives each wizard his own signature, and opens and closes a shop only once', () => {
    const { events, keys, advance } = gameSetup();
    for (const merchant of ['blue', 'red', 'gold'] as const) {
      advance(1);
      events.emit('merchant:purchase', { playerId: 0, merchant, item: 'max_ammo' });
    }
    events.emit('shop:state', { merchant: 'gold', rows: [] });
    events.emit('shop:state', { merchant: 'gold', rows: [] });
    advance(1);
    events.emit('shop:state', { merchant: null, rows: [] });
    expect(keys()).toEqual(['buy_merchant_blue', 'buy_merchant_red', 'buy_merchant_gold', 'ui_shop_open_gold', 'ui_shop_close_gold']);
  });

  it('keeps what a player earns, spends or is refused to that player', () => {
    const { events, keys } = gameSetup();
    events.emit('points:gained', { playerId: 1, amount: 60, reason: 'kill' });
    events.emit('money:spent', { playerId: 1, amount: 750 });
    events.emit('action:denied', { playerId: 1 });
    events.emit('merchant:purchase', { playerId: 1, merchant: 'blue', item: 'max_ammo' });
    events.emit('barricade:repaired', { playerId: 2, x: 0, y: 0 });
    expect(keys()).toEqual([]);
    // A door, though, is heard by everyone.
    events.emit('door:opened', { doorId: 'D1', playerId: 1, x: 0, y: 0 });
    expect(keys()).toEqual(['buy_door']);
  });

  it('stops the hand\'s draw as soon as it opens', () => {
    const { engine, events } = gameSetup();
    events.emit('hand:rolling', { playerId: 0 });
    events.emit('hand:offer', { weapon: 'smg', special: false });
    expect(engine.played.map((p) => [p.key, p.stopped])).toEqual([
      ['hand_roll', true],
      ['hand_offer', false],
    ]);
  });

  it('SIMULAR RACHA: planks in a row, climbing', () => {
    const engine = new FakeEngine();
    let now = 0;
    const runs: { at: number; run: () => void }[] = [];
    const director = new AudioDirector(engine, new FakeSettings(), null, { clock: () => now, random: () => 0.5, schedule: (at, run) => runs.push({ at, run }) });
    const defs: Record<string, AudioDef> = {};
    for (const s of SOUNDS) for (const v of [...s.variants, ...s.shine]) defs[v] = { file: `audio/sfx/${v}.wav`, duration: 0.05, placeholder: false };
    director.load(defs, 'assets/');
    director.simulateStreak();
    for (const r of runs) {
      now = r.at;
      r.run();
    }
    expect(shineSteps(engine, 'reward_repair')).toEqual(AUDIO.ladder.steps.slice(0, AUDIO.streakTest.planks));
  });
});

describe('AudioDirector: place, levels, threats and low health (spec 08 §3.5, §6.4)', () => {
  /** A match: the local player at (1000, 1000) on level 0, the map's level 1 east of x 3000. */
  function match() {
    const g = gameSetup();
    g.director.setLevels((x) => (x > 3000 ? 1 : 0));
    const snapshot = { ...QUIET_SNAPSHOT, x: 1000, y: 1000, level: 0 };
    g.director.update(snapshot);
    return { ...g, snapshot };
  }

  it('places a positional sound: full near, down to a quarter far, panned by its side', () => {
    const { engine, events, advance } = match();
    const { near, far, minGain, maxPan } = AUDIO.position;
    const hitAt = (x: number) => {
      advance(1);
      events.emit('zombie:hit', { x, y: 1000, groundY: 1000, dirX: 1, dirY: 0, killed: false });
      return engine.played.at(-1)?.options;
    };
    const volume = SOUNDS.find((s) => s.id === 'impact.flesh')?.volume ?? 0;
    expect(hitAt(1000 + near / 2)).toMatchObject({ gain: volume, pan: (near / 2 / far) * maxPan });
    expect(hitAt(1000 - (near + far) / 2)?.gain).toBeCloseTo(volume * (1 + minGain) / 2);
    expect(hitAt(1000 - far * 2)).toMatchObject({ gain: volume * minGain, pan: -maxPan });
  });

  it('does not sound what happens on another level, except the boss\'s warnings', () => {
    const { events, keys, advance } = match();
    events.emit('zombie:hit', { x: 3500, y: 1000, groundY: 1000, dirX: 1, dirY: 0, killed: false });
    events.emit('boss:slam', { x: 3500, y: 1000 });
    events.emit('door:opened', { doorId: 'D9', playerId: 1, x: 3500, y: 1000 });
    expect(keys()).toEqual([]);
    advance(1);
    events.emit('boss:warning', { x: 3500, y: 1000 });
    events.emit('boss:windup', { x: 3500, y: 1000, attack: 'leap' });
    expect(keys()).toEqual(['boss_warning', 'boss_windup_leap']);
  });

  it('groans for the nearest zombie every 2 to 5 s, never two at once', () => {
    const { director, keys, advance, snapshot } = match();
    const near = { ...snapshot, zombiesNear: 6, nearestZombieX: 1100, nearestZombieY: 1000 };
    let last = -Infinity;
    const gaps: number[] = [];
    for (let t = 0; t < 30; t += 0.1) {
      const before = keys().length;
      director.update(near);
      if (keys().length > before) {
        gaps.push(t - last);
        last = t;
      }
      advance(0.1);
    }
    expect(keys().every((k) => k.startsWith('zombie_groan'))).toBe(true);
    for (const gap of gaps.slice(1)) {
      expect(gap).toBeGreaterThanOrEqual(AUDIO.groanInterval[0] - 0.11);
      expect(gap).toBeLessThanOrEqual(AUDIO.groanInterval[1] + 0.11);
    }
  });

  it('beats the heart while health is low, without stopping, until the player heals (the user\'s choice)', () => {
    const { engine, director, advance, snapshot } = match();
    const low = { ...snapshot, lowHealth: true };
    director.update(low);
    const beat = engine.played.at(-1);
    expect([beat?.key, beat?.options.loop]).toEqual(['player_heartbeat', true]);
    advance(60);
    director.update(low);
    expect(beat?.stopped).toBe(false);
    expect(engine.played.filter((p) => p.key === 'player_heartbeat')).toHaveLength(1);
    // Healed: it stops; low again: it beats again.
    director.update(snapshot);
    expect(beat?.stopped).toBe(true);
    director.update(low);
    expect(engine.played.filter((p) => p.key === 'player_heartbeat')).toHaveLength(2);
    // The pause cuts it, and it comes back with the match if health is still low.
    director.update({ ...low, paused: true });
    expect(engine.played.at(-1)?.stopped).toBe(true);
    director.update(low);
    expect(engine.played.filter((p) => p.key === 'player_heartbeat')).toHaveLength(3);
  });

  it('gallops while the boss charges and rings dizzy while it is stunned, on its level', () => {
    const { engine, director, keys, snapshot } = match();
    director.update({ ...snapshot, bossCharging: true, bossX: 1200, bossY: 1000 });
    director.update({ ...snapshot, bossStunned: true, bossX: 1300, bossY: 1000 });
    director.update(snapshot);
    expect(keys()).toEqual(['boss_charge_loop', 'boss_dizzy_loop']);
    expect(engine.played.map((p) => p.stopped)).toEqual([true, true]);
    director.update({ ...snapshot, bossCharging: true, bossX: 3500, bossY: 1000 });
    expect(keys()).toHaveLength(2);
  });
});

describe('AudioDirector: the sound test (spec 08 §8, §4.4)', () => {
  /** The game's files and, as the debug build loads them, every candidate's. */
  function withCandidates() {
    const g = gameSetup();
    const defs: Record<string, AudioDef> = {};
    for (const s of SOUNDS) {
      for (const v of [...s.variants, ...s.shine]) {
        defs[v] = { file: `audio/sfx/${v}.wav`, duration: 0.2, placeholder: false, picked: 'A', pending: true };
        for (const letter of ['A', 'B', 'C'] as const) defs[`${v}__${letter.toLowerCase()}`] = { file: `audio/candidates/${v}__${letter.toLowerCase()}.wav`, duration: 0.2, placeholder: false, candidate: letter };
      }
    }
    g.director.load(defs, 'assets/', true);
    return g;
  }

  it('silences the match while it is open: only what is tested sounds, the music bus open for the tracks tested', () => {
    const { engine, events, director, keys, advance } = gameSetup();
    director.update({ ...QUIET_SNAPSHOT, continuous: 'laser' });
    director.setTesting(true);
    expect(engine.played[0]?.stopped).toBe(true);
    expect(engine.gains.music).toBe(AUDIO.musicGain);
    advance(1);
    events.emit('weapon:fired', { playerId: 0, weapon: 'pistol', x: 0, y: 0 });
    events.emit('zombie:hit', { x: 0, y: 0, groundY: 0, dirX: 1, dirY: 0, killed: false });
    director.update({ ...QUIET_SNAPSHOT, continuous: 'laser', lowHealth: true, level: 0, zombiesNear: 3 });
    director.playUi('ui.tap');
    expect(keys()).toEqual(['weapon_laser_loop']);
    director.test('weapon.shotgun.fire');
    expect(keys().at(-1)).toBe('weapon_shotgun_fire');
    // Closed: the match sounds again, its laser too.
    director.setTesting(false);
    director.update({ ...QUIET_SNAPSHOT, continuous: 'laser' });
    advance(1);
    events.emit('weapon:fired', { playerId: 0, weapon: 'pistol', x: 0, y: 0 });
    expect(keys().slice(-2)).toEqual(['weapon_laser_loop', 'weapon_pistol_fire_2']);
    expect(engine.gains.music).toBe(AUDIO.musicGain);
  });

  it('plays a candidate on trial in the match instead of the sound\'s own, until it is cleared', () => {
    const { events, director, keys, advance } = withCandidates();
    director.setTrial('weapon.shotgun.fire', 'C');
    expect(director.pickOf('weapon.shotgun.fire')).toEqual({ letter: 'C', pending: true });
    expect(director.trials()).toEqual({ 'weapon.shotgun.fire': 'C' });
    events.emit('weapon:fired', { playerId: 0, weapon: 'shotgun', x: 0, y: 0 });
    director.setTrial('weapon.shotgun.fire', null);
    advance(1);
    events.emit('weapon:fired', { playerId: 0, weapon: 'shotgun', x: 0, y: 0 });
    expect(keys()).toEqual(['weapon_shotgun_fire__c', 'weapon_shotgun_fire']);
    expect(director.pickOf('weapon.shotgun.fire')).toEqual({ letter: 'A', pending: true });
  });
});

describe('AudioDirector: the music (spec 08 §7)', () => {
  /** Lets a prepare() resolve and what waits for it run. */
  const flush = (): Promise<void> => new Promise((done) => setTimeout(done, 0));

  /** The game's files and every candidate's, the music's with its measured loop; the tracks of `without` have no file. */
  function musicSetup(without: string[] = []) {
    const g = gameSetup();
    const defs: Record<string, AudioDef> = {};
    for (const s of SOUNDS) {
      for (const v of [...s.variants, ...s.shine]) {
        if (s.bus !== 'music') {
          defs[v] = { file: `audio/sfx/${v}.wav`, duration: 0.2, placeholder: false };
          continue;
        }
        const track = { duration: 40.5, placeholder: without.includes(s.id), loopStart: 0.25, loopEnd: 40.25 };
        defs[v] = { ...track, file: `audio/music/${v}.m4a`, picked: 'A', pending: true };
        for (const letter of ['A', 'B', 'C'] as const) defs[`${v}__${letter.toLowerCase()}`] = { ...track, file: `audio/candidates/${v}__${letter.toLowerCase()}.m4a`, candidate: letter };
      }
    }
    g.director.load(defs, 'assets/', true);
    const music = () => g.engine.played.filter((p) => p.options.bus === 'music');
    const now = (): string[] => music().filter((p) => !p.stopped).map((p) => p.key);
    return { ...g, music, now };
  }

  it('decodes a track only when its state comes, and loops it between its measured points', async () => {
    const { engine, director, music } = musicSetup();
    expect(engine.lazy).toEqual(expect.arrayContaining(['music_title', 'music_calm', 'music_round', 'music_boss', 'music_round__b']));
    expect(engine.lazy).not.toContain('weapon_pistol_fire');
    director.update({ ...QUIET_SNAPSHOT, music: 'title' });
    expect(engine.prepared).toEqual(['music_title']);
    await flush();
    director.update({ ...QUIET_SNAPSHOT, music: 'title' });
    await flush();
    expect(music()).toHaveLength(1);
    expect(music()[0]?.key).toBe('music_title');
    expect(music()[0]?.options).toMatchObject({ loop: true, loopStart: 0.25, loopEnd: 40.25, fadeIn: AUDIO.music.crossfade });
  });

  it('crossfades into the next state\'s track, with at most two tracks in memory', async () => {
    const { engine, director, music, now } = musicSetup();
    director.update({ ...QUIET_SNAPSHOT, music: 'calm' });
    await flush();
    director.update({ ...QUIET_SNAPSHOT, music: 'round' });
    expect(engine.prepared).toEqual(['music_calm', 'music_round']);
    expect(now()).toEqual(['music_calm']);
    await flush();
    expect(now()).toEqual(['music_round']);
    expect(music().at(-1)?.options.fadeIn).toBe(AUDIO.music.crossfade);
    // The old one leaves memory once it has faded.
    expect(engine.prepared).toEqual(['music_round']);
    director.update({ ...QUIET_SNAPSHOT, music: 'boss' });
    await flush();
    expect(now()).toEqual(['music_boss']);
  });

  it('keeps one track for the rest and the round when only one has a file, and is silence without any', async () => {
    const { director, music, now } = musicSetup(['music.round', 'music.boss']);
    director.update({ ...QUIET_SNAPSHOT, music: 'round' });
    await flush();
    director.update({ ...QUIET_SNAPSHOT, music: 'calm' });
    await flush();
    expect(music().map((p) => p.key)).toEqual(['music_calm']);
    expect(now()).toEqual(['music_calm']);
    // The boss has no file: silence, and the game goes on.
    director.update({ ...QUIET_SNAPSHOT, music: 'boss' });
    await flush();
    expect(now()).toEqual([]);
  });

  it('fades out at the end of the match', async () => {
    const { director, music, now } = musicSetup();
    director.update({ ...QUIET_SNAPSHOT, music: 'round' });
    await flush();
    director.update({ ...QUIET_SNAPSHOT, music: 'over' });
    await flush();
    expect(now()).toEqual([]);
    expect(music()).toHaveLength(1);
  });

  it('starts the track asked for once the sound can play (the first tap)', async () => {
    const { engine, director, now } = musicSetup();
    engine.muted = true;
    director.update({ ...QUIET_SNAPSHOT, music: 'title' });
    await flush();
    expect(now()).toEqual([]);
    engine.muted = false;
    engine.run();
    await flush();
    expect(now()).toEqual(['music_title']);
  });

  it('ducks under a big sound until it ends, and is muffled while health is low', () => {
    const { engine, director, advance } = musicSetup();
    director.update({ ...QUIET_SNAPSHOT, music: 'round' });
    director.test('jingle.round.start');
    expect(engine.gains.music).toBeCloseTo(AUDIO.musicGain * 10 ** (AUDIO.music.duckDb / 20));
    advance(0.1);
    director.update({ ...QUIET_SNAPSHOT, music: 'round' });
    expect(engine.gains.music).toBeLessThan(AUDIO.musicGain);
    advance(0.2);
    director.update({ ...QUIET_SNAPSHOT, music: 'round' });
    expect(engine.gains.music).toBe(AUDIO.musicGain);
    director.update({ ...QUIET_SNAPSHOT, music: 'round', lowHealth: true });
    expect(engine.filter).toBe(AUDIO.music.lowHealthCutoff);
    director.update({ ...QUIET_SNAPSHOT, music: 'round' });
    expect(engine.filter).toBe(AUDIO.music.openCutoff);
  });

  it('in the sound test, stops the match\'s track and plays one at a time, a candidate or on trial', async () => {
    const { director, now } = musicSetup();
    director.update({ ...QUIET_SNAPSHOT, music: 'round' });
    await flush();
    director.setTesting(true);
    expect(now()).toEqual([]);
    director.test('music.boss');
    await flush();
    expect(now()).toEqual(['music_boss']);
    director.testCandidate('music.calm', 'C');
    await flush();
    expect(now()).toEqual(['music_calm__c']);
    director.testCandidate('music.calm', 'C');
    expect(now()).toEqual([]);
    // Closed, with round B on trial: the match's music comes back with it.
    director.setTrial('music.round', 'B');
    director.setTesting(false);
    director.update({ ...QUIET_SNAPSHOT, music: 'round' });
    await flush();
    expect(now()).toEqual(['music_round__b']);
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

describe('AudioDirector: the dungeon (spec 09 §11)', () => {
  it('asks each of the dungeon\'s events for its sound, the upgrade in its rarity\'s signature', () => {
    // The fake random (0.5) picks the second of two variants.
    const { events, keys, advance } = gameSetup();
    const at = { x: 0, y: 0 };
    const cases: [() => void, string][] = [
      [() => events.emit('dungeon:floor', { floor: 1, ambient: 'mansion', width: 1, height: 1, rooms: [], start: 0 }), 'jingle_floor'],
      [() => events.emit('dungeon:roomLocked', { room: 1 }), 'dungeon_door_shut'],
      [() => events.emit('dungeon:spawnWarning', { room: 1, points: [at], seconds: 0.8 }), 'dungeon_spawn_warning'],
      [() => events.emit('dungeon:roomCleared', { room: 1, counter: 1 }), 'dungeon_door_open,dungeon_room_clear'],
      [() => events.emit('enemy:spitWindup', at), 'enemy_spitter_windup'],
      [() => events.emit('enemy:spit', at), 'enemy_spitter_spit_2'],
      [() => events.emit('enemy:spitHit', { ...at, player: true }), 'enemy_spitter_hit_2'],
      [() => events.emit('enemy:fuse', at), 'enemy_exploder_fuse'],
      [() => events.emit('enemy:exploded', { ...at, radius: 60 }), 'enemy_exploder_burst'],
      [() => events.emit('enemy:bruteStep', at), 'enemy_brute_step_2'],
      [() => events.emit('zombie:attack', { ...at, kind: 'brute' }), 'enemy_brute_attack'],
      [() => events.emit('zombie:attack', { ...at, kind: 'walker' }), 'zombie_attack_2'],
      [() => events.emit('pickup:collected', { playerId: 0, kind: 'key' }), 'pickup_key'],
      [() => events.emit('pickup:collected', { playerId: 0, kind: 'boss_key' }), 'pickup_key'],
      [() => events.emit('dungeon:doorUnlocked', { kind: 'key', ...at }), 'dungeon_unlock'],
      [() => events.emit('dungeon:chestOpened', { kind: 'open', ...at }), 'dungeon_chest_2'],
      [() => events.emit('dungeon:upgrade', { playerId: 0, id: 'vitality', rarity: 'common', free: false }), 'dungeon_upgrade_common'],
      [() => events.emit('dungeon:upgrade', { playerId: 0, id: 'piercing', rarity: 'rare', free: false }), 'dungeon_upgrade_rare'],
      [() => events.emit('dungeon:upgrade', { playerId: 0, id: 'ward', rarity: 'legendary', free: true }), 'dungeon_upgrade_legendary'],
      [() => events.emit('dungeon:upgrade', { playerId: 1, id: 'ward', rarity: 'legendary', free: true }), ''],
      [() => events.emit('dungeon:reroll', { price: 50 }), 'dungeon_reroll'],
      [() => events.emit('dungeon:pact', { playerId: 0, upgrade: 'ward', curse: 'frail' }), 'dungeon_pact,dungeon_curse'],
      [() => events.emit('dungeon:ward', at), 'dungeon_ward'],
      [() => events.emit('dungeon:leech', { heal: 5 }), 'pickup_health'],
      [() => events.emit('dungeon:trapdoor', { ...at, won: false }), 'dungeon_trapdoor'],
    ];
    for (const [emit, expected] of cases) {
      const before = keys().length;
      advance(1);
      emit();
      expect(keys().slice(before).join(',')).toBe(expected);
    }
  });
});
