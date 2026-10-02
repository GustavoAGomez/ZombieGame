import type Phaser from 'phaser';
import { ACTIVATIONS } from '../../config/activations';
import { ITEMS, SIM } from '../../config/balance';
import { COLORS } from '../../config/theme';
import type { GameState } from '../../core/GameState';
import { DEPTH } from '../depth';
import type { MapData } from '../map/MapLoader';

const RED = Number.parseInt(COLORS.red.slice(1), 16);
const BUBBLE = 0xf2b8a8;
/** A faint reddish tint once something is in, and the red it boils to when complete. */
const TINT_ALPHA = 0.24;
const BURST_ALPHA = 0.5;
const BUBBLES = 14;
/** Slow bubbles while waiting (few, long-lived) and the boil when complete (all, quick). */
const SLOW = { count: 4, life: 1.8 };
const BOIL = { count: BUBBLES, life: 0.45 };
/** Bubbles keep this far from the water's edge (px). */
const MARGIN = 4;

interface View {
  index: number;
  rect: { x: number; y: number; width: number; height: number };
  tint: Phaser.GameObjects.Rectangle;
  bubbles: Phaser.GameObjects.Arc[];
}

/**
 * The activation sites' looks (spec 05 §6), drawn over their water: nothing
 * while empty; with an item in, a faint reddish tint and slow bubbles that
 * stay; when the last item lands, it boils red for ITEMS.activationBurstTime
 * and goes back to normal for good. Read from the activations' state on
 * simulated time, so the pause freezes it. Visual only.
 */
export class ActivationSiteViews {
  private readonly views: View[];

  constructor(scene: Phaser.Scene, map: MapData) {
    this.views = ACTIVATIONS.flatMap((def, index) => {
      const site = map.activationSites.find((s) => s.id === def.site);
      if (!site) return [];
      const tint = scene.add
        .rectangle(site.x, site.y, site.width, site.height, RED, TINT_ALPHA)
        .setOrigin(0, 0)
        .setDepth(DEPTH.decals)
        .setVisible(false);
      const bubbles = Array.from({ length: BUBBLES }, () => scene.add.circle(0, 0, 1, BUBBLE, 0.9).setDepth(DEPTH.decals + 0.1).setVisible(false));
      return [{ index, rect: { x: site.x, y: site.y, width: site.width, height: site.height }, tint, bubbles }];
    });
  }

  sync(state: GameState): void {
    for (const v of this.views) {
      const st = state.activations[v.index];
      if (!st) continue;
      const landed = st.landsAt.filter((t) => t <= state.tick).length;
      const sinceDone = st.done ? (state.tick - st.doneTick) / SIM.hz : -1;
      const boiling = st.done && sinceDone < ITEMS.activationBurstTime;
      const waiting = !st.done && landed > 0;
      v.tint.setVisible(boiling || waiting);
      if (boiling) v.tint.setAlpha(BURST_ALPHA);
      else if (waiting) v.tint.setAlpha(TINT_ALPHA);
      const mode = boiling ? BOIL : waiting ? SLOW : null;
      v.bubbles.forEach((b, i) => {
        if (!mode || i >= mode.count) {
          if (b.visible) b.setVisible(false);
          return;
        }
        const cycles = state.time / mode.life + i / mode.count;
        const cycle = Math.floor(cycles);
        const life = cycles - cycle;
        // Each cycle a new place on the water, the same one every time for a given bubble and cycle.
        const x = v.rect.x + MARGIN + hash(i, cycle, 1) * (v.rect.width - MARGIN * 2);
        const y = v.rect.y + MARGIN + hash(i, cycle, 2) * (v.rect.height - MARGIN * 2);
        b.setVisible(true)
          .setPosition(Math.round(x), Math.round(y))
          .setRadius(1 + 2 * life)
          .setAlpha(life < 0.85 ? 0.9 : ((1 - life) / 0.15) * 0.9);
      });
    }
  }
}

/** A repeatable number in [0, 1) for a bubble, a cycle and an axis. */
function hash(i: number, cycle: number, axis: number): number {
  let h = (i * 73856093) ^ (cycle * 19349663) ^ (axis * 83492791);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
