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
| `player` | `idle`, `walk`, `shoot`, `dash`, `death` (y opcional `shoot_walk`: disparar andando; al retroceder mientras dispara se reproduce al revés) |
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
| `decor` | tiles | decoración sin colisión (opcional) |
| `decals` | objetos | *tile objects* sin colisión, en cualquier posición (opcional) |
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
- **Animaciones:** se aceptan como `{ <dirección>: [rutas] }` o `{ <dirección>: { frames: [rutas] } }`. Los nombres se normalizan al vocabulario del manifiesto (`Running`/`Walking` → `walk`, que es el bucle de movimiento; si llegan las dos completas, gana `Running` porque el jugador corre; `Shoot…` → `shoot`, `Bite`/`Attack` → `attack`, `Dash`/`Roll` → `dash`, `Death`/`Dying` → `death`, `Climb` → `climb`); el resto pasa a `snake_case`. Si un export trae otra estructura, el importador avisa y muestra un extracto.
- **Qué hace el importador:** construye un sheet por animación (fila por dirección, columna por frame), alinea cada frame por el `anchor` del manifiesto si el lienzo no mide lo declarado, fuerza el alfa a 0/255, cuantiza a `palette.hex` si existe (si no, avisa) y actualiza el manifiesto (`frames`, `directions`, `placeholder`). Conserva `fps` y `loop` si ya estaban declarados.

## 7. Tiles, kits y decals del mapa definitivo (spec 02)

Los exports están en `art-src/pixellab/<grupo>/<grupo>.png`, con un `README.md` que describe cada grupo y el formato medido. Detalle completo en `docs/specs/02-mapa-mansion.md` §1.

| Tipo | Formato medido | Uso en el juego |
|---|---|---|
| Tilesets Wang (`tileset_*`, export "Wang") | Lámina de 160×128 = 5×4 celdas de 32×32; 17 tiles (las 16 combinaciones de esquinas + "todo terreno 0" repetido) y 3 celdas vacías | Tal cual, con un wangset de tipo `corner` en un `.tsj` |
| Tiles sueltos (`floors_interior`) | 4×4 celdas de 48×48 con 1 px de separación | Reducidos a 32×32 de forma provisional (color dominante) |
| Kits Building (`kit_*`) | 20 piezas sobre fondo transparente, detectadas por caja delimitadora; paredes en 3/4 de hasta 32×37 | Celdas de 32×48 alineadas abajo, con `piece` y `collides` |
| Decals (`decals_*`) | 4×4 celdas de 48×48 con transparencia | Objetos libres en la capa `decals` |

- **Esquinas de los Wang:** la tabla por celda está en el `README.md` de `art-src/pixellab/` y en la spec 02 §1.1. El importador la vuelve a medir en cada ejecución.
- **Propiedades de tile:** `collides` (ya existe), `water` (bloquea cuerpos, no balas: tiles de la piscina con 2 o más esquinas de agua), `void` (vacío no transitable), `material`, `piece`.
- **Objetos nuevos en la capa `objects`:**
  - `portal`: rectángulo de 1–2 tiles con `id`, `pair`, `cost`, `zone` y `secondary`.
  - `window` con `kind: "fence"` para huecos de valla.
  - `zombie_spawn` sin `window` para spawns abiertos.
  - Zonas con `interior` y `openSpawns`.
- **Tilesets externos:** se usan para editar en Tiled (`.tsj`); el mapa que carga el juego los lleva embebidos (`npm run map:build`).

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
- `map:build` no escribe el mapa del juego si el validador falla, y lista los errores (zonas, barricadas, costes, salidas, alcanzabilidad, portales…).
- `assets:check` (y por tanto `npm run build`) pasa el mismo validador a los mapas que tienen fuente en `art-src/tiled/` y avisa si el plano o la fuente son más recientes que el mapa del juego.
- La mansión es el mapa por defecto; `?map=room01` carga el mapa de prueba.
