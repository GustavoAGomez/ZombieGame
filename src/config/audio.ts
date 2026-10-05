/**
 * Every audio number and the sound catalog (spec 08 §1.1). The game never
 * holds a volume or a time of its own: it names a sound by its id and the
 * director (src/audio/AudioDirector.ts) looks it up here.
 */
import type { WeaponId } from './weapons';

/** Where a sound goes: the effects, the menus (it follows the effects' level) or the music. */
export type AudioBus = 'sfx' | 'ui' | 'music';

/** With the global limit full, the lowest priority (and oldest) voice is cut. */
export type AudioPriority = 'low' | 'normal' | 'high';

/** The four families of spec 08 §3.1, the banners and short melodies (§5.5), and the music. */
export type SoundFamily = 'hit' | 'reward' | 'threat' | 'ui' | 'jingle' | 'music';

/** A streak that raises a sound's pitch on each repetition (spec 08 §3.3). */
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
  /** Quieter and panned with its distance to the local player (spec 08 §3.4). */
  positional: boolean;
  ladder: LadderId | null;
  /** The music ducks while it plays. */
  duck: boolean;
  /** Plays over and over until the director stops it (the laser, the flamethrower, the heartbeat). */
  loop: boolean;
}

export const AUDIO = {
  /** Effect voices (effects and menus) at once; past it, the lowest priority voice is cut (spec 08 §3.4). */
  maxVoices: 12,
  /** The Web Audio context: low latency, for the reward to arrive within 50 ms of the action (§3.2). */
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
  /** Peak of every generated file, in dB (§4.2): the relative volume is the catalog's. */
  peakDb: -1,
  /** The local player (spec 08 §1.3): what only they hear (their reloads, their wounds). */
  localPlayerId: 0,
  /** A loop's start and tail (the flamethrower's roar), seconds. */
  loopFadeIn: 0.06,
  loopFadeOut: 0.2,
  /** The laser's hum at full heat, as a playback rate: a fifth up, so its rise says how near it is to overheating (§5.1). */
  laserHotRate: 1.5,
  /** Steps of a streak, semitones over the base note (§3.3): the scale's degrees; past the last it stays there. */
  ladderSteps: [0, 3, 5, 7, 10, 12, 15, 17] as const,
  /** Seconds without a repetition that take a streak back to its first step (§3.3); `upgrade` goes by level. */
  ladderWindows: { kill: 1.5, repair: 2 },
  /** The two notes of a room unlocked, after the door's bolt (§5.2), seconds. */
  zoneFanfareDelay: 0.3,
  /** The boss's longest melody, after its collapse (§5.4), seconds. */
  bossDeadJingleDelay: 1.2,
  /** The game over melody, once the death has sounded (§7: the music fades out in 1 s), seconds. */
  gameOverJingleDelay: 1,
  /** SIMULAR RACHA in the sound test (§8): kills in a row and the time between them, seconds. */
  testStreak: { kills: 8, every: 0.25 },
  /**
   * Positional sounds (§3.4): full volume within `near` px of the local
   * player, falling in a straight line to `farGain` at `far` px (and staying
   * there), panned with the horizontal distance up to `maxPan`.
   */
  positional: { near: 160, far: 480, farGain: 0.25, maxPan: 0.7 },
  /** What sounds even on another level than the local player's (§3.4): the boss's warning. The banners are not positional. */
  everyLevel: ['boss.warning'] as readonly string[],
  /** Zombies within this of the local player groan (§5.4), px; one groan every groanEvery s (min, max), never two at once. */
  groanRange: 320,
  groanEvery: [2, 5] as const,
  /** The heartbeat of low health lasts this long, once per fall into low health (§3.4), seconds. */
  heartbeatSeconds: 5,
  /** The boss's warning whistle falls to this playback rate along the warning (an octave down). */
  warningEndRate: 0.5,
} as const;

/** The sound of each weapon's shot or sweep (spec 08 §5.1); the beam and the jet are loops. */
export const WEAPON_FIRE_SOUND: Readonly<Partial<Record<WeaponId, string>>> = {
  pistol: 'weapon.pistol.fire',
  smg: 'weapon.smg.fire',
  shotgun: 'weapon.shotgun.fire',
  katana: 'weapon.katana.swing',
};

