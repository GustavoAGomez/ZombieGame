/**
 * Bosses (spec 07 §1), all by data: the catalogue, the variants laid over
 * any boss, and the calendar of the rounds they come in. A new boss is a
 * row in BOSSES (and its art); putting it in a round is a row in
 * BOSS_SCHEDULE. The rules shared by every boss (entry, round, rewards) are
 * BOSS in balance.ts.
 */
export type BossId = 'butcher';
export type BossVariantId = 'base' | 'rabid' | 'putrid';
export type BossAttackId = 'charge' | 'slam' | 'leap';

/**
 * The charge (spec 07 §4.1): it crouches for `windup` s with a corridor
 * `width` px wide on the floor towards its target (the direction follows
 * them and locks `lockBefore` s before it runs), then runs up to
 * `distance` px at `speed` px/s. A player it catches takes `damage` and is
 * thrown `knockback` px, once per charge. Into a wall it is stunned for
 * `stunTime` s, taking stunDamageFactor× damage; otherwise it brakes for
 * `brakeTime` s.
 */
export interface ChargeParams {
  windup: number;
  lockBefore: number;
  width: number;
  distance: number;
  speed: number;
  damage: number;
  knockback: number;
  stunTime: number;
  stunDamageFactor: number;
  brakeTime: number;
}

/**
 * The triple slam (spec 07 §4.2): `hits` blows, each over an arc of `arc`
 * degrees in front of it up to `reach` px from its centre, drawn on the
 * floor before it falls. The first winds up for `windup` s; between blows
 * (`between` s, the next one's warning) it turns towards its target by
 * `turnMax` degrees at most and steps `step` px. Each blow: `damage` and a
 * push of `knockback` px. After the last it stands still `recovery` s.
 */
export interface SlamParams {
  arc: number;
  reach: number;
  windup: number;
  between: number;
  turnMax: number;
  step: number;
  hits: number;
  damage: number;
  knockback: number;
  recovery: number;
}

/**
 * The three leaps (spec 07 §4.3): `leaps` jumps, each to where its target
 * stands at takeoff (moved to the nearest place its footprint fits, at most
 * `maxRange` px away), marked with a circle; `air` s in the air, unhurt. The
 * landing hurts `landDamage` within `landRadius` px of its centre, and a ring
 * `waveWidth` px thick grows from there to `waveRadius` px at `waveSpeed`
 * px/s, hurting `waveDamage` once a leap (walls stop it; zombies are spared).
 * `between` s on the ground between leaps; `recovery` s still after the last.
 */
export interface LeapParams {
  leaps: number;
  air: number;
  maxRange: number;
  landRadius: number;
  landDamage: number;
  waveWidth: number;
  waveRadius: number;
  waveSpeed: number;
  waveDamage: number;
  between: number;
  recovery: number;
}

/**
 * Its fury (spec 07 §5): under `at` of its health it roars `roarTime` s and
 * stays enraged until it dies: `speedFactor`× faster, its walks between
 * attacks `walkFactor`× as long; its windups do not change.
 */
export interface FuryParams {
  at: number;
  roarTime: number;
  speedFactor: number;
  walkFactor: number;
}

export interface BossDef {
  id: BossId;
  /** Side of its square footprint on the floor, in tiles: what meets walls and decides where it fits. */
  footprintTiles: number;
  /** The box bullets hit (px), standing on the bottom edge of the footprint, centred on it. */
  hurtbox: { width: number; height: number };
  /** Drawn size (px), standing on the bottom edge of the footprint, centred on it (the placeholder's frame). */
  drawn: { width: number; height: number };
  /** Health in damage units in its first round (× variant, × lap, × players). */
  hp: number;
  /** Walking speed (px/s). */
  speed: number;
  attacks: readonly BossAttackId[];
  /** Seconds it walks towards its target between attacks (a random time in the range). */
  walkTime: { min: number; max: number };
  /**
   * How it picks an attack by the distance from its centre to its target
   * (spec 07 §4.4): close (under closeRange px), mid (up to farRange, with
   * a straight clear way), or far.
   */
  choice: {
    closeRange: number;
    farRange: number;
    /** Weights of the attacks close to its target, and at mid range with a straight clear way. Farther: the leaps. */
    close: readonly (readonly [BossAttackId, number])[];
    mid: readonly (readonly [BossAttackId, number])[];
  };
  charge: ChargeParams;
  slam: SlamParams;
  leap: LeapParams;
  fury: FuryParams;
}

