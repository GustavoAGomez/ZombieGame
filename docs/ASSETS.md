# Contrato de assets

Este documento lo siguen tanto la persona que genera el arte (PixelLab + Aseprite + Tiled) como Claude Code. Si un asset cumple este contrato, sustituir un placeholder por el arte final es solo cambiar archivos, sin tocar la lógica.

## 1. Biblia de estilo (fija para todo el juego)

- **Perspectiva:** top-down en 3/4. Siempre la misma vista en PixelLab, tanto para personajes como para tiles y objetos.
- **Luz:** desde arriba a la izquierda. Sombras hacia abajo a la derecha.
- **Contorno:** línea oscura de 1 px en personajes y objetos interactivos. Sin contorno en el suelo.
- **Paleta:** 32 colores, guardada en `art-src/palette.hex` (un hex por línea). Todos los PNG finales se reducen a esa paleta en Aseprite.
- **Densidad:** 1 píxel de arte = 1 píxel de mundo. No se escalan sprites en el motor.
- **Tile:** 32×32.
- **Personajes:** lienzo de **48×48** con el cuerpo ocupando unos 32 px, para dejar sitio a brazos extendidos y armas.

## 2. Carpetas

```
art-src/
  palette.hex
  pixellab/<asset>/      exports de PixelLab tal cual, sin tocar
  aseprite/              archivos .aseprite retocados (opcional)
  tiled/                 proyecto de Tiled (.tmx/.tsx de trabajo)
public/assets/
  manifest.json
  sprites/<asset>/<animacion>.png
  tiles/<tileset>.png
  maps/<mapa>.tmj
```

## 3. Sprites de personajes

- **Un PNG por animación** en `public/assets/sprites/<asset>/<animacion>.png`, con fondo transparente.
- **Filas = direcciones,** siempre en este orden (el mismo que usa PixelLab):
  `south, south-east, east, north-east, north, north-west, west, south-west`
- **Columnas = frames,** de izquierda a derecha, todos del mismo tamaño.
- **Con 4 direcciones** (`south, east, north, west`): se declara `"directions": 4` y el motor espeja lo que falte.

**Animaciones mínimas del MVP:**

| Asset | Animaciones |
|---|---|
| `player` | `idle`, `walk`, `shoot`, `dash`, `death`. Opcionales: `shoot_walk` (disparar andando; al retroceder mientras dispara se reproduce al revés) y `melee` (cuchillada; dura `MELEE.swingTime`, 0,25 s, y mientras no exista se dibuja el tajo provisional `melee_slash`) |
| `zombie_walker`, `zombie_runner` | `walk`, `attack` (también se usa para arrancar tablones), `climb` (opcional; si falta, se usa `walk`), `death` |

## 4. Manifiesto (`public/assets/manifest.json`)

```json
{
  "tileSize": 32,
  "characters": {
    "player": {
      "frameWidth": 48,
      "frameHeight": 48,
      "anchor": { "x": 0.5, "y": 0.8 },
      "hitbox": { "radius": 6 },
      "directions": 8,
      "placeholder": false,
      "animations": {
        "idle":  { "file": "sprites/player/idle.png",  "frames": 4, "fps": 6,  "loop": true },
        "walk":  { "file": "sprites/player/walk.png",  "frames": 6, "fps": 10, "loop": true },
        "shoot": { "file": "sprites/player/shoot.png", "frames": 3, "fps": 12, "loop": false },
        "dash":  { "file": "sprites/player/dash.png",  "frames": 4, "fps": 20, "loop": false },
        "death": { "file": "sprites/player/death.png", "frames": 6, "fps": 8,  "loop": false }
      }
    }
  },
  "tilesets": {
    "interior": { "file": "tiles/interior.png", "tileWidth": 32, "tileHeight": 32 }
  },
  "objects": {
    "window_planks":   { "file": "sprites/objects/window_planks.png",   "frameWidth": 32, "frameHeight": 32, "frames": 6 },
    "window_planks_v": { "file": "sprites/objects/window_planks_v.png", "frameWidth": 32, "frameHeight": 32, "frames": 6 },
    "door":            { "file": "sprites/objects/door.png",            "frameWidth": 32, "frameHeight": 32, "frames": 2 },
    "door_v":          { "file": "sprites/objects/door_v.png",          "frameWidth": 32, "frameHeight": 32, "frames": 2 },
    "portal":          { "file": "sprites/objects/portal.png",          "frameWidth": 32, "frameHeight": 32, "frames": 2 }
  },
  "maps": { "room01": "maps/room01.tmj", "mansion": "maps/mansion.tmj" }
}
```

