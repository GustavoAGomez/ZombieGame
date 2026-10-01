# Spec 02 · Mapa definitivo: la mansión abandonada

**Objetivo:** sustituir el mapa de prueba (`room01`) por el mapa definitivo, una mansión abandonada de 10 zonas que se desbloquean comprando puertas, con el arte de tiles de PixelLab. Incluye dos islas en otro nivel (sótano y azotea) unidas por portales, agua que bloquea el paso pero no las balas, y spawns abiertos en la calle y la azotea. El mapa se genera una vez con un script y después se retoca a mano en Tiled.

**Base:** todo lo que ya existe sigue valiendo (spec 01): `MapLoader`, zonas, puertas compradas con el chip, barricadas a toques, spawns por ventana, flow field, puntos y botín. Esta spec solo añade lo necesario para un mapa grande con varios niveles.

**Orden:** se implementa antes de la Fase 7 de la spec 01 (rondas y flujo de partida).

---

## 1. Assets: formato detectado y conversión a Tiled

Los exports están en `art-src/pixellab/<grupo>/<grupo>.png` y el `README.md` de esa carpeta explica qué es cada uno. Todo lo de esta sección se ha medido abriendo los PNG (tamaño, separaciones transparentes, cajas delimitadoras, colores de cada esquina); nada es supuesto.

### 1.1 Formato medido

| Grupo | Tamaño | Rejilla | Paleta |
|---|---|---|---|
| `tileset_street`, `tileset_pool`, `tileset_garden` | 160×128 | **5×4 celdas de 32×32** sin separación: 17 tiles + 3 celdas vacías | 38 / 46 / 32 colores |
| `floors_interior` | 195×195 | 4×4 celdas de **48×48** con 1 px de separación; la 4.ª columna y la 4.ª fila con márgenes transparentes | 61 |
| `decals_asphalt`, `decals_grass` | 195×195 | 4×4 celdas de 48×48 con transparencia | 33 / 68 |
| `kit_interior`, `kit_exterior`, `kit_basement`, `kit_fence` | 211×239 | 20 piezas sobre fondo transparente, sin rejilla fija | 31 |

Todos son pixel art nativo (no reescalado) con alfa 0/255.

**Tilesets Wang (export "Wang" del generador clásico).** Los tres tienen la misma disposición y las 16 combinaciones de esquinas. Por celda (columna, fila), las esquinas NO NE / SO SE, con 0 = el terreno de la celda (0,3) y 1 = el de la celda (1,3):

```
        col 0    col 1    col 2    col 3    col 4
fila 0  11/10    11/00    11/01    00/01    00/10      bloque 3×3 (cols 0–2, filas 0–2): isla de terreno 0
fila 1  10/10    00/00    01/01    01/00    10/00      dentro del 1; bloque 2×2 (cols 3–4, filas 0–1):
fila 2  10/11    00/11    01/11    01/10    10/01      esquinas interiores; (3,2) y (4,2): diagonales;
fila 3  00/00    11/11    (vacía)  (vacía)  (vacía)    fila 3: terrenos puros
```

| Tileset | Terreno 0 | Terreno 1 | Transición |
|---|---|---|---|
| `tileset_street` | asfalto | acera | bordillo |
| `tileset_pool` | agua | cubierta de baldosa | pared de la piscina |
| `tileset_garden` | patio de hormigón | césped seco | — |

En `tileset_garden` el PNG tiene el patio como terreno 0 (dentro del bloque 3×3), al revés que en la lista del README. No afecta al juego porque los dos son transitables.

**Piezas de los kits** (detectadas por caja delimitadora). Los cuatro kits comparten exactamente la misma silueta: es una plantilla con distinta textura. Orden de lectura, de izquierda a derecha y de arriba abajo:

