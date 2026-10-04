# Contrato de assets

Este documento lo siguen tanto la persona que genera el arte (PixelLab + Aseprite + Tiled) como Claude Code. Si un asset cumple este contrato, sustituir un placeholder por el arte final es solo cambiar archivos, sin tocar la lógica.

## 1. Biblia de estilo (fija para todo el juego)

- **Perspectiva:** top-down en 3/4. Siempre la misma vista en PixelLab, tanto para personajes como para tiles y objetos.
- **Luz:** desde arriba a la izquierda. Sombras hacia abajo a la derecha.
- **Contorno:** línea oscura de 1 px en personajes y objetos interactivos. Sin contorno en el suelo.
- **Paleta:** 32 colores, guardada en `art-src/palette.hex` (un hex por línea). Todos los PNG finales se reducen a esa paleta en Aseprite.
- **Densidad:** 1 píxel de arte = 1 píxel de mundo. No se escalan sprites en el motor.
- **Tile:** 32×32.
- **Personajes:** lienzo de **48×48** con el cuerpo ocupando unos 32 px, para dejar sitio a brazos extendidos y armas. Los **zombies usan 68×68**: arrastrándose sin piernas el cuerpo mide hasta 52 px de ancho y el zarpazo se sale más (PixelLab los exporta en lienzos de 60, 64 y 68).

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
| `zombie_walker`, `zombie_runner` | `walk`, `attack` (también se usa para arrancar tablones), `death`. Opcionales: `climb` (el pequeño dash al entrar por la ventana; si falta, `walk`), `crawl` y `crawl_attack` (sin piernas: arrastrarse y el zarpazo desde el suelo; si faltan, `walk` más lento y `attack`) |

**Sincronía de los zarpazos:** el golpe hace daño `ZOMBIES.attackWindup` (0,35 s) después de empezar, así que los `fps` de `attack` y `crawl_attack` se eligen para que el fotograma del impacto caiga ahí: 12 fps con el impacto en el fotograma 4 y 15 fps con el impacto en el 5. Al arrancar tablones, el zarpazo empieza ese mismo tiempo antes de que caiga el tablón. Un zarpazo se termina de reproducir aunque el zombi eche a andar justo después.

**Muerte del zombi sin arte:** mientras no haya `death`, el zombi cae al suelo con el primer fotograma de `crawl` y se desvanece durante `ZOMBIES.corpseTime`.

**Magos (`merchant_<color>`):** personajes de **1 dirección** (`"directions": 1`, siempre miran a cámara; el importador toma solo la fila `south`) en 68×68 con el ancla en los pies (0,8). Animaciones: `idle` (respirar, en bucle) y `open_coat` (abrir la gabardina al abrir su tienda, sin bucle; al cerrarla se reproduce al revés). Mientras un mago no tenga personaje, se dibuja su objeto `merchant_<color>` (rectángulo) con el rombo `merchant_gem` encima.

**Direcciones por animación:** una animación puede tener otras filas que el personaje (`"directions": 4` en el climb de un zombi de 8 direcciones); el importador lo anota solo cuando difiere.

