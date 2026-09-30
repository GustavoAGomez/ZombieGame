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
| `player` | `idle`, `walk`, `shoot`, `dash`, `death` |
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

- **`"placeholder": true`** (o un archivo inexistente): el juego genera un rectángulo del tamaño declarado.
- **`window_planks`:** el frame N representa la ventana con N tablones (del 0 al 5).
- **`door`:** frame 0 = cerrada, frame 1 = abierta.
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

1. Deja el export de PixelLab sin tocar en `art-src/pixellab/<asset>/`, por ejemplo `art-src/pixellab/player/`.
2. `scripts/import-pixellab.ts`:
   - **Inspecciona la estructura real del export.** Puede venir en frames sueltos o en sheet, y con nombres de dirección y animación variados. Adáptate al formato que encuentres y documenta en este archivo el formato detectado.
   - **Normaliza** al formato de la sección 3: una fila por dirección en el orden fijado, frames recortados al lienzo declarado y centrados por el ancla.
   - **Cuantiza** a `art-src/palette.hex`, con un aviso si hay colores fuera de la paleta.
   - **Escribe** los PNG en `public/assets/sprites/<asset>/` y actualiza la entrada en `manifest.json`: número de frames, direcciones y `placeholder: false`.
3. `npm run assets:check` valida que los tamaños son múltiplos del frame, que existen las animaciones mínimas, que las rutas del manifiesto son correctas, que el fondo es transparente y que el mapa tiene las capas y objetos obligatorios.
