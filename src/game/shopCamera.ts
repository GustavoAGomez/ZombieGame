/** Gap left between the bottom of the shop panel and the merchant's head (CSS px). */
export const SHOP_CAMERA_GAP = 8;
/** The camera never moves more than this share of the view, so the player stays on screen. */
export const SHOP_CAMERA_MAX_SHARE = 0.3;

export interface ShopCameraInput {
  /** Top of the merchant's drawn body (world px) and the camera's follow target (the player). */
  merchantTop: number;
  targetY: number;
  /** Height of the view in world px and how many CSS px a world px takes on screen. */
  viewHeight: number;
  cssPerWorld: number;
  /** Top of the canvas and bottom of the shop panel on screen (CSS px). */
  canvasTop: number;
  panelBottom: number;
}

/**
 * How far down (world px) the camera's follow offset moves the view while a
 * shop is open, so the merchant opening its coat shows under the panel
 * instead of behind it. 0 when it already shows. Measured against the
 * follow target, not the current scroll, so it does not chase itself.
 */
export function shopCameraOffset(input: ShopCameraInput): number {
  const { merchantTop, targetY, viewHeight, cssPerWorld, canvasTop, panelBottom } = input;
  if (cssPerWorld <= 0) return 0;
  // Where the merchant's head is on screen with the player centred.
  const headOnScreen = canvasTop + (merchantTop - (targetY - viewHeight / 2)) * cssPerWorld;
  const needed = (panelBottom + SHOP_CAMERA_GAP - headOnScreen) / cssPerWorld;
  return Math.min(Math.max(0, needed), viewHeight * SHOP_CAMERA_MAX_SHARE);
}
