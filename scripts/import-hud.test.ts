import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { healthPadding } from '../src/ui/skin';
import { cropToBounds, halve, measureHealthBar, measureTrough, namePieces, prepareHealthBar, readExtraPieces, splitSheet } from './import-hud';
import { decodePng } from './lib/png';
import { blank, paste, type Frame } from './lib/sheet';

const root = resolve(import.meta.dirname, '..');
const hudDir = resolve(root, 'art-src/pixellab/hud');
// The base kit: the export folder with elements/ right inside (later kits live in subfolders, see import.json).
const elements = join(hudDir, readdirSync(hudDir).find((n) => existsSync(join(hudDir, n, 'elements'))) ?? '', 'elements');
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

  it('takes the native small ring, the polygon buttons, the health bar and the boss and weapon bars from import.json', () => {
    const extra = readExtraPieces(hudDir);
    // All drawn at about the small buttons' size (no reduction).
    expect([extra.ringSmall?.width, extra.ringSmall?.height]).toEqual([33, 33]);
    expect([extra.hexagon?.width, extra.hexagon?.height]).toEqual([28, 33]);
    expect([extra.octagon?.width, extra.octagon?.height]).toEqual([34, 34]);
    // Cut out of its whole sheet: PixelLab's own element had lost its top, bottom and right border.
    expect([extra.healthFrame?.width, extra.healthFrame?.height]).toEqual([151, 31]);
    expect([extra.bossFrame?.width, extra.bossFrame?.height]).toEqual([147, 27]);
    expect([extra.gaugeFrame?.width, extra.gaugeFrame?.height]).toEqual([63, 24]);
  });

  it('finds the troughs of the boss bar and the weapon gauge, where the game draws their fill', () => {
    const extra = readExtraPieces(hudDir);
    if (!extra.bossFrame || !extra.gaugeFrame) throw new Error('no boss bar or gauge in import.json');
    expect(measureTrough(extra.bossFrame)).toEqual({ x: 27, y: 8, width: 111, height: 11 });
    expect(measureTrough(extra.gaugeFrame)).toEqual({ x: 8, y: 7, width: 48, height: 10 });
  });

  it('empties a bone-bordered health bar that comes partly filled, and finds its trough and heart', () => {
    const bar = readExtraPieces(hudDir).healthFrame;
    if (!bar) throw new Error('no health bar in import.json');
    const { frame, trough, heart } = prepareHealthBar(bar);
    expect(trough).toEqual({ x: 28, y: 9, width: 114, height: 13 });
    // No olive fill left: every row of the trough is one colour.
    for (let y = trough.y + 1; y < trough.y + trough.height - 1; y++) {
      const colours = new Set<number>();
      for (let x = trough.x + 2; x < trough.x + trough.width - 2; x++) {
        const i = (y * frame.width + x) * 4;
        colours.add(((frame.pixels[i] ?? 0) << 16) | ((frame.pixels[i + 1] ?? 0) << 8) | (frame.pixels[i + 2] ?? 0));
      }
      expect(colours.size, `row ${y}`).toBe(1);
    }
    // The heart, with its outline, left of the trough.
    expect(heart.x + heart.width).toBeLessThan(trough.x);
    expect([heart.width, heart.height]).toEqual([16, 14]);
    // A bar without that border is measured as before and left as it was.
    const old = read('Health_bar.png');
    const same = prepareHealthBar(old);
    expect(same.frame).toBe(old);
    expect(same.trough).toEqual(measureHealthBar(old).trough);
  });

  it('puts 10 whole-pixel segments inside an odd-width trough too (the right margin takes the odd pixel)', () => {
    const health = { file: '', width: 149, height: 22, trough: { x: 28, y: 6, width: 113, height: 13 } };
    const [, right, , left] = healthPadding(health).split(' ').map((v) => Number.parseInt(v, 10));
    expect((health.width - (left ?? 0) - (right ?? 0) - 9 * 2) % 10).toBe(0);
    expect(left).toBeGreaterThanOrEqual(health.trough.x + 2);
    expect(right).toBeGreaterThanOrEqual(health.width - (health.trough.x + health.trough.width) + 2);
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
