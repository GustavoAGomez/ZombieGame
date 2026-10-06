import { AUDIO, MERCHANT_VARIANT, SOUNDS, WEAPON_FIRE_SOUND, type AudioPriority, type LadderId, type MusicState, type SoundDef, type VolumeLevel } from '../config/audio';
import { ITEMS } from '../config/balance';
import type { MerchantId } from '../config/merchants';
import { WEAPONS } from '../config/weapons';
import type { EventBus } from '../core/EventBus';
import type { AudioCandidate, AudioDef } from '../game/assets/manifest';
import type { AudioOutput, Voice } from './AudioEngine';

/** A weapon that sounds for as long as it fires (spec 08 §6.1): a loop. */
export type ContinuousWeapon = 'laser' | 'flamethrower';

/** What the game tells the director every frame (spec 08 §1.3); it grows phase by phase. */
export interface AudioSnapshot {
  /** The match is paused: the effects and loops stop and the music drops (§2). */
  paused: boolean;
  /** The local player's beam or jet firing now, or null. */
  continuous: ContinuousWeapon | null;
  /** The laser's heat, 0..1 (1: about to overheat): its hum rises with it. */
  heat: number;
  /** The local player, where everything is heard from (§3.5): position and level (−1: no match, nothing is placed). */
  x: number;
  y: number;
  level: number;
  /** Health under PLAYER.lowHpThreshold: the heartbeat (§3.5). */
  lowHealth: boolean;
  /** Zombies within AUDIO.groanRange, and where the nearest one is: the groans (§6.4). */
  zombiesNear: number;
  nearestZombieX: number;
  nearestZombieY: number;
  /** A boss charging or stunned, and where: its gallop and its confused groan (§6.4). */
  bossCharging: boolean;
  bossStunned: boolean;
  bossX: number;
  bossY: number;
  /** What the music plays (§7); null: none. */
  music: MusicState | null;
}

/** No match: nothing fires, nothing is paused, nobody listens from anywhere. */
export const QUIET_SNAPSHOT: Readonly<AudioSnapshot> = {
  paused: false,
  continuous: null,
  heat: 0,
  x: 0,
  y: 0,
  level: -1,
  lowHealth: false,
  zombiesNear: 0,
  nearestZombieX: 0,
  nearestZombieY: 0,
  bossCharging: false,
  bossStunned: false,
  bossX: 0,
  bossY: 0,
  music: null,
};

/** A world point. */
interface Place {
  x: number;
  y: number;
}

/** The volume settings the director follows (the device preferences, src/native/preferences.ts). */
export interface AudioSettings {
  readonly sfx: VolumeLevel;
  readonly music: VolumeLevel;
  onChange(listener: () => void): () => void;
}

/** What the rest of the game sees of the audio. */
export interface GameAudio {
  /** At boot (BootScene): every file of the manifest is decoded before the first shot. */
  load(defs: Readonly<Record<string, AudioDef>>, baseUrl: string, withCandidates?: boolean): void;
  /** Inside the JUGAR tap: lets the sound out (§2). */
  unlock(): void;
  /** A menu or HUD sound (§5.6): DOM components get only this function (it keeps its `this`). */
  readonly playUi: (id: string) => void;
  update(snapshot: Readonly<AudioSnapshot>): void;
  /** The map's level at a point (−1: none, a door, outside): what happens on another level is not heard (§3.5). */
  setLevels(levelAt: ((x: number, y: number) => number) | null): void;
}

/** What the sound test panel shows (spec 08 §8). */
export interface AudioStats {
  /** Effect and menu voices playing now. */
  voices: number;
  /** Plays dropped by a limit since the start, and the last one. */
  dropped: number;
  lastDropped: string;
  /** The audio context's state, to see at a glance if it is muted. */
  state: string;
}

/** The debug panel's view of the director: every sound, played as in the game. */
export interface SoundTest {
  readonly sounds: readonly SoundDef[];
  /** Plays a sound as the game would; a loop starts, and stops on the next test of it. */
  test(id: string): void;
  /** The candidates of a sound with files (spec 08 §4.4), A to C; empty once one was chosen. */
  candidatesOf(id: string): AudioCandidate[];
  /** The candidate the game plays, and whether it is still to be chosen; null without candidates. */
  pickOf(id: string): { letter: AudioCandidate; pending: boolean } | null;
  /** Plays candidate `letter` of a sound, as the game would play it. */
  testCandidate(id: string, letter: AudioCandidate): void;
  /**
   * The sound test is open: the match makes no sound at all (its effects,
   * loops and music), only what is tested plays, so the two never mix.
   */
  setTesting(on: boolean): void;
  /** «Probar en partida»: the game plays candidate `letter` of a sound from now on (null: its own again). Debug only. */
  setTrial(id: string, letter: AudioCandidate | null): void;
  /** The candidates on trial, by sound id. */
  trials(): Readonly<Record<string, AudioCandidate>>;
  /** SIMULAR COMBATE: the SMG firing with hits, among a crowd of zombies, for a few seconds, to hear the mix. */
  simulateCombat(): void;
  /** SIMULAR RACHA: planks repaired in a row, to hear the streak climb. */
  simulateStreak(): void;
  stats(): AudioStats;
}

