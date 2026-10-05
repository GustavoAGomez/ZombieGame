/**
 * npm run assets:check — validates public/assets against docs/ASSETS.md:
 * manifest shape, file paths and names, sheet sizes (multiples of the
 * frame), minimum animations, transparent background, palette, and that
 * every map has the required layers and objects. Maps edited in Tiled
 * (art-src/tiled/<map>.tmj) also go through the map validator.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BOSS, MERCHANT, PLAYER, ZOMBIES } from '../src/config/balance';
import { BOSS_IDS, BOSSES } from '../src/config/bosses';
import {
  REQUIRED_ANIMATIONS,
  REQUIRED_OBJECTS,
  animationDirections,
  bossCharacterKey,
  isAnimationPlaceholder,
  parseManifest,
  type Manifest,
} from '../src/game/assets/manifest';
import { parseMap } from '../src/game/map/MapLoader';
import { colorsOutsidePalette, decodePng, parsePaletteHex, readPngInfo } from './lib/png';
import { validateMap } from './lib/validate-map';

export interface CheckReport {
  errors: string[];
  warnings: string[];
  info: string[];
}

interface SheetExpectation {
  label: string;
  file: string;
  placeholder: boolean;
  width: number;
  height: number;
  /** Frame size, for "multiple of the frame" checks. */
  frameWidth: number;
  frameHeight: number;
  needsTransparency: boolean;
}

const SNAKE = /^[a-z][a-z0-9_]*$/;
/** Palette size from the style bible (docs/ASSETS.md §1). */
const PALETTE_SIZE = 32;

function countOpaqueColors(pixels: Uint8Array): number {
  const colors = new Set<number>();
  for (let i = 0; i < pixels.length; i += 4) {
    if ((pixels[i + 3] ?? 0) === 0) continue;
    colors.add(((pixels[i] ?? 0) << 16) | ((pixels[i + 1] ?? 0) << 8) | (pixels[i + 2] ?? 0));
  }
  return colors.size;
}

