import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { healthPadding } from '../src/ui/skin';
import { cropToBounds, halve, measureHealthBar, namePieces, splitSheet } from './import-hud';
import { decodePng } from './lib/png';
import { blank, paste, type Frame } from './lib/sheet';

const root = resolve(import.meta.dirname, '..');
const hudDir = resolve(root, 'art-src/pixellab/hud');
const elements = join(hudDir, readdirSync(hudDir).find((n) => !n.endsWith('.json')) ?? '', 'elements');
const read = (name: string): Frame => {
  const png = decodePng(readFileSync(join(elements, name)));
  return cropToBounds({ width: png.width, height: png.height, pixels: png.pixels });
};
const ELEMENTS = ['Icon_button.png', 'Icon_button-2.png', 'Panel.png', 'Button.png', 'Health_bar.png'];

describe('HUD kit from PixelLab (npm run hud:import)', () => {
  it('names the five pieces by shape, cropped to their bounding box', () => {
    const kit = namePieces(ELEMENTS.map(read));
    expect([kit.ringLarge.width, kit.ringLarge.height]).toEqual([97, 97]);
    expect([kit.ringMedium.width, kit.ringMedium.height]).toEqual([65, 65]);
    expect([kit.panel.width, kit.panel.height]).toEqual([145, 105]);
    expect([kit.plate.width, kit.plate.height]).toEqual([96, 25]);
    expect([kit.healthFrame.width, kit.healthFrame.height]).toEqual([145, 17]);
  });

  it('cuts a single sheet by the alpha channel into the same pieces', () => {
    const pieces = ELEMENTS.map(read);
    const sheet = blank(160, 340);
    let y = 0;
    for (const p of pieces) {
      paste(sheet, p, 4, y);
      y += p.height + 3;
      if (y > sheet.height) throw new Error('sheet too small for the test');
    }
    const cut = namePieces(splitSheet(sheet));
    expect([cut.ringMedium.width, cut.plate.width, cut.healthFrame.height]).toEqual([65, 96, 17]);
  });

  it('finds the health bar trough and the heart left of it', () => {
    const { trough, heart } = measureHealthBar(read('Health_bar.png'));
    expect(trough).toEqual({ x: 22, y: 4, width: 118, height: 9 });
    expect(heart.x + heart.width).toBeLessThan(trough.x);
    expect([heart.width, heart.height]).toEqual([12, 11]);
  });

  it('halves a piece exactly: commonest colour of each 2×2 block, the lighter on a tie', () => {
    const src = blank(3, 3);
    const put = (x: number, y: number, v: number): void => src.pixels.set([v, v, v, 255], (y * 3 + x) * 4);
    // Top-left block: two dark, two light → light. Top-right column: one light pixel alone → light.
    put(0, 0, 20);
    put(1, 0, 20);
    put(0, 1, 230);
    put(1, 1, 230);
    put(2, 0, 230);
    // Bottom-left: only one row of the block exists (odd size); one dark, one empty → the dark one. Bottom-right: empty.
    put(0, 2, 20);
    const half = halve(src);
    expect([half.width, half.height]).toEqual([2, 2]);
    const at = (x: number, y: number): number[] => Array.from(half.pixels.slice((y * 2 + x) * 4, (y * 2 + x) * 4 + 4));
    expect(at(0, 0)).toEqual([230, 230, 230, 255]);
    expect(at(1, 0)).toEqual([230, 230, 230, 255]);
    expect(at(0, 1)).toEqual([20, 20, 20, 255]);
    expect(at(1, 1)[3]).toBe(0);
    // The medium ring becomes the 33 px small one.
    const small = halve(namePieces(ELEMENTS.map(read)).ringMedium);
    expect([small.width, small.height]).toEqual([33, 33]);
  });

  it('puts 10 whole-pixel segments inside the trough', () => {
    const health = { file: '', width: 145, height: 17, trough: { x: 22, y: 4, width: 118, height: 9 } };
    const [top, right, bottom, left] = healthPadding(health).split(' ').map((v) => Number.parseInt(v, 10));
    const inner = health.width - (left ?? 0) - (right ?? 0);
    expect((inner - 9 * 2) % 10).toBe(0);
    expect(left).toBeGreaterThanOrEqual(health.trough.x + 2);
    expect(health.height - (top ?? 0) - (bottom ?? 0)).toBe(health.trough.height - 2);
  });
});