interface ActiveVoice {
  id: string;
  bus: SoundDef['bus'];
  priority: AudioPriority;
  startedAt: number;
  /** Infinity for a loop. */
  endsAt: number;
  voice: Voice;
  /** Its gain before its place (the catalog's volume). */
  gain: number;
  /** The file it plays. */
  key: string;
}

interface PlayRequest {
  /** The files to pick from (a candidate's), instead of the catalog's, and their shine layers. */
  keys?: readonly string[];
  shine?: readonly string[];
  /** Playback rate before the pitch variation (the laser's heat). */
  rate?: number;
  /** The variant the event names (a `keyed` sound: whose wizard), instead of one at random. */
  variant?: number;
  /** A streak's rung (§3.4): its shine layer plays this many steps up the ladder. */
  rung?: number;
  /** Where it happens: another level silences it, and a positional sound is placed (§3.5). */
  at?: Place;
  /** Played by the sound test: it sounds while the test silences the match. */
  test?: boolean;
  /** Seconds to rise from silence (a music track's crossfade); a loop's own otherwise. */
  fadeIn?: number;
}

/** A candidate's files: its variants and, for a streak sound, their shine layers. */
interface CandidateFiles {
  keys: string[];
  shine: string[];
}

const RANK: Readonly<Record<AudioPriority, number>> = { low: 0, normal: 1, high: 2 };

/** The loop of each continuous weapon. */
const CONTINUOUS_LOOP: Readonly<Record<ContinuousWeapon, string>> = { laser: 'weapon.laser.loop', flamethrower: 'weapon.flame.loop' };

export interface DirectorOptions {
  /** Seconds, monotonic. */
  clock?: () => number;
  /** 0..1, for the variants and the pitch: the audio is presentation, it never touches the game's RNG. */
  random?: () => number;
  catalog?: readonly SoundDef[];
  /** Runs `run` in `seconds` (the sound test's simulations); setTimeout by default. */
  schedule?: (seconds: number, run: () => void) => void;
}

/**
 * Decides what sounds, how high and how loud (spec 08 §1): the catalog's
 * variants, pitch and limits, the buses' volume from the settings and the
 * pause, and the loops of the weapons that fire continuously. It never
 * imports Phaser nor reads the game state: it hears the events and a small
 * snapshot per frame, like HapticFeedback.
 */
export class AudioDirector implements GameAudio, SoundTest {
  readonly sounds: readonly SoundDef[];
  private readonly byId: Map<string, SoundDef>;
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly schedule: (seconds: number, run: () => void) => void;
  private readonly voices: ActiveVoice[] = [];
  /** The loops playing, by sound id. */
  private readonly loops = new Map<string, ActiveVoice>();
  private readonly lastPlay = new Map<string, number>();
  private readonly lastVariant = new Map<string, number>();
  private durations: Readonly<Record<string, number>> = {};
  /** Each sound's candidates' files (debug only) and the candidate its game files come from. */
  private candidates = new Map<string, Map<AudioCandidate, CandidateFiles>>();
  private picks = new Map<string, { letter: AudioCandidate; pending: boolean }>();
  private paused = false;
  /** The continuous weapon whose loop is playing. */
  private firing: ContinuousWeapon | null = null;
  /** Each streak's rung and when it last climbed (§3.4). */
  private readonly ladders = new Map<LadderId, { rung: number; at: number }>();
  /** The sound test's upgrade level, 1 to 3 in turn. */
  private testLevel = 0;
  /** Whose shop the local player has open (its closing sounds with that wizard's signature). */
  private shop: MerchantId | null = null;
  /** The hand's draw, stopped as soon as it opens. */
  private handRoll: ActiveVoice | null = null;
  /** Where the local player listens from, and the map's levels (§3.5). */
  private listener: { x: number; y: number; level: number } = { x: 0, y: 0, level: -1 };
  private levelAt: ((x: number, y: number) => number) | null = null;
  /** When the next groan may come (§6.4), seconds on the clock. */
  private nextGroan = 0;
  /** The sound test is open: only its own plays sound. */
  private testing = false;
  /** «Probar en partida»: the candidate the game plays instead of its own, by sound id. */
  private readonly trialPicks = new Map<string, AudioCandidate>();
  /** Each looping file's measured loop (the music, §7). */
  private loopPoints = new Map<string, { start: number; end: number }>();
  /** The music (§7): the state asked for, the track's sound id and voice, and a token that outdates a pending change. */
  private musicState: MusicState | null = null;
  private musicId: string | null = null;
  private music: ActiveVoice | null = null;
  private musicToken = 0;
  /** The music ducks under a `duck` sound until then (§3.5); and it is muffled by low health. */
  private ducked = false;
  private duckUntil = 0;
  private muffled = false;
  private dropped = 0;
  private lastDropped = '';