- **`"placeholder": true`** (o un archivo inexistente): el juego genera un rectángulo del tamaño declarado. Puede ir en el personaje entero o en una sola animación (`"animations": { "walk": { …, "placeholder": true } }`), para personajes a medio dibujar.
- **Animaciones que faltan:** si el personaje ya tiene un `idle` con arte real, las animaciones que aún no existen reutilizan los frames de `idle` (así nunca se convierte en un rectángulo en mitad de la partida). Si no hay `idle` real, se genera el placeholder.
- **`muzzle`** (opcional): la boca del arma en cada fila de dirección, `[x, y]` en píxeles del frame y en el orden de filas. De ahí salen el destello de disparo, la línea de apuntado y las balas. Si se cambia el arte del arma, hay que volver a medirla.
- **Sin destello en el arte:** el motor dibuja el destello (`muzzle_flash`, 12×12, 2 variantes) en cada bala. Las animaciones de disparo no deben llevarlo.
- **`anchor`** es el punto de los pies (centro de la hitbox) en fracción del frame. El del jugador (`0.5, 0.875`) coloca los pies en y = 42 de 48, que es donde apoyan las botas en el export de PixelLab.
- **`window_planks`:** el frame N representa la ventana con N tablones (del 0 al 5).
- **`door`:** frame 0 = cerrada, frame 1 = abierta.
- **Otros objetos del juego** (en el manifiesto como placeholder hasta tener arte): `bullet` (5×2, trazadora dibujada hacia +x: cola naranja y punta blanca, para no confundirse con la línea de apuntado ámbar), `aim_dot` (2×2), `blood` (16×16, 3 variantes), `pickup_ammo` y `pickup_health` (16×16, se dibujan apoyados en el suelo con el borde inferior como ancla).
- **`portal`:** escalera, escalera de mano o trampilla vista desde arriba (spec 02 §3.6). Frame 0 = cerrada, frame 1 = abierta. Se dibuja un sprite por casilla del portal.
- **Variantes verticales `window_planks_v` y `door_v`:** mismos frames y tamaño, dibujadas para paredes verticales (izquierda y derecha). Las versiones sin sufijo son para paredes horizontales (arriba y abajo). El motor **nunca rota** estos sprites, para que la luz siga viniendo de arriba a la izquierda; elige la variante según la orientación de la pared en el mapa.

## 5. Mapas (Tiled JSON, `.tmj`)

Los tilesets deben ir **embebidos** en el `.tmj` que carga el juego (`public/assets/maps/`). Los mapas que se editan en Tiled viven en `art-src/tiled/` con tilesets externos y `npm run map:build` los embebe (ver §7).

**Capas, con estos nombres exactos:**

| Capa | Tipo | Contenido |
|---|---|---|
| `floor` | tiles | suelo |
| `walls` | tiles | paredes; cada tile con la propiedad `collides: true` |
| `wall_faces` | tiles | la cara frontal de una pared en el kit del lado al que mira, encima de `walls` (opcional; la genera `map:build`) |
| `wall_joins` | tiles | los brazos de una unión con el kit de la pared a la que llegan, encima de las caras (opcional; la genera `map:build`) |
| `shadows` | tiles | sombras suaves al pie de paredes y muebles, tileset `map_shadows` (opcional; la genera `map:build`). Una pared vertical solo sombrea su propia casilla, a la derecha de su franja |
| `decor` | tiles | detalles del suelo sin colisión, dibujados entre el suelo y las sombras (opcional). `map:build` pone aquí, bajo cada pared vertical, la mitad derecha del suelo de la derecha (tileset `floor_halves`) |
| `decals` | objetos | *tile objects* sin colisión, en cualquier posición y con volteo horizontal o vertical (opcional) |
| `props` | objetos | atrezo (opcional): rectángulos de tiles enteros con `key` (objeto `prop_*` del manifiesto), `collides` (bool), `flipX`, `flipY`. Con colisión bloquea el paso y las balas, pero no la visión, y se ordena con los personajes; sin colisión va en el suelo (alfombras, escombros) |
| `objects` | objetos | ver la tabla siguiente |

