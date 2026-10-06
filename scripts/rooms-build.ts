/**
 * npm run rooms:build
 *
 *   maps/src/rooms/<ambient>/<name>.txt  (room templates, skill level-design)
 *     → public/assets/rooms/<ambient>.json  (parsed, checked, registered in the manifest)
 *     → public/assets/tiles/tilesets.json   (what the floors compile with, as map:build writes it)
 *
 * Every template is checked as drawn and mirrored (spec 09 §3.2); one that
 * fails stops the build with its problems. The dungeon lays them on its
 * plans at runtime (src/game/dungeon/assembleFloor.ts).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { RoomTemplateError, mirrorTemplate, parseRoomTemplate, validateRoomTemplate, type RoomTemplate } from '../src/game/dungeon/roomTemplate';
import { writeTilesetData } from './build-map';

export interface RoomsBuildResult {
  ambient: string;
  templates: RoomTemplate[];
  /** `<id>: <problem>` lines; the JSON is written only when empty. */
  errors: string[];
}

/** Reads and checks every template of `maps/src/rooms/<ambient>/`. */
export function readRoomTemplates(root: string, ambient: string): RoomsBuildResult {
  const dir = resolve(root, 'maps/src/rooms', ambient);
  const templates: RoomTemplate[] = [];
  const errors: string[] = [];
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.txt')).sort()) {
    const id = `${ambient}/${basename(file, '.txt')}`;
    try {
      const template = parseRoomTemplate(readFileSync(resolve(dir, file), 'utf8'), id);
      if (template.ambient !== ambient) errors.push(`${id}: su ## Sala dice ambiente ${template.ambient} y está en la carpeta ${ambient}`);
      for (const [label, t] of [
        ['', template],
        [' (espejo)', mirrorTemplate(template)],
      ] as const) {
        for (const problem of validateRoomTemplate(t)) errors.push(`${id}${label}: ${problem}`);
      }
      templates.push(template);
    } catch (err) {
      if (err instanceof RoomTemplateError) for (const problem of err.problems) errors.push(`${id}: ${problem}`);
      else throw err;
    }
  }
  return { ambient, templates, errors };
}

/** Writes an ambient's templates for the game and registers them in the manifest. */
export function writeRoomTemplates(root: string, result: RoomsBuildResult): string {
  const file = `rooms/${result.ambient}.json`;
  const out = resolve(root, 'public/assets', file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify({ ambient: result.ambient, templates: result.templates })}\n`);
  const path = resolve(root, 'public/assets/manifest.json');
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as { rooms?: Record<string, string> };
  manifest.rooms ??= {};
  if (manifest.rooms[result.ambient] !== file) {
    manifest.rooms[result.ambient] = file;
    writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return file;
}

export function buildRooms(root: string, log: (line: string) => void): boolean {
  const roomsDir = resolve(root, 'maps/src/rooms');
  if (!existsSync(roomsDir)) {
    log('✖ no existe maps/src/rooms/');
    return false;
  }
  let ok = true;
  for (const ambient of readdirSync(roomsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    const result = readRoomTemplates(root, ambient);
    if (result.errors.length > 0) {
      ok = false;
      log(`✖ ${ambient}: ${result.errors.length} problema(s) en las plantillas; no se escribe rooms/${ambient}.json`);
      for (const e of result.errors) log(`  - ${e}`);
      continue;
    }
    const byType = new Map<string, number>();
    for (const t of result.templates) byType.set(t.type, (byType.get(t.type) ?? 0) + 1);
    const file = writeRoomTemplates(root, result);
    log(`✓ ${ambient}: ${result.templates.length} plantillas (${[...byType].map(([k, n]) => `${n} ${k}`).join(', ')}) → public/assets/${file}`);
  }
  writeTilesetData(root);
  log('✓ tilesets → public/assets/tiles/tilesets.json');
  return ok;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  if (!buildRooms(root, (line) => console.info(line))) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
