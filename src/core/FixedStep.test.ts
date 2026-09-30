import { describe, expect, it } from 'vitest';
import { FixedStep } from './FixedStep';

describe('FixedStep', () => {
  it('runs one step per 1/60 s of accumulated time', () => {
    const fs = new FixedStep(60, 5, 250);
    let steps = 0;
    fs.advance(1000 / 60, () => steps++);
    expect(steps).toBe(1);
    fs.advance(1000 / 30, () => steps++);
    expect(steps).toBe(3);
  });

  it('accumulates partial frames (120 Hz display -> 60 Hz sim)', () => {
    const fs = new FixedStep(60, 5, 250);
    let steps = 0;
    for (let i = 0; i < 120; i++) fs.advance(1000 / 120, () => steps++);
    expect(steps).toBeGreaterThanOrEqual(59);
    expect(steps).toBeLessThanOrEqual(60);
  });

  it('passes a constant dt', () => {
    const fs = new FixedStep(60, 5, 250);
    const dts: number[] = [];
    fs.advance(51, (dt) => dts.push(dt));
    expect(dts.length).toBe(3);
    for (const dt of dts) expect(dt).toBeCloseTo(1 / 60);
  });

  it('caps steps per frame and drops the backlog', () => {
    const fs = new FixedStep(60, 5, 1000);
    let steps = 0;
    fs.advance(1000, () => steps++);
    expect(steps).toBe(5);
    expect(fs.alpha).toBeLessThan(1);
    fs.advance(0, () => steps++);
    expect(steps).toBe(5);
  });

  it('exposes interpolation alpha between 0 and 1', () => {
    const fs = new FixedStep(60, 5, 250);
    fs.advance(1000 / 120, () => undefined);
    expect(fs.alpha).toBeCloseTo(0.5);
  });

  it('ignores negative frame times', () => {
    const fs = new FixedStep(60, 5, 250);
    let steps = 0;
    fs.advance(-100, () => steps++);
    expect(steps).toBe(0);
    expect(fs.alpha).toBe(0);
  });
});
