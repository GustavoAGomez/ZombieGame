/**
 * npm run dungeon:preview <semilla> [<semilla>…]
 *
 * The dungeon's preview (spec 09 §3.4): for each seed, in
 * maps/preview/dungeon/<semilla>/,
 * - planos.txt: the three floors' plans as text, one cell per room, with
 *   each room's template;
 * - planta-<n>-plano.png: the same plan drawn, a square per room coloured
 *   by its type, the doors between them (a key door in amber, the boss's
 *   in red, the challenge's in dark red).
 * Phase M2 adds the PNG of each floor assembled, like map:preview's.
 * Open them and look before closing a phase.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FLOORS, floorConfig, type RoomType } from '../src/config/dungeon';
import type { FloorPlan, Room } from '../src/core/RunState';
import { generateFloor, planToText, roomAt } from '../src/game/dungeon/generateFloor';
import { placeholderBank } from '../src/game/dungeon/templates';
import { drawText, fillRect, type Rgb } from './lib/contact-sheet';
import { encodePng } from './lib/png';
import { blank } from './lib/sheet';

const CELL = 36;
const GAP = 12;
const PAD = 16;
const TITLE = 14;

const INK: Rgb = [20, 18, 24];
const BONE: Rgb = [226, 214, 190];
const COLORS: Readonly<Record<RoomType, Rgb>> = {
  start: [226, 214, 190],
  combat: [92, 96, 108],
  elite: [214, 160, 48],
  treasure: [232, 204, 90],
  hand: [120, 40, 60],
  challenge: [170, 48, 40],
  boss: [96, 20, 28],
};
const DOOR: Rgb = [180, 176, 168];
const KEY_DOOR: Rgb = [232, 204, 90];
const BOSS_DOOR: Rgb = [220, 60, 50];
const CHALLENGE_DOOR: Rgb = [150, 40, 36];
const LETTER: Readonly<Record<RoomType, string>> = { start: 'S', combat: 'C', elite: 'E', treasure: 'T', hand: 'H', challenge: 'R', boss: 'B' };
const AMBIENT_NAME = { mansion: 'MANSION', basement: 'SOTANO', garden: 'JARDIN' } as const;

/** The plan drawn: a square per cell, joined where there is a door. */
export function drawPlan(plan: FloorPlan, seed: number): { width: number; height: number; pixels: Uint8Array } {
  const pitch = CELL + GAP;
  const width = PAD * 2 + plan.width * pitch - GAP;
  const height = PAD * 2 + TITLE + plan.height * pitch - GAP;
  const f = blank(width, height);
  fillRect(f, 0, 0, width, height, INK);
  drawText(f, `PLANTA ${plan.floor} ${AMBIENT_NAME[plan.ambient]} SEMILLA ${seed}`, PAD, PAD - 4, BONE, 2);
  const left = (x: number): number => PAD + x * pitch;
  const top = (y: number): number => PAD + TITLE + y * pitch;
  plan.rooms.forEach((room: Room) => {
    for (const c of room.cells) {
      fillRect(f, left(c.x), top(c.y), CELL, CELL, COLORS[room.type]);
      // The arena's four cells are one room: no gap between them.
      if (room.cells.some((o) => o.x === c.x + 1 && o.y === c.y)) fillRect(f, left(c.x) + CELL, top(c.y), GAP, CELL, COLORS[room.type]);
      if (room.cells.some((o) => o.x === c.x && o.y === c.y + 1)) fillRect(f, left(c.x), top(c.y) + CELL, CELL, GAP, COLORS[room.type]);
    }
    const [c] = room.cells as [Room['cells'][number]];
    const letter = LETTER[room.type];
    const dark = room.type === 'start' || room.type === 'treasure' || room.type === 'elite';
    const size = room.type === 'boss' ? CELL * 2 + GAP : CELL;
    drawText(f, letter, left(c.x) + Math.floor(size / 2) - 3, top(c.y) + Math.floor(size / 2) - 5, dark ? INK : BONE, 2);
    for (const d of room.doors) {
      const other = plan.rooms[d.room] as Room;
      const types = [room.type, other.type];
      const color = types.includes('boss') ? BOSS_DOOR : types.includes('treasure') ? KEY_DOOR : types.includes('challenge') ? CHALLENGE_DOOR : DOOR;
      const x = left(d.cell.x);
      const y = top(d.cell.y);
      if (d.side === 'e') fillRect(f, x + CELL, y + CELL / 2 - 3, GAP, 6, color);
      if (d.side === 's') fillRect(f, x + CELL / 2 - 3, y + CELL, 6, GAP, color);
    }
  });
  return f;
}

/** The three floors of a seed, as text with each room's template. */
export function describeSeed(seed: number): string {
  const parts: string[] = [`SEMILLA ${seed}`, ''];
  for (let floor = 1; floor <= FLOORS; floor++) {
    const config = floorConfig(floor);
    const plan = generateFloor(seed, floor, placeholderBank(config.ambient));
    parts.push(`## Planta ${floor} · ${config.ambient} · ${plan.rooms.length} salas`, '', planToText(plan), '');
    parts.push('| Celda | Tipo | Dificultad | Plantilla | Espejo | Puertas |', '|---|---|---|---|---|---|');
    for (const room of plan.rooms) {
      const [c] = room.cells as [Room['cells'][number]];
      const doors = room.doors.map((d) => `${d.side}→${LETTER[(plan.rooms[d.room] as Room).type]}`).join(' ');
      parts.push(`| ${c.x},${c.y} | ${room.type} | ${room.difficulty ?? '—'} | ${room.template} | ${room.mirrored ? 'sí' : 'no'} | ${doors} |`);
    }
    parts.push('');
    // Sanity: every cell of the grid maps back to its room.
    for (let y = 0; y < plan.height; y++) for (let x = 0; x < plan.width; x++) if (roomAt(plan, { x, y }) >= plan.rooms.length) throw new Error('celda fuera del plano');
  }
  return parts.join('\n');
}

export function previewSeed(root: string, seed: number): string[] {
  const dir = resolve(root, 'maps/preview/dungeon', String(seed));
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  writeFileSync(resolve(dir, 'planos.txt'), `${describeSeed(seed)}\n`);
  files.push('planos.txt');
  for (let floor = 1; floor <= FLOORS; floor++) {
    const plan = generateFloor(seed, floor, placeholderBank(floorConfig(floor).ambient));
    const frame = drawPlan(plan, seed);
    const name = `planta-${floor}-plano.png`;
    writeFileSync(resolve(dir, name), encodePng(frame.width, frame.height, frame.pixels));
    files.push(name);
  }
  return files;
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const seeds = process.argv.slice(2).map((s) => Number(s));
  if (seeds.length === 0 || seeds.some((s) => !Number.isInteger(s))) {
    console.error('Uso: npm run dungeon:preview <semilla> [<semilla>…]');
    process.exitCode = 1;
    return;
  }
  for (const seed of seeds) {
    const files = previewSeed(root, seed);
    console.info(`✓ semilla ${seed}: ${files.join(', ')} en maps/preview/dungeon/${seed}/`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
