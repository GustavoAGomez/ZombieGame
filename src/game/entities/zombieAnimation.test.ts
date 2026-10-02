import { describe, expect, it } from 'vitest';
import { ZOMBIES } from '../../config/balance';
import type { ZombieState } from '../../core/GameState';
import { createTestContext } from '../../test/fixtures';
import { isStrike, letsStrikeFinish, swingId, zombiePose, type ZombieArt } from './zombieAnimation';

const FULL: ZombieArt = { climb: true, crawl: true, crawlAttack: true, death: true };
const NONE: ZombieArt = { climb: false, crawl: false, crawlAttack: false, death: false };

function zombie(fields: Partial<ZombieState>): ZombieState {
  const z = createTestContext().state.zombies[0];
  if (!z) throw new Error('no zombie slot');
  return Object.assign(z, { active: true, hp: 5, maxHp: 5, ai: 'chasing' }, fields);
}

describe('zombiePose', () => {
  it('walks, strikes, lunges through windows and dies with full art', () => {
    expect(zombiePose(zombie({ ai: 'chasing' }), FULL).animation).toBe('walk');
    expect(zombiePose(zombie({ ai: 'toWindow' }), FULL).animation).toBe('walk');
    expect(zombiePose(zombie({ ai: 'attacking' }), FULL).animation).toBe('attack');
    expect(zombiePose(zombie({ ai: 'tearing' }), FULL).animation).toBe('attack');
    expect(zombiePose(zombie({ ai: 'climbing' }), FULL).animation).toBe('climb');
    expect(zombiePose(zombie({ ai: 'dead', hp: 0 }), FULL)).toEqual({ animation: 'death', corpse: false });
  });

  it('crawls and claws from the ground once it has lost its legs', () => {
    const hp = ZOMBIES.crawlAtHp;
    expect(zombiePose(zombie({ ai: 'chasing', hp }), FULL).animation).toBe('crawl');
    expect(zombiePose(zombie({ ai: 'attacking', hp }), FULL).animation).toBe('crawl_attack');
    expect(zombiePose(zombie({ ai: 'tearing', hp }), FULL).animation).toBe('crawl_attack');
    // A legless zombie drags itself through the window instead of lunging.
    expect(zombiePose(zombie({ ai: 'climbing', hp }), FULL).animation).toBe('crawl');
  });

  it('without death art drops to the ground as a fading corpse', () => {
    expect(zombiePose(zombie({ ai: 'dead', hp: 0 }), { ...FULL, death: false })).toEqual({ animation: 'crawl', corpse: true });
    expect(zombiePose(zombie({ ai: 'dead', hp: 0 }), NONE)).toEqual({ animation: 'walk', corpse: true });
  });

  it('falls back to walking and the standing attack when the optional art is missing', () => {
    const hp = ZOMBIES.crawlAtHp;
    expect(zombiePose(zombie({ ai: 'chasing', hp }), NONE).animation).toBe('walk');
    expect(zombiePose(zombie({ ai: 'attacking', hp }), NONE).animation).toBe('attack');
    expect(zombiePose(zombie({ ai: 'climbing' }), NONE).animation).toBe('walk');
  });
});

describe('swingId', () => {
  it('starts one swing per attack', () => {
    expect(swingId(zombie({ ai: 'attacking', actionTick: 42 }))).toBe(42);
    expect(swingId(zombie({ ai: 'chasing', actionTick: 42 }))).toBeNull();
  });

  it('while tearing, starts the swing a windup before the plank comes off', () => {
    expect(swingId(zombie({ ai: 'tearing', actionTick: 7, timer: ZOMBIES.attackWindup + 0.1 }))).toBeNull();
    expect(swingId(zombie({ ai: 'tearing', actionTick: 7, timer: ZOMBIES.attackWindup }))).toBe(7);
  });

  it('only strikes count as swings', () => {
    expect(isStrike('attack')).toBe(true);
    expect(isStrike('crawl_attack')).toBe(true);
    expect(isStrike('walk')).toBe(false);
  });
});

describe('letsStrikeFinish', () => {
  it('lets a strike at a player finish while the zombie walks on, never a swing at planks', () => {
    expect(letsStrikeFinish(zombie({ ai: 'chasing' }), false)).toBe(true);
    expect(letsStrikeFinish(zombie({ ai: 'toWindow' }), false)).toBe(true);
    // Left its window mid-swing: it walks at once.
    expect(letsStrikeFinish(zombie({ ai: 'chasing' }), true)).toBe(false);
    expect(letsStrikeFinish(zombie({ ai: 'tearing' }), false)).toBe(false);
  });
});