export const BOSSES: Readonly<Record<BossId, BossDef>> = {
  // Matarife: a fat zombie with a mallet, the size of a van next to the characters.
  butcher: {
    id: 'butcher',
    footprintTiles: 2,
    hurtbox: { width: 64, height: 80 },
    drawn: { width: 96, height: 110 },
    hp: 100,
    speed: 38,
    attacks: ['charge', 'slam', 'leap'],
    walkTime: { min: 1.5, max: 2.5 },
    choice: {
      closeRange: 90,
      farRange: 260,
      close: [
        ['slam', 0.7],
        ['leap', 0.3],
      ],
      mid: [
        ['charge', 0.6],
        ['leap', 0.4],
      ],
    },
    charge: { windup: 1, lockBefore: 0.3, width: 64, distance: 256, speed: 300, damage: 45, knockback: 24, stunTime: 2, stunDamageFactor: 2, brakeTime: 0.6 },
    slam: { arc: 160, reach: 84, windup: 0.7, between: 0.5, turnMax: 45, step: 16, hits: 3, damage: 30, knockback: 16, recovery: 1.2 },
    leap: { leaps: 3, air: 0.7, maxRange: 360, landRadius: 44, landDamage: 45, waveWidth: 16, waveRadius: 130, waveSpeed: 170, waveDamage: 20, between: 0.5, recovery: 1.5 },
    fury: { at: 0.5, roarTime: 1, speedFactor: 1.25, walkFactor: 0.5 },
  },
};

export const BOSS_IDS: readonly BossId[] = ['butcher'];

/** Modifiers laid over any boss (spec 07 §1): tint, health, damage and the time its attacks take to wind up. */
export interface BossVariant {
  id: BossVariantId;
  /** '#rrggbb' laid over its art, or null. */
  tint: string | null;
  hp: number;
  damage: number;
  /** Factor on every windup (never under MIN_WINDUP_FACTOR). */
  windup: number;
  /** Starts already enraged (spec 07 §5). */
  enraged: boolean;
  /** Every landing of its leaps leaves a puddle that hurts for a while. */
  puddles: boolean;
}

export const BOSS_VARIANTS: Readonly<Record<BossVariantId, BossVariant>> = {
  base: { id: 'base', tint: null, hp: 1, damage: 1, windup: 1, enraged: false, puddles: false },
  rabid: { id: 'rabid', tint: '#d0644a', hp: 1.8, damage: 1.25, windup: 0.85, enraged: true, puddles: false },
  putrid: { id: 'putrid', tint: '#8fb04a', hp: 2.5, damage: 1.5, windup: 0.85, enraged: true, puddles: true },
};

export const BOSS_VARIANT_IDS: readonly BossVariantId[] = ['base', 'rabid', 'putrid'];

/**
 * A windup never drops under this share of its base value: difficulty grows
 * with health, damage, pairs and the zombies around, never by taking away
 * the time to react.
 */
export const MIN_WINDUP_FACTOR = 0.8;

/** The factor a variant puts on every windup, never under MIN_WINDUP_FACTOR. */
export function windupFactor(variant: BossVariantId): number {
  return Math.max(MIN_WINDUP_FACTOR, BOSS_VARIANTS[variant].windup);
}

export interface BossSpawn {
  boss: BossId;
  variant: BossVariantId;
}

export interface BossRound {
  round: number;
  bosses: readonly BossSpawn[];
}

/**
 * Which bosses come in which round. After the last entry the rounds from
 * `cycleFrom` on come back every `every` rounds, in the same order, with
 * the health × lapHpFactor for every lap (×1.3, ×1.69…).
 */
export const BOSS_SCHEDULE = {
  rounds: [
    { round: 6, bosses: [{ boss: 'butcher', variant: 'base' }] },
    { round: 12, bosses: [{ boss: 'butcher', variant: 'rabid' }] },
    {
      round: 18,
      bosses: [
        { boss: 'butcher', variant: 'base' },
        { boss: 'butcher', variant: 'base' },
      ],
    },
    { round: 24, bosses: [{ boss: 'butcher', variant: 'putrid' }] },
    {
      round: 30,
      bosses: [
        { boss: 'butcher', variant: 'rabid' },
        { boss: 'butcher', variant: 'base' },
      ],
    },
  ] as const satisfies readonly BossRound[],
  cycleFrom: 12,
  every: 6,
  lapHpFactor: 1.3,
} as const;

export interface ScheduledBoss extends BossSpawn {
  /** Health factor of the lap of the cycle (1 the first time round). */
  hpFactor: number;
}

/** The bosses of round `round` (none in most rounds), with their lap's health factor. */
export function bossesForRound(round: number): ScheduledBoss[] {
  const s = BOSS_SCHEDULE;
  const r = Math.floor(round);
  const direct = s.rounds.find((e) => e.round === r);
  if (direct) return direct.bosses.map((b) => ({ ...b, hpFactor: 1 }));
  const last = s.rounds[s.rounds.length - 1]?.round ?? 0;
  if (r <= last || r < s.cycleFrom || (r - s.cycleFrom) % s.every !== 0) return [];
  const cycle = s.rounds.filter((e) => e.round >= s.cycleFrom);
  const k = (r - s.cycleFrom) / s.every;
  const entry = cycle[k % cycle.length];
  if (!entry) return [];
  const lap = Math.floor(k / cycle.length);
  return entry.bosses.map((b) => ({ ...b, hpFactor: s.lapHpFactor ** lap }));
}

/** Health of a boss at its spawn: its base × variant × lap × players (spec 07 §9). */
export function bossHp(boss: BossId, variant: BossVariantId, hpFactor = 1, players = 1): number {
  return BOSSES[boss].hp * BOSS_VARIANTS[variant].hp * hpFactor * Math.max(1, players);
}