| # | Tamaño | Forma | Papel |
|---|---|---|---|
| 0 | 32×19 | rectángulo lleno | suelo (en perspectiva; no se usa) |
| 1 | 32×25 | rectángulo | pared horizontal |
| 2 | 12×37 | barra alta | pared vertical, tramo largo |
| 3 | 12×25 | barra | pared vertical, extremo |
| 4 | 12×31 | barra centrada | pared vertical, tramo |
| 5 | 22×25 | rectángulo corto | jamba de hueco de puerta |
| 6 | 12×25 | barra centrada | pilar |
| 7, 8 | 32×25 | L | esquinas superior izquierda / superior derecha |
| 9 | 12×25 | barra | pilar |
| 10 | 12×37 | barra alta | pared vertical |
| 11 | 32×28 | rectángulo bajo | pared baja |
| 12 | 32×37 | bloque alto | pared alta |
| 13, 14 | 32×28, 32×37 | escalonado | escalera (decoración) |
| 15 | 32×19 | rectángulo lleno | tejado (en perspectiva; no se usa) |
| 16, 17 | 12×25, 12×37 | barra centrada | pilar / pared vertical |
| 18, 19 | 32×25 | L | esquinas inferior izquierda / inferior derecha |

Las paredes están dibujadas en 3/4: 32 px de ancho y hasta 37 de alto (sobresalen por encima de su casilla). Las verticales son barras de 12 px. El suelo y el tejado de los kits vienen aplastados en perspectiva (32×19) y no se usan: los suelos salen de `floors_interior` y de los Wang. El papel de cada pieza se ha deducido de su forma; se confirma al verlas colocadas (Fase M3).

### 1.2 Conversión: `npm run tiles:import`

Flujo: `art-src/pixellab/<grupo>/<grupo>.png` → láminas en `public/assets/tiles/<tileset>.png` + tilesets de Tiled en `art-src/tiled/tilesets/<tileset>.tsj`.

- **Formato del tileset: `.tsj`** (JSON). Tiled lo edita igual que el `.tsx` y no hace falta un parser de XML.
- **Wang (`tileset_street`, `tileset_pool`, `tileset_garden`):**
  - La lámina se usa **tal cual** (ya son 32×32, 5 columnas, 20 ids; las 3 celdas vacías no llevan terreno).
  - Un *wangset* de tipo `corner` con 2 colores (los terrenos de §1.1). Para cada tile con contenido, el `wangid` de Tiled sale de la tabla de esquinas. Son 8 valores: arriba, arriba-derecha, derecha, abajo-derecha, abajo, abajo-izquierda, izquierda, arriba-izquierda; las esquinas ocupan las posiciones impares y el color 0 es "sin asignar":
    ```
    wangid = [0, NE+1, 0, SE+1, 0, SO+1, 0, NO+1]
    ```
  - El importador **no copia la tabla**: la vuelve a medir con los colores de las 4 esquinas de cada tile, igual que se ha medido aquí, y falla si no salen las 16 combinaciones.
- **Agua:** en `tileset_pool`, `water: true` en los tiles con **2 o más esquinas de agua**: ids 1, 3, 4, 5, 6, 7, 8, 9, 11, 13, 14 y 15. Con una sola esquina de agua (ids 0, 2, 10, 12) y la cubierta pura (16), se pasa. Si los tiles de borde fueran transitables, se pisaría hasta media casilla de agua; así el jugador se queda a unos píxeles de la pared de la piscina. Se puede cambiar tile a tile en Tiled.
- **`floors_interior`:** 16 tiles; cada fila es un material (`madera`, `linoleo`, `bano`, `hormigon`) y lleva la propiedad `material`. Normalización provisional, con aviso: cada celda de 48×48 se reduce a 32×32 eligiendo el color dominante de cada bloque. Los píxeles transparentes de los márgenes se rellenan con el color del borde. Pinta mejor con la brocha aleatoria de Tiled. Cuando llegue un export de 32×32, entra sin conversión.
- **Kits:** cada pieza se detecta por su caja delimitadora y se coloca en una celda de **32×48**, alineada abajo. Se conserva su posición horizontal dentro de la columna (barra pegada a la izquierda o centrada). Propiedades:
  - `piece`: el papel de §1.1;
  - `collides: true` en paredes, pilares y esquinas.
  
  Uno por kit: `kit_interior` para paredes interiores, `kit_exterior` para la fachada, `kit_basement` para el sótano y `kit_fence` para la valla del jardín.
- **Decals:** tilesets de imagen de 48×48 sin colisión. Se colocan como *tile objects* en la capa de objetos `decals`, en cualquier posición.
- **`map_special`:** tileset que genera el importador (no viene de PixelLab):
  - id 0 = vacío (negro, `void: true`), para el borde de la azotea;
  - id 1 = exterior oscuro (sin colisión), para el fondo fuera del edificio.