**Objetos de la capa `objects`** (campo `type`/`class` y sus propiedades):

| Tipo | Forma | Propiedades |
|---|---|---|
| `zone` | rectángulo | `id` (string), `name`, `startsUnlocked` (bool), `interior` (bool), `openSpawns` (bool) |
| `player_spawn` | punto | — |
| `window` | rectángulo de 1 tile | `id`, `zone`, `planks` (int, 5 por defecto), `kind` (`window` o `fence`) |
| `zombie_spawn` | punto | `window` (id de la ventana a la que va); sin `window` es un spawn abierto y debe caer en una zona con `openSpawns` |
| `door` | rectángulo (1–2 tiles) | `id`, `cost` (int), `fromZone`, `toZone` |
| `portal` | rectángulo (1–2 tiles) | `id`, `pair` (id del otro extremo), `cost`, `zone`, `secondary` (bool), `kind` (`stairs`, `ladder` o `hatch`) |
| `merchant_spot` | punto | `zone` (string): dónde puede estar un mago vendedor (spec 03 §1). Entre 1 y 2 por zona, incluidas las islas; en el centro de una casilla de suelo pegada a una pared o en un rincón, a más de 3 tiles de barricadas, puertas, portales, spawns de zombies y el del jugador, y sin dejar un paso de menos de 2 tiles (el mago es sólido). El validador comprueba todas estas reglas |

## 6. Importar desde PixelLab (`npm run assets:import`)

1. Descomprime el export de PixelLab, sin tocarlo, en `art-src/pixellab/<asset>/`, por ejemplo `art-src/pixellab/player/`. El nombre de la carpeta es la clave del personaje en el manifiesto. Si exportas las animaciones por separado, **cada zip va en su propia subcarpeta** (`art-src/pixellab/player/walk/`, `…/shoot/`), porque todos traen un `metadata.json` y se pisarían. El importador lee la carpeta del personaje y todas sus subcarpetas con `metadata.json`.
2. `scripts/import-pixellab.ts`:
   - **Inspecciona la estructura real del export.** Puede venir en frames sueltos o en sheet, y con nombres de dirección y animación variados. Adáptate al formato que encuentres y documenta en este archivo el formato detectado.
   - **Normaliza** al formato de la sección 3: una fila por dirección en el orden fijado, frames recortados al lienzo declarado y centrados por el ancla.
   - **Cuantiza** a `art-src/palette.hex`, con un aviso si hay colores fuera de la paleta.
   - **Escribe** los PNG en `public/assets/sprites/<asset>/` y actualiza la entrada en `manifest.json`: número de frames, direcciones y `placeholder: false`.
   - Uso: `npm run assets:import` importa todo; `npm run assets:import -- player` solo ese personaje.
3. `npm run assets:check` valida que los tamaños son múltiplos del frame, que existen las animaciones mínimas, que las rutas del manifiesto son correctas, que el fondo es transparente y que el mapa tiene las capas y objetos obligatorios.

### Formato de export detectado (PixelLab, `export_version` 3.1)

Detectado con el primer export (jugador, septiembre de 2026):

```
<asset>/
  metadata.json
  <Estado>/rotations/<dirección>.png            1 frame estático por dirección
  <Estado>/animations/<animación>/…             (si el estado tiene animaciones)
```

