/**
 * Decoration rules for compiled maps (skill level-design §4): weighted
 * floor variants, decals in clusters where people (and zombies) pass, and
 * soft shadows at the foot of walls and furniture. Everything is
 * deterministic: the same plan always gives the same map.
 */

export interface Cell {
  x: number;
  y: number;
}

/** Decal sheets and the cells of each that work as loose decals (transparent edges). */
export const DECALS = {
  interior: {
    tileset: 'decals_interior',
    size: 32,
    blood: [0, 1, 2],
    drag: [3, 4],
    dust: [5, 6, 7],
    debris: [8, 9],
    splinters: [10, 11],
    cracks: [12, 13],
    footprints: [14],
    paper: [15],
  },
  grass: { tileset: 'decals_grass', size: 48, pebbles: [0, 8, 9, 13], weeds: [4], stones: [1, 12] },
  asphalt: { tileset: 'decals_asphalt', size: 48, cracks: [1, 3, 6, 11, 13], stains: [4, 7, 14, 15], gravel: [5], manholes: [0, 2, 9] },
} as const;

/** Shadow tiles of map_shadows (light from the top left). */
export const SHADOW = { top: 0, left: 1, both: 2, corner: 3, wallV: 4 } as const;

/** Share of each zone's floor that should carry a decal or a prop. */
export const DECOR_DENSITY = { min: 0.15, target: 0.2, max: 0.25 } as const;
const MAIN_VARIANT_SHARE = 0.7;