- **Placeholders:** si falta la lámina de un tileset, el juego genera rectángulos según las propiedades (`collides` → pared, `water` → agua verde, `void` → negro, el resto → suelo), como ya hace con `room01`.

### 1.3 Tilesets embebidos en el mapa del juego

El cargador de Tiled de Phaser no admite tilesets externos y nuestro `MapLoader` tampoco (ya falla con un error claro). Por eso:

- **En Tiled** se edita `art-src/tiled/mansion.tmj` con los tilesets externos `.tsj`.
- **`npm run map:build`** genera `public/assets/maps/mansion.tmj` con los tilesets **embebidos** y las rutas de imagen reescritas, y ejecuta el validador de §4.
- **Comprobación:** `assets:check`, el build y el juego avisan si un `.tmj` de `public/assets/maps/` referencia un tileset externo (`source`), indicando que hay que ejecutar `map:build`.

```
art-src/tiled/tilesets/*.tsj  ─┐
art-src/tiled/mansion.tmj      ├─ npm run map:build ─→ public/assets/maps/mansion.tmj  (tilesets embebidos)
(se edita en Tiled)           ─┘
```

---

## 2. Distribución de la mansión

### 2.1 Islas y tamaño

Mapa de **100×54 tiles** (máximo permitido: 100×70). Tres islas en el mismo `.tmj`, separadas por espacio sin suelo:

- **Planta baja** (x 0–71): la casa, el jardín trasero al norte y la calle delantera al sur.
- **Azotea** (x 76–96, y 2–18): otro nivel, rodeada de vacío.
- **Sótano** (x 76–96, y 25–39): otro nivel.

Coordenadas en tiles, con los rectángulos **interiores** (sin las paredes). Paredes de 1 tile.

### 2.2 Zonas

| id | Nombre | Rectángulo (x, y, ancho × alto) | Suelo | Paredes | Notas |
|---|---|---|---|---|---|
| `recibidor` | Recibidor | 21, 29, 14×11 | madera | interior / exterior | **Zona inicial**. |
| `salon` | Salón | 4, 29, 16×11 | madera | interior / exterior | Pilares de 2×2 en (8, 32) y (14, 35) para huir en círculo. |
| `comedor` | Comedor | 36, 29, 14×11 | madera | interior / exterior | |
| `biblioteca` | Biblioteca | 4, 16, 22×12 | madera | interior / exterior | Estanterías de 1 tile en x 8–13, y 20 y en x 16–21, y 24 (pasillos de 3–4 tiles). |
| `cocina` | Cocina | 27, 16, 23×12 | linóleo | interior / exterior | Escalera al sótano. |
| `garaje` | Garaje | 51, 16, 12×24 | hormigón | exterior | Coche (obstáculo de 4×6) en (55, 26). |
| `jardin` | Jardín trasero | 4, 3, 59×12 | patio / césped (`tileset_garden`) | valla | Piscina (`tileset_pool`): cubierta en 22–41 × 6–11, agua en 24–39 × 7–10. Se rodea por los 4 lados. Trampilla al sótano y escalera a la azotea. |
| `calle` | Calle delantera | 0, 41, 72×12 | acera / asfalto (`tileset_street`) | — | Aceras en y 41–42 y 51–52. Escalera de fachada a la azotea. Spawns abiertos. |
| `sotano` | Sótano | 77, 26, 19×13 | hormigón | sótano | Tabique en x 86, y 29–35: se rodea por arriba y por abajo. |
| `azotea` | Azotea | 77, 3, 19×15 | hormigón | — (vacío alrededor) | Chimeneas de 2×2 en (81, 7) y (89, 12). Spawns abiertos. |

Propiedades nuevas de zona: `interior` (bool; las zonas interiores necesitan ≥ 2 barricadas) y `openSpawns` (bool; solo `calle` y `azotea`).

### 2.3 Puertas y portales

Todas las puertas miden 2 tiles. Costes de 750 a 2000, más caros cuanto más lejos del recibidor. Cada zona tiene al menos dos salidas cuando todo está abierto.

