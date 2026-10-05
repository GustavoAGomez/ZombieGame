import { AUDIO, SOUNDS, type AudioPriority, type SoundDef, type VolumeLevel } from '../config/audio';
import type { AudioCandidate, AudioDef } from '../game/assets/manifest';
import type { AudioOutput, Voice } from './AudioEngine';

/** What the game tells the director every frame (spec 08 §1.3); it grows phase by phase. */
export interface AudioSnapshot {
  /** The match is paused: the effects and loops stop and the music drops (§2). */
  paused: boolean;
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
  update(snapshot: AudioSnapshot): void;
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
  /** Plays a sound as the game would. */
  test(id: string): void;
  /** The candidates of a sound with files (spec 08 §4.4), A to C; empty once one was chosen. */
  candidatesOf(id: string): AudioCandidate[];
  /** The candidate the game plays, and whether it is still to be chosen; null without candidates. */
  pickOf(id: string): { letter: AudioCandidate; pending: boolean } | null;
  /** Plays candidate `letter` of a sound, as the game would play it. */
  testCandidate(id: string, letter: AudioCandidate): void;
  stats(): AudioStats;
}

interface ActiveVoice {
  id: string;
  bus: SoundDef['bus'];
  priority: AudioPriority;
  startedAt: number;
  endsAt: number;
  voice: Voice;
}

const RANK: Readonly<Record<AudioPriority, number>> = { low: 0, normal: 1, high: 2 };

export interface DirectorOptions {
  /** Seconds, monotonic. */
  clock?: () => number;
  /** 0..1, for the variants and the pitch: the audio is presentation, it never touches the game's RNG. */
  random?: () => number;
  catalog?: readonly SoundDef[];
}

/**
 * Decides what sounds, how high and how loud (spec 08 §1): the catalog's
 * variants, pitch and limits, and the buses' volume from the settings and
 * the pause. It never imports Phaser nor reads the game state: it hears
 * the events and a small snapshot per frame, like HapticFeedback.
 */
export class AudioDirector implements GameAudio, SoundTest {
  readonly sounds: readonly SoundDef[];
  private readonly byId: Map<string, SoundDef>;
  private readonly clock: () => number;
  private readonly random: () => number;
  private readonly voices: ActiveVoice[] = [];
  private readonly lastPlay = new Map<string, number>();
  private readonly lastVariant = new Map<string, number>();
  private durations: Readonly<Record<string, number>> = {};
  /** Each sound's candidates' files (debug only) and the candidate its game files come from. */
  private candidates = new Map<string, Map<AudioCandidate, string[]>>();
  private picks = new Map<string, { letter: AudioCandidate; pending: boolean }>();
  private paused = false;
  private dropped = 0;
  private lastDropped = '';

  constructor(
    private readonly engine: AudioOutput,
    private readonly settings: AudioSettings,
    options: DirectorOptions = {},
  ) {
    this.sounds = options.catalog ?? SOUNDS;
    this.byId = new Map(this.sounds.map((s) => [s.id, s]));
    this.clock = options.clock ?? (() => performance.now() / 1000);
    this.random = options.random ?? Math.random;
    settings.onChange(() => this.applyLevels());
    this.applyLevels();
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
    if (keys) this.play(id, keys);
  }

  unlock(): void {
    this.engine.unlock();
  }

  readonly playUi = (id: string): void => {
    this.play(id);
  };

  update(snapshot: AudioSnapshot): void {
    if (snapshot.paused === this.paused) return;
    this.paused = snapshot.paused;
    if (this.paused) this.stopBus('sfx');
    this.applyLevels();
  }

  test(id: string): void {
    this.play(id);
  }


  stats(): AudioStats {
    this.prune(this.clock());
    return { voices: this.voices.filter((v) => v.bus !== 'music').length, dropped: this.dropped, lastDropped: this.lastDropped, state: this.engine.state };
  }

  /**
   * Plays a sound of the catalog: a variant at random (not the last one),
   * its pitch varied, within its own limits and the global one. False when
   * it does not sound (dropped, paused, or no file: silence).
   */
  private play(id: string, keys?: readonly string[]): boolean {
    const def = this.byId.get(id);
    if (!def) return false;
    if (this.paused && def.bus === 'sfx') return false;
    const now = this.clock();
    this.prune(now);
    const last = this.lastPlay.get(id);
    if (last !== undefined && now - last < def.minInterval) return this.drop(id);
    if (this.voices.filter((v) => v.id === id).length >= def.maxVoices) return this.drop(id);
    if (def.bus !== 'music' && !this.makeRoom(def.priority)) return this.drop(id);
    const key = this.pickVariant(def, keys ?? def.variants);
    const duration = key === undefined ? undefined : this.durations[key];
    if (key === undefined || duration === undefined) return false;
    const rate = 1 + (this.random() * 2 - 1) * (def.pitchVar / 100);
    const voice = this.engine.play(key, { bus: def.bus, gain: def.volume, rate, pan: 0 });
    this.lastPlay.set(id, now);
    if (!voice) return false;
    this.voices.push({ id, bus: def.bus, priority: def.priority, startedAt: now, endsAt: now + duration / rate, voice });
    return true;
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

  private drop(id: string): false {
    this.dropped++;
    this.lastDropped = id;
    return false;
  }

  private prune(now: number): void {
    for (let i = this.voices.length - 1; i >= 0; i--) if ((this.voices[i]?.endsAt ?? 0) <= now) this.voices.splice(i, 1);
  }

  private stopBus(bus: SoundDef['bus']): void {
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      if (v?.bus !== bus) continue;
      v.voice.stop(AUDIO.voiceFade);
      this.voices.splice(i, 1);
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