- `metadata.json` → `states[]`, cada uno con `character.name` (por ejemplo `Idle`), `character.size` (48×48), `character.directions` (8), `folder` y `frames: { rotations: { <dirección>: ruta }, animations: { … } }`.
- Direcciones con los 8 nombres de PixelLab (`south`, `south-east`, `east`, …), que coinciden con el orden de filas de la §3.
- PNG RGBA de 8 bits con fondo transparente y alfa 0/255.
- **Las `rotations`** de un estado se importan como una animación de 1 frame con el nombre del estado normalizado (`Idle` → `idle`), tenga o no animaciones, salvo que una de sus animaciones ya vaya a ese nombre.
- **Lienzos de otro tamaño:** PixelLab puede generar alguna dirección en 56×56 en vez de 48×48 (visto en la dirección sur de `Running` y `Walking`), con el personaje centrado y 4 px de margen extra por lado. El importador centra esos frames en el lienzo declarado y avisa si al hacerlo se recortaría algún píxel del personaje.
- **Lienzos de 60×60 y 68×68** en las animaciones de disparo: también se centran en 48×48 (en ese export no se recorta nada del personaje).
- **Tomas duplicadas:** si una dirección se regeneró, PixelLab la exporta dos veces con un sufijo (`north-36c131c0`, `north-e16e1c8c`). Por defecto se usa la primera; la elección se puede fijar en `art-src/pixellab/<asset>/import.json`: `{ "takes": { "shoot_walk": { "north": "north-36c131c0" } } }`.
- **Distinto número de frames por dirección** (11 o 13 en los disparos): las direcciones cortas se estiran repitiendo frames de forma uniforme hasta igualar a la más larga, porque el sheet necesita las mismas columnas en todas las filas.
- **Nombres truncados:** PixelLab corta los nombres de animación a 50 caracteres, así que el importador mira también el nombre del estado. Una animación de andar dentro de un estado de disparo (`standing in a firing`) se importa como `shoot_walk`.
- **Animaciones incompletas:** una animación a la que le faltan direcciones (por ejemplo, `Walking` solo con `south`) se omite con un aviso.
- **Animaciones:** se aceptan como `{ <dirección>: [rutas] }` o `{ <dirección>: { frames: [rutas] } }`. Los nombres se normalizan al vocabulario del manifiesto (`Running`/`Walking` → `walk`, que es el bucle de movimiento; si llegan las dos completas, gana `Running` porque el jugador corre; `Shoot…` → `shoot`, `Bite`/`Attack` → `attack`, `Dash`/`Roll` → `dash`, `Death`/`Dying` → `death`, `Climb` → `climb`, `Knife`/`Stab`/`Slash`/`Melee` → `melee`); el resto pasa a `snake_case`. Si un export trae otra estructura, el importador avisa y muestra un extracto.
- **Qué hace el importador:** construye un sheet por animación (fila por dirección, columna por frame), alinea cada frame por el `anchor` del manifiesto si el lienzo no mide lo declarado, fuerza el alfa a 0/255, cuantiza a `palette.hex` si existe (si no, avisa) y actualiza el manifiesto (`frames`, `directions`, `placeholder`). Conserva `fps` y `loop` si ya estaban declarados.

## 7. Tiles, kits y decals del mapa definitivo (spec 02)

Los exports están en `art-src/pixellab/<grupo>/<grupo>.png`, con un `README.md` que describe cada grupo y el formato medido. Detalle completo en `docs/specs/02-mapa-mansion.md` §1.

| Tipo | Formato medido | Uso en el juego |
|---|---|---|
| Tilesets Wang (`tileset_*`, export "Wang") | Lámina de 160×128 = 5×4 celdas de 32×32; 17 tiles (las 16 combinaciones de esquinas + "todo terreno 0" repetido) y 3 celdas vacías | Tal cual, con un wangset de tipo `corner` en un `.tsj` |
| Tiles sueltos (`floors_interior`) | 4×4 celdas de unos 48 px, irregulares y con contornos oscuros (§7.4) | Una celda por componente conexo, sin contorno, a 32×32; 64 tiles: los 16 y sus volteos |
| Kits Building (`kit_*`) | 20 piezas sobre fondo transparente, detectadas por componentes conexos; paredes en 3/4 de hasta 32×37 (§7.2) | Autotile de 32×32: 16 casos por máscara de vecinos, 4 de muro grueso, 15 de brazos y 17 de caras |
| Decals (`decals_*`) | 4×4 celdas de 48×48 con transparencia | Objetos libres en la capa `decals` |

