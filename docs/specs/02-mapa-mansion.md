# Spec 02 · Mapa definitivo: la mansión abandonada

**Objetivo:** sustituir el mapa de prueba (`room01`) por el mapa definitivo, una mansión abandonada de 10 zonas que se desbloquean comprando puertas, con el arte de tiles de PixelLab, dos islas en otro nivel (sótano y azotea) unidas por portales, agua que bloquea el paso pero no las balas y spawns abiertos en la calle y la azotea. El mapa se genera una vez con un script y después se retoca a mano en Tiled.

**Base:** todo lo que ya existe sigue valiendo (spec 01): `MapLoader`, zonas, puertas compradas con el chip, barricadas a toques, spawns por ventana, flow field, puntos y botín. Esta spec solo añade lo necesario para un mapa grande y con varios niveles.

> **Estado de los assets:** las 10 imágenes recibidas no son todavía el formato que necesita el juego (ver §1.2). La Fase M1 empieza por recibir los exports reales. El resto de la spec (distribución, mecánicas, scripts) no depende de ese detalle.

---

## 1. Assets: formato detectado y conversión a Tiled

### 1.1 Lo recibido

Analizado píxel a píxel (tamaño, separaciones transparentes entre piezas, rachas de color y paleta). Copias de referencia en `art-src/reference/mansion/`.

| Archivo | Contenido | Tamaño | Rejilla real | Paleta |
|---|---|---|---|---|
| `kit-valla-madera.png` | Kit Building: valla de madera, suelo de hierba seca | 211×239 | 4×5 piezas (celdas de 53×48 con 1 px de separación) | 31 colores |
| `kit-interior-yeso.png` | Kit Building: paredes de yeso, suelo de madera oscura | 211×239 | ídem | 31 |
| `kit-fachada-lamas.png` | Kit Building: fachada de lamas blancas, suelo de hormigón sucio | 211×239 | ídem | — |
| `kit-sotano-bloque.png` | Kit Building: bloque de hormigón, suelo agrietado | 211×239 | ídem | — |
| `wang-cubierta-agua.png` | Wang 16 esquinas: cubierta de madera → agua verde turbia | 131×75 | 4×4 celdas de **32×18** con 1 px de separación | 23 |
| `wang-acera-asfalto.png` | Wang 16 esquinas: acera con bordillo → asfalto | 131×75 | ídem | 24 |
| `wang-patio-cesped.png` | Losas de patio y césped seco | 131×75 | ídem | 21 |
| `tiles-suelos-interiores.png` | 16 suelos: madera, linóleo a cuadros, baño blanco agrietado, hormigón (4 variantes por fila) | 195×195 | 4×4 celdas de **48×48** con 1 px de separación | 61 |
| `decals-matojos.png` | Decals con transparencia: matojos, piedras, hierba seca | 195×195 | 4×4 celdas de 48×48 | 68 |
| `decals-grietas-manchas.png` | Decals con transparencia: grietas, manchas, agujeros | 195×195 | 4×4 celdas de 48×48 | 33 |

Todas son pixel art nativo a ese tamaño (más del 50 % de rachas de 1 px, no son reescalados) y con alfa 0/255.

**Orden de las 16 esquinas** (medido en `wang-cubierta-agua` y `wang-acera-asfalto`, idéntico en los dos): el tile con índice *i* (por filas, de 0 a 15) tiene en sus esquinas los bits de *i*:

```
i = NO·8 + NE·4 + SO·2 + SE·1      terreno 0 = el oscuro (agua, asfalto)
                                    terreno 1 = el claro (cubierta, acera)
fila 0:  0000 0001 0010 0011       (NO NE SO SE)
fila 1:  0100 0101 0110 0111
fila 2:  1000 1001 1010 1011
fila 3:  1100 1101 1110 1111
```

`wang-patio-cesped` **no** sigue ese orden: solo tiene 6 combinaciones de esquinas distintas (7 tiles todo losa, 3 todo césped y transiciones orgánicas). No es un juego Wang completo o es una vista de ejemplo.

**Piezas de los kits** (los cuatro comparten exactamente la misma silueta: es una plantilla con distinta textura). Medidas en píxeles; posición dentro de su celda:

