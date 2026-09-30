/**
 * Fixed-timestep accumulator. Rendering runs at whatever rate the display
 * gives us; the simulation always advances in constant `dt` steps.
 */
export class FixedStep {
  /** Step length in seconds. */
  readonly dt: number;
  private readonly stepMs: number;
  private accumulatorMs = 0;

  constructor(
    hz: number,
    private readonly maxStepsPerFrame: number,
    private readonly maxFrameMs: number,
  ) {
    this.dt = 1 / hz;
    this.stepMs = 1000 / hz;
  }

  /**
   * Adds the elapsed frame time and runs as many whole steps as fit.
   * Returns the number of steps executed.
   */
  advance(frameMs: number, step: (dt: number) => void): number {
    this.accumulatorMs += Math.min(Math.max(frameMs, 0), this.maxFrameMs);
    let steps = 0;
    while (this.accumulatorMs >= this.stepMs && steps < this.maxStepsPerFrame) {
      step(this.dt);
      this.accumulatorMs -= this.stepMs;
      steps++;
    }
    // Drop the backlog we could not simulate instead of carrying it forever.
    if (steps === this.maxStepsPerFrame && this.accumulatorMs >= this.stepMs) {
      this.accumulatorMs = this.accumulatorMs % this.stepMs;
    }
    return steps;
  }

  /** How far we are into the next step (0..1), for render interpolation. */
  get alpha(): number {
    return this.accumulatorMs / this.stepMs;
  }

  reset(): void {
    this.accumulatorMs = 0;
  }
}
