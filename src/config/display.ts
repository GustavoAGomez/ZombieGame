import { BULLETS } from './balance';

/** Resolution, zoom and camera settings (spec 01 §1). */
export const DISPLAY = {
  /** The canvas backing store is CSS size × devicePixelRatio, capped here. */
  maxDevicePixelRatio: 3,
  /** Roughly how many world pixels should be visible vertically. */
  targetWorldHeight: 270,
  /** World tile size in pixels. */
  tileSize: 32,
  /** Camera follow smoothing (Phaser lerp, 0..1). */
  cameraLerp: 0.15,
  /** Height at which bullets and the aim line are drawn: the bullets' flight height. */
  shotHeight: BULLETS.flightHeight,
} as const;

export function cappedDevicePixelRatio(dpr: number): number {
  if (!Number.isFinite(dpr) || dpr <= 0) return 1;
  return Math.min(dpr, DISPLAY.maxDevicePixelRatio);
}

export interface PhysicalSize {
  width: number;
  height: number;
  dpr: number;
}

/** Converts a CSS-pixel viewport into the canvas backing-store size. */
export function physicalSize(cssWidth: number, cssHeight: number, devicePixelRatio: number): PhysicalSize {
  const dpr = cappedDevicePixelRatio(devicePixelRatio);
  return {
    width: Math.max(1, Math.round(cssWidth * dpr)),
    height: Math.max(1, Math.round(cssHeight * dpr)),
    dpr,
  };
}

/** Integer world zoom: max(1, floor(physicalHeight / 270)). */
export function computeWorldZoom(physicalHeight: number): number {
  return Math.max(1, Math.floor(physicalHeight / DISPLAY.targetWorldHeight));
}