  constructor(
    private readonly engine: AudioOutput,
    private readonly settings: AudioSettings,
    events: EventBus | null,
    options: DirectorOptions = {},
  ) {
    this.sounds = options.catalog ?? SOUNDS;
    this.byId = new Map(this.sounds.map((s) => [s.id, s]));
    this.clock = options.clock ?? (() => performance.now() / 1000);
    this.random = options.random ?? Math.random;
    this.schedule = options.schedule ?? ((seconds, run) => void setTimeout(run, seconds * 1000));
    settings.onChange(() => this.applyLevels());
    this.applyLevels();
    // A track asked for before the sound could play (the title, before any tap) starts once it can.
    engine.whenRunning(() => this.resumeMusic());
    if (events) this.listen(events);
  }

  load(defs: Readonly<Record<string, AudioDef>>, baseUrl: string, withCandidates = false): void {
    // The candidates are only for the sound test: the game alone loads only the chosen files (§8).
    const loaded = Object.fromEntries(Object.entries(defs).filter(([, def]) => withCandidates || !def.candidate));
    const durations: Record<string, number> = {};
    for (const [key, def] of Object.entries(loaded)) if (!def.placeholder) durations[key] = def.duration;
    this.durations = durations;
    this.loopPoints = new Map();
    for (const [key, def] of Object.entries(loaded)) if (def.loopStart !== undefined && def.loopEnd !== undefined) this.loopPoints.set(key, { start: def.loopStart, end: def.loopEnd });
    // The music (and its candidates) decodes only when its state comes: at most two tracks in memory (§7).
    const lazy = new Set<string>();
    for (const sound of this.sounds) {
      if (sound.bus !== 'music') continue;
      for (const v of sound.variants) for (const key of [v, `${v}__a`, `${v}__b`, `${v}__c`]) if (loaded[key]) lazy.add(key);
    }
    this.candidates = new Map();
    this.picks = new Map();
    for (const sound of this.sounds) {
      const first = defs[sound.variants[0] ?? ''];
      if (first?.picked) this.picks.set(sound.id, { letter: first.picked, pending: first.pending === true });
      if (!withCandidates) continue;
      const byLetter = new Map<AudioCandidate, CandidateFiles>();
      for (const letter of ['A', 'B', 'C'] as const) {
        const of = (list: readonly string[]): string[] => list.map((v) => `${v}__${letter.toLowerCase()}`).filter((k) => loaded[k]?.candidate === letter);
        const keys = of(sound.variants);
        if (keys.length > 0) byLetter.set(letter, { keys, shine: of(sound.shine) });
      }
      if (byLetter.size > 0) this.candidates.set(sound.id, byLetter);
    }
    this.engine.load(loaded, baseUrl, lazy);
  }

  candidatesOf(id: string): AudioCandidate[] {
    return [...(this.candidates.get(id)?.keys() ?? [])];
  }

  pickOf(id: string): { letter: AudioCandidate; pending: boolean } | null {
    const pick = this.picks.get(id);
    const trial = this.trialPicks.get(id);
    // On trial, that is the one the game plays now.
    return trial && this.candidates.get(id)?.has(trial) ? { letter: trial, pending: pick?.pending ?? true } : (pick ?? null);
  }

  testCandidate(id: string, letter: AudioCandidate): void {
    const files = this.candidates.get(id)?.get(letter);
    if (files) this.test(id, { keys: files.keys, shine: files.shine });
  }

  setTesting(on: boolean): void {
    if (on === this.testing) return;
    this.testing = on;
    // Whatever was playing stops at once: the match's sounds, loops and music going in, what was tested coming out.
    this.stopBus('sfx');
    this.stopBus('ui');
    this.stopBus('music');
    this.firing = null;
    this.switchMusic(null, AUDIO.voiceFade);
    // The match's music comes back with its state's next update.
    this.musicState = null;
    this.applyLevels();
  }

  setTrial(id: string, letter: AudioCandidate | null): void {
    if (letter) this.trialPicks.set(id, letter);
    else this.trialPicks.delete(id);
  }

  trials(): Readonly<Record<string, AudioCandidate>> {
    return Object.fromEntries(this.trialPicks);
  }

  unlock(): void {
    this.engine.unlock();
  }

  readonly playUi = (id: string): void => {
    this.play(id);
  };

  setLevels(levelAt: ((x: number, y: number) => number) | null): void {
    this.levelAt = levelAt;
  }

