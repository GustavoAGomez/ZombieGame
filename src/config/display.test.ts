import { describe, expect, it } from 'vitest';
import { cappedDevicePixelRatio, computeWorldZoom, physicalSize } from './display';

describe('computeWorldZoom', () => {
  it('is floor(physicalHeight / 270), at least 1', () => {
    expect(computeWorldZoom(100)).toBe(1);
    expect(computeWorldZoom(269)).toBe(1);
    expect(computeWorldZoom(270)).toBe(1);
    expect(computeWorldZoom(539)).toBe(1);
    expect(computeWorldZoom(540)).toBe(2);
    expect(computeWorldZoom(0)).toBe(1);
  });

  it('matches the reference devices', () => {
    // iPhone 844×390 CSS at DPR 3 -> 1170 px tall -> zoom 4 (~292 world px visible)
    expect(computeWorldZoom(physicalSize(844, 390, 3).height)).toBe(4);
    // Android 20:9, 800×360 CSS at DPR 3 -> 1080 px -> zoom 4 (270 world px)
    expect(computeWorldZoom(physicalSize(800, 360, 3).height)).toBe(4);
    // Small Android 16:9 at 720p (640×360 CSS at DPR 2) -> zoom 2 (360 world px)
    expect(computeWorldZoom(physicalSize(640, 360, 2).height)).toBe(2);
    // Desktop browser 1280×720 at DPR 1 -> zoom 2
    expect(computeWorldZoom(physicalSize(1280, 720, 1).height)).toBe(2);
  });

  it('is always an integer', () => {
    for (let h = 1; h < 3000; h += 37) {
      expect(Number.isInteger(computeWorldZoom(h))).toBe(true);
    }
  });
});

describe('physicalSize', () => {
  it('caps devicePixelRatio at 3', () => {
    expect(cappedDevicePixelRatio(4)).toBe(3);
    expect(physicalSize(400, 200, 3.5)).toEqual({ width: 1200, height: 600, dpr: 3 });
  });

  it('falls back to DPR 1 for invalid values', () => {
    expect(cappedDevicePixelRatio(0)).toBe(1);
    expect(cappedDevicePixelRatio(Number.NaN)).toBe(1);
  });
});
