/**
 * Every number of the Dungeon mode (spec 09): the floors, the plan
 * generator and, phase by phase, the rooms, the loot and the wizards. All
 * of them are starting values, to tune after playing. Survival reads none
 * of this.
 */
import type { BossId, BossVariantId } from './bosses';

/** The two games (spec 09 §1): the waves of the mansion, or the rooms of the dungeon. */
export type GameMode = 'survival' | 'dungeon';

/** A floor's look and kits (§2). */
export type Ambient = 'mansion' | 'basement' | 'garden';

/** The rooms of a floor (§2.1). */
export type RoomType = 'start' | 'combat' | 'elite' | 'treasure' | 'hand' | 'challenge' | 'boss';

export type RoomDifficulty = 'easy' | 'medium' | 'hard';

/** The rooms that spawn enemies and count towards the wizard (§7.1). */
export const ENEMY_ROOM_TYPES: readonly RoomType[] = ['combat', 'elite', 'challenge'];

/** The rooms whose door asks for a key (§4.1): never a way through, only an end. */
export const KEYED_ROOM_TYPES: readonly RoomType[] = ['treasure', 'boss'];

export interface FloorConfig {
  ambient: Ambient;
  /** `combat` rooms plus the `elite` one (§2.1); the challenge room is apart. */
  enemyRooms: number;
  boss: BossId;
  variant: BossVariantId;
  /** The boss's life, final (the variant's own multiplier does not apply: the user's choice, docs/DECISIONS.md). */
  bossHp: number;
  /** A base zombie's life on this floor (§5.1). */
  zombieHp: number;
}

export const DUNGEON = {
  /** The plan's grid, in cells (§3.1); the start room in the middle. */
  grid: { width: 9, height: 7 },
  /** The three floors (§2). */
  floors: [
    { ambient: 'mansion', enemyRooms: 6, boss: 'butcher', variant: 'base', bossHp: 60, zombieHp: 3 },
    { ambient: 'basement', enemyRooms: 8, boss: 'butcher', variant: 'rabid', bossHp: 110, zombieHp: 4 },
    { ambient: 'garden', enemyRooms: 10, boss: 'butcher', variant: 'putrid', bossHp: 180, zombieHp: 5 },
  ] as const satisfies readonly FloorConfig[],
  /** Past the victory (§12): the ambients rotate, this many enemy rooms, and life and budgets grow this much per floor over the third. */
  endless: { enemyRooms: 10, scalePerFloor: 1.25 },
  /** Growing the plan (§3.1): the chance a cell grows into each free neighbour. */
  growChance: 0.5,
  /** A floor has a challenge room this often (§2.1). */
  challengeChance: 0.6,
  /** A template is laid out mirrored this often (§3.1). */
  mirrorChance: 0.5,
  /** The boss arena, in cells per side (§3.1). */
  arenaSize: 2,
  /** Rooms between the start and the boss, at least (the user's choice, docs/DECISIONS.md): a plan with it nearer is drawn again. */
  minBossDepth: 3,
  /** A plan that fails its checks is drawn again, up to this many times, before giving up (never seen with these numbers). */
  maxAttempts: 200,
  /** The difficulties a floor draws its rooms from (§3.2): the first floor, and the rest. */
  difficulties: { first: ['easy', 'medium'], later: ['medium', 'hard'] } as const satisfies Record<string, readonly RoomDifficulty[]>,
  /** The template bank each ambient starts with (§3.2), per room type. */
  bank: { combat: 8, elite: 2, challenge: 2, start: 1, treasure: 1, hand: 1, boss: 1 } as const satisfies Record<RoomType, number>,
} as const;

/** The number of hand-made floors before the endless ones. */
export const FLOORS = DUNGEON.floors.length;

/** A floor's configuration: one of the three, or an endless one past them (§12). */
export function floorConfig(floor: number): FloorConfig {
  const n = Math.max(1, Math.floor(floor));
  const base = DUNGEON.floors[(n - 1) % FLOORS] as FloorConfig;
  if (n <= FLOORS) return base;
  const scale = DUNGEON.endless.scalePerFloor ** (n - FLOORS);
  return { ...base, enemyRooms: DUNGEON.endless.enemyRooms, bossHp: Math.round(base.bossHp * scale), zombieHp: Math.round(base.zombieHp * scale) };
}

/** The difficulties a floor's rooms are drawn from (§3.2). */
export function floorDifficulties(floor: number): readonly RoomDifficulty[] {
  return floor <= 1 ? DUNGEON.difficulties.first : DUNGEON.difficulties.later;
}
