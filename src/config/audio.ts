/**
 * Every audio number and the sound catalog (spec 08 §1.1). The game never
 * holds a volume or a time of its own: it names a sound by its id and the
 * director (src/audio/AudioDirector.ts) looks it up here.
 */
import type { Rarity } from './upgrades';
import { BOSS, HAND } from './balance';
import type { MerchantId } from './merchants';
import type { WeaponId } from './weapons';

/** Where a sound goes: the effects, the menus (it follows the effects' level) or the music. */
export type AudioBus = 'sfx' | 'ui' | 'music';

/** With the global limit full, the lowest priority (and oldest) voice is cut. */
export type AudioPriority = 'low' | 'normal' | 'high';

/** The four families of spec 08 §3.2, the banners and short melodies (§6.5), and the music. */
export type SoundFamily = 'hit' | 'reward' | 'threat' | 'ui' | 'jingle' | 'music';

/** A streak that raises the pitch of a sound's shine layer on each repetition (spec 08 §3.4). */
export type LadderId = 'repair' | 'upgrade';

/** What the music plays (§7): the title, the rest between rounds, a round, a boss round; `over` fades it out. */
export type MusicState = 'title' | 'calm' | 'round' | 'boss' | 'over';

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
  /** Plays over and over until the director stops it (the laser, the flamethrower, the heartbeat). */
  loop: boolean;
  /**
   * A streak sound's shine layer (§3.4): one key per variant, played with
   * it, whose pitch alone climbs the ladder. Empty for the rest.
   */
  shine: readonly string[];
  /** Its variants are not random: the event names which (each wizard's signature, in MERCHANT_VARIANT order). */
  keyed: boolean;
  /** The length its file must have, seconds (the hand's draw lasts as HAND.rollingTime), or null. */
  length: number | null;
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
  /** The local player (spec 08 §1.3): what only they hear (their shots, reloads and wounds). */
  localPlayerId: 0,
  /** A loop's start and its tail when it stops (the flamethrower's roar dying into embers), seconds. */
  loopFadeIn: 0.06,
  loopFadeOut: 0.25,
  /** The laser's hum at full heat, as a playback rate: a fifth up, so its rise says how near it is to overheating (§6.1). */
  laserHotRate: 1.5,
  /**
   * The sound test's SIMULAR COMBATE (§8): the SMG firing for `seconds` at
   * its fire rate, `hitsIn10` of every 10 shots hitting, to hear the mix;
   * and around the player a crowd
   * (§9, S4: 20 zombies), one of them striking every `attackEvery` shots
   * and groaning every `groanEvery`, within `crowdRadius` px.
   */
  combatTest: { seconds: 5, hitsIn10: 7, attackEvery: 4, groanEvery: 25, crowdRadius: 300 },
  /**
   * Streaks (§3.4): the shine layer's rungs, semitones over its own note
   * (it stays on the last one), and how long a streak waits for the next
   * repetition, seconds. The upgrade streak goes by the level bought. A
   * kill makes no sound and has no streak (the user's choice, docs/DECISIONS.md).
   */
  ladder: {
    steps: [0, 3, 5, 7, 10, 12, 15, 17],
    windows: { repair: 2 },
  },
  /** The sound test's SIMULAR RACHA (§8): this many planks in a row, this far apart, seconds. */
  streakTest: { planks: 8, interval: 0.3 },
  /** The two bell notes of an unlocked room come after the door's bolt (§6.2), seconds. */
  zoneDelay: 0.35,
  /** `jingle.boss.dead` after the boss's own fall (§6.4), and `jingle.gameover` after the player's death, seconds. */
  bossDeadJingleDelay: 1.2,
  gameOverJingleDelay: 1,
  /** The dungeon (spec 09 §11): the room's bells after its doors open, and the curse's laugh after the pact's choir. */
  roomClearDelay: 0.25,
  curseDelay: 0.7,
  /**
   * Where a positional sound plays (§3.5): at full volume within `near` px
   * of the local player, falling in a line to `minGain` at `far` px and
   * beyond; panned left or right by its side, `maxPan` at most.
   */
  position: { near: 160, far: 480, minGain: 0.25, maxPan: 0.7 },
  /** What sounds on any level, not only the local player's (§3.5): the boss's warnings. The banners have no place. */
  anyLevel: ['boss.warning', 'boss.windup.charge', 'boss.windup.slam', 'boss.windup.leap'] as readonly string[],
  /**
   * The music (§7, §3.5):
   * - `crossfade`: s between two states' tracks;
   * - `overFade`: s for it to fade out when the match is over;
   * - `duckDb`: how much it drops while a `duck` sound plays, reached in
   *   `duckIn` s and back in `duckOut` s;
   * - `lowHealthCutoff`: with low health it goes through a low-pass at
   *   this many Hz (muffled), reached in `filterFade` s; `openCutoff` is
   *   the filter wide open.
   */
  music: { crossfade: 1.5, overFade: 1, duckDb: -6, duckIn: 0.15, duckOut: 0.4, lowHealthCutoff: 800, openCutoff: 20000, filterFade: 0.4 },
  /** Zombies groan (§6.4) when one is within this many px, one groan every 2 to 5 s, never two at once. */
  groanRange: 400,
  groanInterval: [2, 5] as const,
} as const;