| # | Tamaño | Forma | Papel propuesto (a confirmar) |
|---|---|---|---|
| 0 | 32×19 | rectángulo lleno | suelo |
| 1 | 32×25 | rectángulo | pared horizontal |
| 2 | 12×37 | barra alta | pared vertical (tramo largo) |
| 3 | 12×25 | barra | pared vertical (extremo) |
| 4 | 12×31 | barra, alineada a la derecha | pared vertical (tramo) |
| 5 | 22×25 | rectángulo corto | jamba de hueco de puerta |
| 6 | 12×25 | barra, a la derecha | pilar |
| 7, 8 | 32×25 | L (66 % lleno) | esquinas superiores izquierda / derecha |
| 9 | 12×25 | barra | pilar |
| 10 | 12×37 | barra alta | pared vertical |
| 11 | 32×28 | rectángulo bajo | pared baja / con ventana |
| 12 | 32×37 | bloque alto | pared alta / tejado |
| 13, 14 | 32×28 y 32×37 | escalonado | escalera |
| 15 | 32×19 | rectángulo lleno | tejado (otra textura) |
| 16, 17 | 12×25 y 12×37 | barra, a la derecha | pilar / pared vertical |
| 18, 19 | 32×25 | L | esquinas inferiores izquierda / derecha |

Las paredes están dibujadas en 3/4: 32 px de ancho y hasta 37 de alto (sobresalen por encima de su casilla), y las verticales son barras de 12 px.

### 1.2 Lo que necesita el juego (y por qué lo recibido no vale tal cual)

| Requisito (spec 01 y `ASSETS.md`) | Lo recibido | Qué hace falta |
|---|---|---|
| Tiles de 32×32 | Suelos y decals de 48×48 | Exportar los suelos a 32×32 (reducir 48→32 rompe el pixel art y las juntas). Los decals pueden quedarse en 48 px porque se colocan como objetos libres. |
| Tiles Wang cuadrados de 32×32 | Celdas de 32×18 (suelo aplastado en perspectiva) | El export real del tileset (las 16 piezas de 32×32), idealmente con su metadata. Las de 32×18 no encajan en la rejilla. |
| Wang completo de 16 | `patio-cesped` incompleto | Regenerarlo como Wang de 16 o confirmar que es otra cosa. |
| Piezas de kit identificables | Una lámina con huecos | El export real (piezas sueltas o lámina con metadata) para confirmar el papel de cada pieza. |
| Paleta común de 32 colores | 21–68 colores por asset | Opcional para esta spec; se cuantiza al importar si existe `art-src/palette.hex`. |

Estas imágenes parecen **vistas previas** (la vista de PixelLab coloca las piezas con márgenes y aplasta el suelo en perspectiva). Igual que pasó con el jugador, el importador se escribirá contra el primer export real; lo detectado aquí queda documentado en `docs/ASSETS.md` §7.

### 1.3 Conversión a tilesets de Tiled

Flujo: `art-src/pixellab/<tipo>/<asset>/` (export sin tocar) → **`npm run tiles:import`** → láminas limpias en `public/assets/tiles/<tileset>.png` (sin separaciones, 32×32 o 32×48) y tilesets de Tiled en `art-src/tiled/tilesets/<tileset>.tsj`.

- **Formato del tileset: `.tsj` (JSON) en lugar de `.tsx` (XML).** Tiled abre y edita los dos igual, pero leer XML exigiría un parser (una dependencia más). Pendiente de tu confirmación.
- **`suelos-interiores`** (16 tiles): un tileset de imagen con las 4 variantes de cada material seguidas. En Tiled se pinta con el modo aleatorio de la brocha. Propiedad `material` (`madera`, `linoleo`, `bano`, `hormigon`) para futuros sonidos de pasos.
- **Wang de 16 esquinas** (`acera-asfalto`, `cubierta-agua`, `patio-cesped`): un *wangset* de tipo `corner` con 2 colores por tileset. Con el orden de §1.1, el `wangid` de Tiled (8 valores: arriba, arriba-derecha, derecha, abajo-derecha, abajo, abajo-izquierda, izquierda, arriba-izquierda; las esquinas son las posiciones impares, el color 0 es "sin asignar") se genera así:
  ```
  wangid(i) = [0, NE+1, 0, SE+1, 0, SO+1, 0, NO+1]   con NO = (i>>3)&1, NE = (i>>2)&1, SO = (i>>1)&1, SE = i&1
  ```
  Así la brocha de terrenos de Tiled pinta las transiciones solas.
