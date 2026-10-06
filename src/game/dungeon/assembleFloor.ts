/**
 * The floor's map (spec 09 §3.3): the plan and its templates become one
 * ASCII plan of the whole floor, with a zone per room, and the map compiler
 * of maps/src/ (src/game/map/ascii/) does the rest at runtime: walls,
 * shadows, floors, decals and the objects. One MapData per floor, like the
 * mansion's: collisions, routes, the boss's navigation and the darkness of
 * the rooms not yet visited work unchanged.
 */
import type { Ambient, RoomType } from '../../config/dungeon';
import type { Cell, FloorPlan, Room } from '../../core/RunState';
import { compileAsciiMap, parseAsciiMap, type TilesetName } from '../map/ascii/asciiMap';
import { embedTilesets } from '../map/ascii/embed';
import { parseMap, type MapData } from '../map/MapLoader';
import type { Tsj } from '../map/tsj';
import { ROOM_PITCH, doorHoles, inward, mirrorTemplate, type DoorHole, type RoomTemplate } from './roomTemplate';

/** The `paredes` column of a floor's zones: the wall kit of its ambient (§2). */
const WALLS: Readonly<Record<Ambient, string>> = { mansion: '—', basement: 'sótano', garden: 'exterior' };

/** A room's zone id, by its index in the plan. */
export function zoneId(room: number): string {
  return `r${room}`;
}

export interface FloorTextOptions {
  /** Preview only: a hole without a neighbour stays an open gap instead of a wall. */
  openHoles?: boolean;
}

/** Marks a hole's tiles on the grid with `ch`. */
function mark(grid: string[][], ox: number, oy: number, hole: DoorHole, ch: string): void {
  for (const t of hole.tiles) {
    const row = grid[oy + t.y];
    if (row) row[ox + t.x] = ch;
  }
}

/**
 * The floor as the ASCII plan maps/src/ uses (§3.3): each room's template
 * (mirrored when the plan says so) laid at its cell, the holes between two
 * rooms as doors and the others walled, and the tables of every room moved
 * to the floor's coordinates.
 */