/** Which variant of a wizard's own sounds (`keyed`) is whose (§3.3: each wizard has its signature). */
export const MERCHANT_VARIANT: Readonly<Record<MerchantId, number>> = { blue: 0, red: 1, gold: 2 };

/** The dungeon's upgrade sound (spec 09 §11), keyed by rarity: the wizards' signatures, in the same order. */
export const RARITY_VARIANT: Readonly<Record<Rarity, number>> = { common: 0, rare: 1, legendary: 2 };

/** The sound of each weapon's shot or sweep (spec 08 §6.1); the beam and the jet are loops. */
export const WEAPON_FIRE_SOUND: Readonly<Partial<Record<WeaponId, string>>> = {
  pistol: 'weapon.pistol.fire',
  smg: 'weapon.smg.fire',
  shotgun: 'weapon.shotgun.fire',
  katana: 'weapon.katana.swing',
};

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
  /** A file starts where the sound first reaches this, dB under its peak (a recording's room noise before it is cut), after a fade-in of `onsetFade` s. */
  onsetDb: -40,
  onsetFade: 0.001,
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
  /** Report: where the dominant pitch is looked for, Hz (a rewards' note against a hit's body, §4.5). */
  pitchRange: [80, 5000] as const,
  /** Every effect together under this (§2), bytes: 8 MB for Survival's 75 sounds, 10 with the dungeon's 21 (spec 09 §11, docs/DECISIONS.md). */
  budgetBytes: 10 * 1024 * 1024,
  /** A loop's end is blended into its start over this, so it repeats without a seam or a click, seconds. */
  loopCrossfade: 0.12,
  /** Report: a sound with a set `length` may be off it by this much, seconds. */
  lengthTolerance: 0.05,
  /**
   * The music (§7): its lows cut, a crossfade into its own start, the loop
   * repeated `margin` s on each side, 30 to 90 s per loop, M4A at
   * `bitrate`, and every track as loud on average (`rmsDb`, its peak at
   * most −1 dB). Above `sameMaterial` of correlation the crossfade's two
   * ends are the same music (a source that already loops): a linear fade,
   * with no bump in the middle. Its ends are trimmed only where they are
   * silent for `silenceRun` s or more: a loop that starts on a zero
   * crossing keeps every sample.
   */
  music: { highpass: 40, crossfade: 2, margin: 0.25, length: [30, 90] as const, bitrate: '128k', rmsDb: -18, sameMaterial: 0.5, silenceRun: 0.02 },
} as const;

/** The default of every catalog field a sound does not set. */
export const SOUND_DEFAULTS = {
  pitchVar: 0,
  maxVoices: 2,
  minInterval: 0,
  priority: 'normal',
  positional: false,
  ladder: null,
  duck: false,
  loop: false,
  shine: [],
  keyed: false,
  length: null,
} as const satisfies Partial<SoundDef>;

