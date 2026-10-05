import { AUDIO, SOUNDS, WEAPON_FIRE_SOUND, type AudioPriority, type LadderId, type SoundDef, type VolumeLevel } from '../config/audio';
import { BOSS, HAND, ITEMS } from '../config/balance';
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
  /** Where the ear is: the local player, and its level (ground floor, basement, roof); −1: no match. */
  listenerX: number;
  listenerY: number;
  level: number;
  /** The local player's health is low (§3.4): the heartbeat. */
  lowHealth: boolean;
  /** Zombies within AUDIO.groanRange of the local player, and where the nearest is. */
  zombiesNear: number;
  zombieX: number;
  zombieY: number;
  /** The nearest boss charging or stunned, and where it is. */
  bossCharging: boolean;
  bossStunned: boolean;
  bossX: number;
  bossY: number;
}

/** No match: nothing fires, nothing is paused, nobody listens. */
export const QUIET_SNAPSHOT: Readonly<AudioSnapshot> = {
  paused: false,
  continuous: null,
  heat: 0,
  listenerX: 0,
  listenerY: 0,
  level: -1,
  lowHealth: false,
  zombiesNear: 0,
  zombieX: 0,
  zombieY: 0,
  bossCharging: false,
  bossStunned: false,
  bossX: 0,
  bossY: 0,
};

/** The level (ground floor, basement, roof) of a world point, or −1 outside every zone. */
export type LevelOf = (x: number, y: number) => number;

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
  /** The match's levels (§3.4: what happens on another level does not sound); null outside a match. */
  setWorld(levelOf: LevelOf | null): void;
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
  /** Where it happens: a positional sound is quieter and panned with its distance, and silent on another level. */
  at?: { x: number; y: number };
  /** Another player's own sound (their shot): placed where they are although its sound is not positional. */
  remote?: boolean;
}

const RANK: Readonly<Record<AudioPriority, number>> = { low: 0, normal: 1, high: 2 };

/** The loop of each continuous weapon. */
const CONTINUOUS_LOOP: Readonly<Record<ContinuousWeapon, string>> = { laser: 'weapon.laser.loop', flamethrower: 'weapon.flame.loop' };

