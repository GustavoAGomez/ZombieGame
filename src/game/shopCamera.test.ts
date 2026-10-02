import { describe, expect, it } from 'vitest';
import { SHOP_CAMERA_GAP, SHOP_CAMERA_MAX_SHARE, shopCameraOffset } from './shopCamera';

const base = { targetY: 1000, viewHeight: 390, cssPerWorld: 1, canvasTop: 0, panelBottom: 240 };

describe('shopCameraOffset', () => {
  it('moves the view down just enough to show the merchant under the panel', () => {
    // Merchant beside the player: head 44 px over the feet at y 1000 → on screen at 195 - 44 = 151.
    const offset = shopCameraOffset({ ...base, merchantTop: 956 });
    expect(offset).toBeCloseTo(240 + SHOP_CAMERA_GAP - 151);
    // With that offset the head lands right under the panel.
    expect(151 + offset).toBeCloseTo(240 + SHOP_CAMERA_GAP);
  });

  it('does not move when the merchant already shows below the panel', () => {
    expect(shopCameraOffset({ ...base, merchantTop: 1060 })).toBe(0);
  });

  it('scales with the zoom and never pushes the player off screen', () => {
    // At 2 CSS px per world px the head (y 990) is at (990 - (1000 - 97.5)) * 2 = 175 CSS px: 73 CSS px to go, 36.5 world px.
    const zoomed = shopCameraOffset({ ...base, merchantTop: 990, cssPerWorld: 2, viewHeight: 195 });
    expect(zoomed).toBeCloseTo((240 + SHOP_CAMERA_GAP - 175) / 2);
    expect(shopCameraOffset({ ...base, merchantTop: 700 })).toBe(390 * SHOP_CAMERA_MAX_SHARE);
  });
});
