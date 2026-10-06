/**
 * The dungeon's permanent upgrades and curses (spec 09 §7.2, §9): each one
 * by data (its rarity, how many copies stack, and its numbers). Their
 * effects add up in one place, src/game/dungeon/stats.ts, which the systems
 * read; nobody asks for an upgrade by name but that function. The names
 * and descriptions are in src/ui/strings.ts.
 */

export type Rarity = 'common' | 'rare' | 'legendary';

export type UpgradeId =
  | 'vitality'
  | 'quick_hands'
  | 'light_feet'
  | 'magnet'
  | 'greed'
  | 'deep_pockets'
  | 'sharp_knife'
  | 'piercing'
  | 'ricochet'
  | 'incendiary'
  | 'volatile'
  | 'leech'
  | 'second_wind'
  | 'adrenaline'
  | 'fan_fire'
  | 'shadow_dash'
  | 'ward'
  | 'executioner';

export type CurseId = 'frail' | 'hunted' | 'tithe' | 'leak';

export interface UpgradeDef {
  id: UpgradeId;
  rarity: Rarity;
  /** Copies that stack; past them it is never offered again. */
  maxCopies: number;
}

export const UPGRADES: Readonly<Record<UpgradeId, UpgradeDef>> = {
  vitality: { id: 'vitality', rarity: 'common', maxCopies: 3 },
  quick_hands: { id: 'quick_hands', rarity: 'common', maxCopies: 2 },
  light_feet: { id: 'light_feet', rarity: 'common', maxCopies: 2 },
  magnet: { id: 'magnet', rarity: 'common', maxCopies: 1 },
  greed: { id: 'greed', rarity: 'common', maxCopies: 2 },
  deep_pockets: { id: 'deep_pockets', rarity: 'common', maxCopies: 2 },
  sharp_knife: { id: 'sharp_knife', rarity: 'common', maxCopies: 1 },
  piercing: { id: 'piercing', rarity: 'rare', maxCopies: 2 },
  ricochet: { id: 'ricochet', rarity: 'rare', maxCopies: 2 },
  incendiary: { id: 'incendiary', rarity: 'rare', maxCopies: 2 },
  volatile: { id: 'volatile', rarity: 'rare', maxCopies: 2 },
  leech: { id: 'leech', rarity: 'rare', maxCopies: 2 },
  second_wind: { id: 'second_wind', rarity: 'rare', maxCopies: 1 },
  adrenaline: { id: 'adrenaline', rarity: 'rare', maxCopies: 1 },
  fan_fire: { id: 'fan_fire', rarity: 'legendary', maxCopies: 1 },
  shadow_dash: { id: 'shadow_dash', rarity: 'legendary', maxCopies: 1 },
  ward: { id: 'ward', rarity: 'legendary', maxCopies: 1 },
  executioner: { id: 'executioner', rarity: 'legendary', maxCopies: 1 },
};

export const UPGRADE_IDS = Object.keys(UPGRADES) as readonly UpgradeId[];
export const CURSE_IDS: readonly CurseId[] = ['frail', 'hunted', 'tithe', 'leak'];
export const RARITIES: readonly Rarity[] = ['common', 'rare', 'legendary'];

/**
 * What each copy adds (§7.2). Factors multiply per copy where it says so
 * (two Codicias: ×1.3 × 1.3); the rest add up or switch on.
 */
export const UPGRADE_EFFECTS = {
  /** +maxHp of life, and that much healed, per copy. */
  vitality: { maxHp: 25, heal: 25 },
  /** The reload takes this share of its time, per copy. */
  quick_hands: { reload: 0.75 },
  /** Speed ×, per copy. */
  light_feet: { speed: 1.1 },
  /** Pickups reach this many times farther, and what lies on the floor never fades. */
  magnet: { range: 3 },
  /** Money ×, per copy. */
  greed: { money: 1.3 },
  /** Reserve ammo ×, per copy. */
  deep_pockets: { reserve: 1.5 },
  /** The knife's damage × and reach ×. */
  sharp_knife: { damage: 2, reach: 1.3 },
  /** Bullets go through this many more enemies, per copy. */
  piercing: { extra: 1 },
  /** Bullets bounce off walls this many times, per copy. With Perforantes, a bounce gives the pierces back. */
  ricochet: { bounces: 1 },
  /** Chance a hit sets the enemy on fire (the shotgun's burn), per copy, added up. */
  incendiary: { chance: 0.2 },
  /** Enemies burst on death: `damage` to the others within `radius` px; burning, the radius × `burningRadius` and the burst sets them on fire. */
  volatile: { radius: 40, damage: 2, burningRadius: 1.5 },
  /** `heal` life every `kills` kills, per copy (two: every 5). */
  leech: { kills: 10, heal: 5 },
  /** One more dash before the cooldown. */
  second_wind: { dashes: 1 },
  /** With low health: fire rate × and speed ×. */
  adrenaline: { fireRate: 1.3, speed: 1.3 },
  /** `extra` more projectiles to the sides, `angle`° apart, at `damage` of the shot's. */
  fan_fire: { extra: 2, angle: 12, damage: 0.5 },
  /** The dash hurts what it crosses `damage` and leaves fire for `trail` s, `trailRadius` px wide, that burns the enemies on it `trailBurn` in all. */
  shadow_dash: { damage: 3, trail: 1.5, trailRadius: 14, trailBurn: 2 },
  /** The first hit of each room is absorbed. */
  ward: {},
  /** `chance` of a critical hit, × `multiplier`. */
  executioner: { chance: 0.15, multiplier: 3 },
} as const satisfies Record<UpgradeId, object>;

/** The curses of the pact (§9), for the whole run. */
export const CURSE_EFFECTS = {
  frail: { maxHp: -25 },
  hunted: { enemySpeed: 1.15 },
  tithe: { prices: 1.3 },
  leak: { reserve: 0.7 },
} as const satisfies Record<CurseId, object>;

/** What the wizard charges per rarity (§7.1). */
export const RARITY_PRICES: Readonly<Record<Rarity, number>> = { common: 300, rare: 500, legendary: 900 };

/** The chance of each rarity per slot of the offer (§7.1): the first floors, and from `lateFromFloor` on. */
export const RARITY_CHANCES = {
  early: { common: 0.6, rare: 0.3, legendary: 0.1 },
  late: { common: 0.45, rare: 0.35, legendary: 0.2 },
  lateFromFloor: 3,
} as const;

export function rarityOf(id: UpgradeId): Rarity {
  return UPGRADES[id].rarity;
}
