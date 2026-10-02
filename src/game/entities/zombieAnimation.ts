import { ZOMBIES } from '../../config/balance';
import type { ZombieState } from '../../core/GameState';

export type ZombieAnimation = 'walk' | 'attack' | 'climb' | 'death' | 'crawl' | 'crawl_attack';

/** Which optional animations a zombie character has art for (docs/ASSETS.md §3). */
export interface ZombieArt {
  climb: boolean;
  crawl: boolean;
  crawlAttack: boolean;
  death: boolean;
}

export interface ZombiePose {
  animation: ZombieAnimation;
  /**
   * Without death art the zombie drops to the ground: the first crawl frame,
   * held still and fading out for the corpse time.
   */
  corpse: boolean;
}

/** Legless: little HP left (ZOMBIES.crawlAtHp), as in ZombieSystem. */
export function isLegless(z: ZombieState): boolean {
  return z.hp > 0 && z.hp <= ZOMBIES.crawlAtHp;
}

/** The animation a zombie's state asks for. Pure: reads state only. */
export function zombiePose(z: ZombieState, art: ZombieArt): ZombiePose {
  const crawling = isLegless(z) && art.crawl;
  switch (z.ai) {
    case 'dead':
      if (art.death) return { animation: 'death', corpse: false };
      return { animation: art.crawl ? 'crawl' : 'walk', corpse: true };
    case 'tearing':
    case 'attacking':
      return { animation: isLegless(z) && art.crawlAttack ? 'crawl_attack' : 'attack', corpse: false };
    case 'climbing':
    case 'emerging':
      // Breaking in is a short lunge (`climb`); a legless one drags itself through.
      if (crawling) return { animation: 'crawl', corpse: false };
      return { animation: art.climb ? 'climb' : 'walk', corpse: false };
    default:
      return { animation: crawling ? 'crawl' : 'walk', corpse: false };
  }
}

/**
 * Id of the swing that should be playing now, or null when no new one
 * starts. Attacking: one swing per attack. Tearing: the swing starts
 * ZOMBIES.attackWindup before the plank comes off, so the claw lands on it
 * (the strike frames are timed to the windup in the manifest's fps).
 */
export function swingId(z: ZombieState): number | null {
  if (z.ai === 'attacking') return z.actionTick;
  if (z.ai === 'tearing' && z.timer <= ZOMBIES.attackWindup) return z.actionTick;
  return null;
}

/** A strike in progress is let finish while the zombie only walks or crawls on. */
export function isStrike(animation: string): boolean {
  return animation === 'attack' || animation === 'crawl_attack';
}

/**
 * Whether a strike still playing finishes while the zombie walks or crawls
 * on: yes after hitting at a player, never after a swing at planks. A zombie
 * that leaves its window mid-swing walks at once instead of sliding along
 * with its claw out.
 */
export function letsStrikeFinish(z: ZombieState, swingAtPlanks: boolean): boolean {
  return !swingAtPlanks && (z.ai === 'chasing' || z.ai === 'toWindow');
}
