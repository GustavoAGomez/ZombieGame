import { AUDIO, type AudioBus } from '../config/audio';
import type { AudioDef } from '../game/assets/manifest';

/** How a voice plays: its bus, gain (0..1), playback rate (1 = as recorded) and pan (−1 left … 1 right). */
export interface PlayOptions {
  bus: AudioBus;
  gain: number;
  rate: number;
  pan: number;
  loop?: boolean;
}

/** A sound playing. */
export interface Voice {
  /** Fades it out over `fade` seconds and stops it. */
  stop(fade?: number): void;
}

/**
 * What the director needs from an audio engine (spec 08 §1). The real one
 * is Web Audio; the tests pass a fake one, like HapticFeedback's Vibrate.
 */
export interface AudioOutput {
  /** Creates the context (it may stay suspended until a gesture) and decodes every file of the manifest. */
  load(defs: Readonly<Record<string, AudioDef>>, baseUrl: string): void;
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
  /** In the background (app or tab hidden): no gesture may wake it until it comes back. */
  private hidden = false;
  private unlocked = false;

  get state(): string {
    if (!this.ctx) return contextClass() ? 'sin crear' : 'sin Web Audio';
    return this.hidden ? `${this.ctx.state} (en segundo plano)` : this.ctx.state;
  }

  load(defs: Readonly<Record<string, AudioDef>>, baseUrl: string): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    for (const [key, def] of Object.entries(defs)) {
      if (def.placeholder || this.buffers.has(key)) continue;
      void fetch(`${baseUrl}${def.file}`)
        .then((response) => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(`${response.status}`))))
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => this.buffers.set(key, buffer))
        .catch((err: unknown) => console.warn(`audio: no se pudo cargar ${key} (${def.file})`, err));
    }
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
    const gain = ctx.createGain();
    gain.gain.value = options.gain;
    source.connect(gain);
    let tail: AudioNode = gain;
    if (options.pan !== 0 && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
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
      node.connect(this.master);
      this.buses.set(bus, node);
    }
    return ctx;
  }
}
