/**
 * Asset manifest (docs/ASSETS.md §4). Code refers to assets by key only;
 * file paths live in public/assets/manifest.json (CLAUDE.md rule 5).
 */
import { BOSS_IDS, type BossId } from '../../config/bosses';
import { ITEM_IDS, type ItemId } from '../../config/items';

/**
 * Rows of a character sheet: 8 or 4 directions, or 1 for a character that
 * always faces the camera (the merchants).
 */
export type Directions = 1 | 4 | 8;

function isDirections(value: unknown): value is Directions {
  return value === 1 || value === 4 || value === 8;
}

export interface AnimationDef {
  file: string;
  frames: number;
  fps: number;
  loop: boolean;
  /** This animation has no art yet (the character may have others). */
  placeholder?: boolean;
  /** Rows of this sheet when they differ from the character's (a 4-way climb in an 8-way zombie). */
  directions?: Directions;
  /**
   * Frames where something happens in the art, by name (the boss's slam:
   * its mallet hits the floor on frame `hit`). Each is a frame index.
   */
  marks?: Record<string, number>;
}

export interface CharacterDef {
  frameWidth: number;
  frameHeight: number;
  anchor: { x: number; y: number };
  hitbox: { radius: number };
  directions: Directions;
  placeholder?: boolean;
  animations: Record<string, AnimationDef>;
  /**
   * Where the gun's muzzle is in each direction row, in frame pixels
   * (sheet row order). Used for muzzle flashes, the aim line and bullets.
   */
  muzzle?: [number, number][];
}

export interface TilesetDef {
  file: string;
  tileWidth: number;
  tileHeight: number;
  placeholder?: boolean;
}

export interface ObjectDef {
  file: string;
  frameWidth: number;
  frameHeight: number;
  frames: number;
  placeholder?: boolean;
}

/**
 * A piece of the HUD skin (DOM, drawn by CSS): its image and size, the
 * 9-slice inset for stretchable frames, and where the health bar's trough is.
 */
export interface UiRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface UiPieceDef {
  file: string;
  width: number;
  height: number;
  /** 9-slice insets [top, right, bottom, left]. */
  slice?: [number, number, number, number];
  /** The health bar's trough (where the segments go) and its heart (px of the image). */
  trough?: UiRect;
  heart?: UiRect;
}

function uiRect(value: unknown, where: string): UiRect | undefined {
  if (!isRecord(value)) return undefined;
  return { x: Number(value.x) || 0, y: Number(value.y) || 0, width: positive(value.width, `${where}.width`), height: positive(value.height, `${where}.height`) };
}

/**
 * A sound file (spec 08 §1.2): WAV for the effects, with its length in
 * seconds; the music also says where its loop starts and ends.
 */
/** A candidate of a sound (spec 08 §4.4). */
export type AudioCandidate = 'A' | 'B' | 'C';

export interface AudioDef {
  file: string;
  duration: number;
  /** No file yet: the sound is silence, never an error (CLAUDE.md rule 5). */
  placeholder: boolean;
  loopStart?: number;
  loopEnd?: number;
  /** A candidate's file (spec 08 §4.4): only the debug build loads it, for the sound test. */
  candidate?: AudioCandidate;
  /** A game file: the candidate it comes from, and whether that one is still to be chosen (A plays meanwhile). */
  picked?: AudioCandidate;
  pending?: boolean;
}

export interface Manifest {
  tileSize: number;
  characters: Record<string, CharacterDef>;
  tilesets: Record<string, TilesetDef>;
  objects: Record<string, ObjectDef>;
  maps: Record<string, string>;
  /** Dungeon room templates per ambient (npm run rooms:build), spec 09 §3.2. */
  rooms: Record<string, string>;
  /** Every tileset as the map compiler needs it (npm run map:build): the dungeon compiles its floors at runtime (spec 09 §3.3). */
  tilesetData: string | null;
  /** HUD skin pieces (npm run hud:import); without them the HUD keeps its CSS-only look. */
  ui: Record<string, UiPieceDef>;
  /** Sound files by key (npm run audio:gen); the catalog in src/config/audio.ts names them. */
  audio: Record<string, AudioDef>;
}