| id | De → a | Casillas | Coste |
|---|---|---|---|
| D1 | recibidor → salón | x 20, y 33–34 | 750 |
| D2 | recibidor → comedor | x 35, y 33–34 | 750 |
| D3 | salón → biblioteca | y 28, x 10–11 | 1000 |
| D4 | comedor → cocina | y 28, x 42–43 | 1000 |
| D5 | biblioteca ↔ cocina | x 26, y 21–22 | 1250 |
| D6 | cocina → garaje | x 50, y 20–21 | 1250 |
| D7 | garaje → calle (portón) | y 40, x 55–56 | 1250 |
| D8 | recibidor → calle (puerta principal) | y 40, x 27–28 | 1500 |
| D9 | cocina → jardín (puerta trasera) | y 15, x 38–39 | 1500 |
| D10 | biblioteca → jardín (cristalera) | y 15, x 12–13 | 1500 |
| P1 | cocina ↔ sótano (escalera interior) | (47–48, 17) ↔ (78–79, 38) | 1750 |
| P2 | jardín ↔ azotea (escalera de mano) | (60–61, 4) ↔ (78–79, 17) | 2000 |
| P3 | jardín ↔ sótano (trampilla exterior) | (6–7, 12) ↔ (93–94, 27) | 1000 · segunda entrada |
| P4 | calle ↔ azotea (escalera de la fachada) | (8–9, 41) ↔ (93–94, 17) | 1250 · segunda entrada |

**Segundas entradas** (P3 y P4, propiedad `secondary: true`): se compran aparte y son más baratas porque el jugador ya pagó la primera. Solo se pueden comprar cuando su isla ya está desbloqueada; antes, el chip aparece atenuado con el texto `BLOQUEADA`. Así nunca son la vía barata para entrar.

### 2.4 Barricadas (ventanas y huecos de valla)

Cada barricada tiene su `zombie_spawn` 2 tiles hacia fuera, como en `room01`.

| id | Zona | Casilla | Pared | Spawn |
|---|---|---|---|---|
| W1, W2 | recibidor | (23, 40), (32, 40) | fachada sur | (23, 42), (32, 42), en la acera |
| W3, W4, W5 | salón | (3, 32), (3, 36), (12, 40) | oeste, oeste, sur | (1, 32), (1, 36), (12, 42) |
| W6, W7 | comedor | (40, 40), (46, 40) | sur | (40, 42), (46, 42) |
| W8, W9 | biblioteca | (3, 21), (20, 15) | oeste, norte (al jardín) | (1, 21), (20, 13) |
| W10, W11 | cocina | (31, 15), (45, 15) | norte (al jardín) | (31, 13), (45, 13) |
| W12, W13 | garaje | (63, 22), (63, 33) | este | (65, 22), (65, 33) |
| F1, F2, F3 | jardín (hueco de valla) | (15, 2), (50, 2), (3, 8) | valla norte, norte, oeste | (15, 0), (50, 0), (1, 8) |
| S1, S2 | sótano (rejilla) | (81, 25), (96, 32) | norte, este | (81, 23), (98, 32) |

Total: 18 barricadas. Todas las zonas interiores tienen al menos 2. Los huecos de valla son ventanas con `kind: "fence"`: misma mecánica, y su sprite se hará después.

### 2.5 Spawns abiertos

| id | Zona | Punto |
|---|---|---|
| O1, O2 | calle | (1, 46), (70, 46) |
| O3, O4, O5 | azotea | (78, 4), (94, 4), (95, 10) |

### 2.6 Jugador

Aparece en **(28, 31)**, en el recibidor. La ventana más cercana (W2) está a 9,8 tiles (mínimo exigido: más de 6).

### 2.7 Plano

`#` pared · `+` valla · `D` puerta · `W` ventana · `F` hueco de valla · `1`–`4` portales P1–P4 (los dos extremos) · `o` spawn abierto · `@` jugador · `.` suelo interior · `,` jardín · `=` cubierta · `~` agua · `_` calle · `X` vacío.