  update(snapshot: Readonly<AudioSnapshot>): void {
    this.listener = { x: snapshot.x, y: snapshot.y, level: snapshot.level };
    if (!this.testing) this.setMusic(snapshot.music);
    // The music ducks while a `duck` sound plays, and comes back slowly (§3.5).
    if (this.ducked && this.clock() >= this.duckUntil) {
      this.ducked = false;
      this.applyLevels(AUDIO.music.duckOut);
    }
    // Low health muffles it (§3.5).
    if (snapshot.lowHealth !== this.muffled) {
      this.muffled = snapshot.lowHealth;
      this.engine.setMusicFilter(this.muffled ? AUDIO.music.lowHealthCutoff : AUDIO.music.openCutoff, AUDIO.music.filterFade);
    }
    if (snapshot.paused !== this.paused) {
      this.paused = snapshot.paused;
      if (this.paused) this.stopBus('sfx');
      this.applyLevels();
    }
    // A beam or a jet sounds while it fires: its loop starts and stops with it (and with the pause and the sound test).
    const firing = this.paused || this.testing ? null : snapshot.continuous;
    if (firing !== this.firing) {
      if (this.firing) this.stopLoop(CONTINUOUS_LOOP[this.firing], AUDIO.loopFadeOut);
      if (firing) this.startLoop(CONTINUOUS_LOOP[firing], { rate: this.heatRate(firing, snapshot.heat) });
      this.firing = firing;
    } else if (firing) {
      this.loops.get(CONTINUOUS_LOOP[firing])?.voice.setRate(this.heatRate(firing, snapshot.heat));
    }
    this.updateThreats(snapshot);
  }

  /**
   * The continuous threats (§6.4) and low health (§3.5): a groan of the
   * nearest zombie every 2 to 5 s, the boss's gallop and confused groan
   * following it, and the heartbeat while health is low.
   */
  private updateThreats(s: Readonly<AudioSnapshot>): void {
    const now = this.clock();
    const quiet = this.paused || this.testing;
    if (!quiet && s.zombiesNear > 0 && now >= this.nextGroan) {
      this.play('zombie.groan', { at: { x: s.nearestZombieX, y: s.nearestZombieY } });
      const [min, max] = AUDIO.groanInterval;
      this.nextGroan = now + min + this.random() * (max - min);
    }
    const boss = { x: s.bossX, y: s.bossY };
    this.follow('boss.charge.loop', !quiet && s.bossCharging, boss);
    this.follow('boss.dizzy.loop', !quiet && s.bossStunned, boss);
    // The heartbeat for as long as health is low, until the player heals (the user's choice over §3.5's 5 s).
    const beating = !quiet && s.lowHealth;
    if (beating && !this.loops.has('player.heartbeat')) this.startLoop('player.heartbeat', {});
    else if (!beating && this.loops.has('player.heartbeat')) this.stopLoop('player.heartbeat', AUDIO.loopFadeOut);
  }

  /** A loop that sounds while `on`, where `at` is (on its level only), moving with it. */
  private follow(id: string, on: boolean, at: Place): void {
    const v = this.loops.get(id);
    if (!on || !this.sameLevel(id, at)) {
      if (v) this.stopLoop(id, AUDIO.loopFadeOut);
      return;
    }
    if (!v) this.startLoop(id, { at });
    else v.voice.place(v.gain * this.distanceGain(at), this.panOf(at));
  }

  /** Whether `at` is on the local player's level (or the sound is heard on every one). Unknown levels count as the same. */
  private sameLevel(id: string, at: Place): boolean {
    if (AUDIO.anyLevel.includes(id)) return true;
    const level = this.levelAt?.(at.x, at.y) ?? -1;
    return level < 0 || this.listener.level < 0 || level === this.listener.level;
  }

  /** Full within `near`, down in a line to `minGain` at `far` (§3.5); full while nobody listens. */
  private distanceGain(at: Place): number {
    if (this.listener.level < 0) return 1;
    const { near, far, minGain } = AUDIO.position;
    const d = Math.hypot(at.x - this.listener.x, at.y - this.listener.y);
    if (d <= near) return 1;
    if (d >= far) return minGain;
    return 1 - ((d - near) / (far - near)) * (1 - minGain);
  }

  /** Left or right by its side of the listener, at most `maxPan` (§3.5). */
  private panOf(at: Place): number {
    if (this.listener.level < 0) return 0;
    const { far, maxPan } = AUDIO.position;
    return Math.max(-1, Math.min(1, (at.x - this.listener.x) / far)) * maxPan;
  }

  /** Plays a sound as the game would: a loop (and a music track) starts or stops, and a streak climbs (the upgrade one by levels 1, 2, 3 in turn). */
  test(id: string, asked: PlayRequest = {}): void {
    const def = this.byId.get(id);
    const request = { ...asked, test: true };
    if (def?.bus === 'music') this.testMusic(id, request);
    else if (def?.loop) this.toggleLoop(id, request);
    else if (def?.ladder === 'upgrade') this.play(id, { ...request, rung: this.climb('upgrade', (this.testLevel++ % 3) + 1) });
    else if (def?.ladder) this.play(id, { ...request, rung: this.climb(def.ladder) });
    else this.play(id, request);
  }

