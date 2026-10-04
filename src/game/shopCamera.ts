/** Gap left between the merchant's feet and the top of the shop panel (CSS px). */
export const SHOP_CAMERA_GAP = 8;
/** The camera never moves more than this share of the view, so the player stays on screen. */
export const SHOP_CAMERA_MAX_SHARE = 0.3;

export interface ShopCameraInput {
  /** Bottom of the merchant's drawn body (its feet, world px) and the camera's follow target (the player). */
  merchantBottom: number;
  targetY: number;
  /** Height of the view in world px and how many CSS px a world px takes on screen. */
  viewHeight: number;
  cssPerWorld: number;
  /** Top of the canvas and top of the shop panel on screen (CSS px). */
  canvasTop: number;
  panelTop: number;
}

/**
 * The camera's follow offset (world px) while a shop is open: the view moves
 * down so the merchant opening its coat shows above the panel instead of
 * behind it. Negative, because Phaser subtracts the offset from the target;
 * 0 when the merchant already shows. Measured against the follow target,
 * not the current scroll, so it does not chase itself.
 */
export function shopCameraOffset(input: ShopCameraInput): number {
  const { merchantBottom, targetY, viewHeight, cssPerWorld, canvasTop, panelTop } = input;
  if (cssPerWorld <= 0) return 0;
  // Where the merchant's feet are on screen with the player centred.
  const feetOnScreen = canvasTop + (merchantBottom - (targetY - viewHeight / 2)) * cssPerWorld;
  const needed = (feetOnScreen - (panelTop - SHOP_CAMERA_GAP)) / cssPerWorld;
  return needed > 0 ? -Math.min(needed, viewHeight * SHOP_CAMERA_MAX_SHARE) : 0;
}