**Arte compartido:** varios personajes pueden usar las mismas hojas (los corredores y sprinters usan las del caminante). Sus animaciones apuntan a `sprites/<otro>/<animacion>.png` y cada uno conserva sus `fps`, para que el ritmo vaya con su velocidad.

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
- **`marks`** (opcional, por animación): fotogramas donde pasa algo en el arte, por nombre. El mazazo del boss lleva `{ "hit": 7 }` (el mazo toca el suelo) y el salto `{ "air": 2, "land": 6 }` (despega y aterriza). El importador las conserva al reimportar; si cambia el arte, hay que volver a mirarlas.
- **`muzzle`** (opcional): la boca del arma en cada fila de dirección, `[x, y]` en píxeles del frame y en el orden de filas. De ahí salen el destello de disparo, la línea de apuntado y las balas. Si se cambia el arte del arma, hay que volver a medirla.
- **Sin destello en el arte:** el motor dibuja el destello (`muzzle_flash`, 12×12, 2 variantes) en cada bala. Las animaciones de disparo no deben llevarlo. La escopeta lo dibuja un 60 % más grande (`muzzleFlashScale` en `weapons.ts`).
- **`anchor`** es el punto de los pies (centro de la hitbox) en fracción del frame. El del jugador (`0.5, 0.875`) coloca los pies en y = 42 de 48, que es donde apoyan las botas en el export de PixelLab.
- **`window_planks`:** el frame N representa la ventana con N tablones (del 0 al 5).
- **`door`:** frame 0 = cerrada, frame 1 = abierta.
- **Otros objetos del juego** (en el manifiesto como placeholder hasta tener arte): `bullet` (5×2, trazadora dibujada hacia +x: cola naranja y punta blanca, para no confundirse con la línea de apuntado ámbar), `aim_dot` (2×2), `blood` (16×16, 3 variantes), `pickup_ammo` y `pickup_health` (16×16, se dibujan apoyados en el suelo con el borde inferior como ancla), `flame` (8×12, con arte de PixelLab en la paleta del fuego de la mano: 3 lenguas de fuego, centrada, inclinada a la derecha y la misma en espejo, apoyadas en el borde inferior, que es el ancla; las usan los zombis ardiendo, el chorro del lanzallamas y los estallidos del fuego infernal, mezcladas con las chispas `hand_ember`), `weapon_case` (28×18, de frente al sur) y `weapon_case_v` (18×28, de frente al este; al oeste se dibuja en espejo): vitrinas de armas, un fotograma por arma en el orden de `WEAPON_IDS` (pistola, SMG, escopeta), apoyadas en el borde inferior de su casilla. Con arte de PixelLab y centrados en el punto: `hand_crack` (48×40, el agujero sellado por una costra cuyas grietas laten, en bucle), `hand_crack_opening` (48×40, la costra rompiéndose; al cerrarse se reproduce al revés), `hand_crack_open` (48×40, abierto con el fuego dentro, en bucle), `demon_hand` (32×48: puño, abierta sosteniendo el arma con la palma encendida, abierta y vacía, y el gesto obsceno; anclada por abajo, con la base del antebrazo en el borde inferior, que el juego recorta a ras de suelo al salir y al hundirse) y `hand_ember` (8×8, una brasa por fotograma, para la columna); y `weapon_icon` (32×16, con arte de PixelLab: cada arma de perfil apuntando a la derecha, un fotograma por arma en el orden de `WEAPON_IDS`; flota a 1× sobre la mano y se ve en los huecos de armas y en el botón de acción del HUD): la Mano del Demonio (spec 06 §3.7). `item_<id>` (`item_living_heart`, `item_worn_wand`; 24×24, con arte de PixelLab, 8 fotogramas en bucle a los fps del objeto en `items.ts`): cada objeto especial (spec 05) con su animación: el corazón latiendo y la varita con rayos en la punta. La misma hoja sirve en el suelo (dentro de un foco circular de luz ámbar que late, como los marcadores de misión de GTA San Andreas; la varita flota 5 px sobre él y sube y baja), en vuelo hacia la piscina y en su hueco del inventario del HUD, que la reproduce con CSS (`src/ui/itemSprites.ts`). Sin arte, se dibuja el icono del HUD (`src/ui/icons.ts`) centrado.
- **Bosses (spec 07):** `boss_<id>` (hoy solo `boss_butcher`) es un personaje con arte de PixelLab (`art-src/pixellab/boss_butcher/`), en lienzos de 172×172 con los pies en y = 146 (ancla `0.5, 0.85`) sobre el borde inferior de su huella. Sus animaciones son las de `BOSS_ANIMATIONS` (`src/game/assets/manifest.ts`): `idle` (las rotaciones), `walk`, `charge`, `slam` y `leap` en 8 direcciones, y `charge_windup`, `stunned`, `roar` y `death` en 4. El oeste y sus diagonales son el este y las suyas en espejo, para que el mazo siga en la misma mano. Las diagonales se generaron aparte, con descripciones de acción fotograma a fotograma (`*_diag`). `BossView` no las reproduce solas: elige el fotograma por el estado del boss (la preparación de la embestida dura lo que su windup, el mazo baja en cada golpe…), con las marcas del manifiesto. Las variantes se tiñen. `boss_rubble` (32×32, 2 variantes) es la mancha de astillas que queda donde aplasta un mueble, repetida en mosaico sobre su huella. `boss_puddle` (88×88, 6 fotogramas de burbujeo en bucle, de PixelLab) es el charco de ácido del pútrido: se dibuja del tamaño del charco (entero al aterrizar, a algo más de la mitad en el rastro de la embestida), en espejo y desfasado según su hueco del pool.
- **Iconos de los botones redondos** (`icon_reload`, `icon_repair`, `icon_knife`, `icon_dash`; 36×36, un fotograma, con arte de PixelLab): un cargador doble, un martillo cruzado con una llave inglesa, el cuchillo y una bota con líneas de velocidad. El lienzo es más grande que el botón (34 px) para que el dibujo sobresalga, igual que las armas (30-31 px) en sus huecos de 32. El HUD los recorta de su hoja con CSS (`src/ui/sheetIcons.ts`, igual que `weapon_icon`); sin arte, cada botón conserva su glifo de `src/ui/icons.ts`.
- **`portal`:** escalera, escalera de mano o trampilla vista desde arriba (spec 02 §3.6). Frame 0 = cerrada, frame 1 = abierta. Se dibuja un sprite por casilla del portal.
- **Variantes verticales `window_planks_v` y `door_v`:** mismos frames y tamaño, dibujadas para paredes verticales (izquierda y derecha). Las versiones sin sufijo son para paredes horizontales (arriba y abajo). El motor **nunca rota** estos sprites, para que la luz siga viniendo de arriba a la izquierda; elige la variante según la orientación de la pared en el mapa.