/** Loops that last a set time: the boss's warning whistle (falling an octave along it) and the heartbeat of low health. */
const TIMED_LOOPS: Readonly<Record<string, { seconds: number; endRate: number }>> = {
  'boss.warning': { seconds: BOSS.warningTime, endRate: AUDIO.warningEndRate },
  'player.heartbeat': { seconds: AUDIO.heartbeatSeconds, endRate: 1 },
};

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
  /** The ear: the local player's position and level (−1: no match, nothing is placed). */
  private listenerX = 0;
  private listenerY = 0;
  private level = -1;
  private levelOf: LevelOf | null = null;
  /** When each timed loop stops. */
  private readonly loopUntil = new Map<string, number>();
  /** The next groan of the zombies near (§5.4). */
  private nextGroanAt = 0;
  private lowHealth = false;
  private bossCharging = false;
  private bossStunned = false;

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

  setWorld(levelOf: LevelOf | null): void {
    this.levelOf = levelOf;
  }

  update(snapshot: Readonly<AudioSnapshot>): void {
    if (snapshot.paused !== this.paused) {
      this.paused = snapshot.paused;
      if (this.paused) this.stopBus('sfx');
      this.applyLevels();
    }
    this.listenerX = snapshot.listenerX;
    this.listenerY = snapshot.listenerY;
    this.level = snapshot.level;
    const now = this.clock();
    for (const [id, until] of this.loopUntil) if (now >= until) this.stopLoop(id, AUDIO.loopFadeOut);
    this.updateThreats(snapshot, now);
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
    if (TIMED_LOOPS[id]) this.timedLoop(id);
    else if (def?.loop && this.loops.has(id)) this.stopLoop(id, AUDIO.loopFadeOut);
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
    // Another player's shot sounds where they are (§3.4).
    events.on('weapon:fired', (e) => {
      const id = WEAPON_FIRE_SOUND[e.weapon];
      if (id && !local(e.playerId)) this.play(id, { at: e, remote: true });
    });
    events.on('zombie:hit', (e) => this.play(e.weapon === 'katana' ? 'weapon.katana.hit' : 'impact.flesh', { at: e }));
    events.on('fire:blast', (e) => this.play('weapon.flame.blast', { at: e }));

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
    events.on('door:opened', (e) => this.play('buy.door', { at: e }));
    events.on('portal:opened', (e) => this.play('buy.door', { at: e }));
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
    events.on('item:thrown', (e) => this.play('item.splash', { delay: ITEMS.throwTime, at: { x: e.toX, y: e.toY } }));
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

    // §5.4 Threats, where they happen. The three windups must tell apart blind: no zone is drawn on the floor.
    events.on('zombie:attack', (e) => this.play('zombie.attack', { at: e }));
    events.on('zombie:crippled', (e) => this.play('zombie.crawl', { at: e }));
    events.on('barricade:plankBroken', (e) => this.play('barricade.break', { at: e }));
    events.on('boss:warning', (e) => this.timedLoop('boss.warning', e));
    events.on('boss:landed', (e) => this.play('boss.landed', { at: e }));
    events.on('boss:roar', (e) => this.play('boss.roar', { at: e }));
    events.on('boss:windup', (e) => this.play(`boss.windup.${e.attack}`, { at: e }));
    events.on('boss:slam', (e) => this.play('boss.slam', { at: e }));
    events.on('boss:stunned', (e) => this.play('boss.stunned', { at: e }));
    events.on('boss:killed', (e) => this.play('boss.killed', { at: e }));

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

  private startLoop(id: string, rate: number, at?: { x: number; y: number }): ActiveVoice | undefined {
    if (this.loops.has(id)) return this.loops.get(id);
    const voice = this.play(id, at ? { rate, at } : { rate });
    if (voice) this.loops.set(id, voice);
    return voice ?? undefined;
  }

  private stopLoop(id: string, fade: number): void {
    this.loopUntil.delete(id);
    const v = this.loops.get(id);
    if (!v) return;
    v.voice.stop(fade);
    this.loops.delete(id);
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
  }

  /** A loop for its set time (TIMED_LOOPS): its rate ramps to its end rate along it, and it stops. */
  private timedLoop(id: string, at?: { x: number; y: number }): void {
    const timed = TIMED_LOOPS[id];
    if (!timed) return;
    this.stopLoop(id, AUDIO.voiceFade);
    const v = this.startLoop(id, 1, at);
    if (!v) return;
    if (timed.endRate !== 1) v.voice.rampRate(timed.endRate, timed.seconds);
    this.loopUntil.set(id, this.clock() + timed.seconds);
  }

  /**
   * The threats that come from the snapshot (§5.4, §3.4): the groans of the
   * zombies near, the heartbeat when health falls low (once per fall), and
   * the boss's charge and dizziness loops, following it.
   */
  private updateThreats(s: Readonly<AudioSnapshot>, now: number): void {
    if (s.zombiesNear > 0 && now >= this.nextGroanAt) {
      const [min, max] = AUDIO.groanEvery;
      this.nextGroanAt = now + min + this.random() * (max - min);
      this.play('zombie.groan', { at: { x: s.zombieX, y: s.zombieY } });
    }
    // Once per fall into low health: a pause stops it (it stops every effect) and it does not come back.
    const low = s.lowHealth;
    if (low !== this.lowHealth) {
      if (low) this.timedLoop('player.heartbeat');
      else this.stopLoop('player.heartbeat', AUDIO.loopFadeOut);
      this.lowHealth = low;
    }
    this.bossCharging = this.followLoop('boss.charge.loop', s.bossCharging && !s.paused, this.bossCharging, s.bossX, s.bossY);
    this.bossStunned = this.followLoop('boss.stunned.loop', s.bossStunned && !s.paused, this.bossStunned, s.bossX, s.bossY);
  }

  /** A loop that plays while `on` and follows (x, y): its volume and pan as it moves. Returns `on`. */
  private followLoop(id: string, on: boolean, was: boolean, x: number, y: number): boolean {
    if (on && !was) this.startLoop(id, 1, { x, y });
    else if (!on && was) this.stopLoop(id, AUDIO.loopFadeOut);
    const v = on ? this.loops.get(id) : undefined;
    const def = this.byId.get(id);
    if (v && def) {
      const place = this.placement(x, y);
      v.voice.setGain(def.volume * place.gain);
      v.voice.setPan(place.pan);
    }
    return on;
  }

  /**
   * How a sound at (x, y) reaches the ear (§3.4): full within
   * AUDIO.positional.near px, falling in a straight line to farGain at far
   * px (and no lower), panned by the horizontal distance up to maxPan.
   */
  private placement(x: number, y: number): { gain: number; pan: number } {
    if (this.level < 0) return { gain: 1, pan: 0 };
    const { near, far, farGain, maxPan } = AUDIO.positional;
    const dx = x - this.listenerX;
    const d = Math.hypot(dx, y - this.listenerY);
    const t = Math.min(1, Math.max(0, (d - near) / (far - near)));
    return { gain: 1 - (1 - farGain) * t, pan: Math.max(-1, Math.min(1, dx / far)) * maxPan };
  }

  /** Whether a sound at (x, y) is on another level than the ear (§3.4); the boss's warning sounds anyway. */
  private elsewhere(id: string, x: number, y: number): boolean {
    if (this.level < 0 || !this.levelOf || AUDIO.everyLevel.includes(id)) return false;
    const level = this.levelOf(x, y);
    return level >= 0 && level !== this.level;
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
    const at = request.at && (def.positional || request.remote) ? request.at : undefined;
    if (at && this.elsewhere(id, at.x, at.y)) return null;
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
    const place = at ? this.placement(at.x, at.y) : { gain: 1, pan: 0 };
    const voice = this.engine.play(key, {
      bus: def.bus,
      gain: def.volume * place.gain,
      rate,
      pan: place.pan,
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
      if (this.loops.get(v.id) === v) {
        this.loops.delete(v.id);
        this.loopUntil.delete(v.id);
      }
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
