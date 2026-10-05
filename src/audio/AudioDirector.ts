import { AUDIO, SOUNDS, WEAPON_FIRE_SOUND, type AudioPriority, type SoundDef, type VolumeLevel } from '../config/audio';
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
}

/** No match: nothing fires, nothing is paused. */
export const QUIET_SNAPSHOT: Readonly<AudioSnapshot> = { paused: false, continuous: null, heat: 0 };

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
  /** SIMULAR COMBATE: the SMG firing with hits and kills for a few seconds, to hear the mix. */
  simulateCombat(): void;
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
}

interface PlayRequest {
  /** The files to pick from (a candidate's), instead of the catalog's. */
  keys?: readonly string[];
  /** Playback rate before the pitch variation (the laser's heat). */
  rate?: number;
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
  private candidates = new Map<string, Map<AudioCandidate, string[]>>();
  private picks = new Map<string, { letter: AudioCandidate; pending: boolean }>();
  private paused = false;
  /** The continuous weapon whose loop is playing. */
  private firing: ContinuousWeapon | null = null;
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
    if (events) this.listen(events);
  }

  load(defs: Readonly<Record<string, AudioDef>>, baseUrl: string, withCandidates = false): void {
    // The candidates are only for the sound test: the game alone loads only the chosen files (§8).
    const loaded = Object.fromEntries(Object.entries(defs).filter(([, def]) => withCandidates || !def.candidate));
    const durations: Record<string, number> = {};
    for (const [key, def] of Object.entries(loaded)) if (!def.placeholder) durations[key] = def.duration;
    this.durations = durations;
    this.candidates = new Map();
    this.picks = new Map();
    for (const sound of this.sounds) {
      const first = defs[sound.variants[0] ?? ''];
      if (first?.picked) this.picks.set(sound.id, { letter: first.picked, pending: first.pending === true });
      if (!withCandidates) continue;
      const byLetter = new Map<AudioCandidate, string[]>();
      for (const letter of ['A', 'B', 'C'] as const) {
        const keys = sound.variants.map((v) => `${v}__${letter.toLowerCase()}`).filter((k) => loaded[k]?.candidate === letter);
        if (keys.length > 0) byLetter.set(letter, keys);
      }
      if (byLetter.size > 0) this.candidates.set(sound.id, byLetter);
    }
    this.engine.load(loaded, baseUrl);
  }

  candidatesOf(id: string): AudioCandidate[] {
    return [...(this.candidates.get(id)?.keys() ?? [])];
  }

  pickOf(id: string): { letter: AudioCandidate; pending: boolean } | null {
    return this.picks.get(id) ?? null;
  }

  testCandidate(id: string, letter: AudioCandidate): void {
    const keys = this.candidates.get(id)?.get(letter);
    if (!keys) return;
    if (this.byId.get(id)?.loop) this.toggleLoop(id, { keys });
    else this.play(id, { keys });
  }

  unlock(): void {
    this.engine.unlock();
  }

  readonly playUi = (id: string): void => {
    this.play(id);
  };

  update(snapshot: Readonly<AudioSnapshot>): void {
    if (snapshot.paused !== this.paused) {
      this.paused = snapshot.paused;
      if (this.paused) this.stopBus('sfx');
      this.applyLevels();
    }
    // A beam or a jet sounds while it fires: its loop starts and stops with it (and with the pause).
    const firing = this.paused ? null : snapshot.continuous;
    if (firing !== this.firing) {
      if (this.firing) this.stopLoop(CONTINUOUS_LOOP[this.firing], AUDIO.loopFadeOut);
      if (firing) this.startLoop(CONTINUOUS_LOOP[firing], { rate: this.heatRate(firing, snapshot.heat) });
      this.firing = firing;
    } else if (firing) {
      this.loops.get(CONTINUOUS_LOOP[firing])?.voice.setRate(this.heatRate(firing, snapshot.heat));
    }
  }

  test(id: string): void {
    if (this.byId.get(id)?.loop) this.toggleLoop(id, {});
    else this.play(id);
  }

  simulateCombat(): void {
    const { seconds, hitsIn10, killEvery } = AUDIO.combatTest;
    const shots = Math.round(seconds * WEAPONS.smg.fireRate);
    let hits = 0;
    for (let i = 0; i < shots; i++) {
      this.schedule(i / WEAPONS.smg.fireRate, () => {
        this.play('weapon.smg.fire');
        if (i % 10 >= hitsIn10) return;
        this.play('impact.flesh');
        // A kill's own sound (§6.2) arrives in phase S3: until then it is silence.
        if (++hits % killEvery === 0) this.play('reward.kill');
      });
    }
  }

  stats(): AudioStats {
    this.prune(this.clock());
    return { voices: this.voices.filter((v) => v.bus !== 'music').length, dropped: this.dropped, lastDropped: this.lastDropped, state: this.engine.state };
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
    events.on('zombie:hit', (e) => this.play(e.weapon === 'katana' ? 'weapon.katana.hit' : 'impact.flesh'));
    events.on('fire:blast', () => this.play('weapon.flame.blast'));
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
    if (this.paused && def.bus === 'sfx') return null;
    const now = this.clock();
    this.prune(now);
    const last = this.lastPlay.get(id);
    if (last !== undefined && now - last < def.minInterval) return this.drop(id);
    if (this.voices.filter((v) => v.id === id).length >= def.maxVoices) return this.drop(id);
    if (def.bus !== 'music' && !this.makeRoom(def.priority)) return this.drop(id);
    const key = this.pickVariant(def, request.keys ?? def.variants);
    const duration = key === undefined ? undefined : this.durations[key];
    if (key === undefined || duration === undefined) return null;
    const rate = (request.rate ?? 1) * (1 + (this.random() * 2 - 1) * (def.pitchVar / 100));
    const voice = this.engine.play(key, { bus: def.bus, gain: def.volume, rate, pan: 0, loop: def.loop, ...(def.loop ? { fadeIn: AUDIO.loopFadeIn } : {}) });
    this.lastPlay.set(id, now);
    if (!voice) return null;
    const active: ActiveVoice = { id, bus: def.bus, priority: def.priority, startedAt: now, endsAt: def.loop ? Infinity : now + duration / rate, voice };
    this.voices.push(active);
    return active;
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

  /** One of `variants` (the sound's, or a candidate's) at random, never the same twice in a row. */
  private pickVariant(def: SoundDef, variants: readonly string[]): string | undefined {
    const count = variants.length;
    if (count <= 1) return variants[0];
    const previous = this.lastVariant.get(def.id);
    let i = Math.min(count - 1, Math.floor(this.random() * count));
    // Never the same one twice in a row: the next one instead.
    if (i === previous) i = (i + 1) % count;
    this.lastVariant.set(def.id, i);
    return variants[i];
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

  /** The buses' volume: the settings (the menus follow the effects), the music under the effects, and the pause. */
  private applyLevels(): void {
    const sfx = AUDIO.levels[this.settings.sfx];
    const music = AUDIO.levels[this.settings.music] * AUDIO.musicGain;
    this.engine.setBusGain('sfx', this.paused ? 0 : sfx, AUDIO.busFade);
    this.engine.setBusGain('ui', sfx, AUDIO.busFade);
    this.engine.setBusGain('music', this.paused ? music * AUDIO.pausedMusic : music, AUDIO.busFade);
  }
}