### Piezas del HUD (`ui`)

El HUD es DOM, así que sus imágenes no pasan por Phaser. `npm run hud:import` lee el kit de PixelLab de `art-src/pixellab/hud/`: un export con `elements/` (un PNG por pieza) o una hoja única, que se recorta por las cajas delimitadoras sobre el canal alfa.

Identifica las piezas por su forma, las recorta a su contorno y las escribe en `public/assets/ui/`. También deja una hoja de contactos con nombres y tamaños en `maps/preview/hud/hud-kit.png` y registra la sección `ui` del manifiesto.

Las piezas que vienen de otros exports (kits posteriores, guardados en subcarpetas como `art-src/pixellab/hud/botones/` y `botones-2/`) se nombran a mano en `art-src/pixellab/hud/import.json`. Se recortan igual y sustituyen o se suman a las del kit:

```json
{ "pieces": { "ringSmall":   "botones/<export>/elements/Icon_button-2.png",
              "hexagon":     "botones-2/<export>/elements/element_3.png",
              "octagon":     "botones-2/<export>/elements/element_4.png",
              "healthFrame": "botones-2/<export>/elements/Health_bar.png" } }
```

Nombres válidos: `ringLarge`, `ringMedium`, `ringSmall`, `hexagon`, `octagon`, `panel`, `plate` y `healthFrame`. La sección `ui` queda así:

```json
"ui": {
  "ringLarge":   { "file": "ui/ring_large.png", "width": 97, "height": 97 },
  "ringMedium":  { "file": "ui/ring_medium.png", "width": 65, "height": 65 },
  "ringSmall":   { "file": "ui/ring_small.png", "width": 33, "height": 33 },
  "hexagon":     { "file": "ui/hexagon.png", "width": 28, "height": 33 },
  "octagon":     { "file": "ui/octagon.png", "width": 34, "height": 34 },
  "panel":       { "file": "ui/panel.png", "width": 145, "height": 105, "slice": [35, 45, 35, 45] },
  "plate":       { "file": "ui/plate.png", "width": 96, "height": 25, "slice": [8, 8, 8, 8] },
  "healthFrame": { "file": "ui/health_frame.png", "width": 149, "height": 22,
                   "trough": { "x": 28, "y": 6, "width": 114, "height": 13 },
                   "heart": { "x": 8, "y": 6, "width": 16, "height": 14 } }
}
```

- **Aros:** siempre a escala entera, `pixelated`; el pixel art nunca se reduce.
  - El grande es el botón de disparo.
  - El pequeño (`ringSmall`, 33 px) es recargar, cuchillo y la pausa. Viene dibujado a su tamaño en el kit de `botones/`.
  - Si `import.json` no lo trae, el importador lo saca del mediano reducido a la mitad. Como alternativa vale, pero sale irregular.
  - El mediano se importa, pero no se usa.