- **Propiedades por tile:**
  - `collides: true`: paredes, pilares, vallas, coche, estanterías.
  - `water: true`: tiles de agua con 3 o 4 esquinas de agua (con 2 esquinas, la casilla es transitable). Se puede cambiar a mano en Tiled tile a tile.
  - `void: true`: un tile negro de "vacío" para el borde de la azotea.
- **Kits Building:** un tileset por kit con celdas de **32×48**, cada pieza alineada abajo en su celda (sobresale hacia arriba, como en 3/4). Propiedad `piece` con el papel de §1.1 (`floor`, `wall_h`, `wall_v`, `corner_tl`, `pillar`, `door_jamb`, `stairs`, `roof`…) y `collides: true` en paredes, pilares y esquinas. La escalera es solo decoración: el portal es un objeto (§3.6).
  - Interior → kit de yeso; fachada exterior → lamas; jardín → valla; sótano → bloque.
- **Decals:** tileset de imagen de 48×48 sin colisión. Se colocan como *tile objects* en una capa de objetos `decals` (posición libre, sin ajustarse a la rejilla).
- **Placeholders:** si falta la lámina de un tileset, el juego genera rectángulos según sus propiedades (`collides` → pared, `water` → agua verde, `void` → negro, resto → suelo), como hace ya con `room01`.

### 1.4 Varios tilesets en un mapa

La regla de `ASSETS.md` §5 ("tilesets embebidos en el `.tmj`") se mantiene **para el juego**. Para editar en Tiled se trabaja con tilesets externos (`.tsj`), y un paso de build los embebe:

```
art-src/tiled/tilesets/*.tsj  ─┐
art-src/tiled/mansion.tmj      ├─ npm run map:build ─→ public/assets/maps/mansion.tmj  (tilesets embebidos)
(se edita en Tiled)           ─┘
```

---

## 2. Distribución de la mansión

### 2.1 Islas y tamaño

Mapa de **100×54 tiles** (máximo permitido 100×70). Tres islas en el mismo `.tmj`, separadas por espacio sin suelo:

- **Planta baja** (x 0–71): la casa, el jardín trasero al norte y la calle delantera al sur.
- **Azotea** (x 76–96, y 2–18): otro nivel, rodeada de vacío.
- **Sótano** (x 76–96, y 25–39): otro nivel.

Coordenadas en tiles, con los rectángulos **interiores** (sin contar las paredes). Paredes de 1 tile.

### 2.2 Zonas

| id | Nombre | Rectángulo (x, y, ancho × alto) | Suelo | Paredes | Notas |
|---|---|---|---|---|---|
| `recibidor` | Recibidor | 21, 29, 14×11 | madera | yeso / lamas | **Zona inicial**. |
| `salon` | Salón | 4, 29, 16×11 | madera | yeso / lamas | 2 pilares de 2×2 en (8, 32) y (14, 35) para huir en círculo. |
| `comedor` | Comedor | 36, 29, 14×11 | madera | yeso / lamas | |
| `biblioteca` | Biblioteca | 4, 16, 22×12 | madera oscura | yeso / lamas | Estanterías de 1 tile en x 8–13, y 20 y x 16–21, y 24 (pasillos de 3–4 tiles). |
| `cocina` | Cocina | 27, 16, 23×12 | linóleo | yeso / lamas | |
| `garaje` | Garaje | 51, 16, 12×24 | hormigón | lamas | Coche (obstáculo de 4×6) en (55, 26). |
| `jardin` | Jardín trasero | 4, 3, 59×12 | patio / césped | valla | Piscina: cubierta en 22–41 × 6–11, agua en 24–39 × 7–10. Se rodea por los 4 lados. |
| `calle` | Calle delantera | 0, 41, 72×12 | acera / asfalto | — | Aceras en y 41–42 y 51–52. Spawns abiertos en los extremos. |
| `sotano` | Sótano | 77, 26, 19×13 | hormigón | bloque | Tabique en x 86, y 29–35: se rodea por arriba y por abajo. |
| `azotea` | Azotea | 77, 3, 19×15 | tejado | — (vacío alrededor) | Chimeneas de 2×2 en (81, 7) y (89, 12). Spawns abiertos. |

