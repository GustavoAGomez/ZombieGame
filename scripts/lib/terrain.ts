/**
 * Outdoor terrain by vertices (docs/ASSETS.md §7.3). The plan gives one
 * terrain per cell; the Wang tilesets need one terrain per vertex. The map
 * of vertices is (width+1)×(height+1): each vertex takes its terrain from
 * the 4 cells around it, and each tile is then chosen by its 4 corners.
 *
 * Only these pairs have transition art:
 *   asfalto ↔ acera   tileset_street (the kerb)
 *   agua ↔ cubierta   tileset_pool (the pool wall)
 *   patio ↔ césped    tileset_garden
 *   acera ↔ césped    tileset_garden, the sidewalk drawn as patio
 *   cubierta ↔ césped tileset_garden, the pool deck drawn as patio (a rim
 *                     of grey flagstones between the deck and the lawn)
 * Any other pair meeting at a vertex (asphalt touching grass, the deck
 * touching the patio…) is an error that names the pair and where it is.
 */

/** Characters of the plan that are Wang terrains. */
export const TERRAIN_NAMES: Readonly<Record<string, string>> = {
  a: 'asfalto',
  s: 'acera',
  w: 'agua',
  e: 'cubierta',
  p: 'patio',
  g: 'césped',
};

export type TerrainTileset = 'tileset_street' | 'tileset_pool' | 'tileset_garden';

export interface TerrainPair {
  tileset: TerrainTileset;
  /** Character drawn as terrain 0 of the tileset (inside the transition) and as terrain 1. */
  inner: string;
  outer: string;
  /**
   * A vertex between both takes the inner terrain when at least this many
   * of its 4 cells are inner (in proportion when fewer than 4 terrain cells
   * touch it: at the edge of the map or next to a wall).
   */
  threshold: number;
}

/**
 * With threshold 2 the transition falls on the outer cells next to the
 * inner ones (the kerb lies on the sidewalk); with 4 it falls on the inner
 * cells, so the pool wall stays inside the water cells.
 */
export const TERRAIN_PAIRS: readonly TerrainPair[] = [
  { tileset: 'tileset_street', inner: 'a', outer: 's', threshold: 2 },
  { tileset: 'tileset_pool', inner: 'w', outer: 'e', threshold: 4 },
  { tileset: 'tileset_garden', inner: 'p', outer: 'g', threshold: 2 },
  { tileset: 'tileset_garden', inner: 's', outer: 'g', threshold: 2 },
  { tileset: 'tileset_garden', inner: 'e', outer: 'g', threshold: 2 },
];

/** Where each terrain's plain tile comes from: tileset and terrain index in it. */
export const PLAIN_TERRAIN: Readonly<Record<string, { tileset: TerrainTileset; terrain: 0 | 1 }>> = {
  a: { tileset: 'tileset_street', terrain: 0 },
  s: { tileset: 'tileset_street', terrain: 1 },
  w: { tileset: 'tileset_pool', terrain: 0 },
  e: { tileset: 'tileset_pool', terrain: 1 },
  p: { tileset: 'tileset_garden', terrain: 0 },
  g: { tileset: 'tileset_garden', terrain: 1 },
};

export function pairOf(a: string, b: string): TerrainPair | undefined {
  return TERRAIN_PAIRS.find((p) => (p.inner === a && p.outer === b) || (p.inner === b && p.outer === a));
}

const name = (c: string): string => TERRAIN_NAMES[c] ?? c;

export interface TerrainVertices {
  width: number;
  height: number;
  /** (width+1)×(height+1) terrain characters, '' where no terrain cell touches the vertex. */
  vertices: string[];
  errors: string[];
}

/**
 * Terrain of every vertex from the terrain of the cells (`cellAt` gives the
 * plan's ground character; anything that is not a Wang terrain is ignored).
 */
export function terrainVertices(width: number, height: number, cellAt: (x: number, y: number) => string): TerrainVertices {
  const vertices: string[] = [];
  const errors: string[] = [];
  const terrainAt = (x: number, y: number): string => {
    const c = x >= 0 && y >= 0 && x < width && y < height ? cellAt(x, y) : '';
    return c in TERRAIN_NAMES ? c : '';
  };
  for (let vy = 0; vy <= height; vy++) {
    for (let vx = 0; vx <= width; vx++) {
      const around = [terrainAt(vx - 1, vy - 1), terrainAt(vx, vy - 1), terrainAt(vx - 1, vy), terrainAt(vx, vy)].filter((c) => c !== '');
      const distinct = [...new Set(around)];
      let v = '';
      if (distinct.length === 1) v = distinct[0] ?? '';
      else if (distinct.length === 2) {
        const [a = '', b = ''] = distinct;
        const pair = pairOf(a, b);
        if (!pair) errors.push(`par sin tileset ${name(a)}↔${name(b)} en el vértice ${vx},${vy} (entre las casillas ${vx - 1}..${vx}, ${vy - 1}..${vy})`);
        else v = around.filter((c) => c === pair.inner).length * 4 >= pair.threshold * around.length ? pair.inner : pair.outer;
      } else if (distinct.length > 2) {
        errors.push(`${distinct.map(name).join(', ')} se juntan en el vértice ${vx},${vy}; no hay tiles para tres terrenos`);
      }
      vertices.push(v);
    }
  }
  return { width, height, vertices, errors };
}

export interface TerrainTile {
  tileset: TerrainTileset;
  /** Corner code "NWNESWSE" in the tileset's terrains (0 = inner), as in the measured Wang table. */
  code: string;
}

/**
 * The tile for a terrain cell from its 4 corners. Corners without terrain
 * (a vertex touched only by this cell and walls) take the cell's own.
 */
export function terrainTile(t: TerrainVertices, x: number, y: number, own: string): TerrainTile | string {
  const at = (vx: number, vy: number): string => t.vertices[vy * (t.width + 1) + vx] || own;
  const corners = [at(x, y), at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)];
  const distinct = [...new Set(corners)];
  if (distinct.length === 1) {
    const plain = PLAIN_TERRAIN[distinct[0] ?? own];
    if (!plain) return `la casilla ${x},${y} no es de un terreno con tileset`;
    return { tileset: plain.tileset, code: String(plain.terrain).repeat(4) };
  }
  const [a = '', b = ''] = distinct;
  const pair = distinct.length === 2 ? pairOf(a, b) : undefined;
  if (!pair) return `la casilla ${x},${y} junta ${distinct.map(name).join(' y ')} en sus esquinas y no hay tileset para eso`;
  return { tileset: pair.tileset, code: corners.map((c) => (c === pair.inner ? '0' : '1')).join('') };
}