/** Row order of character sheets (same as PixelLab). */
export const DIRECTIONS_8 = [
  'south',
  'south-east',
  'east',
  'north-east',
  'north',
  'north-west',
  'west',
  'south-west',
] as const;

/** Row order for sheets declared with "directions": 4. */
export const DIRECTIONS_4 = ['south', 'east', 'north', 'west'] as const;

/**
 * A boss's animations (spec 07 §8): standing, walking, each stage of its
 * attacks, its roar and its fall. BossView picks the frame from its state.
 */
export const BOSS_ANIMATIONS = ['idle', 'walk', 'charge_windup', 'charge', 'stunned', 'slam', 'leap', 'roar', 'death'] as const;
export type BossAnimation = (typeof BOSS_ANIMATIONS)[number];

/** Minimum animations each character must provide (docs/ASSETS.md §3). */
export const REQUIRED_ANIMATIONS: Readonly<Record<string, readonly string[]>> = {
  player: ['idle', 'walk', 'shoot', 'dash', 'death'],
  zombie_walker: ['walk', 'attack', 'death'],
  zombie_runner: ['walk', 'attack', 'death'],
  ...Object.fromEntries(BOSS_IDS.map((id) => [bossCharacterKey(id), BOSS_ANIMATIONS])),
};

/** Map objects that must exist, one per wall orientation (docs/ASSETS.md §4). */
export const REQUIRED_OBJECTS: readonly string[] = [
  'window_planks',
  'window_planks_v',
  'door',
  'door_v',
  'portal',
  'merchant_blue',
  'merchant_red',
  'merchant_gold',
  'merchant_gem',
  'smoke_puff',
  'offscreen_arrow',
  ...ITEM_IDS.map((id) => itemSpriteKey(id)),
  'boss_rubble',
  'boss_puddle',
];

/** Asset keys the game code uses. */
export const ASSET_KEYS = {
  player: 'player',
  zombieWalker: 'zombie_walker',
  zombieRunner: 'zombie_runner',
  zombieSprinter: 'zombie_sprinter',
  tilesetInterior: 'interior',
  windowPlanks: 'window_planks',
  windowPlanksV: 'window_planks_v',
  /** A fence's gap barricaded: the planks alone (npm run windows:compose). */
  fencePlanks: 'fence_planks',
  fencePlanksV: 'fence_planks_v',
  door: 'door',
  doorV: 'door_v',
  portal: 'portal',
  bullet: 'bullet',
  aimDot: 'aim_dot',
  blood: 'blood',
  /** Drops of a hit's blood spray, in flight and landed (BloodSpray). */
  bloodDrop: 'blood_drop',
  bloodSplat: 'blood_splat',
  /** The player's blood: fresh red drops and splats, and the stains left on the body until full health. */
  bloodDropFresh: 'blood_drop_fresh',
  bloodSplatFresh: 'blood_splat_fresh',
  bloodStain: 'blood_stain',
  pickupAmmo: 'pickup_ammo',
  pickupHealth: 'pickup_health',
  /** The dungeon's keys (spec 09 §6.1). */
  pickupKey: 'pickup_key',
  pickupBossKey: 'pickup_boss_key',
  muzzleFlash: 'muzzle_flash',
  meleeSlash: 'melee_slash',
  katanaSlash: 'katana_slash',
  /** Merchant bodies are `merchant_<id>` (merchantTextureKey). */
  merchantGem: 'merchant_gem',
  smokePuff: 'smoke_puff',
  /** A small flame rising off a burning zombie (the burn effect, spec 04). */
  flame: 'flame',
  /**
   * Weapon cases (spec 04 §3): one frame per weapon in WEAPON_IDS order.
   * `weapon_case` faces south (28×18); `weapon_case_v` faces east or west
   * (18×28; west is drawn mirrored).
   */
  weaponCase: 'weapon_case',
  weaponCaseV: 'weapon_case_v',
  offscreenArrow: 'offscreen_arrow',
  /**
   * The Demon's Hand (spec 06 §3.7), all 32 px wide: its hole in the floor,
   * sealed by a crust with glowing cracks (a loop), breaking open (closing is
   * the same frames backwards) and open with fire inside (a loop); the hand
   * (32×48: fist, open holding the weapon, open and empty, mocking); and the
   * embers rising over it (8×8, one variant per frame).
   */
  handCrack: 'hand_crack',
  handCrackOpening: 'hand_crack_opening',
  handCrackOpen: 'hand_crack_open',
  demonHand: 'demon_hand',
  handEmber: 'hand_ember',
  /**
   * Each weapon seen from the side, pointing right: one frame per weapon in
   * WEAPON_IDS order. Over the Demon's Hand and in the HUD's weapon slots and
   * action button (ui/sheetIcons.ts).
   */
  weaponIcon: 'weapon_icon',
  /** The round buttons' symbols in the HUD (ui/sheetIcons.ts): reload, repair, knife and dash. */
  iconReload: 'icon_reload',
  iconRepair: 'icon_repair',
  iconKnife: 'icon_knife',
  iconDash: 'icon_dash',
  /** Splinters left where a boss crushed furniture (spec 07 §8): 32×32, tiled over its footprint, one variant per frame. */
  bossRubble: 'boss_rubble',
  bossPuddle: 'boss_puddle',
  mapRoom01: 'room01',
  mapMansion: 'mansion',
} as const;

