import { describe, expect, it } from 'vitest';
import { pickZombieKind, spawnInterval, zombieHp, zombieMix, zombiesInRound } from './waveFormulas';

describe('zombieHp', () => {
  it('is 50 + 25 × (r − 1) for rounds 1–9', () => {
    expect([1, 2, 5, 9].map(zombieHp)).toEqual([50, 75, 150, 250]);
  });

  it('grows ×1.1 per round from round 10', () => {
    expect(zombieHp(10)).toBe(275);
    expect(zombieHp(11)).toBe(Math.round(250 * 1.1 ** 2));
    expect(zombieHp(20)).toBe(Math.round(250 * 1.1 ** 11));
  });

  it('treats invalid rounds as round 1', () => {
    expect(zombieHp(0)).toBe(50);
  });
});

describe('zombieMix', () => {
  const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 5);

  it('is all walkers in rounds 1–2', () => {
    expect(zombieMix(1)).toEqual({ walker: 1, runner: 0, sprinter: 0 });
    expect(zombieMix(2)).toEqual({ walker: 1, runner: 0, sprinter: 0 });
  });

  it('ramps runners from 20 % to 50 % in rounds 3–5, then 60 %', () => {
    close(zombieMix(3).runner, 0.2);
    close(zombieMix(4).runner, 0.35);
    close(zombieMix(5).runner, 0.5);
    close(zombieMix(6).runner, 0.6);
    close(zombieMix(15).runner, 0.6);
  });

  it('adds sprinters from round 8, 10 % → 30 %', () => {
    close(zombieMix(7).sprinter, 0);
    close(zombieMix(8).sprinter, 0.1);
    close(zombieMix(9).sprinter, 0.2);
    close(zombieMix(10).sprinter, 0.3);
    close(zombieMix(30).sprinter, 0.3);
  });

  it('always sums to 1', () => {
    for (let r = 1; r <= 40; r++) {
      const m = zombieMix(r);
      close(m.walker + m.runner + m.sprinter, 1);
    }
  });
});

describe('pickZombieKind', () => {
  it('maps a uniform roll onto the mix', () => {
    expect(pickZombieKind(1, 0.99)).toBe('walker');
    expect(pickZombieKind(10, 0.05)).toBe('sprinter'); // < 0.3
    expect(pickZombieKind(10, 0.5)).toBe('runner'); // 0.3..0.9
    expect(pickZombieKind(10, 0.95)).toBe('walker');
  });
});

describe('zombiesInRound and spawnInterval', () => {
  it('uses 6 + 4 × (r − 1), capped at 80', () => {
    expect([1, 2, 10, 19, 20, 50].map(zombiesInRound)).toEqual([6, 10, 42, 78, 80, 80]);
  });

  it('uses max(0.4, 2.0 − 0.1 × (r − 1))', () => {
    expect(spawnInterval(1)).toBeCloseTo(2.0);
    expect(spawnInterval(11)).toBeCloseTo(1.0);
    expect(spawnInterval(17)).toBeCloseTo(0.4);
    expect(spawnInterval(40)).toBeCloseTo(0.4);
  });
});