```


   ++++++++++++F++++++++++++++++++++++++++++++++++F+++++++++++++            XXXXXXXXXXXXXXXXXXXXX
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,22,+            X.o...............o.X
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,====================,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,==~~~~~~~~~~~~~~~~==,,,,,,,,,,,,,,,,,,,,,+            X....##.............X
   F,,,,,,,,,,,,,,,,,,==~~~~~~~~~~~~~~~~==,,,,,,,,,,,,,,,,,,,,,+            X....##.............X
   +,,,,,,,,,,,,,,,,,,==~~~~~~~~~~~~~~~~==,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,==~~~~~~~~~~~~~~~~==,,,,,,,,,,,,,,,,,,,,,+            X..................oX
   +,,,,,,,,,,,,,,,,,,====================,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,33,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X............##.....X
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X............##.....X
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X...................X
   #########DD######W##########W######DD#####W##################            X...................X
   #......................#.......................#............#            X...................X
   #......................#....................11.#............#            X.22.............44.X
   #......................#.......................#............#            XXXXXXXXXXXXXXXXXXXXX
   #......................#.......................#............#
   #....######............#.......................D............#
   W......................D.......................D............#
   #......................D.......................#............W
   #......................#.......................#............#
   #............######....#.......................#............#
   #......................#.......................#............#            #####W###############
   #......................#.......................#....####....#            #...................#
   #......................#.......................#....####....#            #................33.#
   #######DD##############################DD#######....####....#            #...................#
   #................#..............#..............#....####....#            #.........#.........#
   #................#..............#..............#....####....#            #.........#.........#
   #................#.......@......#..............#....####....#            #.........#.........#
   W....##..........#..............#..............#............#            #.........#.........W
   #....##..........D..............D..............#............W            #.........#.........#
   #................D..............D..............#............#            #.........#.........#
   #..........##....#..............#..............#............#            #.........#.........#
   W..........##....#..............#..............#............#            #...................#
   #................#..............#..............#............#            #...................#
   #................#..............#..............#............#            #.11................#
   #................#..............#..............#............#            #####################
   #########W##########W###DD###W#######W#####W########DD#######
________44______________________________________________________________
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
_o____________________________________________________________________o_
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
________________________________________________________________________
```

### 2.8 Recorridos y bucles

- **Anillo de habitaciones:** recibidor → salón → biblioteca → cocina → comedor → recibidor (D1, D3, D5, D4, D2).
- **Anillo exterior:** calle → recibidor (D8) y calle → garaje (D7) → cocina (D6) → comedor → recibidor.
- **Jardín:** se rodea la piscina por los cuatro lados (2–4 tiles de margen) y conecta con la biblioteca (D10) y la cocina (D9), así que forma otro bucle.
- **Islas con dos salidas:**
  - sótano: P1 a la cocina y P3 al jardín;
  - azotea: P2 al jardín y P4 a la calle.
  
  Si los zombies taponan una escalera, queda la otra.
- **Dentro de las zonas grandes:** pilares en el salón, estanterías en la biblioteca, coche en el garaje, tabique en el sótano y chimeneas en la azotea. En todas se puede correr en círculo.
- **Pasos de 2 tiles como mínimo** en puertas, portales y entre obstáculos.

---

## 3. Mecánicas nuevas sobre el código actual

### 3.1 Mapas con varios tilesets

- **`src/game/map/MapLoader.ts`:**
  - Acepta varios tilesets embebidos; hoy solo uno.
  - Las capas guardan GIDs globales.
  - Se construye una tabla de flags por GID (`collides`, `water`, `void`).
  - Lee las propiedades nuevas de zona (`interior`, `openSpawns`), ventana (`kind`), spawn (sin `window`) y el objeto `portal`.
- **`src/game/map/CollisionGrid.ts`:**
  - Usa la tabla de flags (§3.2–3.3).
  - Red de seguridad: una casilla sin suelo bloquea al jugador.
- **`src/game/map/MapView.ts`:**
  - Un tilemap con varios tilesets.
  - Suelo y decoración como capas de tiles; decals como imágenes.
  - Paredes 3/4 como sprites ordenados por profundidad con los personajes (`actorDepth` de la base de la pared), para que la cara de una pared tape a quien está detrás.
  - Unos 1500 sprites; se medirá el rendimiento.
- **`src/game/assets/AssetLibrary.ts` y `placeholders.ts`:** carga y placeholders por tileset según las propiedades de cada tile.
- **`public/assets/manifest.json`:** una entrada por tileset nuevo y el mapa `mansion`. El parámetro `?map=room01|mansion` elige el mapa para probar; la mansión pasa a ser el mapa por defecto en la Fase M7.
- **`scripts/check-assets.ts`:** valida mapas con varios tilesets, avisa de tilesets externos y llama al validador de §4.

### 3.2 Agua

- Las casillas con `water` llevan los flags `BLOCK_PLAYER | BLOCK_ZOMBIE`, como las ventanas: las balas y la línea de visión pasan.
- El flow field ya no las cruza porque bloquean a los zombies.
- La piscina crea un cuello de botella: puedes disparar a través del agua, pero los zombies tienen que rodearla.

