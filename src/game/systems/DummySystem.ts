import { TRAINING_DUMMIES } from '../../config/balance';
import type { SimContext } from './SimContext';

/**
 * Phase 3 only: static training targets so shooting and auto-aim can be
 * tried before zombies exist. Dead dummies come back after a short delay.
 */
export function spawnTrainingDummies(ctx: SimContext): void {
  const { state, map } = ctx;
  const ts = map.tileSize;
  TRAINING_DUMMIES.offsets.forEach(([ox, oy], i) => {
    const z = state.zombies[i];
    if (!z) return;
    z.active = true;
    z.ai = 'dummy';
    z.kind = i === 1 ? 'runner' : i === 2 ? 'sprinter' : 'walker';
    z.homeX = map.playerSpawn.x + ox * ts;
    z.homeY = map.playerSpawn.y + oy * ts;
    z.x = z.prevX = z.homeX;
    z.y = z.prevY = z.homeY;
    z.maxHp = TRAINING_DUMMIES.hp;
    z.hp = z.maxHp;
    z.timer = 0;
  });
}

export function updateDummies(ctx: SimContext, dt: number): void {
  const { state } = ctx;
  for (let i = 0; i < state.zombies.length; i++) {
    const z = state.zombies[i];
    if (!z?.active || z.ai !== 'dummy') continue;
    z.prevX = z.x;
    z.prevY = z.y;
    if (z.hp > 0) {
      // Dummies turn to look at the nearest player.
      const p = state.players[0];
      if (p) z.facing = Math.atan2(p.y - z.y, p.x - z.x);
      continue;
    }
    if (z.timer <= 0) z.timer = TRAINING_DUMMIES.respawnTime;
    z.timer -= dt;
    if (z.timer <= 0) {
      z.timer = 0;
      z.hp = z.maxHp;
      z.x = z.prevX = z.homeX;
      z.y = z.prevY = z.homeY;
    }
  }
}
