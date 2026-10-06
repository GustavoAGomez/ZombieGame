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
  load(defs: Record<string, AudioDef>): void {
    this.loaded = Object.keys(defs);
  }
  unlock(): void {
    this.unlocked++;
  }
  play(key: string, options: PlayOptions): Voice {
    const entry = { key, options, stopped: false, rate: options.rate };
    this.played.push(entry);
    return { stop: () => (entry.stopped = true), setRate: (r) => (entry.rate = r), place: () => undefined };
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
      [() => events.emit('points:gained', { playerId: 0, amount: 60, reason: 'kill' }), 'reward_kill_2,reward_kill_2_shine'],
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

  it('climbs the kill streak on the shine layer only: a rung per kill, staying on the last, back to the first past its window', () => {
    const { engine, events, advance } = gameSetup();
    const kill = (): void => events.emit('points:gained', { playerId: 0, amount: 60, reason: 'kill' });
    for (let i = 0; i < 10; i++) {
      kill();
      advance(AUDIO.ladder.windows.kill / 2);
    }
    advance(AUDIO.ladder.windows.kill + 0.1);
    kill();
    expect(shineSteps(engine, 'reward_kill')).toEqual([...AUDIO.ladder.steps, 17, 17, 0]);
    // The body never changes its pitch.
    expect(new Set(engine.played.filter((p) => p.key.startsWith('reward_kill') && !p.key.endsWith('_shine')).map((p) => p.options.rate))).toEqual(new Set([1]));
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

  it('SIMULAR RACHA: kills in a row, climbing', () => {
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
    expect(shineSteps(engine, 'reward_kill')).toEqual(AUDIO.ladder.steps.slice(0, AUDIO.streakTest.kills));
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

  it('beats the heart for 5 s when health falls low, and not again until it rises and falls', () => {
    const { engine, director, advance, snapshot } = match();
    const low = { ...snapshot, lowHealth: true };
    director.update(low);
    const beat = engine.played.at(-1);
    expect([beat?.key, beat?.options.loop]).toEqual(['player_heartbeat', true]);
    advance(AUDIO.heartbeatTime - 0.1);
    director.update(low);
    expect(beat?.stopped).toBe(false);
    advance(0.2);
    director.update(low);
    expect(beat?.stopped).toBe(true);
    advance(10);
    director.update(low);
    expect(engine.played.filter((p) => p.key === 'player_heartbeat')).toHaveLength(1);
    director.update(snapshot);
    director.update(low);
    expect(engine.played.filter((p) => p.key === 'player_heartbeat')).toHaveLength(2);
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