/** The sound generator (npm run audio:gen, spec 08 §4): its format, finish and report. */
export const AUDIO_GEN = {
  /** WAV mono, 44.1 kHz, 16 bits: decoded the same on iOS and Android (§2). */
  sampleRate: 44100,
  /** Peak of every file, in dB (§4.2). */
  peakDb: AUDIO.peakDb,
  /** Fade at the end so it never clicks when cut (§4.2), seconds. */
  fadeOut: 0.005,
  /** The sound starts within this, seconds (§4.2). */
  maxLeadingSilence: 0.005,
  /** Under this (dB under the peak) a sample counts as silence when trimming and measuring. */
  silenceDb: -50,
  /** Frequent sounds lose what is above this (§3.2 rule 4), Hz. */
  lowpass: 8000,
  /** The one scale of every note (§3.2 rule 1): A minor pentatonic. */
  scale: ['A', 'C', 'D', 'E', 'G'] as const,
  /** Each family's length range, seconds (§3.1; the banners up to 2 s, §5.5). The music has none. */
  familyDurations: { hit: [0.06, 0.25], reward: [0.08, 0.6], threat: [0.15, 1], ui: [0.03, 0.12], jingle: [0.3, 2] } satisfies Record<
    Exclude<SoundFamily, 'music'>,
    readonly [number, number]
  >,
  /** Report: samples at full scale in a row that count as clipping. */
  clipRun: 3,
  /** Report: two variants whose length, brightness and loudness differ less than this are «almost identical». */
  similar: { duration: 0.02, brightness: 0.02, loudnessDb: 0.3 },
  /** Report: the brightness analysis window (samples, a power of 2). */
  fftSize: 1024,
  /** Every generated effect together under this, bytes (§2 said 2 MB; raised by the user to keep 44.1 kHz, docs/DECISIONS.md). */
  budgetBytes: 3.5 * 1024 * 1024,
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
  loop: false,
} as const satisfies Partial<SoundDef>;

function sound(def: Pick<SoundDef, 'id' | 'family' | 'variants' | 'bus' | 'volume'> & Partial<SoundDef>): SoundDef {
  return { ...BASE, ...def };
}