- **Hexágono y octógono** (`hexagon` de 28×33 y `octagon` de 34×34, del kit de `botones-2/`): su forma distingue las armas y las habilidades de los botones redondos.
  - El hexágono es cada hueco de arma, teñido de ámbar el del arma en mano.
  - El octógono es el especial (ámbar) y la mejora de la ronda (azul mientras está guardada; sin teñir, con la cuenta atrás, mientras está activa).
  - Si faltan, esos botones usan el aro pequeño.
- **Panel y placa:** 9-slice, con las esquinas enteras y los bordes repetidos píxel a píxel.
  - El panel es el fondo de la tienda. Sus cortes son anchos para que las esquinas incluyan los extremos inclinados de las pletinas del centro de cada lado.
  - La placa es el chip de acción contextual, los botones de la tienda (también los de los artículos que no se pueden comprar, oscurecidos) y los de los menús: JUGAR, REINTENTAR, CONTINUAR y REINICIAR a 2× y el interruptor de vibración a 1×.
- **Barra de vida:** marco con un corazón a la izquierda. El juego dibuja los segmentos en `trough`, y una copia de `heart` encima late por debajo de 30 de vida.
  - Si el hueco tiene un borde claro, PixelLab lo entrega medio lleno, como una barra en uso. El importador lo vacía fila a fila con el color de su extremo vacío.
  - En ese caso, el corazón es la mancha de color más grande a la izquierda del hueco, con su contorno.
- **Estados, por código y sin más arte** (`src/ui/skin.ts` + `skin.css`, solo con `.has-ui-skin`):
  - tinte ámbar del especial y del arma en mano y azul de la mejora guardada. El aro de disparo va sin teñir. Los tintes se hacen en un canvas al cargar y no tocan la cara, que es todo lo que encierra el borde claro, sea redonda o poligonal;
  - huecos de arma no equipados al 60 %;
  - pulsado a 0,94 durante 60 ms;
  - reparar: un borde ámbar de 2 px alrededor de la placa que parpadea.

  Si falta alguna pieza, el HUD conserva su aspecto solo con CSS.

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
| `zone` | rectángulo | `id` (string), `name`, `startsUnlocked` (bool), `interior` (bool), `openSpawns` (bool), `cost` (int): precio para desbloquear la sala, el mismo por cualquiera de sus puertas o escaleras principales (0 en las que están abiertas desde el inicio) |
| `player_spawn` | punto | — |
| `window` | rectángulo de 1 tile | `id`, `zone`, `planks` (int, 5 por defecto), `kind` (`window` o `fence`) |
| `zombie_spawn` | punto | `window` (id de la ventana a la que va). Sin `window` es un spawn de entrada: lleva `zone` (una zona con `openSpawns`), cae fuera del mapa o en el vacío, y a 3 casillas o menos en línea recta (solo vacío entre medias) de una casilla de su zona, hasta la que el zombi entra andando. Un spawn de ventana que cae dentro de una zona se apaga cuando esa zona se desbloquea |
| `door` | rectángulo (1–2 tiles) | `id`, `fromZone`, `toZone`. Vende la sala cerrada del otro lado al precio de la sala, y se abre sola en cuanto sus dos zonas están desbloqueadas |
| `portal` | rectángulo (1–2 tiles) | `id`, `pair` (id del otro extremo), `zone`, `secondary` (bool), `kind` (`stairs`, `ladder` o `hatch`). Uno principal vende la sala cerrada del otro extremo al precio de la sala; uno secundario no se compra y se abre solo cuando sus dos zonas están desbloqueadas |
| `weapon_case` | rectángulo de 1 tile | `weapon` (string, id de `weapons.ts`), `cost` (int, precio en $), `facing` (`south`, `east` o `west`; **nunca `north`**: el frente se tiene que ver desde la cámara), `zone` (string). Vitrina de un arma básica (spec 04 §3): sólida para cuerpos y balas, no para la vista. Se compra desde el frente, a menos de 40 px. En el plano ASCII va en la tabla `## Vitrinas` (id, casilla, arma, coste, orientación, zona). El validador exige una casilla libre delante, 3 tiles o más hasta las barricadas, puertas y puntos de mago de su zona, y ningún paso de menos de 2 tiles |
| `activation_site` | rectángulo | `id` (string) y `zone` (string): un lugar donde se usan objetos especiales (spec 05 §6). El `id` es el `site` que nombra una activación de `src/config/activations.ts`; el validador exige que cada activación tenga el suyo. El jugador está «en el lugar» si su hitbox queda a menos de `ITEMS.useRange` (40 px) del borde del rectángulo. En la mansión, `pool`: el agua de la piscina del jardín |
| `hand_spot` | punto | `zone` (string): dónde puede estar la Mano del Demonio (spec 06 §3.1). Uno por zona salvo la inicial, que no tiene ninguno; en una casilla de suelo con las cuatro vecinas libres, a la que se llega a pie, nunca en un paso de menos de 3 tiles, y a 3 tiles o más de barricadas, puertas, portales, puntos de mago, vitrinas y puntos de objeto. No es sólida: se pasa por encima. El validador comprueba todas estas reglas |
| `boss_spot` | punto | `zone` (string): por dónde sale un boss del suelo (spec 07 §3). Al menos uno por zona, también en el sótano y la azotea; en el centro de un cuadrado de 3×3 casillas de suelo sin paredes (puede tener atrezo encima: el boss lo aplasta al salir), a 3 tiles o más de puertas, portales, vitrinas, puntos de mago y puntos de la mano. El validador comprueba estas reglas y, además, que un cuerpo de 2×2 casillas llegue por las puertas a todas las salas de cada nivel (con todas abiertas y el atrezo transitable) |
| `item_spot` | punto | `zone` (string): dónde puede aparecer un objeto especial (spec 05 §2). Entre 1 y 2 por zona, incluidos el sótano y la azotea; en el centro de una casilla de suelo a la que se llega a pie, nunca sobre agua, vacío o atrezo, y a 2 tiles o más de barricadas, puertas, portales, spawns, puntos de mago y vitrinas. El validador comprueba todas estas reglas; que el sitio sea creíble (junto a un mueble, en un rincón, no en mitad de un pasillo) se revisa en la vista previa |
| `merchant_spot` | punto | `zone` (string): dónde puede estar un mago vendedor (spec 03 §1). Entre 1 y 2 por zona, incluidas las islas; en el centro de una casilla de suelo pegada a una pared (o al borde del agua: el mago rojo sale de la piscina, spec 05 §6) o en un rincón, a más de 3 tiles de barricadas, puertas, portales, spawns de zombies y el del jugador, y sin dejar un paso de menos de 2 tiles (el mago es sólido). El validador comprueba todas estas reglas |

