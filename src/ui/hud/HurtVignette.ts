import { HURT_VIGNETTE } from '../../config/balance';
import { fillNoiseFrame, hurtIntensity } from './hurt';

/** Below this opacity the noise is not worth animating. */
const NOISE_EPSILON = 0.01;

/**
 * Red frame around the screen (spec 01 §5): a fade with no-signal TV noise
 * that grows as health drops, and a single blink on each hit. The fade is a
 * CSS inset shadow; the noise, a small canvas scaled up pixelated whose
 * pre-drawn frames are cycled at HURT_VIGNETTE.noiseFps only while it shows.
 * The noise frames carry the edge mask in their alpha, so no CSS mask is needed.
 */
export class HurtVignette {
  readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  /** undefined until first needed: jsdom and some old WebViews have no 2D canvas. */
  private ctx: CanvasRenderingContext2D | null | undefined;
  private frames: ImageData[] = [];
  private frameIndex = 0;
  private framesDirty = true;
  private noise = 0;
  private flashUntil = 0;
  private lastFrameTime = -Infinity;
  private raf = 0;

  constructor() {
    this.root = document.createElement('div');
    this.root.className = 'hud-hurt';
    const fade = document.createElement('div');
    fade.className = 'hud-hurt__fade';
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'hud-hurt__noise';
    this.root.append(fade, this.canvas);
    const style = this.root.style;
    style.setProperty('--hurt-flash-fade', String(HURT_VIGNETTE.flashFade));
    style.setProperty('--hurt-flash-noise', String(HURT_VIGNETTE.flashNoise));
    style.setProperty('--hurt-flash-ms', `${HURT_VIGNETTE.flashDuration * 1000}ms`);
    this.setHealth(1, 1);
    window.addEventListener('resize', this.onResize);
  }

  setHealth(hp: number, maxHp: number): void {
    const intensity = hurtIntensity(hp, maxHp);
    this.noise = intensity * HURT_VIGNETTE.maxNoise;
    const style = this.root.style;
    style.setProperty('--hurt', intensity.toFixed(3));
    style.setProperty('--hurt-fade', (intensity * HURT_VIGNETTE.maxFade).toFixed(3));
    style.setProperty('--hurt-noise', this.noise.toFixed(3));
    this.ensureLoop();
  }

  /** The single blink of a hit: up at once, then back to the health's level. */
  flash(): void {
    this.root.classList.add('is-flashing');
    void this.root.offsetWidth;
    this.root.classList.remove('is-flashing');
    this.flashUntil = performance.now() + HURT_VIGNETTE.flashDuration * 1000;
    this.ensureLoop();
  }

  destroy(): void {
    window.removeEventListener('resize', this.onResize);
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.root.remove();
  }

  private readonly onResize = (): void => {
    this.framesDirty = true;
  };

  private noiseShows(now: number): boolean {
    return this.noise > NOISE_EPSILON || now < this.flashUntil;
  }

  private ensureLoop(): void {
    if (this.raf || !this.noiseShows(performance.now())) return;
    this.raf = requestAnimationFrame(this.tick);
  }

  private readonly tick = (now: number): void => {
    this.raf = 0;
    if (!this.noiseShows(now)) return;
    if (now - this.lastFrameTime >= 1000 / HURT_VIGNETTE.noiseFps) {
      this.lastFrameTime = now;
      this.drawNextFrame();
    }
    this.raf = requestAnimationFrame(this.tick);
  };

  private drawNextFrame(): void {
    if (this.ctx === undefined) this.ctx = this.canvas.getContext('2d');
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.framesDirty) this.buildFrames(ctx);
    const frame = this.frames[this.frameIndex];
    if (!frame) return;
    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
    ctx.putImageData(frame, 0, 0);
  }

  /** One noise pixel every noisePixel CSS px, for the current size of the screen. */
  private buildFrames(ctx: CanvasRenderingContext2D): void {
    this.framesDirty = false;
    const { noisePixel, noiseBand, noiseFrames } = HURT_VIGNETTE;
    const w = Math.max(1, Math.ceil(this.root.clientWidth / noisePixel));
    const h = Math.max(1, Math.ceil(this.root.clientHeight / noisePixel));
    this.canvas.width = w;
    this.canvas.height = h;
    this.frames = [];
    for (let i = 0; i < noiseFrames; i++) {
      const frame = ctx.createImageData(w, h);
      fillNoiseFrame(frame.data, w, h, noisePixel, noiseBand);
      this.frames.push(frame);
    }
    this.frameIndex = 0;
  }
}
