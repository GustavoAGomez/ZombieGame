# Exports de PixelLab (PNG, tiles de 32×32, vista top-down)

## Tilesets Wang (generador clásico de Tilesets, exportados como "Wang", 16 tiles)
- tileset_pool: inferior = agua (NO transitable, deja pasar balas), superior = cubierta de baldosa (transitable), transición = pared de la piscina
- tileset_street: inferior = asfalto (transitable), superior = acera (transitable), transición = bordillo
- tileset_garden: inferior = césped (transitable), superior = patio de hormigón (transitable)
Formato Wang de esquinas: crea un wangset de tipo corner en Tiled.
Verifica abriendo el PNG qué combinación de esquinas tiene cada tile.

## Kits Building (paredes de 1 tile de alto, huecos de puerta, pilar, escalera, tejado, suelo)
- kit_interior: paredes de yeso, suelo de madera, tejado de tejas
- kit_exterior: fachada de lamas grises, suelo de patio
- kit_basement: paredes de bloque, suelo de hormigón
- kit_fence: valla de madera, suelo de césped

## Tiles sueltos
- floors_interior: 4 filas = madera, linóleo de cocina, baño, hormigón (4 variantes cada una)

## Decals (con transparencia, para la capa decor)
- decals_asphalt: grietas, manchas, alcantarillas
- decals_grass: matojos, hojas, piedras

Las piezas de los kits no siguen una rejilla fija: detecta cada pieza por
su caja delimitadora sobre el fondo transparente.

## Personajes (export con metadata.json)
- player: export completo de PixelLab (rotaciones, carrera, disparo, disparo andando y muerte en sur, este y oeste); formato en `docs/ASSETS.md` §6.
- zombie_walker: el zombi (andar, zarpazo, climb de 4 direcciones, y en el estado sin piernas gatear y zarpazo en el suelo). Corredores y sprinters usan este arte (`alsoFor` en `import.json`).

---

## Formato medido de estos PNG (1 de octubre de 2026)

Medido píxel a píxel por `npm run tiles:import` (y revisado con las hojas de `npm run tiles:review` en `maps/preview/tiles/`). Detalle en `docs/ASSETS.md` §7. Nada se corta por rejilla ni se supone el orden de los tiles:

| Grupo | Formato medido | Importación |
|---|---|---|
| tileset_street, tileset_pool, tileset_garden | Lámina de 160×128 = 5×4 celdas de 32×32; 17 tiles (las 16 combinaciones + una repetida) y 3 celdas vacías | Tal cual. Las esquinas de cada tile se miden comparando sus parches con los colores medios de los dos terrenos puros (§7.3) |
| floors_interior | 4×4 celdas de unos 48 px, irregulares: separaciones de 1 a 6 px, la última columna (37 px) y la última fila (34 px) recortadas, y contornos oscuros en algunos lados | Una celda por componente conexo, sin contorno, y el mayor cuadrado centrado a 32×32; más sus 3 volteos (§7.4) |
| decals_asphalt, decals_grass | 4×4 celdas de 48×48 con transparencia | Objetos libres |
| kit_* | 20 piezas de distinto tamaño (hasta 32×37) por componentes conexos, la misma plantilla en los cuatro kits | Autotile de paredes de 32×32: 16 casos por máscara de vecinos y 4 de muro grueso (§7.2). Las piezas sueltas quedan en `<kit>/pieces/` |

**Esquinas de los tilesets Wang** (las mide el importador en cada ejecución; los tres tienen la misma disposición y las 16 combinaciones). Por celda (columna, fila), las esquinas NO NE / SO SE, con 0 = asfalto, agua o patio, y 1 = acera, cubierta o césped:

```
        col 0    col 1    col 2    col 3    col 4
fila 0  11/10    11/00    11/01    00/01    00/10
fila 1  10/10    00/00    01/01    01/00    10/00
fila 2  10/11    00/11    01/11    01/10    10/01
fila 3  00/00    11/11    (vacía)  (vacía)  (vacía)
```

- El tile "todo 0" aparece dos veces: en (1,1) y en (0,3).
- Los terrenos se nombran por color: el asfalto y el agua son los más oscuros; el patio, el menos saturado. En el PNG del jardín el patio es el terreno de dentro del bloque 3×3, al revés de lo que dice la lista de arriba.