## 6. Importar desde PixelLab (`npm run assets:import`)

1. Descomprime el export de PixelLab, sin tocarlo, en `art-src/pixellab/<asset>/`, por ejemplo `art-src/pixellab/player/`. El nombre de la carpeta es la clave del personaje en el manifiesto. Si exportas las animaciones por separado, **cada zip va en su propia subcarpeta** (`art-src/pixellab/player/walk/`, `…/shoot/`), porque todos traen un `metadata.json` y se pisarían. El importador lee la carpeta del personaje y todas sus subcarpetas con `metadata.json`.
2. `scripts/import-pixellab.ts`:
   - **Inspecciona la estructura real del export.** Puede venir en frames sueltos o en sheet, y con nombres de dirección y animación variados. Adáptate al formato que encuentres y documenta en este archivo el formato detectado.
   - **Normaliza** al formato de la sección 3: una fila por dirección en el orden fijado, frames recortados al lienzo declarado y centrados por el ancla.
   - **Cuantiza** a `art-src/palette.hex`, con un aviso si hay colores fuera de la paleta.
   - **Escribe** los PNG en `public/assets/sprites/<asset>/` y actualiza la entrada en `manifest.json`: número de frames, direcciones y `placeholder: false`.
   - Uso: `npm run assets:import` importa todo; `npm run assets:import -- player` solo ese personaje.
