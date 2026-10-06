/**
 * The one place the upgrades and curses add up (spec 09 §7.2): from the
 * run's lists to the numbers the systems read. Without a run (Survival)
 * everything is neutral, so the shared systems never ask which mode they
 * are in. Memoized per run while its lists do not grow.
 */
import { PLAYER } from '../../config/balance';
import { CURSE_EFFECTS, UPGRADE_EFFECTS, type CurseId, type UpgradeId } from '../../config/upgrades';
import type { PlayerState } from '../../core/GameState';
import type { RunState } from '../../core/RunState';

export interface PlayerStats {
  /** Added to PLAYER.maxHp (Vitalidad, Frágil). */
  maxHpBonus: number;
  /** The reload's time ×. */
  reload: number;
  /** The player's speed ×. */
  speed: number;
  /** How far pickups are taken from ×, and whether they fade. */
  pickupRange: number;
  pickupsExpire: boolean;
  /** Money (and points) ×. */
  money: number;
  /** Reserve ammo ×. */
  reserve: number;
  knifeDamage: number;
  knifeReach: number;
  /** Enemies a bullet goes through beyond its own. */
  extraPierce: number;
  /** Bounces off walls per bullet; with pierces to give back on each bounce (Perforantes + Rebote). */
  bounces: number;
  /** Chance a hit sets the enemy on fire. */
  igniteChance: number;
  volatile: { radius: number; damage: number; burningRadius: number } | null;
  leech: { kills: number; heal: number } | null;
  /** Dashes before the cooldown. */
  dashes: number;
  adrenaline: { fireRate: number; speed: number } | null;
  fan: { extra: number; angle: number; damage: number } | null;
  shadowDash: { damage: number; trail: number; trailRadius: number; trailBurn: number } | null;
  ward: boolean;
  crit: { chance: number; multiplier: number } | null;
  /** The enemies' speed × (Acosado). */
  enemySpeed: number;
  /** The wizard's prices × (Diezmo). */
  prices: number;
}

export const NEUTRAL_STATS: Readonly<PlayerStats> = {
  maxHpBonus: 0,
  reload: 1,
  speed: 1,
  pickupRange: 1,
  pickupsExpire: true,
  money: 1,
  reserve: 1,
  knifeDamage: 1,
  knifeReach: 1,
  extraPierce: 0,
  bounces: 0,
  igniteChance: 0,
  volatile: null,
  leech: null,
  dashes: 1,
  adrenaline: null,
  fan: null,
  shadowDash: null,
  ward: false,
  crit: null,
  enemySpeed: 1,
  prices: 1,
};

/** How many copies of `id` the run holds. */
export function copiesOf(run: Pick<RunState, 'upgrades'>, id: UpgradeId): number {
  let n = 0;
  for (const u of run.upgrades) if (u === id) n++;
  return n;
}

export function hasCurse(run: Pick<RunState, 'curses'>, id: CurseId): boolean {
  return run.curses.includes(id);
}

const cache = new WeakMap<RunState, { key: string; stats: PlayerStats }>();

/** The stats of a run's player (neutral without a run). */
export function playerStats(run: RunState | null | undefined): Readonly<PlayerStats> {
  if (!run) return NEUTRAL_STATS;
  const key = `${run.upgrades.length}:${run.curses.length}`;
  const hit = cache.get(run);
  if (hit && hit.key === key) return hit.stats;
  const stats = computeStats(run);
  cache.set(run, { key, stats });
  return stats;
}

function computeStats(run: RunState): PlayerStats {
  const c = (id: UpgradeId): number => copiesOf(run, id);
  const E = UPGRADE_EFFECTS;
  const s: PlayerStats = { ...NEUTRAL_STATS };
  s.maxHpBonus = c('vitality') * E.vitality.maxHp + (hasCurse(run, 'frail') ? CURSE_EFFECTS.frail.maxHp : 0);
  s.reload = E.quick_hands.reload ** c('quick_hands');
  s.speed = E.light_feet.speed ** c('light_feet');
  if (c('magnet') > 0) {
    s.pickupRange = E.magnet.range;
    s.pickupsExpire = false;
  }
  s.money = E.greed.money ** c('greed');
  s.reserve = E.deep_pockets.reserve ** c('deep_pockets') * (hasCurse(run, 'leak') ? CURSE_EFFECTS.leak.reserve : 1);
  if (c('sharp_knife') > 0) {
    s.knifeDamage = E.sharp_knife.damage;
    s.knifeReach = E.sharp_knife.reach;
  }
  s.extraPierce = c('piercing') * E.piercing.extra;
  s.bounces = c('ricochet') * E.ricochet.bounces;
  s.igniteChance = Math.min(1, c('incendiary') * E.incendiary.chance);
  if (c('volatile') > 0) s.volatile = { radius: E.volatile.radius, damage: E.volatile.damage * c('volatile'), burningRadius: E.volatile.burningRadius };
  if (c('leech') > 0) s.leech = { kills: Math.max(1, Math.round(E.leech.kills / c('leech'))), heal: E.leech.heal };
  s.dashes = 1 + c('second_wind') * E.second_wind.dashes;
  if (c('adrenaline') > 0) s.adrenaline = { fireRate: E.adrenaline.fireRate, speed: E.adrenaline.speed };
  if (c('fan_fire') > 0) s.fan = { extra: E.fan_fire.extra, angle: E.fan_fire.angle, damage: E.fan_fire.damage };
  if (c('shadow_dash') > 0) s.shadowDash = { ...E.shadow_dash };
  s.ward = c('ward') > 0;
  if (c('executioner') > 0) s.crit = { chance: E.executioner.chance, multiplier: E.executioner.multiplier };
  s.enemySpeed = hasCurse(run, 'hunted') ? CURSE_EFFECTS.hunted.enemySpeed : 1;
  s.prices = hasCurse(run, 'tithe') ? CURSE_EFFECTS.tithe.prices : 1;
  return s;
}

/** Adrenalina runs while the player's health is low (§7.2). */
export function adrenalineOn(stats: Readonly<PlayerStats>, p: Pick<PlayerState, 'hp'>): boolean {
  return stats.adrenaline !== null && p.hp > 0 && p.hp < PLAYER.lowHpThreshold;
}

/** The player's speed × with their upgrades, Adrenalina included. */
export function speedBonus(stats: Readonly<PlayerStats>, p: Pick<PlayerState, 'hp'>): number {
  return stats.speed * (adrenalineOn(stats, p) ? (stats.adrenaline?.speed ?? 1) : 1);
}

/** The fire rate × with Adrenalina. */
export function fireRateBonus(stats: Readonly<PlayerStats>, p: Pick<PlayerState, 'hp'>): number {
  return adrenalineOn(stats, p) ? (stats.adrenaline?.fireRate ?? 1) : 1;
}

/** The life a player should have at most with their upgrades and curses. */
export function maxHpWith(stats: Readonly<PlayerStats>): number {
  return Math.max(1, PLAYER.maxHp + stats.maxHpBonus);
}
