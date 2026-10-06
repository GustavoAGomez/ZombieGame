import { AUDIO, type AudioBus } from '../config/audio';
import type { AudioDef } from '../game/assets/manifest';

/** How a voice plays: its bus, gain (0..1), playback rate (1 = as recorded) and pan (−1 left … 1 right). */
export interface PlayOptions {
  bus: AudioBus;
  gain: number;
  rate: number;
  pan: number;
  loop?: boolean;
  /** Seconds to rise from silence (a loop's start). */
  fadeIn?: number;
  /** It may move while it plays (a boss's loop): its pan can change even from the centre. */
  positional?: boolean;
  /** A loop repeats between these seconds of its file (the music's measured loop, §7); the whole file otherwise. */
  loopStart?: number;
  loopEnd?: number;
}

/** A sound playing. */
export interface Voice {
  /** Fades it out over `fade` seconds and stops it. */
  stop(fade?: number): void;
  /** Changes its playback rate while it plays (the laser's hum rising with the heat). */
  setRate(rate: number): void;
  /** Moves it while it plays (a boss's loop following the boss): its gain and pan. */
  place(gain: number, pan: number): void;
}

/**
 * What the director needs from an audio engine (spec 08 §1). The real one
 * is Web Audio; the tests pass a fake one, like HapticFeedback's Vibrate.
 */
export interface AudioOutput {
  /**
   * Creates the context (it may stay suspended until a gesture) and decodes
   * every file of the manifest but the `lazy` ones (the music), which wait
   * for prepare().
   */
  load(defs: Readonly<Record<string, AudioDef>>, baseUrl: string, lazy?: ReadonlySet<string>): void;
  /**
   * Decodes these lazy files (the music) and frees every other lazy one, so
   * at most the current track and the next are in memory (§7). Resolves
   * when they are ready (or failed: silence).
   */
  prepare(keys: readonly string[]): Promise<void>;
  /** The music bus through a low-pass at `frequency` Hz, reached in `fade` s (low health, §3.5). */
  setMusicFilter(frequency: number, fade: number): void;
  /** Calls `listener` each time the context starts running (unlocked, back from the background). */
  whenRunning(listener: () => void): void;
  /** Inside a user gesture: lets the sound out (iOS and Android start muted). */
  unlock(): void;
  /** Plays the file of `key`; null when it is missing or not decoded yet (silence, not an error). */
  play(key: string, options: PlayOptions): Voice | null;
  /** Takes a bus to `gain` over `fade` seconds. */
  setBusGain(bus: AudioBus, gain: number, fade: number): void;
  /** For the sound test panel: the context's state. */
  readonly state: string;
}

type AudioContextClass = typeof AudioContext;

