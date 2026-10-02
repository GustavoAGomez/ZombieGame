import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { healthPadding } from '../src/ui/skin';
import { cleanButton, cleanHealthBar, cleanRing, halve } from './import-hud';
import { decodePng } from './lib/png';
import type { Frame } from './lib/sheet';

const root = resolve(import.meta.dirname, '..');
const hudDir = resolve(root, 'art-src/pixellab/hud');
const elements = join(hudDir, readdirSync(hudDir).find((n) => !n.endsWith('.json')) ?? '', 'elements');
const read = (name: string): Frame => {
  const png = decodePng(readFileSync(join(elements, name)));
  return { width: png.width, height: png.height, pixels: png.pixels };
};
const isOrange = (f: Frame, x: number, y: number): boolean => {
  const i = (y * f.width + x) * 4;
  const [r = 0, g = 0, b = 0, a = 0] = f.pixels.subarray(i, i + 4);
  return a > 0 && r > 140 && g > 70 && r - b > 70;
};
const countOrange = (f: Frame, x0 = 0, y0 = 0, x1 = f.width, y1 = f.height): number => {
  let n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (isOrange(f, x, y)) n++;
  return n;
};

describe('HUD pieces from PixelLab (npm run hud:import)', () => {
  it('round buttons lose their icons and keep the ring', () => {
    for (const name of ['Icon_button.png', 'Icon_button-2.png']) {
      const raw = read(name);
      expect(countOrange(raw)).toBeGreaterThan(50);
      const { ring, face } = cleanRing(raw);
      expect(countOrange(ring), name).toBe(0);
      // The face is a single flat colour.
      const colours = new Set<number>();
      for (let i = 0; i < face.length; i++) if (face[i]) colours.add(ring.pixels[i * 4]! * 65536 + ring.pixels[i * 4 + 1]! * 256 + ring.pixels[i * 4 + 2]!);
      expect(colours.size).toBe(1);
      // The ring around it is still there: bone-white pixels near the edge.
      let bone = 0;
      for (let i = 0; i < face.length; i++) if (!face[i] && ring.pixels[i * 4]! > 200 && ring.pixels[i * 4 + 2]! > 190) bone++;
      expect(bone).toBeGreaterThan(40);
    }
  });

  it('halves the medium ring exactly to fit the HUD buttons', () => {
    const { ring, face } = cleanRing(read('Icon_button-2.png'));
    const half = halve(ring, face);
    expect([half.frame.width, half.frame.height]).toEqual([Math.ceil(ring.width / 2), Math.ceil(ring.height / 2)]);
  });

  it('the rectangular button loses its CRAFT text', () => {
    expect(countOrange(read('Button.png'))).toBeGreaterThan(30);
    expect(countOrange(cleanButton(read('Button.png')))).toBe(0);
  });

  it('the health bar keeps its cross and empties the fill to the black trough', () => {
    const { frame, trough } = cleanHealthBar(read('Health_bar.png'));
    expect(countOrange(frame, trough.x, trough.y, trough.x + trough.width, trough.y + trough.height)).toBe(0);
    // The cross, left of the trough, is still orange.
    expect(countOrange(frame, 0, 0, trough.x, frame.height)).toBeGreaterThan(20);
    expect(trough.width).toBeGreaterThan(100);
  });

  it('puts 10 whole-pixel segments inside the trough', () => {
    const health = { file: '', width: 145, height: 17, trough: { x: 22, y: 5, width: 116, height: 8 } };
    const [top, right, bottom, left] = healthPadding(health).split(' ').map((v) => Number.parseInt(v, 10));
    const inner = health.width - (left ?? 0) - (right ?? 0);
    expect((inner - 9 * 2) % 10).toBe(0);
    expect(health.height - (top ?? 0) - (bottom ?? 0)).toBe(6);
  });
});