- **Esquinas de los Wang:** las mide el importador en cada ejecución sin suponer el orden de los tiles (§7.3).
- **Propiedades de tile:** `collides` (ya existe), `water` (bloquea cuerpos, no balas: tiles de la piscina con 2 o más esquinas de agua), `void` (vacío no transitable), `material`, `piece`.
- **Objetos nuevos en la capa `objects`:**
  - `portal`: rectángulo de 1–2 tiles con `id`, `pair`, `cost`, `zone` y `secondary`.
  - `window` con `kind: "fence"` para huecos de valla.
  - `zombie_spawn` sin `window` para spawns abiertos.
  - Zonas con `interior` y `openSpawns`.
- **Tilesets externos:** se usan para editar en Tiled (`.tsj`); el mapa que carga el juego los lleva embebidos (`npm run map:build`).

### 7.1 Revisión antes de importar (`npm run tiles:review`)

Escribe solo archivos de revisión, nunca los assets del juego, para abrirlos y mirarlos antes de importar:

| Archivo | Qué enseña |
|---|---|
| `art-src/pixellab/<kit>/pieces/<kit>-NN.png` | cada pieza del kit, extraída por componentes conexos del canal alfa |
| `maps/preview/tiles/<kit>-piezas.png` | hoja de contactos de las piezas, numeradas y clasificadas |
| `maps/preview/tiles/<kit>-autotile.png` | los 16 casos de pared con su máscara |
| `maps/preview/tiles/<kit>-prueba.png` | un plano de prueba (habitación en L, uniones en T, cruce, huecos de puerta, pilar) y el mismo plano con la máscara de cada pared |
| `maps/preview/tiles/<tileset>-wang.png` | cada tile Wang con sus 4 esquinas medidas |
| `maps/preview/tiles/<tileset>-wang-prueba.png` | un terreno dibujado por vértices con la tabla medida (los bordes tienen que ser continuos) |
| `maps/preview/tiles/floors_interior-celdas.png` | cada celda de suelo: lo que se descarta, la baldosa y la baldosa repetida 3×3 |

### 7.2 Kits Building: piezas y autotile de paredes

Las piezas **no están en una rejilla**: son recortes de distinto tamaño sobre fondo transparente. Se extraen por componentes conexos del canal alfa (`scripts/lib/kit.ts`). Los cuatro kits (`kit_interior`, `kit_exterior`, `kit_basement`, `kit_fence`) comparten una plantilla de 20 piezas, con los mismos tamaños y en los mismos sitios. Está clasificada en `KIT_TEMPLATE` (`scripts/lib/wall-autotile.ts`), y el importador comprueba el número y el tamaño de las piezas. La clasificación se hizo mirando las hojas de contactos: en el sótano y en la valla se distingue el borde superior (claro) de la cara frontal (oscura).

| # | Tamaño | Clasificación | Filas: remate / borde superior / cara |
|---|---|---|---|
| 00 | 32×19 | suelo (muestra) | — |
| 01 | 32×25 | tramo horizontal con cara y **remate al este** (listón en la fachada, poste final en la valla) | 7 (banda) / — / 18 |
| 02 | 12×37 | tramo vertical que acaba al sur, cara doble | 5 / 14 / 18 |
| 03 | 12×25 | pilar, cara doble | 7 / — / 18 |
| 04 | 12×31 | marco de puerta largo, cara simple | 5 / 8 / 18 |
| 05 | 22×25 | tramo horizontal con cara, **sin remates** (pieza lisa) | 7 (banda) / — / 18 |
| 06 | 12×25 | marco de puerta corto, cara simple | 7 / — / 18 |
| 07, 18 | 32×25 | esquina NO (pata ancha / estrecha) | no se usan: dibujan la pata vertical como cara |
| 08, 19 | 32×25 | esquina NE (pata ancha / estrecha) | no se usan, por lo mismo |
| 09 | 12×25 | tramo vertical, cara corta, cara doble | 5 / 14 / 6 |
| 10 | 12×37 | igual que #02 | 5 / 14 / 18 |
| 11 | 32×28 | borde superior ancho (muro grueso), sin cara | — |
| 12 | 32×37 | muro grueso con cara | — |
| 13 | 32×28 | escalera, sin cara | — |
| 14 | 32×37 | escalera con cara | — |
| 15 | 32×19 | tejado o segundo suelo (muestra) | — |
| 16 | 12×25 | tramo vertical, cara corta, cara simple | 5 / 14 / 6 |
| 17 | 12×37 | tramo vertical que acaba al sur, cara simple | 5 / 14 / 18 |