### 3.3 Vacío

- Las casillas con `void` llevan los mismos flags que el agua. Además, toda casilla sin suelo bloquea al jugador.
- Los zombies en `toWindow` caminan en línea recta fuera del edificio sin consultar la rejilla, así que los spawns de ventana pueden seguir en zonas sin suelo.

### 3.4 Spawns abiertos

- **Definición:** un `zombie_spawn` **sin** propiedad `window` es abierto. Su zona se saca de la casilla donde está; error si no cae en una zona con `openSpawns`.
- **`SpawnSystem`:** peso 0 si su zona está bloqueada o si hay un jugador vivo a menos de **8 tiles** (`WAVES.openSpawnMinDistance`; evita que aparezcan encima del jugador).
- **`spawnZombie`:** estado nuevo **`emerging`** (0,6 s, `ZOMBIES.emergeTime`). No se mueve ni ataca, se le puede disparar y usa la animación `climb` (o `walk`). Después pasa a `chasing`.

### 3.5 Zombies de ventana con el exterior accesible

Si un zombie en `toWindow` o `tearing` está en una casilla que el flow field alcanza (es decir, el jugador puede llegar hasta él porque la calle o el jardín están desbloqueados), pasa a `chasing`. Así, en la calle o el jardín no se quedan arrancando tablones con el jugador al lado. Cambia `ZombieSystem.ts`.

### 3.6 Portales

- **Datos (Tiled):** objeto `portal`, un rectángulo de 1–2 tiles con propiedades `id`, `pair` (id del otro extremo), `cost`, `zone` y `secondary` (bool). Los dos extremos deben coincidir en coste y `secondary`.
  - `MapLoader` lo convierte en `MapData.portals` (índice del par, casillas, punto de llegada = centro del otro extremo).
  - `GameState.portalsOpen` lleva un valor por par.
- **Compra:** como una puerta.
  - `InteractionSystem` ofrece el portal cerrado más cercano (contexto nuevo `portal`).
  - El chip muestra `ABRIR ESCALERA` (`ABRIR TRAMPILLA` en P3) y el coste, o `FALTAN X`. En un portal secundario con su isla aún bloqueada, se ve atenuado con `BLOQUEADA` y no se puede comprar.
  - Comprar abre los dos extremos, desbloquea las dos zonas y recalcula el flow field.
- **Jugador (nuevo `PortalSystem`, tras el movimiento):** al entrar en un portal abierto, aparece en el otro extremo con `prevX/prevY` igual a la nueva posición (sin interpolar el salto). Queda bloqueado para ese portal hasta que sale de su rectángulo, así no rebota.
- **Zombies:**
  - El flow field enlaza las casillas de los dos extremos de un portal abierto con coste 1 (cambia `FlowField.ts`).
  - Un zombie que persigue y entra en un portal cuyo otro extremo está más cerca del jugador se teletransporta, con el mismo bloqueo. Así te siguen entre islas y por cualquiera de las dos escaleras.
- **Vista:**
  - Al teletransportarse el jugador, la cámara salta sin lerp (`GameScene`).
  - Placeholder nuevo `portal` (32×32, frame 0 cerrado y 1 abierto, con forma de escalera) hasta que llegue su sprite.
- **Textos:** `ABRIR ESCALERA`, `ABRIR TRAMPILLA` y `BLOQUEADA` en `src/ui/strings.ts`.

### 3.7 Rendimiento

- El flow field pasa de 924 a 5400 casillas: un BFS cada 250 ms sigue siendo despreciable.
- El objetivo de la spec 01 (60 fps con 20 zombies y 30 balas en un iPhone 12) se vuelve a medir en la Fase M7 con la mansión.

---

## 4. Scripts

