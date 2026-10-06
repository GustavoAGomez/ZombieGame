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
- zombie_walker: el zombi (andar, zarpazo, climb de 4 direcciones, muerte, y en el estado sin piernas gatear y zarpazo en el suelo).
- zombie_runner, zombie_sprinter: corredor (sudadera ocre) y sprinter (chaqueta roja de paramédico), cada uno con su arte: correr, zarpazo, climb, muerte y, sin piernas, arrastrarse y zarpazo en el suelo.
- zombie_spitter, zombie_exploder, zombie_brute: los de la mazmorra. El escupidor anda, escupe, da zarpazos y muere; sin piernas, se arrastra y da zarpazos. El explosivo (la versión con barriga) corre y se hincha con la mecha; sin piernas, se arrastra. El bruto (72 px, en un lienzo de 104) anda, da el mazazo (`smash` → `attack`) y muere.
- Los zombis tumbados vienen más grandes que de pie y `"scale"` los reduce (`docs/DECISIONS.md`, «Los zombis sin piernas, a su tamaño»).
- En los zombis, lo generado en 5 direcciones se completa con el oeste en espejo (`"mirrorMissing"` en `import.json`); el zarpazo en el suelo se llama `crawl_claw` y `"sources"` lo lleva a `crawl_attack`.

## Objetos (`objects/<clave>/`, imágenes sueltas y `import.json` con el orden de fotogramas)
- demon_hand: la Mano del Demonio a 32×48. Los PNG de la carpeta son los de PixelLab sin tocar (puño, abierta con la palma encendida, vacía y el gesto obsceno). En `retocado/` están con puntas de brasa en las garras abiertas, desplazados (+2, +6) y con una paleta común de 32 colores; esos son los que se importan (ver `docs/DECISIONS.md`).
- hand_crack, hand_crack_opening, hand_crack_open: el agujero de la mano (48×40, de 46 px de ancho): la costra con las grietas latiendo, la costra rompiéndose y el fuego dentro. En `retocado/`, con una paleta común de 32 colores para las tres.
- hand_ember: 5 brasas sueltas de PixelLab (de 2 a 6 px), recortadas y centradas en 8×8 en `retocado/`.
- item_worn_wand, item_living_heart: los objetos especiales (24×24), 8 fotogramas en bucle cada uno: la varita gastada con rayos en la punta y el corazón humano latiendo. La varita es la versión que el usuario retocó en PixelLab (sin el píxel claro suelto al final del mango), exportada de la galería. En `retocado/`, con alfa 0/255 y una paleta de 32 colores por objeto.
- weapon_icon: las 6 armas de perfil (32×16, de 30-31 px de ancho para que sobresalgan del hueco; la pistola, en espejo). Los PNG de la carpeta son los candidatos de PixelLab tal cual; muchos venían «enrollados» (trozos pegados al borde contrario del lienzo), y en `retocado/` están desenrollados, recortados, centrados y con una paleta común de 32 colores.
- icon_reload, icon_repair, icon_knife, icon_dash: los símbolos de los botones redondos (36×36, más grandes que el botón para que sobresalgan): cargador doble, martillo cruzado con llave inglesa, cuchillo y bota con líneas de velocidad. En `retocado/`, desenrollados y centrados.
- enemy_shot: el escupitajo del escupidor (32×32, 5 fotogramas: el original y 4 de bamboleo), dibujado volando hacia arriba a la derecha; el juego lo gira hacia donde vuela.
- enemy_burst: la explosión del explosivo (128×128, 9 fotogramas: destello, bola de fuego, anillo con trozos, humo que se apaga).
- flame: 3 lenguas de fuego de PixelLab (8×12) con la paleta del fuego del agujero: centrada, inclinada a la derecha y esa misma en espejo, recortadas y apoyadas en el borde inferior en `retocado/`.
- prop_*: el atrezo del mapa, un PNG por objeto tal como sale de PixelLab, salvo dos:
  - 20 objetos de 32 px (tanda de *Create 1-Direction Object* con una descripción por hueco) y 6 de 64 px (las cajas, la caldera, el depósito, el colchón, la alfombra del hogar y la estantería metálica corta, de 64×64 sobre su huella de 32×64).
  - prop_coche (Pro Flash, de frente, 57×55 en un lienzo de 128×64 que el importador centra en 64×64), prop_farola (20×80) y prop_arbol (95×105), estos dos ya en la cuenta.
  - prop_arbol: en `retocado/`, con la saturación a la mitad para casar con el césped seco.
  - prop_mancha_aceite: no es de PixelLab como objeto. Es la mancha negra de `decals_asphalt` (celda 2,3), recortada sola y centrada en 32×32 en `retocado/`.

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