export function floorText(plan: FloorPlan, templates: ReadonlyMap<string, RoomTemplate>, options: FloorTextOptions = {}): string {
  const width = plan.width * ROOM_PITCH.x + 1;
  const height = plan.height * ROOM_PITCH.y + 1;
  const grid: string[][] = Array.from({ length: height }, () => new Array<string>(width).fill('_'));
  const zones: string[] = [];
  const doors: string[] = [];
  const tables = { enemigos: [] as string[], magos: [] as string[], cofre: [] as string[], bosses: [] as string[], mano: [] as string[], atrezo: [] as string[] };
  let player: Cell | null = null;
  const laid: { room: Room; index: number; template: RoomTemplate; ox: number; oy: number }[] = [];
  plan.rooms.forEach((room, index) => {
    const base = templates.get(room.template);
    if (!base) throw new Error(`falta la plantilla ${room.template} de la sala ${index}`);
    const template = room.mirrored ? mirrorTemplate(base) : base;
    const [tl] = room.cells as [Cell];
    const ox = tl.x * ROOM_PITCH.x;
    const oy = tl.y * ROOM_PITCH.y;
    template.grid.forEach((row, y) => [...row].forEach((ch, x) => ((grid[oy + y] as string[])[ox + x] = ch)));
    laid.push({ room, index, template, ox, oy });
  });
  // The holes: a door where the plan joins two rooms (once per pair), a wall elsewhere.
  for (const { room, index, template, ox, oy } of laid) {
    const holes = doorHoles(template.cellsX, template.cellsY);
    for (const hole of holes) {
      const door = room.doors.find((d) => d.side === hole.side && d.cell.x - (room.cells[0] as Cell).x === hole.cell.x && d.cell.y - (room.cells[0] as Cell).y === hole.cell.y);
      if (!door) {
        if (!options.openHoles) mark(grid, ox, oy, hole, '#');
        continue;
      }
      mark(grid, ox, oy, hole, 'D');
      if (door.room > index) {
        const cells = hole.tiles.map((t) => `${ox + t.x},${oy + t.y}`).join(' ');
        doors.push(`| D${doors.length + 1} | ${cells} | ${zoneId(index)} | ${zoneId(door.room)} |`);
      }
    }
    // The zone: its seed just inside its first hole (a door, or the walled hole of a preview).
    const first = holes.find((h) => room.doors.some((d) => d.side === h.side)) ?? holes[0];
    if (!first) throw new Error(`la sala ${index} no tiene huecos de puerta`);
    const seed = inward(first, first.tiles[0] as Cell);
    zones.push(`| ${zoneId(index)} | ${roomName(room.type)} | ${room.type === 'start' ? 'sí' : 'no'} | — | sí | no | ${ox + seed.x},${oy + seed.y} | ${WALLS[plan.ambient]} | ${room.template}${room.mirrored ? ' (espejo)' : ''} |`);
    const shift = (c: Cell): string => `${ox + c.x},${oy + c.y}`;
    template.enemies.forEach((c, i) => tables.enemigos.push(`| E${index}_${i + 1} | ${shift(c)} | ${zoneId(index)} |`));
    template.merchants.forEach((c, i) => tables.magos.push(`| M${index}_${i + 1} | ${shift(c)} | ${zoneId(index)} |`));
    template.chests.forEach((c, i) => tables.cofre.push(`| C${index}_${i + 1} | ${shift(c)} | ${zoneId(index)} |`));
    template.bossSpots.forEach((c, i) => tables.bosses.push(`| B${index}_${i + 1} | ${shift(c)} | ${zoneId(index)} |`));
    template.hands.forEach((c, i) => tables.mano.push(`| H${index}_${i + 1} | ${shift(c)} | ${zoneId(index)} |`));
    template.props.forEach((p) => {
      const xs = p.cells.map((c) => ox + c.x);
      const ys = p.cells.map((c) => oy + c.y);
      const area = p.cells.length === 1 ? `${xs[0]},${ys[0]}` : `${Math.min(...xs)},${Math.min(...ys)} ${Math.max(...xs)},${Math.max(...ys)}`;
      const flip = `${p.flipX ? 'h' : ''}${p.flipY ? 'v' : ''}` || '—';
      tables.atrezo.push(`| A${index}_${p.id} | ${p.key} | ${area} | ${p.collides ? 'sí' : 'no'} | ${flip} |`);
    });
    if (template.player) player = { x: ox + template.player.x, y: oy + template.player.y };
  }
  if (!player) throw new Error('la planta no tiene sala de inicio con jugador');
  const p: Cell = player;
  const lines = [
    ...grid.map((row) => row.join('')),
    '',
    `## Zonas (una por sala del plano; planta ${plan.floor}, ${plan.ambient})`,
    '| id | nombre | inicial | precio | interior | spawns abiertos | semilla | paredes | contiene |',
    '|---|---|---|---|---|---|---|---|---|',
    ...zones,
    '',
    '## Puertas (D): entre dos salas del plano; las cierra y abre la mazmorra, no se compran',
    '| id | casillas | de | a |',
    '|---|---|---|---|',
    ...doors,
    '',
    '## Jugador',
    '| casilla |',
    '|---|',
    `| ${p.x},${p.y} |`,
    '',
    '## Enemigos (puntos de aparición de cada sala)',
    '| id | casilla | zona |',
    '|---|---|---|',
    ...tables.enemigos,
    '',
    '## Magos',
    '| id | casilla | zona |',
    '|---|---|---|',
    ...tables.magos,
    '',
    '## Cofre',
    '| id | casilla | zona |',
    '|---|---|---|',
    ...tables.cofre,
    '',
    '## Bosses',
    '| id | casilla | zona |',
    '|---|---|---|',
    ...tables.bosses,
    '',
    '## Mano',
    '| id | casilla | zona |',
    '|---|---|---|',
    ...tables.mano,
    '',
    '## Atrezo',
    '| id | objeto | casillas | colisión | volteo |',
    '|---|---|---|---|---|',
    ...tables.atrezo,
    '',
  ];
  return lines.join('\n');
}

const ROOM_NAMES: Readonly<Record<RoomType, string>> = { start: 'Inicio', combat: 'Sala', elite: 'Élite', treasure: 'Tesoro', hand: 'La Mano', challenge: 'Reto', boss: 'Arena' };

function roomName(type: RoomType): string {
  return ROOM_NAMES[type];
}

/** A floor's MapData from its plan (§3.3): the ASCII text, compiled and read as any map of the game. */
export function assembleFloor(plan: FloorPlan, templates: ReadonlyMap<string, RoomTemplate>, tilesets: Readonly<Record<TilesetName, Tsj>>): MapData {
  const text = floorText(plan, templates);
  const compiled = compileAsciiMap(parseAsciiMap(text), tilesets, `dungeon/${plan.ambient}/${plan.floor}`);
  const embedded = embedTilesets(
    compiled,
    (source) => tilesets[source.replace(/^tilesets\//, '').replace(/\.tsj$/, '') as TilesetName],
    (_source, image) => image,
  );
  return parseMap(embedded);
}

/** The templates of an ambient by id, for the plan to look up. */
export function templatesById(list: readonly RoomTemplate[]): Map<string, RoomTemplate> {
  return new Map(list.map((t) => [t.id, t]));
}