function sound(def: Pick<SoundDef, 'id' | 'family' | 'variants' | 'bus' | 'volume'> & Partial<SoundDef>): SoundDef {
  return { ...SOUND_DEFAULTS, ...def };
}

/** A sound id as a manifest key, in snake_case: `item.cantUse` → `item_cant_use`. */
function snake(id: string): string {
  return id.replace(/\./g, '_').replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/** The keys of a sound's files: its id in snake_case, and _1.._n with several variants. */
function keys(id: string, count = 1): string[] {
  const base = snake(id);
  return count === 1 ? [base] : Array.from({ length: count }, (_, i) => `${base}_${i + 1}`);
}

/** A streak sound's shine keys: one per variant, `<variant>_shine`. */
function shine(variants: readonly string[]): string[] {
  return variants.map((v) => `${v}_shine`);
}

/** A wizard's sound: one variant per wizard, in MERCHANT_VARIANT order. */
function wizards(id: string): string[] {
  const base = snake(id);
  return ['blue', 'red', 'gold'].map((m) => `${base}_${m}`);
}

/** The dungeon's upgrade sound: one variant per rarity, in RARITY_VARIANT order. */
function rarities(id: string): string[] {
  const base = snake(id);
  return ['common', 'rare', 'legendary'].map((r) => `${base}_${r}`);
}

/** The catalog (spec 08 §6): one entry per sound id. */
export const SOUNDS: readonly SoundDef[] = [
  // §6.1 Weapons and the player. Wounds, death, the heartbeat and what breaks are measured as threats (§3.2).
  sound({ id: 'weapon.pistol.fire', family: 'hit', variants: keys('weapon.pistol.fire', 3), bus: 'sfx', volume: 0.75, pitchVar: 4, maxVoices: 4, minInterval: 0.03 }),
  sound({ id: 'weapon.smg.fire', family: 'hit', variants: keys('weapon.smg.fire', 4), bus: 'sfx', volume: 0.5, pitchVar: 5, maxVoices: 4, minInterval: 0.04, priority: 'low' }),
  sound({ id: 'weapon.shotgun.fire', family: 'hit', variants: keys('weapon.shotgun.fire'), bus: 'sfx', volume: 0.95, pitchVar: 3, maxVoices: 2, priority: 'high' }),
  sound({ id: 'weapon.katana.swing', family: 'hit', variants: keys('weapon.katana.swing', 3), bus: 'sfx', volume: 0.6, pitchVar: 6 }),
  sound({ id: 'weapon.katana.hit', family: 'hit', variants: keys('weapon.katana.hit'), bus: 'sfx', volume: 0.6, pitchVar: 5, maxVoices: 3, minInterval: 0.05 }),
  sound({ id: 'weapon.laser.loop', family: 'hit', variants: keys('weapon.laser.loop'), bus: 'sfx', volume: 0.4, maxVoices: 1, priority: 'high', loop: true }),
  sound({ id: 'weapon.laser.overheat', family: 'threat', variants: keys('weapon.laser.overheat'), bus: 'sfx', volume: 0.7, maxVoices: 1, priority: 'high' }),
  sound({ id: 'weapon.flame.loop', family: 'hit', variants: keys('weapon.flame.loop'), bus: 'sfx', volume: 0.5, maxVoices: 1, priority: 'high', loop: true }),
  sound({ id: 'weapon.flame.blast', family: 'hit', variants: keys('weapon.flame.blast'), bus: 'sfx', volume: 0.7, pitchVar: 6, maxVoices: 3, minInterval: 0.05, positional: true }),
  sound({ id: 'weapon.knife', family: 'hit', variants: keys('weapon.knife', 2), bus: 'sfx', volume: 0.55, pitchVar: 6 }),
  sound({ id: 'weapon.reload.start', family: 'hit', variants: keys('weapon.reload.start'), bus: 'sfx', volume: 0.5, maxVoices: 1 }),
  sound({ id: 'weapon.reload.end', family: 'hit', variants: keys('weapon.reload.end'), bus: 'sfx', volume: 0.55, maxVoices: 1 }),
  sound({ id: 'weapon.empty', family: 'hit', variants: keys('weapon.empty'), bus: 'sfx', volume: 0.45, maxVoices: 1, minInterval: 0.1 }),
  sound({ id: 'weapon.switch', family: 'hit', variants: keys('weapon.switch'), bus: 'sfx', volume: 0.45, pitchVar: 4, maxVoices: 1, minInterval: 0.05 }),
  sound({ id: 'weapon.broken', family: 'threat', variants: keys('weapon.broken'), bus: 'sfx', volume: 0.7, maxVoices: 1, priority: 'high' }),
  sound({ id: 'impact.flesh', family: 'hit', variants: keys('impact.flesh', 4), bus: 'sfx', volume: 0.5, pitchVar: 8, maxVoices: 4, minInterval: 0.04, priority: 'low', positional: true }),
  sound({ id: 'player.dash', family: 'hit', variants: keys('player.dash'), bus: 'sfx', volume: 0.55, pitchVar: 4, maxVoices: 1 }),
  sound({ id: 'player.hurt', family: 'threat', variants: keys('player.hurt', 2), bus: 'sfx', volume: 0.7, pitchVar: 4, maxVoices: 1, minInterval: 0.2, priority: 'high' }),
  sound({ id: 'player.death', family: 'threat', variants: keys('player.death'), bus: 'sfx', volume: 0.9, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'player.heartbeat', family: 'threat', variants: keys('player.heartbeat'), bus: 'sfx', volume: 0.7, maxVoices: 1, priority: 'high', loop: true }),
  // §6.2 Rewards. `denied` and `item.cantUse` answer a tap: measured as interface sounds.
  // A hit sounds only with its impact (impact.flesh), and a kill not at all: no `reward.hit` nor `reward.kill` (the user's choice, docs/DECISIONS.md).
  sound({ id: 'reward.repair', family: 'reward', variants: keys('reward.repair'), shine: shine(keys('reward.repair')), bus: 'sfx', volume: 0.6, maxVoices: 2, ladder: 'repair' }),
  sound({ id: 'pickup.ammo', family: 'reward', variants: keys('pickup.ammo'), bus: 'sfx', volume: 0.6, maxVoices: 1 }),
  sound({ id: 'pickup.health', family: 'reward', variants: keys('pickup.health'), bus: 'sfx', volume: 0.65, maxVoices: 1 }),
  sound({ id: 'pickup.item', family: 'reward', variants: keys('pickup.item'), bus: 'sfx', volume: 0.65, maxVoices: 1 }),
  sound({ id: 'buy.cash', family: 'reward', variants: keys('buy.cash'), bus: 'sfx', volume: 0.55, pitchVar: 3, maxVoices: 1 }),
  sound({ id: 'buy.door', family: 'reward', variants: keys('buy.door'), bus: 'sfx', volume: 0.75, maxVoices: 2, positional: true }),
  sound({ id: 'buy.zone', family: 'reward', variants: keys('buy.zone'), bus: 'sfx', volume: 0.65, maxVoices: 1 }),
  sound({ id: 'buy.weapon', family: 'reward', variants: keys('buy.weapon'), bus: 'sfx', volume: 0.75, maxVoices: 1, priority: 'high' }),
  sound({ id: 'buy.merchant', family: 'reward', variants: wizards('buy.merchant'), keyed: true, bus: 'sfx', volume: 0.7, maxVoices: 1 }),
  sound({ id: 'buy.upgrade', family: 'reward', variants: keys('buy.upgrade'), shine: shine(keys('buy.upgrade')), bus: 'sfx', volume: 0.75, maxVoices: 1, priority: 'high', ladder: 'upgrade' }),
  sound({ id: 'buy.special', family: 'jingle', variants: keys('buy.special'), bus: 'sfx', volume: 0.9, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'boost.on', family: 'reward', variants: keys('boost.on'), bus: 'sfx', volume: 0.7, maxVoices: 1 }),
  sound({ id: 'denied', family: 'ui', variants: keys('denied'), bus: 'sfx', volume: 0.55, maxVoices: 1, minInterval: 0.15 }),
  sound({ id: 'item.cantUse', family: 'ui', variants: keys('item.cantUse'), bus: 'sfx', volume: 0.45, maxVoices: 1, minInterval: 0.15 }),
  sound({ id: 'item.splash', family: 'reward', variants: keys('item.splash'), bus: 'sfx', volume: 0.7, maxVoices: 2, positional: true }),
  sound({ id: 'ritual.done', family: 'jingle', variants: keys('ritual.done'), bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'merchant.arrive', family: 'reward', variants: wizards('merchant.arrive'), keyed: true, bus: 'sfx', volume: 0.7, maxVoices: 1 }),
  // §6.3 The Demon's Hand: the signature of hell in all of them.
  sound({ id: 'hand.pay.money', family: 'reward', variants: keys('hand.pay.money'), bus: 'sfx', volume: 0.7, maxVoices: 1 }),
  sound({ id: 'hand.pay.blood', family: 'threat', variants: keys('hand.pay.blood'), bus: 'sfx', volume: 0.75, maxVoices: 1 }),
  sound({ id: 'hand.roll', family: 'threat', variants: keys('hand.roll'), bus: 'sfx', volume: 0.6, maxVoices: 1, length: HAND.rollingTime }),
  sound({ id: 'hand.offer', family: 'reward', variants: keys('hand.offer'), bus: 'sfx', volume: 0.7, maxVoices: 1 }),
  sound({ id: 'hand.offer.special', family: 'jingle', variants: keys('hand.offer.special'), bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'hand.taken', family: 'reward', variants: keys('hand.taken'), bus: 'sfx', volume: 0.65, maxVoices: 1 }),
  sound({ id: 'hand.refund', family: 'threat', variants: keys('hand.refund'), bus: 'sfx', volume: 0.75, maxVoices: 1 }),
  sound({ id: 'hand.moved', family: 'threat', variants: keys('hand.moved'), bus: 'sfx', volume: 0.6, maxVoices: 1 }),
  // §6.4 Threats. `boss.dizzy.loop` is the stunned boss's confused groan (a complaint), the loop that follows `boss.stunned`.
  sound({ id: 'zombie.groan', family: 'threat', variants: keys('zombie.groan', 4), bus: 'sfx', volume: 0.45, pitchVar: 6, maxVoices: 1, priority: 'low', positional: true }),
  sound({ id: 'zombie.attack', family: 'threat', variants: keys('zombie.attack', 2), bus: 'sfx', volume: 0.6, pitchVar: 6, maxVoices: 3, minInterval: 0.08, positional: true }),
  sound({ id: 'zombie.crawl', family: 'threat', variants: keys('zombie.crawl'), bus: 'sfx', volume: 0.5, pitchVar: 6, maxVoices: 2, priority: 'low', positional: true }),
  sound({ id: 'barricade.break', family: 'threat', variants: keys('barricade.break', 2), bus: 'sfx', volume: 0.6, pitchVar: 5, maxVoices: 2, minInterval: 0.1, positional: true }),
  sound({ id: 'boss.warning', family: 'threat', variants: keys('boss.warning'), bus: 'sfx', volume: 0.85, maxVoices: 2, priority: 'high', duck: true, length: BOSS.warningTime }),
  sound({ id: 'boss.landed', family: 'threat', variants: keys('boss.landed'), bus: 'sfx', volume: 1, maxVoices: 2, priority: 'high' }),
  sound({ id: 'boss.roar', family: 'threat', variants: keys('boss.roar'), bus: 'sfx', volume: 0.9, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'boss.windup.charge', family: 'threat', variants: keys('boss.windup.charge'), bus: 'sfx', volume: 0.85, maxVoices: 2, priority: 'high' }),
  sound({ id: 'boss.windup.slam', family: 'threat', variants: keys('boss.windup.slam'), bus: 'sfx', volume: 0.85, maxVoices: 2, priority: 'high' }),
  sound({ id: 'boss.windup.leap', family: 'threat', variants: keys('boss.windup.leap'), bus: 'sfx', volume: 0.85, maxVoices: 2, priority: 'high' }),
  sound({ id: 'boss.charge.loop', family: 'threat', variants: keys('boss.charge.loop'), bus: 'sfx', volume: 0.7, maxVoices: 1, priority: 'high', positional: true, loop: true }),
  sound({ id: 'boss.slam', family: 'threat', variants: keys('boss.slam'), bus: 'sfx', volume: 0.9, maxVoices: 2, priority: 'high' }),
  sound({ id: 'boss.stunned', family: 'threat', variants: keys('boss.stunned'), bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high' }),
  sound({ id: 'boss.dizzy.loop', family: 'threat', variants: keys('boss.dizzy.loop'), bus: 'sfx', volume: 0.6, maxVoices: 1, priority: 'high', positional: true, loop: true }),
  sound({ id: 'boss.killed', family: 'threat', variants: keys('boss.killed'), bus: 'sfx', volume: 1, maxVoices: 1, priority: 'high', duck: true }),
  // §6.5 Banners and short melodies: through the effects bus, so they sound without music.
  sound({ id: 'jingle.round.start', family: 'jingle', variants: keys('jingle.round.start'), bus: 'sfx', volume: 0.8, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'jingle.round.boss', family: 'jingle', variants: keys('jingle.round.boss'), bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'jingle.round.clear', family: 'jingle', variants: keys('jingle.round.clear'), bus: 'sfx', volume: 0.8, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'jingle.boss.dead', family: 'jingle', variants: keys('jingle.boss.dead'), bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'jingle.gameover', family: 'jingle', variants: keys('jingle.gameover'), bus: 'sfx', volume: 0.8, maxVoices: 1, priority: 'high' }),
  // §7 Music, one track per state; `calm` and `round` share one when only one has a file.
  sound({ id: 'music.title', family: 'music', variants: keys('music.title'), bus: 'music', volume: 1, maxVoices: 2, priority: 'high', loop: true }),
  sound({ id: 'music.calm', family: 'music', variants: keys('music.calm'), bus: 'music', volume: 1, maxVoices: 2, priority: 'high', loop: true }),
  sound({ id: 'music.round', family: 'music', variants: keys('music.round'), bus: 'music', volume: 1, maxVoices: 2, priority: 'high', loop: true }),
  sound({ id: 'music.boss', family: 'music', variants: keys('music.boss'), bus: 'music', volume: 1, maxVoices: 2, priority: 'high', loop: true }),
  // Spec 09 §11: the dungeon. Doors, the room's prize, the wave's warning, the new enemies, keys, locks and chests, the wizard's wares, the pact, the trapdoor and the floor's banner.
  sound({ id: 'dungeon.door.shut', family: 'hit', variants: keys('dungeon.door.shut'), bus: 'sfx', volume: 0.7, maxVoices: 1, priority: 'high' }),
  sound({ id: 'dungeon.door.open', family: 'reward', variants: keys('dungeon.door.open'), bus: 'sfx', volume: 0.6, maxVoices: 1 }),
  sound({ id: 'dungeon.room.clear', family: 'reward', variants: keys('dungeon.room.clear'), bus: 'sfx', volume: 0.7, maxVoices: 1, priority: 'high' }),
  sound({ id: 'dungeon.spawn.warning', family: 'threat', variants: keys('dungeon.spawn.warning'), bus: 'sfx', volume: 0.65, maxVoices: 1, priority: 'high' }),
  sound({ id: 'enemy.spitter.windup', family: 'threat', variants: keys('enemy.spitter.windup'), bus: 'sfx', volume: 0.55, pitchVar: 5, maxVoices: 2, positional: true }),
  sound({ id: 'enemy.spitter.spit', family: 'hit', variants: keys('enemy.spitter.spit', 2), bus: 'sfx', volume: 0.6, pitchVar: 6, maxVoices: 2, positional: true }),
  sound({ id: 'enemy.spitter.hit', family: 'hit', variants: keys('enemy.spitter.hit', 2), bus: 'sfx', volume: 0.6, pitchVar: 6, maxVoices: 2, positional: true }),
  sound({ id: 'enemy.exploder.fuse', family: 'threat', variants: keys('enemy.exploder.fuse'), bus: 'sfx', volume: 0.6, pitchVar: 4, maxVoices: 2, positional: true }),
  sound({ id: 'enemy.exploder.burst', family: 'hit', variants: keys('enemy.exploder.burst'), bus: 'sfx', volume: 0.9, pitchVar: 4, maxVoices: 3, minInterval: 0.05, priority: 'high', positional: true }),
  sound({ id: 'enemy.brute.step', family: 'threat', variants: keys('enemy.brute.step', 2), bus: 'sfx', volume: 0.5, pitchVar: 4, maxVoices: 2, minInterval: 0.2, priority: 'low', positional: true }),
  sound({ id: 'enemy.brute.attack', family: 'threat', variants: keys('enemy.brute.attack'), bus: 'sfx', volume: 0.75, pitchVar: 4, maxVoices: 2, positional: true }),
  sound({ id: 'pickup.key', family: 'reward', variants: keys('pickup.key'), bus: 'sfx', volume: 0.7, maxVoices: 1 }),
  sound({ id: 'dungeon.unlock', family: 'reward', variants: keys('dungeon.unlock'), bus: 'sfx', volume: 0.75, maxVoices: 1, positional: true }),
  sound({ id: 'dungeon.chest', family: 'reward', variants: keys('dungeon.chest', 2), bus: 'sfx', volume: 0.7, maxVoices: 1, positional: true }),
  sound({ id: 'dungeon.upgrade', family: 'reward', variants: rarities('dungeon.upgrade'), keyed: true, bus: 'sfx', volume: 0.8, maxVoices: 1, priority: 'high' }),
  sound({ id: 'dungeon.reroll', family: 'ui', variants: keys('dungeon.reroll'), bus: 'sfx', volume: 0.5, maxVoices: 1 }),
  sound({ id: 'dungeon.pact', family: 'jingle', variants: keys('dungeon.pact'), bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'dungeon.curse', family: 'threat', variants: keys('dungeon.curse'), bus: 'sfx', volume: 0.8, maxVoices: 1, priority: 'high' }),
  sound({ id: 'dungeon.ward', family: 'reward', variants: keys('dungeon.ward'), bus: 'sfx', volume: 0.65, maxVoices: 1, priority: 'high' }),
  sound({ id: 'dungeon.trapdoor', family: 'reward', variants: keys('dungeon.trapdoor'), bus: 'sfx', volume: 0.75, maxVoices: 1, priority: 'high', positional: true }),
  sound({ id: 'jingle.floor', family: 'jingle', variants: keys('jingle.floor'), bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', duck: true }),
  // §6.6 Interface.
  sound({ id: 'ui.tap', family: 'ui', variants: ['ui_tap'], bus: 'ui', volume: 0.5, pitchVar: 3, maxVoices: 2, minInterval: 0.03, priority: 'low' }),
  sound({ id: 'ui.shop.open', family: 'ui', variants: wizards('ui.shop.open'), keyed: true, bus: 'ui', volume: 0.5, maxVoices: 1 }),
  sound({ id: 'ui.shop.close', family: 'ui', variants: wizards('ui.shop.close'), keyed: true, bus: 'ui', volume: 0.45, maxVoices: 1 }),
  sound({ id: 'ui.pause.open', family: 'ui', variants: keys('ui.pause.open'), bus: 'ui', volume: 0.5, maxVoices: 1 }),
  sound({ id: 'ui.pause.close', family: 'ui', variants: keys('ui.pause.close'), bus: 'ui', volume: 0.5, maxVoices: 1 }),
  sound({ id: 'ui.play', family: 'ui', variants: keys('ui.play'), bus: 'ui', volume: 0.7, maxVoices: 1 }),
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
