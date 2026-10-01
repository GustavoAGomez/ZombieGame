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
    expect(errorsOf({ ...structuredClone(base), width: 130 })).toMatch(/máximo es 120×70/);
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

  describe('furniture', () => {
    const propsOf = (map: TiledMap): TiledObject[] => (map.layers.find((l) => l.name === 'props') as TiledObjectLayer).objects;
    const prop = (id: string, x: number, y: number, w = 1, h = 1): TiledObject => ({
      id: 9000 + x * 100 + y,
      name: id,
      type: 'prop',
      x: x * 32,
      y: y * 32,
      width: w * 32,
      height: h * 32,
      rotation: 0,
      visible: true,
      properties: [
        { name: 'key', type: 'string', value: 'prop_test' },
        { name: 'collides', type: 'bool', value: true },
      ],
    });
    const withProp = (p: TiledObject): TiledMap => {
      const map = structuredClone(base);
      propsOf(map).push(p);
      return map;
    };

    it('keeps furniture away from barricades and doors in the same zone', () => {
      expect(errorsOf(withProp(prop('Q1', 39, 39)))).toMatch(/Q1 \(prop_test\) está a 2 tiles o menos de la barricada W1/);
      expect(errorsOf(withProp(prop('Q2', 33, 38)))).toMatch(/Q2 \(prop_test\) está a 2 tiles o menos de la puerta D1/);
    });

    it('does not let furniture leave a pass under 2 tiles', () => {
      // One tile from the corridor wall, in the middle of the corridor (3 tiles tall).
      expect(errorsOf(withProp(prop('Q3', 38, 31)))).toMatch(/Q3 \(prop_test\) deja un paso de menos de 2 tiles/);
    });

    it('does not let furniture cut a zone in two', () => {
      // A column of furniture right inside the guest toilet's doorway shuts the toilet off.
      expect(errorsOf(withProp(prop('Q4', 43, 37, 1, 3)))).toMatch(/recibidor tiene \d+ casillas a las que no se puede llegar/);
    });

    it('does not let furniture cover the player spawn', () => {
      expect(errorsOf(withProp(prop('Q5', 39, 31)))).toMatch(/Q5 tapa el spawn del jugador/);
    });
  });

  describe('merchant spots', () => {
    const moveSpot = (name: string, tx: number, ty: number) =>
      variant((o) => Object.assign(byName(o, name), { x: (tx + 0.5) * 32, y: (ty + 0.5) * 32 }));

    it('needs one or two per zone', () => {
      const none = variant((o) => {
        for (const name of ['M17', 'M18']) o.splice(o.indexOf(byName(o, name)), 1);
      });
      expect(errorsOf(none)).toMatch(/la zona sotano tiene 0 puntos de mago/);
      const three = variant((o) => o.push({ ...byName(o, 'M1'), id: 9999, name: 'M99', x: 35.5 * 32, y: 30.5 * 32 }));
      expect(errorsOf(three)).toMatch(/la zona recibidor tiene 3 puntos de mago/);
    });

    it('keeps them against a wall, inside their zone and clear of barricades', () => {
      expect(errorsOf(moveSpot('M3', 25, 37))).toMatch(/punto de mago 3 \(salon\) no está pegado a una pared/);
      expect(errorsOf(moveSpot('M6', 53, 41))).toMatch(/punto de mago 6 \(comedor\) está a 1\.0 tiles de la barricada W6/);
      expect(errorsOf(moveSpot('M6', 25, 37))).toMatch(/punto de mago 6 \(comedor\) no cae en su zona/);
    });

    it('does not let a merchant narrow a pass under 2 tiles', () => {
      // In the 2-tile gap between the library and its reading corner.
      expect(errorsOf(moveSpot('M7', 21, 21))).toMatch(/punto de mago 7 \(biblioteca\) deja un paso de menos de 2 tiles en 21,22/);
    });
  });
});