  simulateStreak(): void {
    const { planks, interval } = AUDIO.streakTest;
    for (let i = 0; i < planks; i++) this.schedule(i * interval, () => this.test('reward.repair'));
  }

  simulateCombat(): void {
    const { seconds, hitsIn10, attackEvery, groanEvery, crowdRadius } = AUDIO.combatTest;
    const shots = Math.round(seconds * WEAPONS.smg.fireRate);
    // Somewhere in the crowd around the player (in the middle, out of a match).
    const around = (): Place => {
      const angle = this.random() * 2 * Math.PI;
      const r = crowdRadius * (0.3 + 0.7 * this.random());
      return { x: this.listener.x + Math.cos(angle) * r, y: this.listener.y + Math.sin(angle) * r };
    };
    for (let i = 0; i < shots; i++) {
      this.schedule(i / WEAPONS.smg.fireRate, () => {
        this.play('weapon.smg.fire', { test: true });
        if (i % attackEvery === 0) this.play('zombie.attack', { at: around(), test: true });
        if (i % groanEvery === 0) this.play('zombie.groan', { at: around(), test: true });
        if (i % 10 >= hitsIn10) return;
        this.play('impact.flesh', { at: around(), test: true });
      });
    }
  }

  stats(): AudioStats {
    this.prune(this.clock());
    return { voices: this.voices.filter((v) => v.bus !== 'music').length, dropped: this.dropped, lastDropped: this.lastDropped, state: this.engine.state };
  }

  /**
   * The music's state (§7): a new state's track comes in over the old one's
   * with a crossfade, once decoded; `calm` and `round` keep playing the
   * same track when they share it; `over` fades it out.
   */
  private setMusic(state: MusicState | null): void {
    if (state === this.musicState) return;
    this.musicState = state;
    const id = state === null || state === 'over' ? null : this.trackFor(state);
    if (id !== null && id === this.musicId && this.music) return;
    this.switchMusic(id, state === 'over' ? AUDIO.music.overFade : AUDIO.music.crossfade);
  }

  /** The track of a state: its own, or for `calm` and `round` the other one's when only it has a file (§7). */
  private trackFor(state: Exclude<MusicState, 'over'>): string | null {
    const own = `music.${state}`;
    if (this.hasMusic(own)) return own;
    const shared = state === 'calm' ? 'music.round' : state === 'round' ? 'music.calm' : null;
    return shared && this.hasMusic(shared) ? shared : null;
  }

  private hasMusic(id: string): boolean {
    const key = this.musicFiles(id)[0];
    return key !== undefined && this.durations[key] !== undefined;
  }

  /** A track's files: the candidate on trial, or its own. */
  private musicFiles(id: string): readonly string[] {
    const letter = this.trialPicks.get(id);
    const trial = letter ? this.candidates.get(id)?.get(letter) : undefined;
    return trial?.keys ?? this.byId.get(id)?.variants ?? [];
  }

  /** From the current track to `id` (null: silence) over `fade` s; at most the two of them in memory. */
  private switchMusic(id: string | null, fade: number): void {
    const token = ++this.musicToken;
    const old = this.music;
    this.music = null;
    this.musicId = id;
    if (id === null) {
      this.stopVoice(old, fade);
      this.schedule(fade, () => token === this.musicToken && void this.engine.prepare([]));
      return;
    }
    const keys = this.musicFiles(id);
    const key = keys[0] ?? '';
    void this.engine.prepare(old ? [old.key, key] : [key]).then(() => {
      // Another change came while it decoded: this one is outdated.
      if (token !== this.musicToken) return;
      this.music = this.play(id, { keys, fadeIn: fade });
      this.stopVoice(old, fade);
      // The old track leaves memory once it is silent.
      this.schedule(fade, () => token === this.musicToken && void this.engine.prepare([key]));
    });
  }

  /** The sound can play now (unlocked, back from the background): the track asked for starts if it could not. */
  private resumeMusic(): void {
    if (this.musicId !== null && !this.music && !this.testing) this.switchMusic(this.musicId, AUDIO.music.crossfade);
  }

  /** The sound test: a track (or a candidate of it) starts, once decoded, and the next tap stops it. */
  private testMusic(id: string, request: PlayRequest): void {
    if (this.loops.has(id)) {
      this.stopLoop(id, AUDIO.voiceFade);
      return;
    }
    // One track at a time: the one tested before stops.
    this.stopBus('music');
    const keys = request.keys ?? this.musicFiles(id);
    void this.engine.prepare(keys.slice(0, 1)).then(() => this.testing && this.startLoop(id, { ...request, keys, fadeIn: AUDIO.voiceFade }));
  }

