/**
 * Every audio number and the sound catalog (spec 08 §1.1). The game never
 * holds a volume or a time of its own: it names a sound by its id and the
 * director (src/audio/AudioDirector.ts) looks it up here.
 */

/** Where a sound goes: the effects, the menus (it follows the effects' level) or the music. */
export type AudioBus = 'sfx' | 'ui' | 'music';

/** With the global limit full, the lowest priority (and oldest) voice is cut. */
export type AudioPriority = 'low' | 'normal' | 'high';

/** The four families of spec 08 §3.2, the banners and short melodies (§6.5), and the music. */
export type SoundFamily = 'hit' | 'reward' | 'threat' | 'ui' | 'jingle' | 'music';

/** A streak that raises the pitch of a sound's shine layer on each repetition (spec 08 §3.4). */
export type LadderId = 'kill' | 'repair' | 'upgrade';

/** A player's volume setting for the effects or the music (pause menu). */
export type VolumeLevel = 'high' | 'medium' | 'low' | 'off';

export interface SoundDef {
  /** Its name, e.g. `weapon.pistol.fire`. */
  id: string;
  family: SoundFamily;
  /** Keys of the manifest's `audio` section, 1 to 4: one at random, never the same twice in a row. */
  variants: readonly string[];
  bus: AudioBus;
  /** 0..1, relative to the others: every file is normalised to the same peak (spec 08 §4.2). */
  volume: number;
  /** Random pitch change on each play, ± percent. */
  pitchVar: number;
  /** Copies of this sound that may play at once. */
  maxVoices: number;
  /** Seconds between two plays of it; a play sooner is dropped. */
  minInterval: number;
  priority: AudioPriority;
  /** Quieter and panned with its distance to the local player (spec 08 §3.5). */
  positional: boolean;
  ladder: LadderId | null;
  /** The music ducks while it plays. */
  duck: boolean;
}

export const AUDIO = {
  /** Effect voices (effects and menus) at once; past it, the lowest priority voice is cut (spec 08 §3.5). */
  maxVoices: 12,
  /** The Web Audio context: low latency, for the reward to arrive within 50 ms of the action (§3.3). */
  latencyHint: 'interactive' as const,
  /** Gain of each volume setting (pause menu: ALTO, MEDIO, BAJO, NO). */
  levels: { high: 1, medium: 0.6, low: 0.3, off: 0 } satisfies Record<VolumeLevel, number>,
  /** The order a tap on the setting goes through. */
  levelOrder: ['high', 'medium', 'low', 'off'] as const satisfies readonly VolumeLevel[],
  /** The music, by default, 35 % under the effects (§7). */
  musicGain: 0.65,
  /** With the game paused the effects and loops stop and the music stays at 40 % (§2). */
  pausedMusic: 0.4,
  /** Seconds for a bus to reach a new volume (no clicks). */
  busFade: 0.05,
  /** Seconds a voice takes to fade out when it is cut. */
  voiceFade: 0.03,
  /** The master bus limiter, so many sounds at once never clip (§1). */
  compressor: { threshold: -10, knee: 6, ratio: 4, attack: 0.003, release: 0.25 },
} as const;

/** The sound workshop (npm run audio:gen, spec 08 §4): its format, finish and report. */
export const AUDIO_GEN = {
  /** WAV, 44.1 kHz, 16 bits: decoded the same on iOS and Android (§2). */
  sampleRate: 44100,
  /** Peak of every file, in dB (§4.2): the relative volume is the catalog's. */
  peakDb: -1,
  /** At least this fade at the end, so it never clicks when cut (§4.2), seconds. */
  fadeOut: 0.005,
  /** The sound starts within this, seconds (§4.2). */
  maxLeadingSilence: 0.005,
  /** Nothing under this (§4.2, §3.3 rule 4), Hz. */
  highpass: 60,
  /** Under this (dB under the peak) a sample counts as silence when trimming and measuring. */
  silenceDb: -50,
  /** The one key of everything with a note (§3.3 rule 2): A minor. */
  scale: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const,
  /**
   * Each family's length range and longest tail, seconds (§3.2, §3.3 rule
   * 6: up to 300 ms of tail in the frequent sounds, up to 1.5 s in the big
   * moments). The banners last up to 2.5 s (§6.5). The music has none.
   */
  families: {
    hit: { duration: [0.08, 0.4], tail: 0.3 },
    reward: { duration: [0.1, 0.9], tail: 0.6 },
    threat: { duration: [0.2, 1.5], tail: 1 },
    ui: { duration: [0.04, 0.2], tail: 0.15 },
    jingle: { duration: [0.3, 2.5], tail: 1.5 },
  } satisfies Record<Exclude<SoundFamily, 'music'>, { duration: readonly [number, number]; tail: number }>,
  /** Report: the tail is what follows the last moment the sound is within this of its peak, dB. */
  tailDb: -20,
  /** Report: a phone speaker plays nothing under 100 Hz: no more than this share of the energy there (§4.5). */
  maxLowShare: 0.25,
  /** Report: the bands of the energy split, Hz (their upper edges; the last one goes to the top). */
  bands: [100, 250, 1000, 5000] as const,
  /** Report: samples at full scale in a row that count as clipping. */
  clipRun: 3,
  /** Report: two variants whose length, brightness and loudness differ less than this are «almost identical». */
  similar: { duration: 0.02, brightness: 0.02, loudnessDb: 0.3 },
  /** Report: the analysis window (samples, a power of 2). */
  fftSize: 1024,
  /** Every effect together under this (§2), bytes. */
  budgetBytes: 8 * 1024 * 1024,
} as const;

/** The default of every catalog field a sound does not set. */
const BASE = {
  pitchVar: 0,
  maxVoices: 2,
  minInterval: 0,
  priority: 'normal',
  positional: false,
  ladder: null,
  duck: false,
} as const satisfies Partial<SoundDef>;

function sound(def: Pick<SoundDef, 'id' | 'family' | 'variants' | 'bus' | 'volume'> & Partial<SoundDef>): SoundDef {
  return { ...BASE, ...def };
}

/** The catalog (spec 08 §6): one entry per sound id. */
export const SOUNDS: readonly SoundDef[] = [
  // §6.6 Interface. S1's test sound.
  sound({ id: 'ui.tap', family: 'ui', variants: ['ui_tap'], bus: 'ui', volume: 0.5, pitchVar: 3, maxVoices: 2, minInterval: 0.03, priority: 'low' }),
];

const BY_ID = new Map(SOUNDS.map((s) => [s.id, s]));

export function soundById(id: string): SoundDef | undefined {
  return BY_ID.get(id);
}

/** The volume setting after `level` in the pause menu's rotation (ALTO → MEDIO → BAJO → NO → ALTO). */
export function nextVolumeLevel(level: VolumeLevel): VolumeLevel {
  const order = AUDIO.levelOrder;
  return order[(order.indexOf(level) + 1) % order.length] ?? 'high';
}