| Comando | Script | Qué hace |
|---|---|---|
| `npm run tiles:import` | `scripts/import-tiles.ts` | Exports de `art-src/pixellab/` → láminas en `public/assets/tiles/` + `.tsj` con wangsets y propiedades en `art-src/tiled/tilesets/` + `map_special`. Mide las esquinas de los Wang y falla si no salen las 16. Cuantiza si hay paleta. |
| `npm run map:mansion` | `scripts/gen-mansion-map.ts` | Genera **una vez** `art-src/tiled/mansion.tmj` a partir de las tablas de §2: capas `floor` (con los terrenos Wang ya resueltos), `walls`, `decor`, `decals` y `objects`. **No sobrescribe** si el archivo existe, salvo con `--force`, y avisa de que se perderían los retoques. |
| `npm run map:build` | `scripts/build-map.ts` | `art-src/tiled/*.tmj` → `public/assets/maps/*.tmj` con los tilesets embebidos y las rutas de imagen reescritas; ejecuta el validador. |

**Validador** (`scripts/lib/validate-map.ts`; lo usan `map:build`, `assets:check` y los tests):

- tilesets embebidos;
- de 8 a 10 zonas, una inicial;
- ≥ 2 barricadas por zona `interior`;
- spawns abiertos solo en zonas con `openSpawns`;
- costes entre 750 y 2000;
- puertas y portales de ≥ 2 tiles;
- jugador a más de 6 tiles de cualquier barricada;
- todas las zonas alcanzables desde la inicial con todo abierto;
- **cada zona con al menos 2 salidas** (puertas o portales);
- cada portal con par y el mismo coste y `secondary` en los dos extremos;
- mapa ≤ 100×70.

---

## 5. Fases

Implementa en orden; al acabar cada fase, sigue el cierre de fase de `CLAUDE.md`.

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **M1 · Assets** | `tiles:import`: Wang medidos con wangsets y agua, suelos normalizados, kits por caja delimitadora, decals, `map_special`. `.tsj` en `art-src/tiled/tilesets/`. `ASSETS.md` §7 al día. | En Tiled, la brocha de terrenos pinta bien las transiciones de los tres Wang. `assets:check` en verde. Tests del importador. |
| **M2 · Varios tilesets** | `MapLoader`, `CollisionGrid` y `MapView` con varios tilesets y flags por tile. Paredes 3/4 ordenadas por profundidad. `?map=`. | `room01` funciona igual. Un mapa de prueba con 2 tilesets, agua y vacío carga bien. Tests. |
| **M3 · Generador y build** | `map:mansion` (una vez, `--force`), `map:build` y validador. | El juego carga la mansión con `?map=mansion`. El validador pasa. Tests del generador y del validador. |
| **M4 · Agua, vacío y spawns abiertos** | Flags nuevos, estado `emerging`, distancia mínima de los spawns abiertos, zombies de ventana que pasan a perseguir. | Las balas cruzan la piscina y los zombies la rodean. En la calle salen zombies sin barricada y nunca a menos de 8 tiles. Tests. |
| **M5 · Portales** | Compra (incluidas las segundas entradas), teletransporte de jugador y zombies, flow field entre islas, salto de cámara, placeholder. | Comprar P1 abre el sótano y desbloquea P3. Los zombies te siguen por cualquiera de las dos escaleras. Tests. |
| **M6 · ⏸ Retoque en Tiled** | **Detente aquí.** Tú retocas `art-src/tiled/mansion.tmj` en Tiled; yo solo arreglo lo que rompa el validador o el build. | Lo das por bueno tras jugarlo. |
| **M7 · Balance de la mansión** | Costes, pesos de spawn y ritmo de rondas en el mapa grande. Medición de rendimiento. Mansión por defecto. | Se juega en la mansión a 60 fps en un iPhone 12. |

## 6. Decisiones

**Tomadas:**
- **Antes de la Fase 7.** La mansión se hace antes que el flujo de rondas de la spec 01.
- **`.tsj` para editar** y `map:build` para embeber; el juego y `assets:check` avisan si un mapa del juego trae tilesets externos.
- **Segunda entrada en el sótano y la azotea:** trampilla del jardín y escalera de la fachada. Más baratas y solo comprables con la isla ya desbloqueada.
- **La escalera del sótano sale de la cocina** (antes, de la biblioteca).

**Abiertas** (no bloquean):
- `floors_interior` llega a 48×48 y se normaliza a 32×32 de forma provisional. Un export a 32×32 entraría sin conversión y quedaría más fino.
- El suelo y el tejado de los kits vienen en perspectiva (32×19) y no se usan.
- Las paredes de los kits son 3/4 con barras verticales de 12 px, mientras que la colisión es por casilla completa: el jugador se para a unos 10 px de una pared vertical. Se valorará al verlo en la Fase M3.
