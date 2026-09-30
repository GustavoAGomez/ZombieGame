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
  /** Messages about duplicate takes that were resolved. */
  notes?: string[];
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

const FIRING = /shoot|fir(e|ing)|gun/;
const MOVING = /walk|run|jog|sprint/;

const ALIASES: readonly (readonly [RegExp, string])[] = [
  [/idle|breath|stand|rotation/, 'idle'],
  // `walk` is the movement loop; for the player it is a run.
  [MOVING, 'walk'],
  [/attack|punch|bite|swipe|tear/, 'attack'],
  [/dash|roll|dodge/, 'dash'],
  [/death|die|dying|dead/, 'death'],
  [/climb|vault/, 'climb'],
];

/**
 * Maps export names like "Idle" or "Walking 6 frames" to manifest names.
 * `context` is the state name: PixelLab truncates animation names to 50
 * characters, so "walking forward …" inside a "standing in a firing" state
 * is recognised as walking while shooting (`shoot_walk`).
 */
export function normaliseAnimationName(name: string, context = ''): string {
  const lower = name.toLowerCase();
  const firing = FIRING.test(lower) || FIRING.test(context.toLowerCase());
  if (MOVING.test(lower) && firing) return 'shoot_walk';
  if (FIRING.test(lower)) return 'shoot';
  for (const [pattern, alias] of ALIASES) if (pattern.test(lower)) return alias;
  return lower.replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'anim';
}

/** Per manifest animation, which take to use for a direction PixelLab exported twice. */
export type TakeOverrides = Record<string, Record<string, string>>;

/** "north-36c131c0" → "north": PixelLab suffixes directions that were regenerated. */
const TAKE_SUFFIX = /-[0-9a-f]{8}$/;

/**
 * Collapses duplicate takes of a direction ("north-36c131c0", "north-e16e1c8c")
 * into one: the override if given, else the first declared. Notes describe
 * what was chosen.
 */
export function resolveTakes(
  frames: Map<string, string[]>,
  overrides: Record<string, string> = {},
): { frames: Map<string, string[]>; notes: string[] } {
  const groups = new Map<string, string[]>();
  for (const key of frames.keys()) {
    const base = key.replace(TAKE_SUFFIX, '');
    groups.set(base, [...(groups.get(base) ?? []), key]);
  }
  const resolved = new Map<string, string[]>();
  const notes: string[] = [];
  for (const [base, keys] of groups) {
    const wanted = overrides[base];
    const chosen = wanted && keys.includes(wanted) ? wanted : keys[0];
    if (!chosen) continue;
    if (wanted && !keys.includes(wanted)) notes.push(`la toma "${wanted}" no existe en ${base}; se usa "${chosen}"`);
    if (keys.length > 1) {
      notes.push(`${base}: ${keys.length} tomas (${keys.join(', ')}); se usa "${chosen}"${wanted === chosen ? ' (import.json)' : ''}`);
    }
    resolved.set(base, frames.get(chosen) ?? []);
  }
  return { frames: resolved, notes };
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

/**
 * Parses metadata.json into animations. Rotations become a 1-frame
 * animation named after the state; duplicate direction takes are resolved
 * with `overrides` (keyed by manifest animation name).
 */
export function parsePixelLabMetadata(json: unknown, overrides: TakeOverrides = {}): PixelLabExport {
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
      const raw = framesFromDirectionMap(dirs);
      if (raw.size === 0) {
        warnings.push(`Animación "${animName}" con una estructura no reconocida: ${JSON.stringify(dirs).slice(0, 120)}`);
        continue;
      }
      const name = normaliseAnimationName(animName, stateName);
      const { frames, notes } = resolveTakes(raw, overrides[name]);
      animations.push({ name, sourceName: animName, width, height, frames, notes });
    }

    // The rotations are the character standing still: a 1-frame animation named after the
    // state ("Idle" → idle), unless one of its animations already maps to that name.
    const rotations = framesFromDirectionMap(state.frames.rotations);
    const rotationName = normaliseAnimationName(stateName);
    if (rotations.size > 0 && !animations.some((a) => a.name === rotationName)) {
      animations.push({ name: rotationName, sourceName: `${stateName} (rotaciones)`, width, height, frames: rotations });
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

export interface Selection {
  selected: ExportAnimation[];
  skipped: string[];
}

function isComplete(anim: ExportAnimation): boolean {
  try {
    directionRows(anim.frames);
    return true;
  } catch {
    return false;
  }
}

/** Running beats walking when both map to `walk`: the movement loop is a run. */
function priority(anim: ExportAnimation): number {
  return /run|sprint|jog/i.test(anim.sourceName) ? 1 : 0;
}

/**
 * Keeps one export animation per manifest name. Animations missing
 * directions are skipped; among complete ones for the same name, a run
 * wins over a walk, then the first one found.
 */
export function selectAnimations(animations: readonly ExportAnimation[]): Selection {
  const skipped: string[] = [];
  const byName = new Map<string, ExportAnimation>();
  for (const anim of animations) {
    if (!isComplete(anim)) {
      skipped.push(`"${anim.sourceName}": solo tiene ${[...anim.frames.keys()].join(', ')}; se omite`);
      continue;
    }
    const current = byName.get(anim.name);
    if (!current) {
      byName.set(anim.name, anim);
    } else if (priority(anim) > priority(current)) {
      skipped.push(`"${current.sourceName}" y "${anim.sourceName}" van a "${anim.name}"; se usa "${anim.sourceName}"`);
      byName.set(anim.name, anim);
    } else {
      skipped.push(`"${current.sourceName}" y "${anim.sourceName}" van a "${anim.name}"; se usa "${current.sourceName}"`);
    }
  }
  return { selected: [...byName.values()], skipped };
}
