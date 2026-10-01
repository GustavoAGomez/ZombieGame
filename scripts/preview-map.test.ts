import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mansionPlanText } from './lib/mansion-fixture';
import { renderMap, renderPlan, zoneDensities } from './preview-map';
import { parseMap } from '../src/game/map/MapLoader';
import { readFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

describe('map preview', () => {
  it('paints the ASCII plan at 8 px per tile', () => {
    const image = renderPlan(mansionPlanText());
    expect([image.width, image.height]).toEqual([108 * 8, 68 * 8]);
  });

  it('renders the built mansion at 1:1 with its layers', () => {
    const { image, map } = renderMap(resolve(root, 'public/assets/maps/mansion.tmj'));
    expect([image.width, image.height]).toEqual([map.width * 32, map.height * 32]);
    // The centre of the hall is wood, not the black background.
    const i = ((35 * 32 + 16) * image.width + 37 * 32 + 16) * 4;
    expect((image.pixels[i] ?? 0) + (image.pixels[i + 1] ?? 0) + (image.pixels[i + 2] ?? 0)).toBeGreaterThan(120);
  });

  it('keeps every zone of the mansion between 15 and 25 % decorated', () => {
    const map = parseMap(JSON.parse(readFileSync(resolve(root, 'public/assets/maps/mansion.tmj'), 'utf8')));
    for (const { zone, density } of zoneDensities(map)) {
      expect(density, zone).toBeGreaterThanOrEqual(0.15);
      expect(density, zone).toBeLessThanOrEqual(0.255);
    }
  });
});
