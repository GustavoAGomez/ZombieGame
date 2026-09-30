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
    "door_v":          { "file": "sprites/objects/door_v.png",          "frameWidth": 32, "frameHeight": 32, "frames": 2 }
  },
  "maps": { "room01": "maps/room01.tmj" }
}
```

- **`"placeholder": true`** (o un archivo inexistente): el juego genera un rectángulo del tamaño declarado. Puede ir en el personaje entero o en una sola animación (`"animations": { "walk": { …, "placeholder": true } }`), para personajes a medio dibujar.
- **Animaciones que faltan:** si el personaje ya tiene un `idle` con arte real, las animaciones que aún no existen reutilizan los frames de `idle` (así nunca se convierte en un rectángulo en mitad de la partida). Si no hay `idle` real, se genera el placeholder.
- **`muzzle`** (opcional): la boca del arma en cada fila de dirección, `[x, y]` en píxeles del frame y en el orden de filas. De ahí salen el destello de disparo, la línea de apuntado y las balas. Si se cambia el arte del arma, hay que volver a medirla.
- **Sin destello en el arte:** el motor dibuja el destello (`muzzle_flash`, 12×12, 2 variantes) en cada bala. Las animaciones de disparo no deben llevarlo.
- **`anchor`** es el punto de los pies (centro de la hitbox) en fracción del frame. El del jugador (`0.5, 0.875`) coloca los pies en y = 42 de 48, que es donde apoyan las botas en el export de PixelLab.
- **`window_planks`:** el frame N representa la ventana con N tablones (del 0 al 5).
- **`door`:** frame 0 = cerrada, frame 1 = abierta.
- **Otros objetos del juego** (en el manifiesto como placeholder hasta tener arte): `bullet` (3×2), `aim_dot` (2×2), `blood` (16×16, 3 variantes), `pickup_ammo` y `pickup_health` (16×16, se dibujan apoyados en el suelo con el borde inferior como ancla).
- **Variantes verticales `window_planks_v` y `door_v`:** mismos frames y tamaño, dibujadas para paredes verticales (izquierda y derecha). Las versiones sin sufijo son para paredes horizontales (arriba y abajo). El motor **nunca rota** estos sprites, para que la luz siga viniendo de arriba a la izquierda; elige la variante según la orientación de la pared en el mapa.

## 5. Mapas (Tiled JSON, `.tmj`)

Los tilesets deben ir **embebidos** en el `.tmj`.

**Capas, con estos nombres exactos:**

| Capa | Tipo | Contenido |
|---|---|---|
| `floor` | tiles | suelo |
| `walls` | tiles | paredes; cada tile con la propiedad `collides: true` |
| `decor` | tiles | decoración sin colisión (opcional) |
| `objects` | objetos | ver la tabla siguiente |

**Objetos de la capa `objects`** (campo `type`/`class` y sus propiedades):

| Tipo | Forma | Propiedades |
|---|---|---|
| `zone` | rectángulo | `id` (string), `name`, `startsUnlocked` (bool) |
| `player_spawn` | punto | — |
| `window` | rectángulo de 1 tile | `id`, `zone`, `planks` (int, 5 por defecto) |
| `zombie_spawn` | punto | `window` (id de la ventana a la que va) |
| `door` | rectángulo (1–2 tiles) | `id`, `cost` (int), `fromZone`, `toZone` |

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