Propiedades nuevas de zona: `interior` (bool; las zonas interiores necesitan ≥ 2 barricadas) y `openSpawns` (bool; solo `calle` y `azotea`).

### 2.3 Puertas y portales

Todas las puertas miden 2 tiles. Costes de 750 a 2000, más caros cuanto más lejos del recibidor.

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
| P1 | biblioteca ↔ sótano (escalera interior) | (5–6, 17) ↔ (78–79, 38) | 1750 |
| P2 | jardín ↔ azotea (escalera de mano) | (60–61, 4) ↔ (78–79, 17) | 2000 |

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

Total: 18 barricadas. Todas las zonas interiores tienen al menos 2. Los huecos de valla son ventanas con la propiedad `kind: "fence"` (misma mecánica; su sprite se hará después).

### 2.5 Spawns abiertos

| id | Zona | Punto |
|---|---|---|
| O1, O2 | calle | (1, 46), (70, 46) |
| O3, O4, O5 | azotea | (78, 4), (94, 4), (94, 16) |

### 2.6 Jugador

Aparece en **(28, 31)**, en el recibidor. La ventana más cercana (W2) está a 9,8 tiles (mínimo exigido: más de 6).

### 2.7 Plano

`#` pared · `+` valla · `D` puerta · `W` ventana · `F` hueco de valla · `P` portal · `o` spawn abierto · `@` jugador · `.` suelo interior · `,` jardín · `=` cubierta · `~` agua · `_` calle · `X` vacío.