  /** The events of spec 08 §6.1: the local player's own sounds, and the hits anyone makes. */
  private listen(events: EventBus): void {
    const mine = (playerId: number, id: string): void => {
      if (playerId === AUDIO.localPlayerId) this.play(id);
    };
    events.on('weapon:fired', (e) => {
      const id = WEAPON_FIRE_SOUND[e.weapon];
      if (id) mine(e.playerId, id);
    });
    events.on('knife:swing', (e) => mine(e.playerId, 'weapon.knife'));
    events.on('weapon:reload', (e) => mine(e.playerId, e.phase === 'start' ? 'weapon.reload.start' : 'weapon.reload.end'));
    events.on('weapon:empty', (e) => mine(e.playerId, 'weapon.empty'));
    events.on('weapon:switched', (e) => mine(e.playerId, 'weapon.switch'));
    events.on('weapon:overheat', (e) => mine(e.playerId, 'weapon.laser.overheat'));
    events.on('weapon:broken', (e) => mine(e.playerId, 'weapon.broken'));
    events.on('player:dash', (e) => mine(e.playerId, 'player.dash'));
    events.on('player:damaged', (e) => mine(e.playerId, 'player.hurt'));
    events.on('player:died', (e) => mine(e.playerId, 'player.death'));
    events.on('zombie:hit', (e) => this.play(e.weapon === 'katana' ? 'weapon.katana.hit' : 'impact.flesh', { at: e }));
    events.on('fire:blast', (e) => this.play('weapon.flame.blast', { at: e }));
    this.listenThreats(events);
    this.listenRewards(events, mine);
  }

  /** The events of §6.4, each where it happens. */
  private listenThreats(events: EventBus): void {
    events.on('zombie:attack', (e) => this.play('zombie.attack', { at: e }));
    events.on('zombie:crippled', (e) => this.play('zombie.crawl', { at: e }));
    events.on('barricade:plankBroken', (e) => this.play('barricade.break', { at: e }));
    events.on('boss:warning', (e) => this.play('boss.warning', { at: e }));
    events.on('boss:landed', (e) => this.play('boss.landed', { at: e }));
    events.on('boss:roar', (e) => this.play('boss.roar', { at: e }));
    events.on('boss:windup', (e) => this.play(`boss.windup.${e.attack}`, { at: e }));
    events.on('boss:slam', (e) => this.play('boss.slam', { at: e }));
    events.on('boss:stunned', (e) => this.play('boss.stunned', { at: e }));
    events.on('boss:killed', (e) => this.play('boss.killed', { at: e }));
  }

  /**
   * The events of §6.2, §6.3, §6.5 and §6.6. What a player earns, spends or
   * is refused is theirs alone; doors, rooms, wizards, the hand and the
   * banners are heard by everyone. Money always sounds with `buy.cash` (the
   * money signature, on `money:spent`), and each purchase adds its own.
   */
  private listenRewards(events: EventBus, mine: (playerId: number, id: string) => void): void {
    const local = (playerId: number): boolean => playerId === AUDIO.localPlayerId;
    events.on('barricade:repaired', (e) => {
      if (local(e.playerId)) this.play('reward.repair', { rung: this.climb('repair') });
    });
    events.on('pickup:collected', (e) => mine(e.playerId, e.kind === 'ammo' ? 'pickup.ammo' : 'pickup.health'));
    events.on('item:picked', (e) => mine(e.playerId, 'pickup.item'));
    events.on('money:spent', (e) => mine(e.playerId, 'buy.cash'));
    events.on('door:opened', (e) => this.play('buy.door', { at: e }));
    events.on('portal:opened', (e) => this.play('buy.door', { at: e }));
    events.on('zone:unlocked', () => this.schedule(AUDIO.zoneDelay, () => this.play('buy.zone')));
    // At a case, ammo sounds like picking ammo up; a weapon, like the case's own.
    events.on('weaponCase:purchase', (e) => mine(e.playerId, e.ammo ? 'pickup.ammo' : 'buy.weapon'));
    events.on('merchant:purchase', (e) => {
      if (!local(e.playerId)) return;
      if (e.item === 'weapon_special') this.play('buy.special');
      else if (e.level !== undefined) this.play('buy.upgrade', { rung: this.climb('upgrade', e.level) });
      else this.play('buy.merchant', { variant: MERCHANT_VARIANT[e.merchant] });
    });
    events.on('boost:activated', (e) => mine(e.playerId, 'boost.on'));
    events.on('action:denied', (e) => mine(e.playerId, 'denied'));
    events.on('item:cantUse', (e) => mine(e.playerId, 'item.cantUse'));
    // The splash when it lands, a moment after the throw.
    events.on('item:thrown', (e) => this.schedule(ITEMS.throwTime, () => this.play('item.splash', { at: { x: e.toX, y: e.toY } })));
    events.on('activation:completed', () => this.play('ritual.done'));
    events.on('merchant:moved', (e) => {
      if (e.first) this.play('merchant.arrive', { variant: MERCHANT_VARIANT[e.merchant] });
    });
    events.on('hand:paid', (e) => this.play(e.blood ? 'hand.pay.blood' : 'hand.pay.money'));
    events.on('hand:rolling', () => (this.handRoll = this.play('hand.roll')));
    events.on('hand:offer', (e) => {
      this.stopVoice(this.handRoll, AUDIO.voiceFade);
      this.handRoll = null;
      this.play(e.special ? 'hand.offer.special' : 'hand.offer');
    });
    events.on('hand:taken', () => this.play('hand.taken'));
    events.on('hand:refunded', () => this.play('hand.refund'));
    events.on('hand:moved', () => this.play('hand.moved'));
    events.on('round:changed', (e) => this.play(e.boss ? 'jingle.round.boss' : 'jingle.round.start'));
    events.on('round:cleared', () => this.play('jingle.round.clear'));
    events.on('boss:killed', () => this.schedule(AUDIO.bossDeadJingleDelay, () => this.play('jingle.boss.dead')));
    events.on('game:over', () => this.schedule(AUDIO.gameOverJingleDelay, () => this.play('jingle.gameover')));
    events.on('shop:state', (e) => {
      if (e.merchant === this.shop) return;
      // The wizard opens or closes his coat (§6.6): only when the panel opens or closes, not when its rows change.
      if (e.merchant) this.play('ui.shop.open', { variant: MERCHANT_VARIANT[e.merchant] });
      else if (this.shop) this.play('ui.shop.close', { variant: MERCHANT_VARIANT[this.shop] });
      this.shop = e.merchant;
    });
  }

