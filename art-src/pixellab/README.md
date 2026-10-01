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
- player: export completo de PixelLab (rotaciones y animaciones); formato en `docs/ASSETS.md` §6.

---

## Formato medido de estos PNG (1 de octubre de 2026)

Medido píxel a píxel por `npm run tiles:import` y documentado en `docs/ASSETS.md` §7. **No todos son de 32×32**; el importador los normaliza de forma provisional y avisa, hasta que haya exports a 32×32:

| Grupo | Rejilla medida | Normalización provisional |
|---|---|---|
| tileset_street, tileset_pool, tileset_garden | Lámina de 160×128 = **5×4 celdas de 32×32** sin separación; 17 tiles y 3 celdas vacías | Ninguna: la lámina se usa tal cual como tileset |
| floors_interior | 4×4 celdas de **48×48** con 1 px de separación; la 4.ª columna y la 4.ª fila tienen márgenes transparentes | Reducir a 32×32 con el color dominante de cada bloque |
| decals_asphalt, decals_grass | 4×4 celdas de 48×48 con transparencia | Ninguna: se colocan como objetos libres |
| kit_* | 20 piezas detectadas por caja delimitadora, de hasta 32×37 (paredes en 3/4); el suelo y el tejado miden 32×19 | Paredes en celdas de 32×48 alineadas abajo |

**Esquinas de los tilesets Wang** (verificado abriendo los tres PNG: los tres tienen la misma disposición y las 16 combinaciones). Por celda (columna, fila), las esquinas NO NE / SO SE, con 0 = el terreno de la celda (0,3) y 1 = el de la celda (1,3):

```
        col 0    col 1    col 2    col 3    col 4
fila 0  11/10    11/00    11/01    00/01    00/10
fila 1  10/10    00/00    01/01    01/00    10/00
fila 2  10/11    00/11    01/11    01/10    10/01
fila 3  00/00    11/11    (vacía)  (vacía)  (vacía)
```

- El tile "todo 0" aparece dos veces: en (1,1), centro del bloque 3×3, y en (0,3).
- **Terreno 0 / 1 medido:** tileset_street = asfalto / acera; tileset_pool = agua / cubierta.
- **tileset_garden = patio / césped**, al revés de lo que dice la lista de arriba (en el PNG, el patio es el terreno de dentro del bloque 3×3). No afecta al juego: los dos son transitables.
