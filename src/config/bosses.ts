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
}

export const BOSSES: Readonly<Record<BossId, BossDef>> = {
  // El Matarife: a fat zombie with a mallet, the size of a van next to the characters.
  butcher: {
    id: 'butcher',
    footprintTiles: 2,
    hurtbox: { width: 64, height: 80 },
    drawn: { width: 96, height: 110 },
    hp: 100,
    speed: 38,
    attacks: ['charge', 'slam', 'leap'],
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