  /**
   * The rung a streak plays on now (§3.4): one up per repetition within its
   * window (staying on the last), back to the first past it. The upgrade
   * streak goes by the level bought: level 1 on the first rung.
   */
  private climb(ladder: LadderId, level = 1): number {
    const top = AUDIO.ladder.steps.length - 1;
    if (ladder === 'upgrade') return Math.min(top, Math.max(0, level - 1));
    const now = this.clock();
    const last = this.ladders.get(ladder);
    const rung = last && now - last.at <= AUDIO.ladder.windows[ladder] ? Math.min(top, last.rung + 1) : 0;
    this.ladders.set(ladder, { rung, at: now });
    return rung;
  }

  /** The laser's hum rises with its heat (§6.1); anything else plays as recorded. */
  private heatRate(weapon: ContinuousWeapon, heat: number): number {
    return weapon === 'laser' ? 1 + (AUDIO.laserHotRate - 1) * Math.min(1, Math.max(0, heat)) : 1;
  }

  private startLoop(id: string, request: PlayRequest): void {
    if (this.loops.has(id)) return;
    const voice = this.play(id, request);
    if (voice) this.loops.set(id, voice);
  }

  private stopLoop(id: string, fade: number): void {
    const v = this.loops.get(id);
    if (!v) return;
    v.voice.stop(fade);
    this.loops.delete(id);
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  /** The sound test: a loop starts, and the next tap stops it. */
  private toggleLoop(id: string, request: PlayRequest): void {
    if (this.loops.has(id)) this.stopLoop(id, AUDIO.loopFadeOut);
    else this.startLoop(id, request);
  }

  /**
   * Plays a sound of the catalog: a variant at random (not the last one),
   * its pitch varied, within its own limits and the global one. Null when
   * it does not sound (dropped, paused, or no file: silence).
   */
  private play(id: string, request: PlayRequest = {}): ActiveVoice | null {
    const def = this.byId.get(id);
    if (!def) return null;
    // In pause the effects are silent, except what the open sound test plays.
    if (this.paused && def.bus === 'sfx' && !(this.testing && request.test)) return null;
    // While the sound test is open, the match is silent: only what is tested sounds.
    if (this.testing && !request.test) return null;
    // On another level it does not sound at all (§3.5): not a drop.
    if (request.at && !this.sameLevel(id, request.at)) return null;
    const now = this.clock();
    this.prune(now);
    const last = this.lastPlay.get(id);
    if (last !== undefined && now - last < def.minInterval) return this.drop(id);
    if (this.voices.filter((v) => v.id === id).length >= def.maxVoices) return this.drop(id);
    if (def.bus !== 'music' && !this.makeRoom(def.priority)) return this.drop(id);
    // «Probar en partida»: a candidate on trial plays instead of the sound's own files.
    const trialLetter = request.keys ? undefined : this.trialPicks.get(id);
    const onTrial = trialLetter ? this.candidates.get(id)?.get(trialLetter) : undefined;
    const keys = request.keys ?? onTrial?.keys ?? def.variants;
    const index = request.variant !== undefined && def.keyed ? Math.min(request.variant, keys.length - 1) : this.pickVariant(def, keys.length);
    const key = keys[index];
    const duration = key === undefined ? undefined : this.durations[key];
    if (key === undefined || duration === undefined) return null;
    const rate = (request.rate ?? 1) * (1 + (this.random() * 2 - 1) * (def.pitchVar / 100));
    const at = def.positional ? request.at : undefined;
    const gain = at ? def.volume * this.distanceGain(at) : def.volume;
    const pan = at ? this.panOf(at) : 0;
    const loopPoints = def.loop ? this.loopPoints.get(key) : undefined;
    const fadeIn = request.fadeIn ?? (def.loop ? AUDIO.loopFadeIn : undefined);
    const options = {
      bus: def.bus,
      gain,
      rate,
      pan,
      loop: def.loop,
      positional: def.positional,
      ...(fadeIn !== undefined ? { fadeIn } : {}),
      ...(loopPoints ? { loopStart: loopPoints.start, loopEnd: loopPoints.end } : {}),
    };
    const body = this.engine.play(key, options);
    this.lastPlay.set(id, now);
    if (!body) return null;
    let voice: Voice = body;
    let ends = duration / rate;
    // A streak's shine layer, with it: only its pitch climbs the ladder (§3.4).
    const shineKey = (request.shine ?? onTrial?.shine ?? def.shine)[index];
    const shineDuration = shineKey === undefined ? undefined : this.durations[shineKey];
    if (shineKey !== undefined && shineDuration !== undefined) {
      const shineRate = rate * 2 ** ((AUDIO.ladder.steps[request.rung ?? 0] ?? 0) / 12);
      const shine = this.engine.play(shineKey, { ...options, rate: shineRate });
      if (shine) {
        voice = { stop: (fade) => (body.stop(fade), shine.stop(fade)), setRate: (r) => body.setRate(r), place: (g, p) => (body.place(g, p), shine.place(g, p)) };
        ends = Math.max(ends, shineDuration / shineRate);
      }
    }
    const active: ActiveVoice = { id, bus: def.bus, priority: def.priority, startedAt: now, endsAt: def.loop ? Infinity : now + ends, voice, gain: def.volume, key };
    this.voices.push(active);
    // The music ducks under it until it ends (§3.5).
    if (def.duck && !def.loop) {
      this.duckUntil = Math.max(this.duckUntil, active.endsAt);
      if (!this.ducked) {
        this.ducked = true;
        this.applyLevels(AUDIO.music.duckIn);
      }
    }
    return active;
  }

  /** Stops one voice now, if it still plays. */
  private stopVoice(v: ActiveVoice | null, fade: number): void {
    if (!v) return;
    const i = this.voices.indexOf(v);
    if (i < 0) return;
    v.voice.stop(fade);
    this.voices.splice(i, 1);
  }

  /** With the global limit full, cuts the lowest priority, oldest voice; false if every voice outranks `priority`. */
  private makeRoom(priority: AudioPriority): boolean {
    const effects = this.voices.filter((v) => v.bus !== 'music');
    if (effects.length < AUDIO.maxVoices) return true;
    let victim: ActiveVoice | undefined;
    for (const v of effects) {
      if (!victim || RANK[v.priority] < RANK[victim.priority] || (RANK[v.priority] === RANK[victim.priority] && v.startedAt < victim.startedAt)) victim = v;
    }
    if (!victim || RANK[victim.priority] > RANK[priority]) return false;
    victim.voice.stop(AUDIO.voiceFade);
    this.voices.splice(this.voices.indexOf(victim), 1);
    if (this.loops.get(victim.id) === victim) this.loops.delete(victim.id);
    return true;
  }

  /** One of `count` variants at random, never the same twice in a row. */
  private pickVariant(def: SoundDef, count: number): number {
    if (count <= 1) return 0;
    const previous = this.lastVariant.get(def.id);
    let i = Math.min(count - 1, Math.floor(this.random() * count));
    // Never the same one twice in a row: the next one instead.
    if (i === previous) i = (i + 1) % count;
    this.lastVariant.set(def.id, i);
    return i;
  }

  private drop(id: string): null {
    this.dropped++;
    this.lastDropped = id;
    return null;
  }

  private prune(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) if ((this.voices[i]?.endsAt ?? 0) <= now) this.voices.splice(i, 1);
  }

  /** Stops every voice of a bus, its loops too. */
  private stopBus(bus: SoundDef['bus']): void {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v?.bus !== bus) continue;
      v.voice.stop(AUDIO.voiceFade);
      this.voices.splice(i, 1);
      if (this.loops.get(v.id) === v) this.loops.delete(v.id);
    }
  }

  /**
   * The buses' volume: the settings (the menus follow the effects), the
   * music under the effects, the pause and the sound test (heard even in
   * pause), and the music ducking under a big sound over `musicFade` s.
   */
  private applyLevels(musicFade: number = AUDIO.busFade): void {
    const sfx = AUDIO.levels[this.settings.sfx];
    const duck = this.ducked ? 10 ** (AUDIO.music.duckDb / 20) : 1;
    const music = AUDIO.levels[this.settings.music] * AUDIO.musicGain * duck;
    this.engine.setBusGain('sfx', this.paused && !this.testing ? 0 : sfx, AUDIO.busFade);
    this.engine.setBusGain('ui', sfx, AUDIO.busFade);
    this.engine.setBusGain('music', this.paused && !this.testing ? music * AUDIO.pausedMusic : music, musicFade);
  }
}
