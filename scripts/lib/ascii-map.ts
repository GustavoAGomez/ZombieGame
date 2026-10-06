/**
 * The ASCII map compiler, for the scripts: the pure part lives with the game
 * (src/game/map/ascii/asciiMap.ts, which also compiles the dungeon's floors
 * at runtime); here, what only the build needs: the content hash that tells
 * a Tiled source retouched by hand from a compiled one (map:build).
 */
import { createHash } from 'node:crypto';
import { compileAsciiMap as compilePure, type AsciiMap, type TilesetName } from '../../src/game/map/ascii/asciiMap';
import type { TiledProperty, TiledSourceMap } from '../../src/game/map/tiled';
import type { Tsj } from '../../src/game/map/tsj';

export * from '../../src/game/map/ascii/asciiMap';

/** A short hash of what Tiled would save: layers, tiles and objects, not formatting. */
export function contentHash(map: TiledSourceMap): string {
  const layers = map.layers.map((l) =>
    l.type === 'tilelayer'
      ? { name: l.name, data: l.data }
      : {
          name: l.name,
          objects: l.objects.map((o) => ({
            type: o.type || o.class || '',
            name: o.name,
            x: o.x,
            y: o.y,
            w: o.width,
            h: o.height,
            gid: o.gid ?? 0,
            props: [...(o.properties ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((q) => [q.name, q.value]),
          })),
        },
  );
  return createHash('sha1').update(JSON.stringify({ w: map.width, h: map.height, layers })).digest('hex').slice(0, 16);
}

/** Map property that stores the hash of the content the compiler wrote. */
export const COMPILED_HASH = 'compiledHash';

/** The pure compiler's map, with its content hash stored, so map:build knows when someone retouched it in Tiled. */
export function compileAsciiMap(map: AsciiMap, tilesets: Readonly<Record<TilesetName, Tsj>>, sourceName: string): TiledSourceMap {
  const result: TiledSourceMap & { properties?: TiledProperty[] } = compilePure(map, tilesets, sourceName);
  result.properties = [...(result.properties ?? []), { name: COMPILED_HASH, type: 'string', value: contentHash(result) }];
  return result;
}