/** The catalog (spec 08 §5): one entry per sound id. */
export const SOUNDS: readonly SoundDef[] = [
  // §5.1 Weapons and the player. The families follow §3.1 (warnings, wounds and death are threats).
  sound({ id: 'weapon.pistol.fire', family: 'hit', variants: ['weapon_pistol_fire_1', 'weapon_pistol_fire_2'], bus: 'sfx', volume: 0.75, pitchVar: 4, maxVoices: 4, minInterval: 0.03 }),
  sound({ id: 'weapon.smg.fire', family: 'hit', variants: ['weapon_smg_fire_1', 'weapon_smg_fire_2', 'weapon_smg_fire_3'], bus: 'sfx', volume: 0.45, pitchVar: 5, maxVoices: 4, minInterval: 0.04, priority: 'low' }),
  sound({ id: 'weapon.shotgun.fire', family: 'hit', variants: ['weapon_shotgun_fire'], bus: 'sfx', volume: 0.95, pitchVar: 3, maxVoices: 2, priority: 'high' }),
  sound({ id: 'weapon.katana.swing', family: 'hit', variants: ['weapon_katana_swing_1', 'weapon_katana_swing_2'], bus: 'sfx', volume: 0.6, pitchVar: 6 }),
  sound({ id: 'weapon.katana.hit', family: 'hit', variants: ['weapon_katana_hit'], bus: 'sfx', volume: 0.55, pitchVar: 4, maxVoices: 3, minInterval: 0.05 }),
  sound({ id: 'weapon.laser.loop', family: 'hit', variants: ['weapon_laser_loop'], bus: 'sfx', volume: 0.4, maxVoices: 1, priority: 'high', loop: true }),
  sound({ id: 'weapon.laser.overheat', family: 'threat', variants: ['weapon_laser_overheat'], bus: 'sfx', volume: 0.7, maxVoices: 1, priority: 'high' }),
  sound({ id: 'weapon.flame.loop', family: 'hit', variants: ['weapon_flame_loop'], bus: 'sfx', volume: 0.5, maxVoices: 1, priority: 'high', loop: true }),
  sound({ id: 'weapon.flame.blast', family: 'hit', variants: ['weapon_flame_blast'], bus: 'sfx', volume: 0.7, pitchVar: 6, maxVoices: 3, minInterval: 0.05, positional: true }),
  sound({ id: 'weapon.knife', family: 'hit', variants: ['weapon_knife_1', 'weapon_knife_2'], bus: 'sfx', volume: 0.55, pitchVar: 6 }),
  sound({ id: 'weapon.reload.start', family: 'hit', variants: ['weapon_reload_start'], bus: 'sfx', volume: 0.5, maxVoices: 1 }),
  sound({ id: 'weapon.reload.end', family: 'hit', variants: ['weapon_reload_end'], bus: 'sfx', volume: 0.55, maxVoices: 1 }),
  sound({ id: 'weapon.empty', family: 'hit', variants: ['weapon_empty'], bus: 'sfx', volume: 0.5, maxVoices: 1, minInterval: 0.1 }),
  sound({ id: 'weapon.switch', family: 'hit', variants: ['weapon_switch'], bus: 'sfx', volume: 0.45, maxVoices: 1 }),
  sound({ id: 'weapon.broken', family: 'threat', variants: ['weapon_broken'], bus: 'sfx', volume: 0.75, maxVoices: 1, priority: 'high' }),
  sound({ id: 'impact.flesh', family: 'hit', variants: ['impact_flesh_1', 'impact_flesh_2', 'impact_flesh_3'], bus: 'sfx', volume: 0.5, pitchVar: 8, maxVoices: 4, minInterval: 0.04, priority: 'low', positional: true }),
  sound({ id: 'player.dash', family: 'hit', variants: ['player_dash'], bus: 'sfx', volume: 0.55, pitchVar: 4, maxVoices: 1 }),
  sound({ id: 'player.hurt', family: 'threat', variants: ['player_hurt'], bus: 'sfx', volume: 0.8, pitchVar: 4, maxVoices: 1, minInterval: 0.15, priority: 'high' }),
  sound({ id: 'player.death', family: 'threat', variants: ['player_death'], bus: 'sfx', volume: 0.9, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'player.heartbeat', family: 'threat', variants: ['player_heartbeat'], bus: 'sfx', volume: 0.7, maxVoices: 1, priority: 'high', loop: true }),
  // §5.2 Rewards: tonal, bright, in the scale, ending up. The streaks go without a random pitch, to stay in tune.
  sound({ id: 'reward.hit', family: 'reward', variants: ['reward_hit'], bus: 'sfx', volume: 0.3, pitchVar: 3, maxVoices: 3, minInterval: 0.04, priority: 'low' }),
  sound({ id: 'reward.kill', family: 'reward', variants: ['reward_kill'], bus: 'sfx', volume: 0.6, maxVoices: 3, minInterval: 0.03, ladder: 'kill' }),
  sound({ id: 'reward.repair', family: 'reward', variants: ['reward_repair'], bus: 'sfx', volume: 0.6, ladder: 'repair' }),
  sound({ id: 'pickup.ammo', family: 'reward', variants: ['pickup_ammo'], bus: 'sfx', volume: 0.7 }),
  sound({ id: 'pickup.health', family: 'reward', variants: ['pickup_health'], bus: 'sfx', volume: 0.7 }),
  sound({ id: 'pickup.item', family: 'reward', variants: ['pickup_item'], bus: 'sfx', volume: 0.75, priority: 'high' }),
  sound({ id: 'buy.cash', family: 'reward', variants: ['buy_cash'], bus: 'sfx', volume: 0.6 }),
  sound({ id: 'buy.door', family: 'reward', variants: ['buy_door'], bus: 'sfx', volume: 0.8, priority: 'high', positional: true }),
  sound({ id: 'buy.zone', family: 'reward', variants: ['buy_zone'], bus: 'sfx', volume: 0.7, priority: 'high' }),
  sound({ id: 'buy.weapon', family: 'reward', variants: ['buy_weapon'], bus: 'sfx', volume: 0.75, priority: 'high' }),
  sound({ id: 'buy.merchant', family: 'reward', variants: ['buy_merchant'], bus: 'sfx', volume: 0.7 }),
  sound({ id: 'buy.upgrade', family: 'reward', variants: ['buy_upgrade'], bus: 'sfx', volume: 0.75, priority: 'high', ladder: 'upgrade' }),
  sound({ id: 'buy.special', family: 'reward', variants: ['buy_special'], bus: 'sfx', volume: 0.8, priority: 'high' }),
  sound({ id: 'boost.on', family: 'reward', variants: ['boost_on'], bus: 'sfx', volume: 0.7 }),
  sound({ id: 'denied', family: 'ui', variants: ['denied'], bus: 'sfx', volume: 0.55, maxVoices: 1, minInterval: 0.15 }),
  // The same two notes as `denied`, quieter.
  sound({ id: 'item.cantUse', family: 'ui', variants: ['denied'], bus: 'sfx', volume: 0.35, maxVoices: 1, minInterval: 0.15 }),
  sound({ id: 'item.splash', family: 'reward', variants: ['item_splash'], bus: 'sfx', volume: 0.7, positional: true }),
  sound({ id: 'ritual.done', family: 'jingle', variants: ['ritual_done'], bus: 'sfx', volume: 0.9, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'merchant.arrive', family: 'reward', variants: ['merchant_arrive'], bus: 'sfx', volume: 0.7 }),
  // §5.3 The Demon's Hand.
  sound({ id: 'hand.pay.money', family: 'reward', variants: ['hand_pay_money'], bus: 'sfx', volume: 0.7, maxVoices: 1 }),
  sound({ id: 'hand.pay.blood', family: 'threat', variants: ['hand_pay_blood'], bus: 'sfx', volume: 0.8, maxVoices: 1 }),
  sound({ id: 'hand.roll', family: 'jingle', variants: ['hand_roll'], bus: 'sfx', volume: 0.55, maxVoices: 1, priority: 'high' }),
  sound({ id: 'hand.offer', family: 'reward', variants: ['hand_offer'], bus: 'sfx', volume: 0.7, maxVoices: 1, priority: 'high' }),
  sound({ id: 'hand.offer.special', family: 'reward', variants: ['hand_offer_special'], bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'hand.taken', family: 'reward', variants: ['hand_taken'], bus: 'sfx', volume: 0.7, maxVoices: 1 }),
  sound({ id: 'hand.refund', family: 'threat', variants: ['hand_refund'], bus: 'sfx', volume: 0.75, maxVoices: 1 }),
  sound({ id: 'hand.moved', family: 'threat', variants: ['hand_moved'], bus: 'sfx', volume: 0.6, maxVoices: 1 }),
  // §5.5 Banners and short melodies: on the effects bus, so they sound with the music off.
  sound({ id: 'jingle.round.start', family: 'jingle', variants: ['jingle_round_start'], bus: 'sfx', volume: 0.75, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'jingle.round.boss', family: 'jingle', variants: ['jingle_round_boss'], bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'jingle.round.clear', family: 'jingle', variants: ['jingle_round_clear'], bus: 'sfx', volume: 0.8, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'jingle.boss.dead', family: 'jingle', variants: ['jingle_boss_dead'], bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', duck: true }),
  sound({ id: 'jingle.gameover', family: 'jingle', variants: ['jingle_gameover'], bus: 'sfx', volume: 0.8, maxVoices: 1, priority: 'high', duck: true }),
  // §5.4 Threats: low and rough, not frequent. All of them where they happen.
  sound({ id: 'zombie.groan', family: 'threat', variants: ['zombie_groan_1', 'zombie_groan_2', 'zombie_groan_3', 'zombie_groan_4'], bus: 'sfx', volume: 0.35, pitchVar: 6, maxVoices: 1, priority: 'low', positional: true }),
  sound({ id: 'zombie.attack', family: 'threat', variants: ['zombie_attack'], bus: 'sfx', volume: 0.6, pitchVar: 8, maxVoices: 3, minInterval: 0.1, positional: true }),
  sound({ id: 'zombie.crawl', family: 'threat', variants: ['zombie_crawl'], bus: 'sfx', volume: 0.5, pitchVar: 8, maxVoices: 2, minInterval: 0.1, positional: true }),
  sound({ id: 'barricade.break', family: 'threat', variants: ['barricade_break'], bus: 'sfx', volume: 0.7, pitchVar: 6, maxVoices: 3, minInterval: 0.06, positional: true }),
  sound({ id: 'boss.warning', family: 'threat', variants: ['boss_warning'], bus: 'sfx', volume: 0.75, maxVoices: 2, priority: 'high', positional: true, duck: true, loop: true }),
  sound({ id: 'boss.landed', family: 'threat', variants: ['boss_landed'], bus: 'sfx', volume: 1, maxVoices: 2, priority: 'high', positional: true }),
  sound({ id: 'boss.roar', family: 'threat', variants: ['boss_roar'], bus: 'sfx', volume: 0.9, pitchVar: 4, maxVoices: 1, priority: 'high', positional: true, duck: true }),
  sound({ id: 'boss.windup.charge', family: 'threat', variants: ['boss_windup_charge'], bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', positional: true }),
  sound({ id: 'boss.windup.slam', family: 'threat', variants: ['boss_windup_slam'], bus: 'sfx', volume: 0.8, maxVoices: 1, priority: 'high', positional: true }),
  sound({ id: 'boss.windup.leap', family: 'threat', variants: ['boss_windup_leap'], bus: 'sfx', volume: 0.85, maxVoices: 1, priority: 'high', positional: true }),
  sound({ id: 'boss.charge.loop', family: 'threat', variants: ['boss_charge_loop'], bus: 'sfx', volume: 0.8, maxVoices: 1, priority: 'high', positional: true, loop: true }),
  sound({ id: 'boss.slam', family: 'threat', variants: ['boss_slam'], bus: 'sfx', volume: 0.95, pitchVar: 3, maxVoices: 2, priority: 'high', positional: true }),
  sound({ id: 'boss.stunned', family: 'threat', variants: ['boss_stunned'], bus: 'sfx', volume: 0.9, maxVoices: 1, priority: 'high', positional: true }),
  // The «dizzy» arpeggio after the crash, while it lasts: the moment to hit it.
  sound({ id: 'boss.stunned.loop', family: 'threat', variants: ['boss_stunned_loop'], bus: 'sfx', volume: 0.55, maxVoices: 1, priority: 'high', positional: true, loop: true }),
  sound({ id: 'boss.killed', family: 'threat', variants: ['boss_killed'], bus: 'sfx', volume: 1, maxVoices: 1, priority: 'high', positional: true }),
  // §5.6 Interface.
  sound({ id: 'ui.tap', family: 'ui', variants: ['ui_tap'], bus: 'ui', volume: 0.5, pitchVar: 3, maxVoices: 2, minInterval: 0.03, priority: 'low' }),
  sound({ id: 'ui.shop.open', family: 'ui', variants: ['ui_shop_open'], bus: 'ui', volume: 0.5, maxVoices: 1 }),
  sound({ id: 'ui.shop.close', family: 'ui', variants: ['ui_shop_close'], bus: 'ui', volume: 0.45, maxVoices: 1 }),
  sound({ id: 'ui.pause.open', family: 'ui', variants: ['ui_pause_open'], bus: 'ui', volume: 0.5, maxVoices: 1 }),
  sound({ id: 'ui.pause.close', family: 'ui', variants: ['ui_pause_close'], bus: 'ui', volume: 0.5, maxVoices: 1 }),
  sound({ id: 'ui.play', family: 'ui', variants: ['ui_play'], bus: 'ui', volume: 0.7, maxVoices: 1 }),
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