export interface PlacedDecal {
  tileset: string;
  local: number;
  /** Centre in world px. */
  cx: number;
  cy: number;
  flipX: boolean;
  flipY: boolean;
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(x: number, y: number, salt = 0): number {
  let h = Math.imul(x + salt * 101, 0x27d4eb2d) ^ Math.imul(y - salt * 57, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1): clusters instead of an even sprinkle. */
export function valueNoise(x: number, y: number, cell: number, salt: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const s = (t: number): number => t * t * (3 - 2 * t);
  const a = hash(x0, y0, salt);
  const b = hash(x0 + 1, y0, salt);
  const c = hash(x0, y0 + 1, salt);
  const d = hash(x0 + 1, y0 + 1, salt);
  return a + (b - a) * s(fx) + (c - a) * s(fy) + (a - b - c + d) * s(fx) * s(fy);
}

/**
 * Variant per tile: `main` about 70 % of the time, otherwise one of
 * `rares`, but never the same rare variant on two neighbouring tiles. Rare
 * tiles gather where a smooth noise is high (worn patches) instead of an
 * even sprinkle, which would read as a polka-dot pattern.
 */
export function floorVariants(
  width: number,
  height: number,
  isFloor: (x: number, y: number) => boolean,
  variantsAt: (x: number, y: number) => { main: number; rares: readonly number[] },
): Int8Array {
  const out = new Int8Array(width * height).fill(-1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!isFloor(x, y)) continue;
      const { main, rares } = variantsAt(x, y);
      let v = main;
      const wear = valueNoise(x, y, 5, 17); // mean 0.5: keeps the 30 % share on average
      if (rares.length > 0 && hash(x, y, 7) < (1 - MAIN_VARIANT_SHARE) * 2 * wear) {
        const rare = rares[Math.floor(hash(x, y, 11) * rares.length)] ?? main;
        const around = [out[y * width + x - 1], out[(y - 1) * width + x], out[(y - 1) * width + x - 1], out[(y - 1) * width + x + 1]];
        if (!around.includes(rare)) v = rare;
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

/** Shadow tile for a cell given which neighbours cast shadow, or -1. */
export function shadowTile(north: boolean, west: boolean, northWest: boolean): number {
  if (north && west) return SHADOW.both;
  if (north) return SHADOW.top;
  if (west) return SHADOW.left;
  if (northWest) return SHADOW.corner;
  return -1;
}

export interface DecorInput {
  width: number;
  height: number;
  tileSize: number;
  /** Ground character per cell after markers are resolved ('wall' under walls). */
  ground: (x: number, y: number) => string;
  /** Zone index per cell, -1 outside. */
  zoneAt: (x: number, y: number) => number;
  zoneCount: number;
  /** Cells where nothing can be placed (walls, void, water, furniture with collision). */
  blocked: (x: number, y: number) => boolean;
  /** Barricades: their cell and the direction into their zone. */
  windows: readonly { cell: Cell; inward: Cell; outdoor: boolean }[];
  /** Door and open-gap cells. */
  passages: readonly Cell[];
  /** Cells (row-major index) covered by props, with or without collision. */
  propCells: ReadonlySet<number>;
  seed: number;
}

/** Floor area per zone (free cells plus cells under props) and the part already covered by props. */
function zoneAreas(input: Pick<DecorInput, 'width' | 'height' | 'zoneAt' | 'zoneCount' | 'blocked' | 'propCells'>): { area: number[]; props: number[] } {
  const area = new Array<number>(input.zoneCount).fill(0);
  const props = new Array<number>(input.zoneCount).fill(0);
  for (let y = 0; y < input.height; y++) {
    for (let x = 0; x < input.width; x++) {
      const z = input.zoneAt(x, y);
      if (z < 0) continue;
      const underProp = input.propCells.has(y * input.width + x);
      if (underProp) props[z]!++;
      if (underProp || !input.blocked(x, y)) area[z]!++;
    }
  }
  return { area, props };
}

const INDOOR = '.kbcr';

/**
 * Places decals zone by zone: first the wear that tells a story (barricades,
 * doors, corners), then noise clusters until about 20 % of the zone's floor
 * carries a decal or a prop.
 */
export function placeDecals(input: DecorInput): PlacedDecal[] {
  const { width: W, height: H, tileSize: ts } = input;
  const random = rng(input.seed);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(random() * list.length)] as T;
  const gauss = (sigma: number): number => (random() + random() + random() - 1.5) * sigma * 1.4;
  const decals: PlacedDecal[] = [];
  const covered = new Set<number>(input.propCells);
  const { area: floorCount, props: coveredCount } = zoneAreas(input);

  const place = (tileset: string, local: number, cx: number, cy: number, force = false): boolean => {
    const tx = Math.floor(cx / ts);
    const ty = Math.floor(cy / ts);
    if (tx < 0 || ty < 0 || tx >= W || ty >= H || input.blocked(tx, ty)) return false;
    const z = input.zoneAt(tx, ty);
    const key = ty * W + tx;
    // Only the wear around barricades may go past the target: it tells what happened there.
    if (z >= 0 && !force && coveredCount[z]! >= floorCount[z]! * DECOR_DENSITY.target) return false;
    decals.push({ tileset, local, cx: Math.round(cx), cy: Math.round(cy), flipX: random() < 0.5, flipY: random() < 0.5 });
    if (z >= 0 && !covered.has(key)) {
      covered.add(key);
      coveredCount[z]!++;
    }
    return true;
  };
  const I = DECALS.interior;
  const centre = (c: number): number => (c + 0.5) * ts;

  // 1. Barricades: debris, splinters and blood inside, and a trail into the room.
  for (const w of input.windows) {
    const ix = centre(w.cell.x + w.inward.x);
    const iy = centre(w.cell.y + w.inward.y);
    if (w.outdoor) {
      for (let k = 0; k < 2; k++) place(I.tileset, pick(I.splinters), ix + gauss(10), iy + gauss(10), true);
      continue;
    }
    place(I.tileset, pick(I.debris), ix + gauss(8), iy + gauss(8), true);
    place(I.tileset, pick(I.splinters), ix + gauss(10), iy + gauss(10), true);
    if (random() < 0.75) place(I.tileset, pick(I.blood), ix + gauss(10), iy + gauss(10), true);
    const steps = 2 + Math.floor(random() * 3);
    for (let s = 1; s <= steps; s++) {
      const along = 0.9 + s * 0.75;
      const side = gauss(6);
      const cx = centre(w.cell.x) + w.inward.x * along * ts + w.inward.y * side;
      const cy = centre(w.cell.y) + w.inward.y * along * ts + w.inward.x * side;
      place(I.tileset, s === 1 ? pick(I.drag) : pick([...I.blood, ...I.footprints]), cx, cy, s === 1);
    }
  }

  // 2. Doors and open gaps: dirt and footprints where everybody walks.
  for (const p of input.passages) {
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = p.x + dx;
      const y = p.y + dy;
      if (!INDOOR.includes(input.ground(x, y)) || input.blocked(x, y) || random() > 0.55) continue;
      place(I.tileset, random() < 0.6 ? pick(I.dust) : pick(I.footprints), centre(x) + gauss(7) - dx * 6, centre(y) + gauss(7) - dy * 6);
    }
  }

  // 3. Corners gather dust.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!INDOOR.includes(input.ground(x, y)) || input.blocked(x, y)) continue;
      const wallN = input.ground(x, y - 1) === 'wall';
      const wallS = input.ground(x, y + 1) === 'wall';
      const wallW = input.ground(x - 1, y) === 'wall';
      const wallE = input.ground(x + 1, y) === 'wall';
      if (!((wallN || wallS) && (wallW || wallE)) || random() > 0.4) continue;
      place(I.tileset, pick(I.dust), centre(x) + (wallW ? -8 : 8), centre(y) + (wallN ? -8 : 8));
    }
  }

