/** A second tap closer than this (ms) to the previous one would be a double-tap zoom. */
const DOUBLE_TAP_MS = 350;

/**
 * Blocks every kind of page zoom. The viewport meta (user-scalable=no) and
 * `touch-action: none` on the page are ignored by iOS Safari, which still
 * zooms on a pinch and on fast repeated taps (hammering the knife button
 * zoomed in with no way back). So:
 *   - Safari's pinch gestures are cancelled;
 *   - a touch move with two fingers or a scale (a pinch) is cancelled;
 *   - a tap that ends right after the previous one is cancelled (double-tap zoom);
 *   - double clicks are cancelled.
 * The controls read pointer events, which are dispatched before these touch
 * events, so cancelling them does not get in the way of play.
 */
export function blockZoom(target: Document = document): void {
  const cancel = (e: Event): void => {
    if (e.cancelable) e.preventDefault();
  };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend', 'dblclick']) target.addEventListener(type, cancel, { passive: false });
  target.addEventListener(
    'touchmove',
    (e) => {
      const scale = (e as TouchEvent & { scale?: number }).scale;
      if (e.touches.length > 1 || (scale !== undefined && scale !== 1)) cancel(e);
    },
    { passive: false },
  );
  let lastTouchEnd = -Infinity;
  target.addEventListener(
    'touchend',
    (e) => {
      if (e.timeStamp - lastTouchEnd < DOUBLE_TAP_MS) cancel(e);
      lastTouchEnd = e.timeStamp;
    },
    { passive: false },
  );
}
