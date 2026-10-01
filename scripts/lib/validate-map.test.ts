import { describe, expect, it } from 'vitest';
import type { TiledMap, TiledObject, TiledObjectLayer, TiledSourceMap } from '../../src/game/map/tiled';
import { embeddedMansion } from './mansion-fixture';
import { validateMap } from './validate-map';

const base = embeddedMansion();

/** A copy of the valid mansion with `edit` applied to its objects. */
function variant(edit: (objects: TiledObject[], map: TiledMap) => void): TiledMap {
  const map = structuredClone(base);
  const layer = map.layers.find((l) => l.name === 'objects') as TiledObjectLayer;
  edit(layer.objects, map);
  return map;
}

const byName = (objects: TiledObject[], name: string): TiledObject => {
  const obj = objects.find((o) => o.name === name);
  if (!obj) throw new Error(`no object ${name}`);
  return obj;
};

const setProp = (obj: TiledObject, name: string, value: string | number | boolean): void => {
  const prop = obj.properties?.find((p) => p.name === name);
  if (prop) prop.value = value;
  else (obj.properties ??= []).push({ name, type: typeof value === 'boolean' ? 'bool' : typeof value === 'number' ? 'int' : 'string', value });
};

const errorsOf = (map: TiledMap | TiledSourceMap): string => validateMap(map).errors.join('\n');

describe('validateMap', () => {
  it('accepts the generated mansion', () => {
    expect(validateMap(base).errors).toEqual([]);
  });

  it('asks for map:build when tilesets are external', () => {
    const map: TiledSourceMap = { ...structuredClone(base), tilesets: [{ firstgid: 1, source: 'tilesets/kit_fence.tsj' }] };
    expect(errorsOf(map)).toMatch(/npm run map:build/);
  });

  it('limits the map size', () => {
    expect(errorsOf({ ...structuredClone(base), width: 120 })).toMatch(/máximo es 100×70/);
  });

  it('needs exactly one initial zone, containing the player', () => {
    expect(errorsOf(variant((o) => setProp(byName(o, 'salon'), 'startsUnlocked', true)))).toMatch(/exactamente una zona inicial/);
    expect(errorsOf(variant((o) => Object.assign(byName(o, 'player'), { x: 10 * 32, y: 33 * 32 })))).toMatch(/no aparece dentro de la zona inicial/);
  });

  it('needs two barricades per interior zone', () => {
    expect(errorsOf(variant((o) => setProp(byName(o, 'azotea'), 'interior', true)))).toMatch(/azotea tiene 0 barricadas/);
  });

  it('keeps the player away from barricades', () => {
    expect(errorsOf(variant((o) => Object.assign(byName(o, 'player'), { x: 39.5 * 32, y: 38.5 * 32 })))).toMatch(/a 3\.0 tiles de W1/);
  });

  it('checks costs and sizes of doors and portals', () => {
    expect(errorsOf(variant((o) => setProp(byName(o, 'D1'), 'cost', 500)))).toMatch(/puerta D1 cuesta 500/);
    expect(errorsOf(variant((o) => Object.assign(byName(o, 'D1'), { height: 32 })))).toMatch(/puerta D1 mide 1 tile/);
    expect(errorsOf(variant((o) => setProp(byName(o, 'P2a'), 'cost', 2500)))).toMatch(/portal P2a cuesta 2500/);
  });

  it('needs doors that touch both of their zones', () => {
    expect(errorsOf(variant((o) => setProp(byName(o, 'D1'), 'toZone', 'garaje')))).toMatch(/D1 no toca la zona garaje/);
  });

  it('needs two exits per zone', () => {
    const map = variant((o) => o.splice(o.indexOf(byName(o, 'D3')), 1));
    expect(errorsOf(map)).toMatch(/salon tiene 1 salida/);
  });

  it('needs every zone reachable with everything open', () => {
    const map = variant((o) => {
      for (const name of ['P2a', 'P2b', 'P4a', 'P4b']) o.splice(o.indexOf(byName(o, name)), 1);
    });
    expect(errorsOf(map)).toMatch(/azotea no es alcanzable/);
  });

  it('needs both portal ends to agree on cost and secondary', () => {
    expect(errorsOf(variant((o) => setProp(byName(o, 'P1b'), 'cost', 1500)))).toMatch(/P1a y P1b deben tener el mismo coste/);
    expect(errorsOf(variant((o) => setProp(byName(o, 'P3b'), 'secondary', false)))).toMatch(/P3a y P3b/);
  });

  it('keeps portals inside their zone', () => {
    expect(errorsOf(variant((o) => setProp(byName(o, 'P1a'), 'zone', 'comedor')))).toMatch(/P1a se sale de su zona comedor/);
  });

  it('reports parse errors instead of throwing', () => {
    expect(errorsOf(variant((o) => setProp(byName(o, 'P1a'), 'pair', 'P9')))).toMatch(/unknown pair "P9"/);
  });
});
