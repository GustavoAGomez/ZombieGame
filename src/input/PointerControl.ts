/**
 * Shared single-pointer tracking for a DOM control: captures the pointer
 * that started on it, follows only that pointer, and resets on release,
 * cancel or lost capture (e.g. pulling down the notification centre).
 */
export abstract class PointerControl {
  protected pointerId: number | null = null;

  constructor(protected readonly target: HTMLElement) {
    target.addEventListener('pointerdown', this.onDown);
    target.addEventListener('pointermove', this.onMove);
    target.addEventListener('pointerup', this.onEnd);
    target.addEventListener('pointercancel', this.onEnd);
    target.addEventListener('lostpointercapture', this.onEnd);
    target.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  get active(): boolean {
    return this.pointerId !== null;
  }

  /** Forces the control back to rest (e.g. when the app loses focus). */
  reset(): void {
    if (this.pointerId !== null && this.target.hasPointerCapture(this.pointerId)) {
      this.target.releasePointerCapture(this.pointerId);
    }
    this.pointerId = null;
    this.onRelease();
  }

  protected abstract onPress(e: PointerEvent): void;
  protected abstract onDrag(e: PointerEvent): void;
  protected abstract onRelease(): void;

  private readonly onDown = (e: PointerEvent): void => {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    try {
      this.target.setPointerCapture(e.pointerId);
    } catch {
      // Capture can fail for synthetic events; tracking still works.
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
    this.pointerId = null;
    this.onRelease();
  };
}
