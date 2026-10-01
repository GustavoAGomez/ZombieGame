import { describe, expect, it } from 'vitest';
import { terrainTile, terrainVertices } from './terrain';

const grid = (rows: string[]) => ({ w: rows[0]!.length, h: rows.length, at: (x: number, y: number) => rows[y]?.[x] ?? '_' });
const vertices = (rows: string[]) => {
  const g = grid(rows);
  return terrainVertices(g.w, g.h, g.at);
};

describe('terrain by vertices', () => {
  it('puts the kerb on the sidewalk: a vertex is asphalt with 2 of its 4 cells', () => {
    const t = vertices(['aass', 'aass']);
    expect(t.errors).toEqual([]);
    // Vertex between columns 1 and 2: 2 asphalt + 2 sidewalk → asphalt.
    expect(t.vertices[1 * 5 + 2]).toBe('a');
    expect(terrainTile(t, 2, 0, 's')).toEqual({ tileset: 'tileset_street', code: '0101' });
    expect(terrainTile(t, 0, 0, 'a')).toEqual({ tileset: 'tileset_street', code: '0000' });
  });

  it('keeps the pool wall inside the water: a vertex is water only with 4 water cells', () => {
    const t = vertices(['eeee', 'ewwe', 'ewwe', 'eeee']);
    expect(t.vertices[2 * 5 + 2]).toBe('w');
    expect(t.vertices[1 * 5 + 1]).toBe('e');
    expect(terrainTile(t, 1, 1, 'w')).toEqual({ tileset: 'tileset_pool', code: '1110' });
  });

  it('passes from sidewalk to grass with the garden tileset, the sidewalk as patio', () => {
    const t = vertices(['ssgg', 'ssgg']);
    expect(t.errors).toEqual([]);
    expect(terrainTile(t, 2, 0, 'g')).toEqual({ tileset: 'tileset_garden', code: '0101' });
  });

  it('fails on a pair without tileset, saying which and where', () => {
    expect(vertices(['aagg']).errors[0]).toMatch(/par sin tileset asfalto↔césped en el vértice 2,0/);
    expect(vertices(['ee', 'pp']).errors[0]).toMatch(/cubierta↔patio|patio↔cubierta/);
    // Asphalt touching grass only diagonally is still an error.
    expect(vertices(['as', 'sg']).errors.join(' ')).toMatch(/asfalto, acera, césped|tres terrenos/);
  });

  it('passes from the pool deck to grass with the garden tileset, the deck as patio', () => {
    const t = vertices(['eegg', 'eegg']);
    expect(t.errors).toEqual([]);
    expect(terrainTile(t, 2, 0, 'g')).toEqual({ tileset: 'tileset_garden', code: '0101' });
    expect(terrainTile(t, 0, 0, 'e')).toEqual({ tileset: 'tileset_pool', code: '1111' });
  });

  it('ignores what is not a Wang terrain (walls, dirt, interior floors)', () => {
    expect(vertices(['gd.H#', 'gd.H#']).errors).toEqual([]);
  });
});
