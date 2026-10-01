/**
 * Asset manifest (docs/ASSETS.md §4). Code refers to assets by key only;
 * file paths live in public/assets/manifest.json (CLAUDE.md rule 5).
 */

export interface AnimationDef {
  file: string;
  frames: number;
  fps: number;
  loop: boolean;
  /** This animation has no art yet (the character may have others). */
  placeholder?: boolean;
}

export interface CharacterDef {
  frameWidth: number;
  frameHeight: number;
  anchor: { x: number; y: number };
  hitbox: { radius: number };
  directions: 4 | 8;
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

export interface Manifest {
  tileSize: number;
  characters: Record<string, CharacterDef>;
  tilesets: Record<string, TilesetDef>;
  objects: Record<string, ObjectDef>;
  maps: Record<string, string>;
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

/** Minimum animations each character must provide (docs/ASSETS.md §3). */
export const REQUIRED_ANIMATIONS: Readonly<Record<string, readonly string[]>> = {
  player: ['idle', 'walk', 'shoot', 'dash', 'death'],
  zombie_walker: ['walk', 'attack', 'death'],
  zombie_runner: ['walk', 'attack', 'death'],
};

/** Map objects that must exist, one per wall orientation (docs/ASSETS.md §4). */
export const REQUIRED_OBJECTS: readonly string[] = ['window_planks', 'window_planks_v', 'door', 'door_v', 'portal'];

/** Asset keys the game code uses. */
export const ASSET_KEYS = {
  player: 'player',
  zombieWalker: 'zombie_walker',
  zombieRunner: 'zombie_runner',
  zombieSprinter: 'zombie_sprinter',
  tilesetInterior: 'interior',
  windowPlanks: 'window_planks',
  windowPlanksV: 'window_planks_v',
  door: 'door',
  doorV: 'door_v',
  portal: 'portal',
  bullet: 'bullet',
  aimDot: 'aim_dot',
  blood: 'blood',
  pickupAmmo: 'pickup_ammo',
  pickupHealth: 'pickup_health',
  muzzleFlash: 'muzzle_flash',
  mapRoom01: 'room01',
} as const;

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
    if (directions !== 4 && directions !== 8) throw new ManifestError(`${where}.directions must be 4 or 8`);
    const animations: Record<string, AnimationDef> = {};
    for (const [anim, a] of Object.entries(section(raw.animations, `${where}.animations`))) {
      const aw = `${where}.animations.${anim}`;
      if (!isRecord(a)) throw new ManifestError(`${aw} must be an object`);
      animations[anim] = {
        file: text(a.file, `${aw}.file`),
        frames: positive(a.frames, `${aw}.frames`),
        fps: positive(a.fps, `${aw}.fps`),
        loop: a.loop === true,
        placeholder: a.placeholder === true,
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

  return { tileSize, characters, tilesets, objects, maps };
}

/**
 * Sheet row for an 8-way direction index (0 = south, clockwise through
 * east, north, west). With 4-direction sheets, diagonals use the nearest
 * horizontal row (docs/DECISIONS.md).
 */
export function directionRow(dir8: number, directions: 4 | 8): number {
  const d = ((dir8 % 8) + 8) % 8;
  if (directions === 8) return d;
  // DIRECTIONS_4 = south, east, north, west
  const map4 = [0, 1, 1, 1, 2, 3, 3, 3] as const;
  return map4[d] ?? 0;
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