3. **Objetos del manifiesto** (sección `objects`, como `demon_hand`): van en `art-src/pixellab/objects/<clave>/`, con las imágenes de PixelLab tal como se descargan y un `import.json` que nombra los fotogramas en orden:

   ```json
   { "frames": ["retocado/fist.png", "retocado/offer.png", "retocado/empty.png", "retocado/mock.png"] }
   ```

   - El tamaño de fotograma lo manda el manifiesto. Un PNG de otro tamaño se centra en él, con aviso si se recorta algo.
   - El importador pone los fotogramas de izquierda a derecha, pasa el alfa a 0/255, cuantiza a la paleta si existe, escribe el `file` de la entrada y la marca con `"placeholder": false`.
   - Los retoques a mano (puntas de brasa, contornos, recolocar en el lienzo, paleta común de 32 colores) van en una subcarpeta `retocado/`, junto a los originales sin tocar.
   - `npm run assets:import -- <clave>` importa solo ese objeto.
4. `npm run assets:check` valida que los tamaños son múltiplos del frame, que existen las animaciones mínimas, que las rutas del manifiesto son correctas, que el fondo es transparente y que el mapa tiene las capas y objetos obligatorios.

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
- **Export del zombi** (octubre de 2026): un estado `Idle` con `walking`, el zarpazo (`a_vicious_claw_swipe…`) y `climb` (solo sur, este, norte y oeste), y un estado `the same zombie craw` (el nombre truncado de «crawling») con `dragging_itself_forward` y `ground-level_claw`. Andar, zarpazo y climb vienen en 60×60; arrastrarse, en 64×64 y 68×68. Todo se centra en el lienzo de 68×68 del zombi, con los pies en y ≈ 54 (ancla 0,8).
- **Direcciones que faltan:** una animación con al menos 3 direcciones (la muerte del jugador llega en sur, este y oeste) se completa a 8 con la más cercana en el círculo. En caso de empate gana la del mismo lado (sureste → este), luego la que tiene lado (norte → este u oeste) y después la primera en el orden de filas. Con menos de 3 se omite, como antes.
- **Tomas duplicadas:** si una dirección se regeneró, PixelLab la exporta dos veces con un sufijo (`north-36c131c0`, `north-e16e1c8c`). Por defecto se usa la primera; la elección se puede fijar en `art-src/pixellab/<asset>/import.json`: `{ "takes": { "shoot_walk": { "north": "north-36c131c0" } } }`.
- **Distinto número de frames por dirección** (11 o 13 en los disparos): las direcciones cortas se estiran repitiendo frames de forma uniforme hasta igualar a la más larga, porque el sheet necesita las mismas columnas en todas las filas. En un bucle donde casi todas las filas son cortas conviene lo contrario: `import.json` puede fijar los frames, `{ "frames": { "walk": 9 } }`, y las dos diagonales de 11 del zombi se reducen a 9 en vez de meter tirones en las otras seis.
- **Escala de una animación:** si PixelLab dibuja un estado a otro tamaño que el resto del personaje (el zombi arrastrándose salía 1,5 veces más grande: 6 px entre los ojos en vez de 4), `import.json` lo corrige con `"scale"`. Admite un factor para todas las filas (`{ "crawl": 0.8 }`) o uno por dirección, con `"*"` para el resto: `{ "crawl": { "*": 0.8, "south": 0.7, "south-east": 0.7, "south-west": 0.7 } }`. El zombi tumbado mirando hacia abajo enseña la cara y abulta más que de espaldas o de lado, así que esas tres filas llevan un factor menor. Se escala alrededor de los pies (el ancla), así que sigue apoyado donde está el personaje. Cada píxel toma el color más repetido de su zona y, en caso de empate, el más oscuro, para que el contorno de 1 px no se rompa.
- **Tomas de varias animaciones:** `import.json` con `"sources"` construye una animación a partir de otras del export, por su nombre en el export y en orden de preferencia: cada dirección sale de la primera que la tiene. Las que no se nombran y darían el mismo nombre se ignoran, así que una toma fallida puede quedarse en el export sin usarse. El boss lo usa así: `{ "walk": ["walk_v3"], "leap": ["leap_v2", "leap"] }` (el andar de plantilla perdía el mazo; el salto repetido hacia el sur y el este y el original hacia el norte).
- **Direcciones en espejo:** `import.json` con `"mirror"`, `{ "west": "east", "south-west": "south-east", "north-west": "north-east" }`, dibuja cada dirección como la otra volteada en horizontal, sustituyendo la suya si la hay. Así una animación generada solo al sur, este y norte queda en 4 filas, y un personaje con un arma en una mano la sigue llevando en la misma al girarse.
- **Arte compartido:** `import.json` con `{ "alsoFor": ["zombie_runner", "zombie_sprinter"] }` copia al manifiesto de esos personajes las hojas, el lienzo, el ancla y las filas del importado; cada uno conserva sus `fps` y `loop`.
- **Nombres truncados:** PixelLab corta los nombres de animación a 50 caracteres, así que el importador mira también el nombre del estado. Una animación de andar dentro de un estado de disparo (`standing in a firing`) se importa como `shoot_walk`.
- **Animaciones incompletas:** una animación a la que le faltan direcciones (por ejemplo, `Walking` solo con `south`) se omite con un aviso.
- **Animaciones:** se aceptan como `{ <dirección>: [rutas] }` o `{ <dirección>: { frames: [rutas] } }`. Los nombres se normalizan al vocabulario del manifiesto (`Running`/`Walking` → `walk`, que es el bucle de movimiento; si llegan las dos completas, gana `Running` porque el jugador corre; `Shoot…` → `shoot`, `Bite`/`Attack`/`Swipe`/`Claw` → `attack`, `Dash`/`Roll` → `dash`, `Death`/`Dying`/`Staggers` → `death`, `Climb` → `climb`, `Knife`/`Stab`/`Slash`/`Melee` → `melee`, `Crawl`/`Dragging` → `crawl`, y un ataque dentro de un estado de arrastrarse → `crawl_attack`); el resto pasa a `snake_case`. La muerte se reconoce antes que el disparo, para que «…drops the handgun» no se lea como disparar. Si un export trae otra estructura, el importador avisa y muestra un extracto.
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
  - `zombie_spawn` sin `window` (con `zone`) para los spawns de entrada, fuera del mapa.
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
- **Mano del Demonio:** tabla `## Mano` del plano (`id`, `casilla`, `zona`, `nota`), con ids `H1`, `H2`… La casilla conserva su suelo; `map:build` escribe un `hand_spot` en su centro y `map:preview` lo marca con una grieta oscura de borde rojo y brasas.
- **Bosses:** tabla `## Bosses` del plano (`id`, `casilla`, `zona`, `nota`), con ids `B1`, `B2`… La casilla es la del centro del cuadrado de 3×3; `map:build` escribe un `boss_spot` en su centro y `map:preview` marca el cuadrado con un borde naranja discontinuo y una cruz roja en medio.
- **Objetos:** tabla `## Objetos` del plano (`id`, `casilla`, `zona`, `nota`), con ids `I1`, `I2`… (las `E` son de los spawns de entrada). La casilla conserva su suelo; `map:build` escribe un `item_spot` en su centro y `map:preview` lo marca con una estrella violeta.
- **Activaciones:** tabla `## Activaciones` del plano (`id`, `casillas` de esquina a esquina, `zona`, `nota`). `map:build` escribe un `activation_site` con ese rectángulo y `map:preview` lo marca con un marco violeta discontinuo.
- **Magos:** tabla `## Magos` del plano (`id`, `casilla`, `zona`, `nota`). La casilla conserva su suelo en el plano; `map:build` escribe un `merchant_spot` en su centro y `map:preview` lo marca con un rombo azul.
- **Atrezo:** tabla `## Atrezo` del plano (`id`, `objeto`, `casillas` como una casilla o dos esquinas, `colisión`, `volteo`). Cada clave tiene un solo tamaño; `map:build` registra en el manifiesto los objetos que falten como placeholder del tamaño de su huella, y el arte pendiente se apunta en `docs/ASSETS-TODO.md`.
- `map:build` no escribe el mapa del juego si el validador falla, y lista los errores (zonas, barricadas, costes, salidas, alcanzabilidad, portales, atrezo a menos de 2 tiles de barricadas, puertas o portales de su zona, pasos de menos de 2 tiles junto a un mueble, casillas aisladas, puntos de mago mal colocados…).
- `map:preview` imprime la densidad de decoración de cada zona (objetivo de la skill: 15–25 %).
- `assets:check` (y por tanto `npm run build`) pasa el mismo validador a los mapas que tienen fuente en `art-src/tiled/` y avisa si el plano o la fuente son más recientes que el mapa del juego.
- La mansión es el mapa por defecto; `?map=room01` carga el mapa de prueba.
