import { describe, expect, it } from 'vitest';
import { DUNGEON } from '../../config/dungeon';
import { testTemplates } from '../../test/dungeonFixtures';
import { doorHoles, mirrorTemplate, parseRoomTemplate, templateSize, validateRoomTemplate, type RoomTemplate } from './roomTemplate';

/** An empty combat room with the fixed holes and whatever `tables` say. */
function combatRoom(tables: string, interior?: (x: number, y: number) => string): string {
  const { width, height } = templateSize(1, 1);
  const holes = doorHoles(1, 1).flatMap((h) => h.tiles);
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let row = '';
    for (let x = 0; x < width; x++) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      row += border ? (holes.some((c) => c.x === x && c.y === y) ? 'o' : '#') : (interior?.(x, y) ?? '.');
    }
    rows.push(row);
  }
  return `${rows.join('\n')}\n\n## Sala\n| tipo | dificultad | ambiente |\n|---|---|---|\n| combat | easy | mansion |\n\n${tables}`;
}

const SPOTS = '## Enemigos\n| id | casilla |\n|---|---|\n| E1 | 4,2 |\n| E2 | 13,6 |\n\n## Magos\n| id | casilla |\n|---|---|\n| M1 | 1,1 |\n';

describe('room templates (spec 09 §3.2)', () => {
  it('has its door holes at the same place in every room: the middle of the north and south walls, just under the middle of the others', () => {
    const holes = doorHoles(1, 1);
    expect(holes.map((h) => h.side)).toEqual(['n', 's', 'w', 'e']);
    expect(holes.find((h) => h.side === 'n')?.tiles).toEqual([
      { x: 8, y: 0 },
      { x: 9, y: 0 },
    ]);
    expect(holes.find((h) => h.side === 'e')?.tiles).toEqual([
      { x: 17, y: 4 },
      { x: 17, y: 5 },
    ]);
    // The arena: a hole per cell and side, eight in all, on its 35×17 ring.
    const arena = doorHoles(DUNGEON.arenaSize, DUNGEON.arenaSize);
    expect(arena).toHaveLength(8);
    expect(templateSize(2, 2)).toEqual({ width: 35, height: 17 });
    expect(arena.find((h) => h.side === 's' && h.cell.x === 1)?.tiles).toEqual([
      { x: 25, y: 16 },
      { x: 26, y: 16 },
    ]);
  });

  it('accepts every template of the mansion, drawn and mirrored, with the sizes of the bank', () => {
    const list = testTemplates();
    const byType = new Map<string, number>();
    for (const t of list) {
      expect(validateRoomTemplate(t), t.id).toEqual([]);
      expect(validateRoomTemplate(mirrorTemplate(t)), `${t.id} (espejo)`).toEqual([]);
      byType.set(t.type, (byType.get(t.type) ?? 0) + 1);
    }
    expect(Object.fromEntries(byType)).toEqual(DUNGEON.bank);
  });

  it('mirrors a template left to right: the holes stay, the furniture and the points move', () => {
    const t = parseRoomTemplate(combatRoom(`${SPOTS}\n## Atrezo\n| id | objeto | casillas | colisión | volteo |\n|---|---|---|---|---|\n| A1 | prop_mesa | 2,2 3,2 | sí | — |\n`), 'mansion/test');
    const m = mirrorTemplate(t);
    expect(m.mirrored).toBe(true);
    expect(m.enemies).toEqual([
      { x: 13, y: 2 },
      { x: 4, y: 6 },
    ]);
    expect(m.props[0]?.cells).toEqual([
      { x: 15, y: 2 },
      { x: 14, y: 2 },
    ]);
    expect(m.props[0]?.flipX).toBe(true);
    expect(m.grid[0]).toBe(t.grid[0]);
    expect(mirrorTemplate(m)).toEqual({ ...t, props: t.props.map((p) => ({ ...p, cells: [...p.cells].reverse().reverse() })) });
  });

  it('rejects furniture before a hole, an enemy near a hole and a passage narrower than two tiles', () => {
    const before = parseRoomTemplate(combatRoom(`${SPOTS}\n## Atrezo\n| id | objeto | casillas | colisión | volteo |\n|---|---|---|---|---|\n| A1 | prop_cajas | 8,1 9,2 | sí | — |\n`), 'mansion/a');
    expect(validateRoomTemplate(before).join('\n')).toMatch(/delante de un hueco/);
    const near = parseRoomTemplate(combatRoom('## Enemigos\n| id | casilla |\n|---|---|\n| E1 | 2,4 |\n| E2 | 13,6 |\n\n## Magos\n| id | casilla |\n|---|---|\n| M1 | 1,1 |\n'), 'mansion/b');
    expect(validateRoomTemplate(near).join('\n')).toMatch(/a menos de 4 casillas/);
    // A wall across the room with a one-tile gap: the east holes never join the west ones.
    const narrow = parseRoomTemplate(
      combatRoom(SPOTS, (x, y) => (x === 11 && y !== 4 ? '#' : '.')),
      'mansion/c',
    );
    expect(validateRoomTemplate(narrow).join('\n')).toMatch(/paso de 2 casillas/);
    const twoWide = parseRoomTemplate(
      combatRoom(SPOTS, (x, y) => (x === 11 && y !== 4 && y !== 5 ? '#' : '.')),
      'mansion/d',
    );
    expect(validateRoomTemplate(twoWide)).toEqual([]);
  });

  it('asks each room for what it gives: a wizard in enemy rooms, a chest where a prize waits, the arena a boss spot', () => {
    const noWizard = parseRoomTemplate(combatRoom('## Enemigos\n| id | casilla |\n|---|---|\n| E1 | 4,2 |\n| E2 | 13,6 |\n'), 'mansion/e');
    expect(validateRoomTemplate(noWizard).join('\n')).toMatch(/punto de mago/);
    const treasure = testTemplates().find((t) => t.type === 'treasure') as RoomTemplate;
    expect(validateRoomTemplate({ ...treasure, chests: [] }).join('\n')).toMatch(/cofre/);
    const boss = testTemplates().find((t) => t.type === 'boss') as RoomTemplate;
    expect(validateRoomTemplate({ ...boss, bossSpots: [] }).join('\n')).toMatch(/punto de boss/);
    expect(boss.cellsX).toBe(2);
  });
});
