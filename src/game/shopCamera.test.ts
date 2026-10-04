import { describe, expect, it } from 'vitest';
import { SHOP_CAMERA_GAP, SHOP_CAMERA_MAX_SHARE, shopCameraOffset } from './shopCamera';

const base = { targetY: 1000, viewHeight: 390, cssPerWorld: 1, canvasTop: 0, panelTop: 96 };

describe('shopCameraOffset', () => {
  it('moves the view down just enough to show the merchant above the panel', () => {
    // Merchant beside the player, feet at y 1006 → on screen at 195 + 6 = 201.
    const offset = shopCameraOffset({ ...base, merchantBottom: 1006 });
    expect(offset).toBeCloseTo(-(201 - (96 - SHOP_CAMERA_GAP)));
    // With that offset the feet land right above the panel.
    expect(201 + offset).toBeCloseTo(96 - SHOP_CAMERA_GAP);
  });

  it('does not move when the merchant already shows above the panel', () => {
    expect(shopCameraOffset({ ...base, merchantBottom: 860 })).toBe(0);
  });

  it('scales with the zoom and never pushes the player off screen', () => {
    // At 2 CSS px per world px the feet (y 1000) are at (1000 - (1000 - 97.5)) * 2 = 195 CSS px: 107 CSS px to go, 53.5 world px.
    const zoomed = shopCameraOffset({ ...base, merchantBottom: 1000, cssPerWorld: 2, viewHeight: 195 });
    expect(zoomed).toBeCloseTo(-(195 - (96 - SHOP_CAMERA_GAP)) / 2);
    expect(shopCameraOffset({ ...base, merchantBottom: 1300 })).toBe(-390 * SHOP_CAMERA_MAX_SHARE);
  });
});