/**
 * A special item's animated sprite (spec 05): `item_<id>`, 24×24 frames
 * played at the item's fps, the same on the map, in flight and in its HUD
 * slot.
 */
export function itemSpriteKey(id: ItemId): string {
  return `item_${id}`;
}

/**
 * A boss's character (spec 07 §8): `boss_<id>`, with BOSS_ANIMATIONS,
 * standing on its anchor at the bottom edge of its footprint.
 */
export function bossCharacterKey(id: BossId): string {
  return `boss_${id}`;
}

export const MANIFEST_URL = 'assets/manifest.json';
export const ASSETS_BASE_URL = 'assets/';

export class ManifestError extends Error {
  override name = 'ManifestError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function positive(value: unknown, where: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new ManifestError(`${where} must be a positive number`);
  }
  return value;
}

function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new ManifestError(`${where} must be a string`);
  return value;
}

function section(value: unknown, where: string): Record<string, unknown> {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new ManifestError(`${where} must be an object`);
  return value;
}

/** Validates raw JSON and returns a typed manifest, or throws ManifestError. */
export function parseManifest(json: unknown): Manifest {
  if (!isRecord(json)) throw new ManifestError('The manifest must be a JSON object');
  const tileSize = positive(json.tileSize, 'tileSize');

  const characters: Record<string, CharacterDef> = {};
  for (const [key, raw] of Object.entries(section(json.characters, 'characters'))) {
    const where = `characters.${key}`;
    if (!isRecord(raw)) throw new ManifestError(`${where} must be an object`);
    const anchor = isRecord(raw.anchor) ? raw.anchor : {};
    const hitbox = isRecord(raw.hitbox) ? raw.hitbox : {};
    const directions = raw.directions ?? 8;
    if (!isDirections(directions)) throw new ManifestError(`${where}.directions must be 1, 4 or 8`);
    const animations: Record<string, AnimationDef> = {};
    for (const [anim, a] of Object.entries(section(raw.animations, `${where}.animations`))) {
      const aw = `${where}.animations.${anim}`;
      if (!isRecord(a)) throw new ManifestError(`${aw} must be an object`);
      if (a.directions !== undefined && !isDirections(a.directions)) {
        throw new ManifestError(`${aw}.directions must be 1, 4 or 8`);
      }
      const frames = positive(a.frames, `${aw}.frames`);
      let marks: Record<string, number> | undefined;
      if (a.marks !== undefined) {
        if (!isRecord(a.marks)) throw new ManifestError(`${aw}.marks must be an object`);
        marks = {};
        for (const [name, frame] of Object.entries(a.marks)) {
          if (typeof frame !== 'number' || !Number.isInteger(frame) || frame < 0 || frame >= frames) {
            throw new ManifestError(`${aw}.marks.${name} must be a frame index under ${frames}`);
          }
          marks[name] = frame;
        }
      }
      animations[anim] = {
        file: text(a.file, `${aw}.file`),
        frames,
        fps: positive(a.fps, `${aw}.fps`),
        loop: a.loop === true,
        placeholder: a.placeholder === true,
        ...(a.directions !== undefined ? { directions: a.directions } : {}),
        ...(marks ? { marks } : {}),
      };
    }
    let muzzle: [number, number][] | undefined;
    if (raw.muzzle !== undefined) {
      if (!Array.isArray(raw.muzzle) || raw.muzzle.length !== directions) {
        throw new ManifestError(`${where}.muzzle must have one [x, y] per direction (${directions})`);
      }
      muzzle = raw.muzzle.map((pt: unknown, i) => {
        if (!Array.isArray(pt) || pt.length !== 2 || !pt.every((n) => typeof n === 'number')) {
          throw new ManifestError(`${where}.muzzle[${i}] must be [x, y]`);
        }
        return [pt[0] as number, pt[1] as number];
      });
    }
    characters[key] = {
      frameWidth: positive(raw.frameWidth, `${where}.frameWidth`),
      frameHeight: positive(raw.frameHeight, `${where}.frameHeight`),
      anchor: {
        x: typeof anchor.x === 'number' ? anchor.x : 0.5,
        y: typeof anchor.y === 'number' ? anchor.y : 0.5,
      },
      hitbox: { radius: typeof hitbox.radius === 'number' ? hitbox.radius : 6 },
      directions,
      placeholder: raw.placeholder === true,
      animations,
      ...(muzzle ? { muzzle } : {}),
    };
  }

  const tilesets: Record<string, TilesetDef> = {};
  for (const [key, raw] of Object.entries(section(json.tilesets, 'tilesets'))) {
    const where = `tilesets.${key}`;
    if (!isRecord(raw)) throw new ManifestError(`${where} must be an object`);
    tilesets[key] = {
      file: text(raw.file, `${where}.file`),
      tileWidth: positive(raw.tileWidth, `${where}.tileWidth`),
      tileHeight: positive(raw.tileHeight, `${where}.tileHeight`),
      placeholder: raw.placeholder === true,
    };
  }

  const objects: Record<string, ObjectDef> = {};
  for (const [key, raw] of Object.entries(section(json.objects, 'objects'))) {
    const where = `objects.${key}`;
    if (!isRecord(raw)) throw new ManifestError(`${where} must be an object`);
    objects[key] = {
      file: text(raw.file, `${where}.file`),
      frameWidth: positive(raw.frameWidth, `${where}.frameWidth`),
      frameHeight: positive(raw.frameHeight, `${where}.frameHeight`),
      frames: positive(raw.frames, `${where}.frames`),
      placeholder: raw.placeholder === true,
    };
  }

  const maps: Record<string, string> = {};
  for (const [key, raw] of Object.entries(section(json.maps, 'maps'))) maps[key] = text(raw, `maps.${key}`);
  const rooms: Record<string, string> = {};
  for (const [key, raw] of Object.entries(section(json.rooms, 'rooms'))) rooms[key] = text(raw, `rooms.${key}`);
  const tilesetData = json.tilesetData === undefined ? null : text(json.tilesetData, 'tilesetData');

  const ui: Record<string, UiPieceDef> = {};
  for (const [key, raw] of Object.entries(section(json.ui, 'ui'))) {
    const where = `ui.${key}`;
    if (!isRecord(raw)) throw new ManifestError(`${where} must be an object`);
    const slice = typeof raw.slice === 'number' ? [raw.slice, raw.slice, raw.slice, raw.slice] : raw.slice;
    if (slice !== undefined && !(Array.isArray(slice) && slice.length === 4 && slice.every((n) => typeof n === 'number' && n >= 0))) {
      throw new ManifestError(`${where}.slice must be [top, right, bottom, left]`);
    }
    const trough = uiRect(raw.trough, `${where}.trough`);
    const heart = uiRect(raw.heart, `${where}.heart`);
    ui[key] = {
      file: text(raw.file, `${where}.file`),
      width: positive(raw.width, `${where}.width`),
      height: positive(raw.height, `${where}.height`),
      ...(slice ? { slice: slice as [number, number, number, number] } : {}),
      ...(trough ? { trough } : {}),
      ...(heart ? { heart } : {}),
    };
  }

  const audio: Record<string, AudioDef> = {};
  for (const [key, raw] of Object.entries(section(json.audio, 'audio'))) {
    const where = `audio.${key}`;
    if (!isRecord(raw)) throw new ManifestError(`${where} must be an object`);
    const loop = (field: 'loopStart' | 'loopEnd'): number | undefined => {
      const value = raw[field];
      if (value === undefined) return undefined;
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new ManifestError(`${where}.${field} must be a number of seconds`);
      return value;
    };
    const loopStart = loop('loopStart');
    const loopEnd = loop('loopEnd');
    const letter = (field: 'candidate' | 'picked'): AudioCandidate | undefined => {
      const value = raw[field];
      if (value === undefined) return undefined;
      if (value !== 'A' && value !== 'B' && value !== 'C') throw new ManifestError(`${where}.${field} must be A, B or C`);
      return value;
    };
    const candidate = letter('candidate');
    const picked = letter('picked');
    audio[key] = {
      file: text(raw.file, `${where}.file`),
      duration: positive(raw.duration, `${where}.duration`),
      placeholder: raw.placeholder === true,
      ...(loopStart !== undefined ? { loopStart } : {}),
      ...(loopEnd !== undefined ? { loopEnd } : {}),
      ...(candidate ? { candidate } : {}),
      ...(picked ? { picked } : {}),
      ...(raw.pending === true ? { pending: true } : {}),
    };
  }

  return { tileSize, characters, tilesets, objects, maps, rooms, tilesetData, ui, audio };
}