No hay piezas de unión en T ni de cruce, y las esquinas no cumplen la perspectiva: el autotile las compone.

**Reglas de perspectiva 3/4** (también en la skill level-design):

- una pared horizontal siempre lleva su cara frontal hacia el sur;
- una pared con un hueco al sur muestra su cara; las demás, solo el borde superior;
- el espejo horizontal siempre está permitido;
- rotar 90° o voltear en vertical, solo en partes sin cara frontal (bordes superiores, suelos);
- lo que falte se compone: borde superior + franja de cara recortada de un tramo horizontal.

**Autotile de 16 casos** en tiles de 32×32, indexado por la máscara de paredes vecinas (N=1, E=2, S=4, O=8). La geometría está medida sobre los kits:

- **Borde superior vertical:** franja de 12 px en x 10..21.
- **Pared horizontal:** banda de borde superior de 7 px (y 7..13) y cara frontal debajo, de 18 px (y 14..31). Las filas 0..6 de encima dejan ver el suelo del norte.

| Parte | De dónde sale |
|---|---|
| Tramo horizontal | #05, ensanchado a 32 px con las 10 columnas de sí mismo que dejan la costura menos visible |
| Remate horizontal | #01; se espeja para el remate oeste |
| Borde superior vertical | las filas sin cara de #02, apiladas con volteos verticales (permitido: no tiene cara) |
| Extremo norte | remate de #02 |
| Extremo sur | cara de #02 |
| Pilar | #03 |

Los casos con brazos horizontales llevan la banda en los brazos y la franja vertical hacia el norte o el sur. La cara se dibuja bajo cada brazo, y bajo el centro solo si no hay pared al sur. Las uniones en T y el cruce salen solos.

**Muros gruesos (tiles 16–19).** Una pared dentro de un cuadrado de 2×2 paredes no es una línea fina: con la máscara de 4 vecinos, un bloque (chimenea, columna, fachada doble, cobertizo) salía como una escalera de bandas y caras. Esas celdas usan un tile macizo:

- **Índice:** 16 + 2 si el norte está abierto + 1 si el sur está abierto.
- **Borde superior:** ancho, de la pieza #11, sin cara (se apila con volteos).
- **Norte abierto:** el bloque empieza a la altura de la banda, y por encima se ve el suelo del norte.
- **Sur abierto:** termina con la banda y la cara de un tramo horizontal.

**Borde superior y cara de distinto kit.** En 3/4 la cara de una pared es su lado sur, así que un mismo muro de fachada puede mirar afuera o hacia una habitación. Antes, cada pared tenía un solo kit, y donde se juntaban un tabique de yeso y la fachada de lamas el tabique cambiaba de material a mitad de franja y parecía que no llegaba a tocarla. Ahora:

- **Borde superior:** todas las paredes de la casa (`#` y `H`) usan el de yeso, y se leen como una sola estructura.
- **Cara:** cada una muestra el lado al que mira, con lamas si da afuera y yeso si da a una habitación. Va en la capa `wall_faces` con los tiles de cara (35–50 por máscara y 51 para un muro grueso).
- **Valla contra la casa:** sus bordes superiores son distintos. Los brazos de la casa hacia la valla se repiten con el kit de la valla en la capa `wall_joins` (tiles 20–34), y así la valla llega hasta la casa. Manda el kit de menos rango: valla < yeso < fachada.

`map:build` elige el tile por la máscara de vecinos, en los que cuentan las paredes, vallas, puertas y barricadas; un hueco abierto corta la pared. Bajo las partes transparentes pone el suelo de cada lado: la capa `floor` lleva el de la izquierda y la capa `decor`, la mitad derecha del de la derecha (`floor_halves`).

### 7.3 Tilesets Wang: tabla de esquinas y terreno por vértices

