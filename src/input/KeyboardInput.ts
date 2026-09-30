/**
 * Desktop keyboard fallback for quick testing in a browser. Mirrors the
 * touch controls: WASD / arrows move, IJKL aim and fire, Space fires with
 * auto-aim, Q switches weapon, Shift / E dash. It only records key state.
 */
const MOVE_LEFT = ['KeyA', 'ArrowLeft'] as const;
const MOVE_RIGHT = ['KeyD', 'ArrowRight'] as const;
const MOVE_UP = ['KeyW', 'ArrowUp'] as const;
const MOVE_DOWN = ['KeyS', 'ArrowDown'] as const;
const AIM_LEFT = ['KeyJ'] as const;
const AIM_RIGHT = ['KeyL'] as const;
const AIM_UP = ['KeyI'] as const;
const AIM_DOWN = ['KeyK'] as const;

export class KeyboardInput {
  private readonly down = new Set<string>();
  /** Keys pressed since they were last consumed. */
  private readonly pressed = new Set<string>();

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** True once per key press. */
  consumePress(code: string): boolean {
    return this.pressed.delete(code);
  }

  /** Movement axis from WASD / arrows, normalised to length ≤ 1. */
  moveAxis(out: { x: number; y: number }): { x: number; y: number } {
    return this.axis(out, MOVE_LEFT, MOVE_RIGHT, MOVE_UP, MOVE_DOWN);
  }

  /** Aim axis from IJKL. */
  aimAxis(out: { x: number; y: number }): { x: number; y: number } {
    return this.axis(out, AIM_LEFT, AIM_RIGHT, AIM_UP, AIM_DOWN);
  }

  reset(): void {
    this.down.clear();
    this.pressed.clear();
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
  }

  private axis(
    out: { x: number; y: number },
    left: readonly string[],
    right: readonly string[],
    up: readonly string[],
    down: readonly string[],
  ): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.anyDown(left)) x -= 1;
    if (this.anyDown(right)) x += 1;
    if (this.anyDown(up)) y -= 1;
    if (this.anyDown(down)) y += 1;
    const len = Math.hypot(x, y);
    out.x = len > 0 ? x / len : 0;
    out.y = len > 0 ? y / len : 0;
    return out;
  }

  private anyDown(codes: readonly string[]): boolean {
    for (let i = 0; i < codes.length; i++) if (this.down.has(codes[i] ?? '')) return true;
    return false;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.repeat) return;
    this.down.add(e.code);
    this.pressed.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
}
