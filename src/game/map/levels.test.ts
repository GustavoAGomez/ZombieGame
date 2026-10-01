import { describe, expect, it } from 'vitest';
import { createMansionContext } from '../../test/fixtures';
import { cellHidden, fogEdges, fogOwners } from './fog';
import { cameraBounds, computeLevels } from './levels';

describe('levels', () => {
  const { map } = createMansionContext();
  const { levels, zoneLevel } = computeLevels(map);
  const levelOf = (id: string) => zoneLevel[map.zones.findIndex((z) => z.id === id)];

  it('groups the zones joined by doors: ground floor, basement and roof', () => {
    expect(levels).toHaveLength(3);
    const ground = levelOf('recibidor');
    for (const id of ['salon', 'comedor', 'biblioteca', 'cocina', 'garaje', 'jardin', 'calle']) expect(levelOf(id), id).toBe(ground);
    expect(levelOf('sotano')).not.toBe(ground);
    expect(levelOf('azotea')).not.toBe(ground);
    expect(levelOf('sotano')).not.toBe(levelOf('azotea'));
  });

  it('keeps each level inside its own area, with a gap of void between them', () => {
    const ts = map.tileSize;
    const ground = levels[levelOf('recibidor') ?? 0]!.bounds;
    const roof = levels[levelOf('azotea') ?? 0]!.bounds;
    const basement = levels[levelOf('sotano') ?? 0]!.bounds;
    // The ground floor never reaches the islands, and the islands do not overlap.
    expect(ground.x + ground.width).toBeLessThanOrEqual(roof.x - 8 * ts);
    expect(ground.x + ground.width).toBeLessThanOrEqual(basement.x - 8 * ts);
    expect(roof.y + roof.height).toBeLessThanOrEqual(basement.y);
  });

  it('centres a level narrower than the view, with void on both sides', () => {
    const b = cameraBounds({ x: 1000, y: 100, width: 500, height: 600 }, 700, 300);
    expect(b).toEqual({ x: 900, y: 100, width: 700, height: 600 });
    // A typical phone view never reaches the ground floor from the roof.
    const roof = levels[levelOf('azotea') ?? 0]!.bounds;
    const ground = levels[levelOf('recibidor') ?? 0]!.bounds;
    expect(cameraBounds(roof, 22 * 32, 10 * 32).x).toBeGreaterThan(ground.x + ground.width);
  });
});

describe('fog of locked zones', () => {
  const { map } = createMansionContext();
  const owners = fogOwners(map);
  const zone = (id: string) => map.zones.findIndex((z) => z.id === id);
  const at = (x: number, y: number) => owners[y * map.width + x];

  it('covers the floor and the walls inside a zone, not the walls on its border', () => {
    expect(at(26, 23)).toBe(zone('biblioteca')); // floor
    expect(at(21, 20)).toBe(zone('biblioteca')); // partition between the library and the study
    expect(at(32, 21)).toBe(-1); // wall between the library and the kitchen
    expect(at(24, 33)).toBe(zone('salon')); // the salón column
    expect(at(32, 38)).toBe(-1); // door D1
  });

  it('keeps the border of a zone dark until a zone it touches is unlocked', () => {
    const edges = fogEdges(map, owners);
    const mask = (x: number, y: number) => edges[y * map.width + x] ?? 0;
    const bit = (id: string) => 1 << zone(id);
    // Door D1 shows once the hall or the salón is open.
    expect(mask(32, 38) & bit('salon')).not.toBe(0);
    expect(mask(32, 38) & bit('recibidor')).not.toBe(0);
    expect(mask(32, 38) & bit('azotea')).toBe(0);
    // The hall's north-west corner is its own; the walls right past it belong to the rooms around.
    expect(mask(32, 29) & bit('recibidor')).not.toBe(0);
    expect(mask(31, 29)).toBe(bit('biblioteca') | bit('salon'));
    expect(mask(32, 28)).toBe(bit('biblioteca') | bit('cocina'));
    // Cells inside a zone are left to that zone's own darkness.
    expect(mask(26, 23)).toBe(0);
    // Void farther than FOG_EDGE_TILES (3) from every zone never needs it.
    expect(mask(86, 60)).toBe(0);
  });

  it('shows from the hall only the hall and its own border', () => {
    const edges = fogEdges(map, owners);
    const hall = 1 << zone('recibidor');
    const hidden = (x: number, y: number) => cellHidden(y * map.width + x, owners, edges, hall);
    expect(hidden(37, 31)).toBe(false); // hall floor
    expect(hidden(32, 29)).toBe(false); // its corner
    expect(hidden(32, 38)).toBe(false); // door D1
    expect(hidden(31, 29)).toBe(true); // the library's wall, right past the corner
    expect(hidden(32, 28)).toBe(true);
    expect(hidden(26, 23)).toBe(true); // the library
    expect(hidden(86, 60)).toBe(false); // void far from everything
  });
});
