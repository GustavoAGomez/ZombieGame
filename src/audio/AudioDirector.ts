import { AUDIO, SOUNDS, WEAPON_FIRE_SOUND, type AudioPriority, type LadderId, type SoundDef, type VolumeLevel } from '../config/audio';
import { HAND, ITEMS } from '../config/balance';
import type { EventBus } from '../core/EventBus';
import type { AudioDef } from '../game/assets/manifest';
import type { AudioOutput, Voice } from './AudioEngine';

/** A weapon that sounds for as long as it fires (spec 08 §5.1): a loop. */
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
  load(defs: Readonly<Record<string, AudioDef>>, baseUrl: string): void;
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
  /** Plays a sound with its streak; a loop starts, and stops on the next test of it. */
  test(id: string): void;
  /** SIMULAR RACHA (§8): kills in a row, to hear the streak rise. */
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
}

interface PlayRequest {
  /** Playback rate before the pitch variation (a loop's own). */
  rate?: number;
  /** Seconds from now until it starts. */
  delay?: number;
  /** The upgrade level bought (1, 2, 3): the step of the `upgrade` streak. */
  level?: number;
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
  /** Runs `run` in `seconds` (SIMULAR RACHA). */
  schedule?: (run: () => void, seconds: number) => void;
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
  private readonly voices: ActiveVoice[] = [];
  /** The loops playing, by sound id. */
  private readonly loops = new Map<string, ActiveVoice>();
  private readonly lastPlay = new Map<string, number>();
  private readonly lastVariant = new Map<string, number>();
  private durations: Readonly<Record<string, number>> = {};
  private paused = false;
  /** The continuous weapon whose loop is playing. */
  private firing: ContinuousWeapon | null = null;
  /** Each time streak's step and when it last rose (§3.3). */
  private readonly streaks = new Map<LadderId, { step: number; at: number }>();
  /** The local player's shop panel is open (its open and close sounds). */
  private shopOpen = false;
  /** The sound test's upgrade level, 1 → 2 → 3 → 1. */
  private testLevel = 0;
  private readonly schedule: (run: () => void, seconds: number) => void;
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
    this.schedule = options.schedule ?? ((run, seconds) => void setTimeout(run, seconds * 1000));
    settings.onChange(() => this.applyLevels());
    this.applyLevels();
    if (events) this.listen(events);
  }

  load(defs: Readonly<Record<string, AudioDef>>, baseUrl: string): void {
    const durations: Record<string, number> = {};
    for (const [key, def] of Object.entries(defs)) if (!def.placeholder) durations[key] = def.duration;
    this.durations = durations;
    this.engine.load(defs, baseUrl);
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
      if (firing) this.startLoop(CONTINUOUS_LOOP[firing], this.laserRate(firing, snapshot.heat));
      this.firing = firing;
    } else if (firing) {
      this.loops.get(CONTINUOUS_LOOP[firing])?.voice.setRate(this.laserRate(firing, snapshot.heat));
    }
  }

  test(id: string): void {
    const def = this.byId.get(id);
    if (def?.loop && this.loops.has(id)) this.stopLoop(id, AUDIO.loopFadeOut);
    else if (def?.loop) this.startLoop(id, 1);
    else if (def?.ladder === 'upgrade') this.play(id, { level: (this.testLevel = (this.testLevel % 3) + 1) });
    else this.play(id);
  }

  simulateStreak(): void {
    const { kills, every } = AUDIO.testStreak;
    for (let i = 0; i < kills; i++) this.schedule(() => this.play('reward.kill'), i * every);
  }

  stats(): AudioStats {
    this.prune(this.clock());
    return { voices: this.voices.filter((v) => v.bus !== 'music').length, dropped: this.dropped, lastDropped: this.lastDropped, state: this.engine.state };
  }

  /** The events of spec 08 §5.1: the local player's own sounds, and the hits anyone makes. */
  private listen(events: EventBus): void {
    const local = (playerId: number): boolean => playerId === AUDIO.localPlayerId;
    const mine = (playerId: number, id: string): void => {
      if (local(playerId)) this.play(id);
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

    // §5.2 Rewards: the local player's.
    events.on('points:gained', (e) => {
      if (e.reason === 'hit') mine(e.playerId, 'reward.hit');
      else if (e.reason === 'kill') mine(e.playerId, 'reward.kill');
    });
    events.on('barricade:repaired', (e) => mine(e.playerId, 'reward.repair'));
    events.on('pickup:collected', (e) => mine(e.playerId, e.kind === 'ammo' ? 'pickup.ammo' : 'pickup.health'));
    events.on('item:picked', (e) => mine(e.playerId, 'pickup.item'));
    // The till for the shops and the weapon cases; the hand has its own coins falling into the fire.
    events.on('money:spent', (e) => {
      if (e.source !== 'hand') mine(e.playerId, 'buy.cash');
    });
    events.on('door:opened', () => this.play('buy.door'));
    events.on('portal:opened', () => this.play('buy.door'));
    events.on('zone:unlocked', () => this.play('buy.zone', { delay: AUDIO.zoneFanfareDelay }));
    events.on('weaponCase:purchase', (e) => mine(e.playerId, 'buy.weapon'));
    events.on('merchant:purchase', (e) => {
      if (!local(e.playerId)) return;
      if (e.item.startsWith('upgrade_')) this.play('buy.upgrade', { level: e.level ?? 1 });
      else this.play(e.item === 'weapon_special' ? 'buy.special' : 'buy.merchant');
    });
    events.on('boost:activated', (e) => mine(e.playerId, 'boost.on'));
    events.on('action:denied', (e) => mine(e.playerId, 'denied'));
    events.on('item:cantUse', (e) => mine(e.playerId, 'item.cantUse'));
    // The splash where the item lands, ITEMS.throwTime after the throw.
    events.on('item:thrown', () => this.play('item.splash', { delay: ITEMS.throwTime }));
    events.on('activation:completed', () => this.play('ritual.done'));
    // Merchants that only change spot do not sound: they would come with the round's banner.
    events.on('merchant:moved', (e) => {
      if (e.first) this.play('merchant.arrive');
    });

    // §5.3 The Demon's Hand: its draw ticks while it rolls, after the fist has risen.
    events.on('hand:paid', (e) => {
      this.play(e.blood ? 'hand.pay.blood' : 'hand.pay.money');
      if (!e.mock) this.play('hand.roll', { delay: HAND.risingTime });
    });
    events.on('hand:offer', (e) => this.play(e.special ? 'hand.offer.special' : 'hand.offer'));
    events.on('hand:taken', () => this.play('hand.taken'));
    events.on('hand:refunded', () => this.play('hand.refund'));
    events.on('hand:moved', () => this.play('hand.moved'));

    // §5.5 Banners and short melodies.
    events.on('round:changed', (e) => this.play(e.boss ? 'jingle.round.boss' : 'jingle.round.start'));
    events.on('round:cleared', () => this.play('jingle.round.clear'));
    events.on('boss:killed', () => this.play('jingle.boss.dead', { delay: AUDIO.bossDeadJingleDelay }));
    events.on('game:over', () => this.play('jingle.gameover', { delay: AUDIO.gameOverJingleDelay }));

    // §5.6 The shop panel opening and closing.
    events.on('shop:state', (e) => {
      const open = e.merchant !== null;
      if (open === this.shopOpen) return;
      this.shopOpen = open;
      this.play(open ? 'ui.shop.open' : 'ui.shop.close');
    });
  }

  /**
   * A streak's playback rate (§3.3): `kill` and `repair` rise a step with each
   * repetition inside their window and go back to the first after it;
   * `upgrade` takes the step of the level bought. Past the last step it stays.
   */
  private ladderRate(ladder: LadderId, now: number, level: number | undefined): number {
    const steps = AUDIO.ladderSteps;
    let step: number;
    if (ladder === 'upgrade') {
      step = Math.max(0, (level ?? 1) - 1);
    } else {
      const streak = this.streaks.get(ladder);
      step = streak && now - streak.at <= AUDIO.ladderWindows[ladder] ? streak.step + 1 : 0;
      step = Math.min(step, steps.length - 1);
      this.streaks.set(ladder, { step, at: now });
    }
    return 2 ** ((steps[Math.min(step, steps.length - 1)] ?? 0) / 12);
  }

  /** The laser's hum rises with its heat; anything else plays as recorded. */
  private laserRate(weapon: ContinuousWeapon, heat: number): number {
    return weapon === 'laser' ? 1 + (AUDIO.laserHotRate - 1) * Math.min(1, Math.max(0, heat)) : 1;
  }

  private startLoop(id: string, rate: number): void {
    if (this.loops.has(id)) return;
    const voice = this.play(id, { rate });
    if (voice) this.loops.set(id, voice);
  }

  private stopLoop(id: string, fade: number): void {
    const v = this.loops.get(id);
    if (!v) return;
    v.voice.stop(fade);
    this.loops.delete(id);
    this.voices.splice(this.voices.indexOf(v), 1);
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
    // The streak rises with every repetition, even one a limit drops.
    const ladder = def.ladder ? this.ladderRate(def.ladder, now, request.level) : 1;
    const last = this.lastPlay.get(id);
    if (last !== undefined && now - last < def.minInterval) return this.drop(id);
    if (this.voices.filter((v) => v.id === id).length >= def.maxVoices) return this.drop(id);
    if (def.bus !== 'music' && !this.makeRoom(def.priority)) return this.drop(id);
    const key = this.pickVariant(def);
    const duration = key === undefined ? undefined : this.durations[key];
    if (key === undefined || duration === undefined) return null;
    const rate = (request.rate ?? 1) * ladder * (1 + (this.random() * 2 - 1) * (def.pitchVar / 100));
    const delay = request.delay ?? 0;
    const voice = this.engine.play(key, {
      bus: def.bus,
      gain: def.volume,
      rate,
      pan: 0,
      loop: def.loop,
      ...(def.loop ? { fadeIn: AUDIO.loopFadeIn } : {}),
      ...(delay > 0 ? { delay } : {}),
    });
    this.lastPlay.set(id, now);
    if (!voice) return null;
    const active: ActiveVoice = { id, bus: def.bus, priority: def.priority, startedAt: now, endsAt: def.loop ? Infinity : now + delay + duration / rate, voice };
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

  private pickVariant(def: SoundDef): string | undefined {
    const count = def.variants.length;
    if (count <= 1) return def.variants[0];
    const previous = this.lastVariant.get(def.id);
    let i = Math.min(count - 1, Math.floor(this.random() * count));
    // Never the same one twice in a row: the next one instead.
    if (i === previous) i = (i + 1) % count;
    this.lastVariant.set(def.id, i);
    return def.variants[i];
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
