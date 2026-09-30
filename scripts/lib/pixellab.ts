/**
 * Reader for PixelLab character exports (docs/ASSETS.md §6).
 *
 * Detected format (export_version 3.x, September 2026):
 *   <asset>/metadata.json
 *   <asset>/<State>/rotations/<direction>.png          one static frame per direction
 *   <asset>/<State>/animations/<anim>/<direction>/…    (declared in metadata.frames.animations)
 * metadata.states[] = { character: { name, size: {width, height}, directions }, folder,
 *                       frames: { rotations: { <direction>: path }, animations: { … } } }
 * Direction names are the 8 PixelLab names in our row order: south, south-east, east, …
 * PNGs are 8-bit RGBA with a transparent background.
 */
import { DIRECTIONS_4, DIRECTIONS_8 } from '../../src/game/assets/manifest';

export interface ExportAnimation {
  /** Animation name normalised to the manifest vocabulary (idle, walk, …). */
  name: string;
  /** Name as written in the export, for messages. */
  sourceName: string;
  width: number;
  height: number;
  /** Frame paths (relative to the asset folder) per direction name. */
  frames: Map<string, string[]>;
}

export interface PixelLabExport {
  version: string;
  animations: ExportAnimation[];
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const ALIASES: readonly (readonly [RegExp, string])[] = [
  [/idle|breath|stand|rotation/, 'idle'],
  [/walk|run|jog/, 'walk'],
  [/shoot|fire|gun/, 'shoot'],
  [/attack|punch|bite|swipe|tear/, 'attack'],
  [/dash|roll|dodge/, 'dash'],
  [/death|die|dying|dead/, 'death'],
  [/climb|vault/, 'climb'],
];

/** Maps export names like "Idle" or "Walking 6 frames" to manifest names. */
export function normaliseAnimationName(name: string): string {
  const lower = name.toLowerCase();
  for (const [pattern, alias] of ALIASES) if (pattern.test(lower)) return alias;
  return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'anim';
}

function framesFromDirectionMap(value: unknown): Map<string, string[]> {
  const frames = new Map<string, string[]>();
  if (!isRecord(value)) return frames;
  for (const [dir, entry] of Object.entries(value)) {
    if (typeof entry === 'string') frames.set(dir, [entry]);
    else if (Array.isArray(entry)) frames.set(dir, entry.filter((p): p is string => typeof p === 'string'));
    else if (isRecord(entry) && Array.isArray(entry.frames)) {
      frames.set(dir, entry.frames.filter((p): p is string => typeof p === 'string'));
    }
  }
  return frames;
}

/** Parses metadata.json into animations. Rotations become a 1-frame animation named after the state. */
export function parsePixelLabMetadata(json: unknown): PixelLabExport {
  const warnings: string[] = [];
  if (!isRecord(json) || !Array.isArray(json.states)) throw new Error('metadata.json sin "states": formato de PixelLab no reconocido');
  const version = typeof json.export_version === 'string' ? json.export_version : '?';
  if (!version.startsWith('3.')) warnings.push(`export_version ${version} no probada (se esperaba 3.x)`);

  const animations: ExportAnimation[] = [];
  for (const state of json.states) {
    if (!isRecord(state) || !isRecord(state.frames)) continue;
    const character = isRecord(state.character) ? state.character : {};
    const size = isRecord(character.size) ? character.size : {};
    const width = typeof size.width === 'number' ? size.width : 0;
    const height = typeof size.height === 'number' ? size.height : 0;
    const folder = typeof state.folder === 'string' ? state.folder : 'state';
    const stateName = typeof character.name === 'string' ? character.name : folder;

    const anims = isRecord(state.frames.animations) ? state.frames.animations : {};
    for (const [animName, dirs] of Object.entries(anims)) {
      const frames = framesFromDirectionMap(dirs);
      if (frames.size === 0) {
        warnings.push(`Animación "${animName}" con una estructura no reconocida: ${JSON.stringify(dirs).slice(0, 120)}`);
        continue;
      }
      animations.push({ name: normaliseAnimationName(animName), sourceName: animName, width, height, frames });
    }

    // A state without animations is a set of static rotations: use it as a 1-frame animation.
    if (Object.keys(anims).length === 0) {
      const frames = framesFromDirectionMap(state.frames.rotations);
      if (frames.size > 0) animations.push({ name: normaliseAnimationName(stateName), sourceName: stateName, width, height, frames });
    }
  }
  return { version, animations, warnings };
}

/**
 * Orders an animation's directions into sheet rows. Returns the direction
 * count (8, or 4 when only south/east/north/west exist) and the rows.
 */
export function directionRows(frames: Map<string, string[]>): { directions: 4 | 8; rows: string[][] } {
  const has8 = DIRECTIONS_8.every((d) => frames.has(d));
  if (has8) return { directions: 8, rows: DIRECTIONS_8.map((d) => frames.get(d) ?? []) };
  const has4 = DIRECTIONS_4.every((d) => frames.has(d));
  if (has4) return { directions: 4, rows: DIRECTIONS_4.map((d) => frames.get(d) ?? []) };
  const missing = DIRECTIONS_8.filter((d) => !frames.has(d));
  throw new Error(`Faltan direcciones: ${missing.join(', ')}`);
}
