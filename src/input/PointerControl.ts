/**
 * Shared single-pointer tracking for a DOM control: captures the pointer
 * that started on it, follows only that pointer, and resets on release,
 * cancel or lost capture (e.g. pulling down the notification centre).
 *
 * Stuck-control guards (a missed release used to leave a stick pushed):
 *  - releases are also caught at window level, in case the browser
 *    delivered them elsewhere;
 *  - `validate()` (called every tick) resets the control when the browser
 *    no longer holds the pointer capture we took, i.e. the finger is gone
 *    but we never heard about it;
 *  - a new finger on a control whose capture is gone takes it over.
 */
export abstract class PointerControl {
  protected pointerId: number | null = null;
  /** True when setPointerCapture succeeded for the current pointer. */
  private captured = false;

  constructor(protected readonly target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onEnd);
    target.addEventListener('pointercancel', this.onEnd);
    target.addEventListener('lostpointercapture', this.onEnd);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('pointerup', this.onEnd, true);
    window.addEventListener('pointercancel', this.onEnd, true);
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** Resets the control if its pointer's capture vanished without a release event. */
  validate(): void {
    if (this.pointerId !== null && this.captured && !this.target.hasPointerCapture(this.pointerId)) this.reset();
  }

  /** Forces the control back to rest (e.g. when the app loses focus). */
  reset(): void {
    this.release();
    this.onRelease();
  }

  /** Removes the window-level listeners. */
  dispose(): void {
    window.removeEventListener('pointerup', this.onEnd, true);
    window.removeEventListener('pointercancel', this.onEnd, true);
    this.reset();
  }

  protected abstract onPress(e: PointerEvent): void;
  protected abstract onDrag(e: PointerEvent): void;
  protected abstract onRelease(): void;

  private release(): void {
    const id = this.pointerId;
    this.pointerId = null;
    this.captured = false;
    if (id !== null && this.target.hasPointerCapture(id)) {
      try {
        this.target.releasePointerCapture(id);
      } catch {
        // Already released by the browser.
      }
    }
  }

  private readonly onDown = (e: PointerEvent): void => {
    e.preventDefault();
    if (this.pointerId !== null) {
      // A second finger is ignored while the first still holds the control;
      // if the first one's capture is gone, its release was missed: take over.
      if (e.pointerId === this.pointerId || this.target.hasPointerCapture(this.pointerId)) return;
      this.release();
      this.onRelease();
    }
    this.pointerId = e.pointerId;
    try {
      this.target.setPointerCapture(e.pointerId);
      this.captured = this.target.hasPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic events; the window-level release still works.
      this.captured = false;
    }
    this.onPress(e);
  };

  private readonly onMove = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    this.onDrag(e);
  };

  private readonly onEnd = (e: PointerEvent): void => {
    if (e.pointerId !== this.pointerId) return;
    this.release();
    this.onRelease();
  };
}