function contextClass(): AudioContextClass | null {
  const w = globalThis as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

const BUSES: readonly AudioBus[] = ['sfx', 'ui', 'music'];

/**
 * The Web Audio engine (spec 08 §1): three buses (effects, menus, music)
 * into a master bus with a limiter. It knows nothing of the game. Without
 * Web Audio (an old WebView, tests) it stays silent and never throws.
 */
export class WebAudioEngine implements AudioOutput {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buses = new Map<AudioBus, GainNode>();
  /** Gains asked for before the context existed. */
  private readonly pendingGains = new Map<AudioBus, number>();
  private readonly buffers = new Map<string, AudioBuffer>();
  /** The lazy files (the music): their urls, and the decodes under way. */
  private readonly lazyUrls = new Map<string, string>();
  private readonly decoding = new Map<string, Promise<void>>();
  /** The lazy files asked for by the last prepare(). */
  private wanted = new Set<string>();
  private musicFilter: BiquadFilterNode | null = null;
  private readonly runningListeners: (() => void)[] = [];
  /** In the background (app or tab hidden): no gesture may wake it until it comes back. */
  private hidden = false;
  private unlocked = false;

  get state(): string {
    if (!this.ctx) return contextClass() ? 'sin crear' : 'sin Web Audio';
    return this.hidden ? `${this.ctx.state} (en segundo plano)` : this.ctx.state;
  }

  load(defs: Readonly<Record<string, AudioDef>>, baseUrl: string, lazy: ReadonlySet<string> = new Set()): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    for (const [key, def] of Object.entries(defs)) {
      if (def.placeholder || this.buffers.has(key)) continue;
      if (lazy.has(key)) this.lazyUrls.set(key, `${baseUrl}${def.file}`);
      else void this.decode(ctx, key, `${baseUrl}${def.file}`);
    }
  }

  prepare(keys: readonly string[]): Promise<void> {
    const ctx = this.ctx;
    this.wanted = new Set(keys);
    // The music not asked for leaves memory: at most the current track and the next (§7).
    for (const key of this.lazyUrls.keys()) if (!this.wanted.has(key)) this.buffers.delete(key);
    if (!ctx) return Promise.resolve();
    const loads = keys.flatMap((key) => {
      const url = this.lazyUrls.get(key);
      if (!url || this.buffers.has(key)) return [];
      return [this.decoding.get(key) ?? this.decode(ctx, key, url)];
    });
    return Promise.all(loads).then(() => undefined);
  }

  setMusicFilter(frequency: number, fade: number): void {
    if (!this.ctx || !this.musicFilter) return;
    const t = this.ctx.currentTime;
    this.musicFilter.frequency.cancelScheduledValues(t);
    this.musicFilter.frequency.setTargetAtTime(frequency, t, Math.max(fade, 0.001) / 3);
  }

  whenRunning(listener: () => void): void {
    this.runningListeners.push(listener);
  }

  private decode(ctx: AudioContext, key: string, url: string): Promise<void> {
    const done = fetch(url)
      .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
      .then((data) => ctx.decodeAudioData(data))
      .then((buffer) => {
        // A lazy file no longer asked for by the time it decoded is not kept.
        if (!this.lazyUrls.has(key) || this.wanted.has(key)) this.buffers.set(key, buffer);
      })
      .catch((err: unknown) => console.warn(`audio: no se pudo cargar ${key} (${url})`, err))
      .finally(() => this.decoding.delete(key));
    this.decoding.set(key, done);
    return done;
  }

  unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx || this.hidden) return;
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    if (this.unlocked) return;
    // Older iOS only lets the sound out after something has played inside the gesture: one silent sample.
    const source = ctx.createBufferSource();
    source.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    source.connect(ctx.destination);
    source.start();
    this.unlocked = true;
  }

  /** The app or tab went to the background: everything stops. */
  suspend(): void {
    this.hidden = true;
    if (this.ctx && this.ctx.state === 'running') void this.ctx.suspend().catch(() => undefined);
  }

  /** It came back. On iOS the context may stay suspended: the next gesture's unlock() wakes it. */
  resume(): void {
    this.hidden = false;
    if (this.ctx && this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  play(key: string, options: PlayOptions): Voice | null {
    const ctx = this.ctx;
    const buffer = this.buffers.get(key);
    const bus = this.buses.get(options.bus);
    if (!ctx || !buffer || !bus || ctx.state !== 'running') return null;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = options.rate;
    source.loop = options.loop === true;
    if (source.loop && options.loopStart !== undefined && options.loopEnd !== undefined && options.loopEnd > options.loopStart) {
      source.loopStart = options.loopStart;
      source.loopEnd = options.loopEnd;
    }
    const gain = ctx.createGain();
    if (options.fadeIn) {
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(options.gain, ctx.currentTime + options.fadeIn);
    } else {
      gain.gain.value = options.gain;
    }
    source.connect(gain);
    let tail: AudioNode = gain;
    let panner: StereoPannerNode | null = null;
    if ((options.pan !== 0 || options.positional) && typeof ctx.createStereoPanner === 'function') {
      panner = ctx.createStereoPanner();
      panner.pan.value = options.pan;
      gain.connect(panner);
      tail = panner;
    }
    tail.connect(bus);
    source.start();
    let stopped = false;
    source.onended = () => {
      stopped = true;
      tail.disconnect();
    };
    return {
      stop: (fade = AUDIO.voiceFade) => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        gain.gain.setTargetAtTime(0, t, Math.max(fade, 0.001) / 3);
        source.stop(t + fade);
      },
      setRate: (rate) => {
        if (!stopped) source.playbackRate.setTargetAtTime(rate, ctx.currentTime, 0.02);
      },
      place: (g, pan) => {
        if (stopped) return;
        gain.gain.setTargetAtTime(g, ctx.currentTime, 0.05);
        panner?.pan.setTargetAtTime(pan, ctx.currentTime, 0.05);
      },
    };
  }

  setBusGain(bus: AudioBus, gain: number, fade: number): void {
    const node = this.buses.get(bus);
    if (!this.ctx || !node) {
      this.pendingGains.set(bus, gain);
      return;
    }
    const t = this.ctx.currentTime;
    node.gain.cancelScheduledValues(t);
    node.gain.setTargetAtTime(gain, t, Math.max(fade, 0.001) / 3);
  }

  private ensureContext(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctx = contextClass();
    if (!Ctx) return null;
    try {
      this.ctx = new Ctx({ latencyHint: AUDIO.latencyHint });
    } catch {
      return null;
    }
    const ctx = this.ctx;
    const limiter = ctx.createDynamicsCompressor();
    const c = AUDIO.compressor;
    limiter.threshold.value = c.threshold;
    limiter.knee.value = c.knee;
    limiter.ratio.value = c.ratio;
    limiter.attack.value = c.attack;
    limiter.release.value = c.release;
    limiter.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(limiter);
    for (const bus of BUSES) {
      const node = ctx.createGain();
      node.gain.value = this.pendingGains.get(bus) ?? 1;
      if (bus === 'music') {
        // The music through a low-pass, wide open until health is low (§3.5).
        this.musicFilter = ctx.createBiquadFilter();
        this.musicFilter.type = 'lowpass';
        this.musicFilter.frequency.value = AUDIO.music.openCutoff;
        node.connect(this.musicFilter);
        this.musicFilter.connect(this.master);
      } else {
        node.connect(this.master);
      }
      this.buses.set(bus, node);
    }
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'running') for (const listener of this.runningListeners) listener();
    });
    return ctx;
  }
}