**Medición sin suponer el orden** (`measureWangSheet` en `scripts/lib/wang.ts`):

1. Los dos terrenos puros son los dos tiles cuyos colores medios están más lejos entre sí.
2. Se muestrea un parche en cada esquina de cada tile y se compara con esos dos colores.
3. Se afina con 2-medias de todos los parches, partiendo de los colores puros. Así, la tierra del bordillo de la calle, que llega a la esquina y está casi a la misma distancia del asfalto que de la acera, cuenta para el asfalto.

Los terrenos se nombran por color: el asfalto y el agua son los más oscuros; el patio, el menos saturado.

Los tres tilesets dan las 16 combinaciones y comparten disposición (NO NE SO SE, con 0 = asfalto, agua o patio, y 1 = acera, cubierta o césped):

| Esquinas | Tile (col, fila) | Esquinas | Tile (col, fila) |
|---|---|---|---|
| 0000 | 6 (1,1) y 15 (0,3) | 1000 | 9 (4,1) |
| 0001 | 3 (3,0) | 1001 | 14 (4,2) |
| 0010 | 4 (4,0) | 1010 | 5 (0,1) |
| 0011 | 11 (1,2) | 1011 | 10 (0,2) |
| 0100 | 8 (3,1) | 1100 | 1 (1,0) |
| 0101 | 7 (2,1) | 1101 | 2 (2,0) |
| 0110 | 13 (3,2) | 1110 | 0 (0,0) |
| 0111 | 12 (2,2) | 1111 | 16 (1,3) |

**Terreno por vértices** (`scripts/lib/terrain.ts`): un mapa de (ancho+1)×(alto+1) vértices. Cada vértice toma el terreno de las casillas de alrededor, y cada tile se elige por sus 4 esquinas. Solo hay transición entre estos pares:

| Par | Tileset | Vértice entre los dos |
|---|---|---|
| asfalto ↔ acera | `tileset_street` | asfalto si lo son 2 de sus 4 casillas: el bordillo cae en la acera |
| agua ↔ cubierta | `tileset_pool` | agua solo si lo son las 4: el muro cae dentro del agua |
| patio ↔ césped | `tileset_garden` | patio si lo son 2 de 4 |
| acera ↔ césped | `tileset_garden`, la acera como patio | acera si lo son 2 de 4 |
| cubierta ↔ césped | `tileset_garden`, la cubierta como patio (queda un borde de losas grises) | cubierta si lo son 2 de 4 |

El umbral es una proporción de las casillas de terreno que tocan el vértice (en el borde del mapa o junto a una pared hay menos de 4). Cualquier otro par que se toque en un vértice, o tres terrenos en un mismo vértice, hace fallar a `map:build` con el par y el vértice. El asfalto nunca toca el césped: calzada → bordillo → acera → césped. Hoy no existe `tileset_asphalt_grass`, así que no hay bordes de calzada rota.

### 7.4 Suelos interiores

El export `floors_interior` tampoco es una rejilla regular. Son 4×4 celdas de unos 48 px, con separaciones de 1 a 6 px, la última columna (37 px) y la última fila (34 px) recortadas, y algunas celdas con un contorno oscuro en uno o dos lados. El importador cortaba con paso fijo de 49 px y metía ese contorno en las baldosas, lo que dibujaba una cuadrícula sobre los suelos.

La extracción nueva (`scripts/lib/floor-cells.ts`):

1. detecta cada celda por componentes conexos;
2. recorta las líneas de contorno oscuras;
3. escala a 32×32 el mayor cuadrado centrado. Completar las celdas cortas con espejo se probó y dejaba simetrías que se repetían en cada baldosa.

Como Phaser 4 dibuja en negro los tiles volteados de una capa de tiles, los volteos van guardados en el tileset: 64 tiles, `volteo × 16 + fila × 4 + variante`, con volteo 0 (ninguno), 1 (horizontal), 2 (vertical) y 3 (los dos). `map:build` elige un volteo al azar para cada baldosa, así ninguna marca se repite en cuadrícula.