  // 4. Noise clusters until each zone reaches the target density.
  const order: number[] = [];
  for (let i = 0; i < W * H; i++) order.push(i);
  order.sort((a, b) => hash(a % W, Math.floor(a / W), 3) - hash(b % W, Math.floor(b / W), 3));
  // Passes with a lower noise threshold each time, for zones still short of the target.
  for (const threshold of [0.6, 0.45, 0.3]) for (const cell of order) {
    const x = cell % W;
    const y = (cell - x) / W;
    const z = input.zoneAt(x, y);
    if (z < 0 || input.blocked(x, y) || covered.has(cell)) continue;
    if (coveredCount[z]! >= floorCount[z]! * DECOR_DENSITY.target) continue;
    const g = input.ground(x, y);
    const n = valueNoise(x, y, INDOOR.includes(g) ? 4 : 6, g.charCodeAt(0));
    if (n < threshold) continue;
    const cx = centre(x) + gauss(8);
    const cy = centre(y) + gauss(8);
    if (INDOOR.includes(g)) place(I.tileset, pick(random() < 0.55 ? I.dust : random() < 0.5 ? I.cracks : I.paper), cx, cy);
    else if (g === 'g') place(DECALS.grass.tileset, pick(random() < 0.5 ? DECALS.grass.pebbles : random() < 0.5 ? DECALS.grass.weeds : DECALS.grass.stones), cx, cy);
    else if (g === 'a') place(DECALS.asphalt.tileset, pick(random() < 0.6 ? DECALS.asphalt.cracks : random() < 0.8 ? DECALS.asphalt.stains : DECALS.asphalt.gravel), cx, cy);
    else if (g === 's' || g === 'p' || g === 'e' || g === 'd') {
      if (random() < 0.35) place(g === 's' ? DECALS.asphalt.tileset : DECALS.grass.tileset, g === 's' ? pick(DECALS.asphalt.cracks) : pick(DECALS.grass.pebbles), cx, cy);
    }
  }
  return decals;
}

/** Share of each zone's floor covered by a decal or a prop (skill §4.7). */
export function decorDensity(
  decals: readonly PlacedDecal[],
  input: Pick<DecorInput, 'width' | 'height' | 'tileSize' | 'zoneAt' | 'zoneCount' | 'blocked' | 'propCells'>,
): number[] {
  const { area, props: covered } = zoneAreas(input);
  const seen = new Set<number>(input.propCells);
  for (const d of decals) {
    const tx = Math.floor(d.cx / input.tileSize);
    const ty = Math.floor(d.cy / input.tileSize);
    const z = input.zoneAt(tx, ty);
    const key = ty * input.width + tx;
    if (z < 0 || seen.has(key)) continue;
    seen.add(key);
    covered[z]!++;
  }
  return area.map((a, z) => (a > 0 ? (covered[z] ?? 0) / a : 0));
}