/**
 * Sheet row for an 8-way direction index (0 = south, clockwise through
 * east, north, west). With 4-direction sheets, diagonals use the nearest
 * horizontal row (docs/DECISIONS.md).
 */
export function directionRow(dir8: number, directions: Directions): number {
  const d = ((dir8 % 8) + 8) % 8;
  if (directions === 8) return d;
  if (directions === 1) return 0;
  // DIRECTIONS_4 = south, east, north, west
  const map4 = [0, 1, 1, 1, 2, 3, 3, 3] as const;
  return map4[d] ?? 0;
}

/** Direction rows of an animation's sheet: its own if declared, else the character's. */
export function animationDirections(def: CharacterDef, animation: string): Directions {
  return def.animations[animation]?.directions ?? def.directions;
}

/** True when this animation must be generated (no art for it or its character). */
export function isAnimationPlaceholder(def: CharacterDef, animation: string): boolean {
  return def.placeholder === true || def.animations[animation]?.placeholder === true;
}

export function characterTextureKey(character: string, animation: string): string {
  return `char:${character}:${animation}`;
}

const animationKeyCache: Record<string, Record<string, string[]>> = {};

/** Animation key for a character/animation/direction. Cached: no per-frame strings. */
export function animationKey(character: string, animation: string, dir8: number): string {
  const byAnim = (animationKeyCache[character] ??= {});
  const byDir = (byAnim[animation] ??= []);
  return (byDir[dir8] ??= `${character}:${animation}:${dir8}`);
}

export function objectTextureKey(object: string): string {
  return `obj:${object}`;
}

export function tilesetTextureKey(tileset: string): string {
  return `tiles:${tileset}`;
}

export function mapCacheKey(map: string): string {
  return `map:${map}`;
}