```


   ++++++++++++F++++++++++++++++++++++++++++++++++F+++++++++++++            XXXXXXXXXXXXXXXXXXXXX
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,PP,+            X.o...............o.X
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,====================,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,==~~~~~~~~~~~~~~~~==,,,,,,,,,,,,,,,,,,,,,+            X....##.............X
   F,,,,,,,,,,,,,,,,,,==~~~~~~~~~~~~~~~~==,,,,,,,,,,,,,,,,,,,,,+            X....##.............X
   +,,,,,,,,,,,,,,,,,,==~~~~~~~~~~~~~~~~==,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,==~~~~~~~~~~~~~~~~==,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,====================,,,,,,,,,,,,,,,,,,,,,+            X...................X
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X............##.....X
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X............##.....X
   +,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,+            X...................X
   #########DD######W##########W######DD#####W##################            X...................X
   #......................#.......................#............#            X.................o.X
   #.PP...................#.......................#............#            X.PP................X
   #......................#.......................#............#            XXXXXXXXXXXXXXXXXXXXX
   #......................#.......................#............#
   #....######............#.......................D............#
   W......................D.......................D............#
   #......................D.......................#............W
   #......................#.......................#............#
   #............######....#.......................#............#
   #......................#.......................#............#            #####W###############
   #......................#.......................#....####....#            #...................#
   #......................#.......................#....####....#            #...................#
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
   #................#..............#..............#............#            #.PP................#
   #................#..............#..............#............#            #####################
   #########W##########W###DD###W#######W#####W########DD#######
________________________________________________________________________
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
- **Dentro de las zonas grandes:** pilares en el salón, estanterías en la biblioteca, coche en el garaje, tabique en el sótano y chimeneas en la azotea. En todas se puede correr en círculo.
- **Pasos de 2 tiles como mínimo** en puertas y entre obstáculos.
- **Sótano y azotea** tienen una sola entrada (su portal), pero bucles dentro. Si quieres que tengan dos salidas, se puede añadir un segundo portal (pendiente, ver §6).

---

## 3. Mecánicas nuevas sobre el código actual

### 3.1 Mapas con varios tilesets

- **`src/game/map/MapLoader.ts`:**
  - Acepta varios tilesets embebidos; hoy solo uno.
  - Las capas guardan GIDs globales.
  - Se construye una tabla de flags por GID (`collides`, `water`, `void`).
  - Lee las propiedades nuevas de zona, ventana, spawn y portal.
- **`src/game/map/CollisionGrid.ts`:**
  - Usa la tabla de flags (§3.2–3.3).
  - Red de seguridad: una casilla sin suelo bloquea al jugador.
- **`src/game/map/MapView.ts`:**
  - Un tilemap con varios tilesets.
  - Suelo y decoración como capas de tiles.
  - Paredes 3/4 como sprites ordenados por profundidad con los personajes (`actorDepth` de la base de la pared), para que la cara de una pared tape a quien está detrás.
  - Unos 1500 sprites en 100×54; se medirá el rendimiento.
- **`src/game/assets/AssetLibrary.ts` y `placeholders.ts`:** un placeholder por tileset según las propiedades de cada tile.
- **`public/assets/manifest.json`:** una entrada por tileset nuevo y el mapa `mansion`. El parámetro `?map=room01|mansion` elige el mapa para probar; la mansión pasa a ser el mapa por defecto en la Fase M7.
- **`scripts/check-assets.ts`:** valida mapas con varios tilesets y llama al validador de §4.

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

Si un zombie en `toWindow` o `tearing` está en una casilla que el flow field alcanza (es decir, el jugador puede llegar hasta él porque la calle o el jardín están desbloqueados), pasa a `chasing`. Así, en la calle o el jardín los zombies no se quedan arrancando tablones con el jugador al lado. Cambia `ZombieSystem.ts`.

### 3.6 Portales

- **Datos (Tiled):** objeto `portal`, un rectángulo de 1–2 tiles con propiedades `id`, `pair` (id del otro extremo), `cost` y `zone`. Los dos extremos deben tener el mismo coste.
  - `MapLoader` lo convierte en `MapData.portals` (índice del par, casillas, punto de llegada = centro del otro extremo).
  - `GameState.portalsOpen` lleva un valor por par.
- **Compra:** como una puerta.
  - `InteractionSystem` ofrece el portal cerrado más cercano (contexto nuevo `portal`).
  - El chip muestra `ABRIR ESCALERA` y el coste, o `FALTAN X`.
  - Comprar abre los dos extremos, desbloquea las dos zonas y recalcula el flow field.
- **Jugador (nuevo `PortalSystem`, tras el movimiento):** al entrar en un portal abierto, aparece en el otro extremo con `prevX/prevY` igual a la nueva posición (sin interpolar el salto). Queda bloqueado para ese portal hasta que sale de su rectángulo, así no rebota.
- **Zombies:**
  - El flow field enlaza las casillas de los dos extremos de un portal abierto con coste 1 (cambia `FlowField.ts`).
  - Un zombie que persigue y entra en un portal cuyo otro extremo está más cerca del jugador se teletransporta, con el mismo bloqueo. Así te siguen entre islas.
- **Vista:**
  - Al teletransportarse el jugador, la cámara salta sin lerp (`GameScene`).
  - Placeholder nuevo `portal` (32×32, frame 0 cerrado y 1 abierto, con forma de escalera) hasta que llegue su sprite.
- **Textos:** `ABRIR ESCALERA` en `src/ui/strings.ts`.

### 3.7 Rendimiento

- El flow field pasa de 924 a 5400 casillas: un BFS cada 250 ms sigue siendo despreciable.
- El objetivo de la spec 01 (60 fps con 20 zombies y 30 balas en un iPhone 12) se vuelve a medir en la Fase M7 con la mansión.

---

## 4. Scripts

| Comando | Script | Qué hace |
|---|---|---|
| `npm run tiles:import` | `scripts/import-tiles.ts` | Exports de `art-src/pixellab/` → láminas limpias en `public/assets/tiles/` + `.tsj` con wangsets y propiedades en `art-src/tiled/tilesets/`. Cuantiza si hay paleta. |
| `npm run map:mansion` | `scripts/gen-mansion-map.ts` | Genera **una vez** `art-src/tiled/mansion.tmj` a partir de las tablas de §2: capas `floor` (con la brocha de terrenos ya aplicada), `walls`, `decor`, `decals` y `objects`. **No sobrescribe** si el archivo existe, salvo con `--force`, y avisa de que se perderían los retoques. |
| `npm run map:build` | `scripts/build-map.ts` | `art-src/tiled/*.tmj` → `public/assets/maps/*.tmj` con los tilesets embebidos y las rutas de imagen reescritas; ejecuta el validador. |

**Validador** (`scripts/lib/validate-map.ts`; lo usan `map:build`, `assets:check` y los tests):

- de 8 a 10 zonas, una inicial;
- ≥ 2 barricadas por zona `interior`;
- spawns abiertos solo en zonas con `openSpawns`;
- costes entre 750 y 2000;
- puertas de ≥ 2 tiles;
- jugador a más de 6 tiles de cualquier barricada;
- todas las zonas alcanzables desde la inicial con todo abierto;
- cada portal tiene par y el mismo coste en los dos extremos;
- mapa ≤ 100×70.

---

## 5. Fases

Implementa en orden; al acabar cada fase, sigue el cierre de fase de `CLAUDE.md`.

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **M1 · Assets** | Recibir los exports reales y documentar su formato definitivo en `ASSETS.md`. `tiles:import` y `.tsj` con wangsets y propiedades. Placeholders para lo que falte. | En Tiled, la brocha de terrenos pinta bien las transiciones de los tres Wang. `assets:check` en verde. |
| **M2 · Varios tilesets** | `MapLoader`, `CollisionGrid` y `MapView` con varios tilesets y flags por tile. Paredes 3/4 ordenadas por profundidad. `?map=`. | `room01` funciona igual. Un mapa de prueba con 2 tilesets, agua y vacío carga bien. Tests. |
| **M3 · Generador y build** | `map:mansion` (una vez, `--force`), `map:build` y validador. | El juego carga la mansión con `?map=mansion`. El validador pasa. Tests del generador y del validador. |
| **M4 · Agua, vacío y spawns abiertos** | Flags nuevos, estado `emerging`, distancia mínima de los spawns abiertos, zombies de ventana que pasan a perseguir. | Las balas cruzan la piscina y los zombies la rodean. En la calle salen zombies sin barricada y nunca a menos de 8 tiles. Tests. |
| **M5 · Portales** | Compra, teletransporte de jugador y zombies, flow field entre islas, salto de cámara, placeholder. | Comprar P1 abre el sótano. Los zombies te siguen por la escalera. Tests. |
| **M6 · ⏸ Retoque en Tiled** | **Detente aquí.** Tú retocas `art-src/tiled/mansion.tmj` en Tiled; yo solo arreglo lo que rompa el validador o el build. | Lo das por bueno tras jugarlo. |
| **M7 · Balance de la mansión** | Costes, pesos de spawn y ritmo de rondas en el mapa grande. Medición de rendimiento. Mansión por defecto. | Se juega de la ronda 1 a la 10 en la mansión a 60 fps en un iPhone 12. |

## 6. Decisiones pendientes

1. **Exports reales de los tiles.** Los suelos y decals llegan a 48 px y los Wang en celdas de 32×18. Necesito los zips o carpetas originales de PixelLab (como los del jugador) antes de la Fase M1.
2. **`.tsj` (JSON) o `.tsx` (XML).** Propongo `.tsj` para no añadir un parser de XML.
3. **Sótano y azotea con una sola entrada.** Tienen bucles dentro, pero una única salida. ¿Valen así o añadimos un segundo portal a cada isla?
4. **Orden respecto a la spec 01.** Las fases 7 (rondas y flujo), 8 (HUD) y 9 (pulido nativo) siguen pendientes. Propongo hacer la Fase 7 antes de M7, para equilibrar la mansión con rondas de verdad.
5. **Papel de cada pieza de los kits** (§1.1): es una propuesta por forma que hay que confirmar con el export.