**Clasificación de las variantes** (mirando la repetición 3×3). Cada suelo usa su variante limpia al 70 % y, como raras, las manchadas, sin dos iguales juntas (tampoco en diagonal). Las rayadas no se usan: repiten su marca en cada baldosa. La tabla está en `FLOOR_VARIANTS` (`scripts/lib/ascii-map.ts`), y el plano ya no elige la variante por zona.

| Suelo | v0 | v1 | v2 | v3 |
|---|---|---|---|---|
| madera (`.`) | rayada (oscura, arañazos en diagonal) | **limpia** (clara) | manchada | rayada (rojiza, un arañazo) |
| linóleo (`k`) | manchada (leve) | manchada | **limpia** | manchada |
| baño (`b`) | **limpia** | rayada (otro despiece, con grietas) | manchada | manchada (grietas) |
| hormigón (`c`, `r`) | manchada (una mancha) | manchada | **limpia** | manchada (musgo y grietas) |

### Flujo del mapa de la mansión

```
npm run tiles:import    art-src/pixellab/ → public/assets/tiles/*.png + art-src/tiled/tilesets/*.tsj
maps/src/mansion.txt    plano ASCII (skill level-design): un carácter por tile y tablas de ids debajo
npm run map:build       plano → art-src/tiled/mansion.tmj → embebe los tilesets → public/assets/maps/mansion.tmj, valida y registra en el manifiesto
npm run map:preview     maps/preview/: el mapa completo a 1:4, cada zona a 1:1 y el plano en colores
(Tiled)                 se retoca art-src/tiled/mansion.tmj; map:build ya no lo pisa (avisa), salvo con --force
```

- El `.tmj` compilado guarda en sus propiedades un hash de su contenido (`compiledHash`). Si al recompilar el contenido ya no coincide, alguien lo ha retocado en Tiled: `map:build` lo conserva, avisa y construye con los retoques.
- Las zonas se calculan desde el plano: cada zona es la región que se rellena desde su semilla, cerrada por paredes, vallas, puertas de pago, barricadas y vacío. Se guardan como varios objetos `zone` con el mismo `id` (las zonas en L necesitan varios rectángulos) y el `MapLoader` los une.
- Cada barricada pone su `zombie_spawn` 2 tiles hacia fuera, en el lado contrario a su zona.
- **Decoración** (skill level-design §4, `scripts/lib/decorate.ts`), determinista:
  - suelos interiores con la variante limpia de cada material al 70 % y las manchadas repartidas, nunca dos iguales juntas (§7.4), cada baldosa en uno de sus 4 volteos;
  - decals agrupados: escombros, astillas, sangre y un rastro hacia dentro en cada barricada; suciedad y pisadas en puertas y huecos; polvo en las esquinas; y racimos de ruido hasta cubrir el 20 % de cada zona (contando el atrezo);
  - sombras al pie de paredes, vallas, puertas, barricadas y muebles con colisión.
- **Magos:** tabla `## Magos` del plano (`id`, `casilla`, `zona`, `nota`). La casilla conserva su suelo en el plano; `map:build` escribe un `merchant_spot` en su centro y `map:preview` lo marca con un rombo azul.
- **Atrezo:** tabla `## Atrezo` del plano (`id`, `objeto`, `casillas` como una casilla o dos esquinas, `colisión`, `volteo`). Cada clave tiene un solo tamaño; `map:build` registra en el manifiesto los objetos que falten como placeholder del tamaño de su huella, y el arte pendiente se apunta en `docs/ASSETS-TODO.md`.
- `map:build` no escribe el mapa del juego si el validador falla, y lista los errores (zonas, barricadas, costes, salidas, alcanzabilidad, portales, atrezo a menos de 2 tiles de barricadas, puertas o portales de su zona, pasos de menos de 2 tiles junto a un mueble, casillas aisladas, puntos de mago mal colocados…).
- `map:preview` imprime la densidad de decoración de cada zona (objetivo de la skill: 15–25 %).
- `assets:check` (y por tanto `npm run build`) pasa el mismo validador a los mapas que tienen fuente en `art-src/tiled/` y avisa si el plano o la fuente son más recientes que el mapa del juego.
- La mansión es el mapa por defecto; `?map=room01` carga el mapa de prueba.