export function checkAssets(root: string): CheckReport {
  const report: CheckReport = { errors: [], warnings: [], info: [] };
  const assetsDir = resolve(root, 'public/assets');
  const manifestPath = resolve(assetsDir, 'manifest.json');

  let manifest: Manifest;
  try {
    manifest = parseManifest(JSON.parse(readFileSync(manifestPath, 'utf8')));
  } catch (err) {
    report.errors.push(`manifest.json: ${(err as Error).message}`);
    return report;
  }

  const palettePath = resolve(root, 'art-src/palette.hex');
  const palette = existsSync(palettePath) ? parsePaletteHex(readFileSync(palettePath, 'utf8')) : null;
  if (!palette) report.info.push('Sin art-src/palette.hex: se omite la comprobación de paleta.');

  const sheets: SheetExpectation[] = [];

  for (const [key, required] of Object.entries(REQUIRED_ANIMATIONS)) {
    const def = manifest.characters[key];
    if (!def) {
      report.errors.push(`Falta el personaje "${key}" en el manifiesto`);
      continue;
    }
    for (const anim of required) {
      if (!def.animations[anim]) report.errors.push(`${key}: falta la animación mínima "${anim}"`);
    }
  }

  for (const [key, def] of Object.entries(manifest.characters)) {
    if (!SNAKE.test(key)) report.errors.push(`Nombre de personaje no válido "${key}" (usa snake_case)`);
    // A boss's body is a box: half its footprint minus the slack (BossBody).
    const boss = BOSS_IDS.find((id) => key === bossCharacterKey(id));
    const expectedRadius = boss
      ? (BOSSES[boss].footprintTiles * manifest.tileSize) / 2 - BOSS.bodySlack
      : key === 'player'
        ? PLAYER.hitboxRadius
        : key.startsWith('merchant_')
          ? MERCHANT.radius
          : ZOMBIES.hitboxRadius;
    if (def.hitbox.radius !== expectedRadius) {
      report.warnings.push(`${key}: hitbox.radius ${def.hitbox.radius} ≠ balance.ts (${expectedRadius}); el juego usa balance.ts`);
    }
    for (const [anim, a] of Object.entries(def.animations)) {
      if (!SNAKE.test(anim)) report.errors.push(`${key}: nombre de animación no válido "${anim}"`);
      const expectedFile = `sprites/${key}/${anim}.png`;
      // Characters that share art (import.json "alsoFor") point at another character's sheet.
      const shared = Object.keys(manifest.characters).some((other) => a.file === `sprites/${other}/${anim}.png`);
      if (!shared) report.warnings.push(`${key}.${anim}: la ruta debería ser ${expectedFile} (es ${a.file})`);
      sheets.push({
        label: `${key}.${anim}`,
        file: a.file,
        placeholder: isAnimationPlaceholder(def, anim),
        width: def.frameWidth * a.frames,
        height: def.frameHeight * animationDirections(def, anim),
        frameWidth: def.frameWidth,
        frameHeight: def.frameHeight,
        needsTransparency: true,
      });
    }
  }

  for (const key of REQUIRED_OBJECTS) {
    if (!manifest.objects[key]) report.errors.push(`Falta el objeto "${key}" en el manifiesto`);
  }

  for (const [key, def] of Object.entries(manifest.objects)) {
    if (!SNAKE.test(key)) report.errors.push(`Nombre de objeto no válido "${key}"`);
    sheets.push({
      label: `objects.${key}`,
      file: def.file,
      placeholder: def.placeholder === true,
      width: def.frameWidth * def.frames,
      height: def.frameHeight,
      frameWidth: def.frameWidth,
      frameHeight: def.frameHeight,
      needsTransparency: true,
    });
  }

  for (const [key, def] of Object.entries(manifest.tilesets)) {
    sheets.push({
      label: `tilesets.${key}`,
      file: def.file,
      placeholder: def.placeholder === true,
      width: 0,
      height: 0,
      frameWidth: def.tileWidth,
      frameHeight: def.tileHeight,
      needsTransparency: false,
    });
  }

  let placeholders = 0;
  for (const sheet of sheets) {
    const path = resolve(assetsDir, sheet.file);
    if (!existsSync(path)) {
      if (sheet.placeholder) placeholders++;
      else report.errors.push(`${sheet.label}: no existe ${sheet.file} (márcalo con "placeholder": true o añade el PNG)`);
      continue;
    }
    if (sheet.placeholder) report.warnings.push(`${sheet.label}: existe ${sheet.file} pero sigue marcado como placeholder`);
    try {
      const buf = readFileSync(path);
      const info = readPngInfo(buf);
      if (info.width % sheet.frameWidth !== 0 || info.height % sheet.frameHeight !== 0) {
        report.errors.push(`${sheet.label}: ${info.width}×${info.height} no es múltiplo del frame ${sheet.frameWidth}×${sheet.frameHeight}`);
      } else if (sheet.width > 0 && (info.width !== sheet.width || info.height !== sheet.height)) {
        report.errors.push(`${sheet.label}: mide ${info.width}×${info.height}, el manifiesto espera ${sheet.width}×${sheet.height}`);
      }
      if (sheet.needsTransparency) {
        if (!info.hasTransparency) report.errors.push(`${sheet.label}: el PNG no tiene canal alfa (el fondo debe ser transparente)`);
        else {
          const png = decodePng(buf);
          if ((png.pixels[3] ?? 0) !== 0) report.warnings.push(`${sheet.label}: la esquina superior izquierda no es transparente`);
          if (!palette) {
            const distinct = countOpaqueColors(png.pixels);
            if (distinct > PALETTE_SIZE) {
              report.warnings.push(`${sheet.label}: ${distinct} colores (la biblia de estilo pide una paleta de ${PALETTE_SIZE})`);
            }
          }
          if (palette) {
            const outside = colorsOutsidePalette(png, palette);
            if (outside.length > 0) {
              const sample = outside.slice(0, 5).map((c) => `#${c.toString(16).padStart(6, '0')}`).join(', ');
              report.warnings.push(`${sheet.label}: ${outside.length} colores fuera de la paleta (${sample}…)`);
            }
          }
        }
      }
    } catch (err) {
      report.errors.push(`${sheet.label}: ${(err as Error).message}`);
    }
  }
  if (placeholders > 0) report.info.push(`${placeholders} hojas usan placeholder generado en runtime.`);

  for (const [key, file] of Object.entries(manifest.maps)) {
    const path = resolve(assetsDir, file);
    if (!existsSync(path)) {
      report.errors.push(`maps.${key}: no existe ${file}`);
      continue;
    }
    const source = resolve(root, 'art-src/tiled', `${key}.tmj`);
    const plan = resolve(root, 'maps/src', `${key}.txt`);
    if (existsSync(source) && statSync(source).mtimeMs > statSync(path).mtimeMs) {
      report.warnings.push(`maps.${key}: art-src/tiled/${key}.tmj es más reciente que ${file}; ejecuta npm run map:build`);
    }
    if (existsSync(plan) && (!existsSync(source) || statSync(plan).mtimeMs > statSync(source).mtimeMs)) {
      report.warnings.push(`maps.${key}: maps/src/${key}.txt es más reciente que art-src/tiled/${key}.tmj; ejecuta npm run map:build`);
    }
    try {
      const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
      const map = parseMap(raw);
      // Full game maps (they have a Tiled source) must pass the design rules; room01 is a test map.
      if (existsSync(source)) {
        for (const e of validateMap(raw as Parameters<typeof validateMap>[0]).errors) report.errors.push(`maps.${key}: ${e}`);
      }
      for (const t of map.tilesets) {
        if (!manifest.tilesets[t.name]) report.errors.push(`maps.${key}: usa el tileset "${t.name}", que no está en el manifiesto`);
      }
      if (map.tileSize !== manifest.tileSize) report.errors.push(`maps.${key}: tile de ${map.tileSize} px ≠ tileSize ${manifest.tileSize}`);
      if (map.windows.length === 0) report.errors.push(`maps.${key}: no tiene ventanas`);
      for (const w of map.windows) {
        if (!map.zombieSpawns.some((s) => s.window === w.id)) report.errors.push(`maps.${key}: la ventana ${w.id} no tiene zombie_spawn`);
      }
      report.info.push(
        `maps.${key}: ${map.width}×${map.height} tiles, ${map.zones.length} zonas, ${map.windows.length} ventanas, ` +
          `${map.doors.length} puertas, ${map.portals.length / 2} portales, ${map.openSpawns.length} spawns de entrada.`,
      );
    } catch (err) {
      report.errors.push(`maps.${key}: ${(err as Error).message}`);
    }
  }

  return report;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const report = checkAssets(root);
  for (const line of report.info) console.info(`  · ${line}`);
  for (const line of report.warnings) console.warn(`  ⚠ ${line}`);
  for (const line of report.errors) console.error(`  ✖ ${line}`);
  if (report.errors.length > 0) {
    console.error(`\nassets:check falló con ${report.errors.length} errores.`);
    process.exit(1);
  }
  console.info(`\nassets:check OK (${report.warnings.length} avisos).`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
