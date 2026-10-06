# Decisiones

Registro de lo que la spec no definía (o definía de forma ambigua) y cómo se resolvió. Siempre la opción más simple.

## Fase 0 · Setup

- **Docs dentro de `docs/`.** Los archivos venían en la raíz; se movieron a `docs/specs/01-mvp-gameplay.md` y `docs/ASSETS.md`, que es donde los referencia `CLAUDE.md`.
- **TypeScript 6.0 en lugar de 7.0.** TS 7 (compilador nativo) es la última versión, pero `typescript-eslint` solo soporta `<6.1`. Se fija `typescript@~6.0.3`.
- **Tamaño del canvas.** Phaser con `Scale.NONE`: el backing store se redimensiona a `CSS × DPR` (máx. 3) con `game.scale.resize()` y el CSS fuerza el canvas al 100 % del viewport (`!important`), así no hay errores de redondeo con zoom fraccional.
- **Phaser no escucha la entrada.** `input` desactivado en la config: todos los controles son DOM (regla 2).
- **Audio desactivado** (`noAudio`) hasta que haya sonidos; evita crear un `AudioContext` bloqueado en iOS.
- **Orientación en web.** El navegador no puede bloquear la orientación, así que en vertical se muestra un aviso a pantalla completa (`GIRA EL MÓVIL`). En nativo: iOS solo `LandscapeLeft`/`LandscapeRight` (también iPad) y Android `sensorLandscape`. El resto de ajustes nativos queda para la Fase 9.
- **appId provisional** `es.garajedeideas.zombies`, nombre `Zombies`. Cambiar antes de publicar.
- **Fuentes:** solo el subconjunto `latin` de Press Start 2P y Silkscreen (cubre el español) para no empaquetar cirílico ni griego.
- **`npm audit`:** 3 avisos moderados en `uuid`, que llega por `@capacitor/cli → xcode`. Es una herramienta de desarrollo que no se incluye en la app; se deja hasta que Capacitor lo actualice.
- **Tests junto al código** (`src/**/*.test.ts`), sin carpeta aparte.

## Fase 1 · Mapa y cámara

- **Colisiones propias en lugar de Arcade Physics.** El stack cita Arcade Physics, pero las reglas 1 y 2 (lógica separada del render y reutilizable en un servidor online) mandan: las colisiones son funciones puras sobre una rejilla de tiles (`CollisionGrid`: círculo contra tiles con deslizamiento, sub-pasos contra el túnel y raycast de rejilla para línea de visión). No se activa ningún motor de física de Phaser.
- **Flags por tile.** Paredes: bloquean todo. Ventanas: bloquean al jugador y a los zombies, pero no a las balas ni a la línea de visión (se puede disparar a los zombies que arrancan tablones, como en BO1). Puertas cerradas: bloquean todo; abiertas, nada.
- **Ventanas y puertas en el `.tmj`.** Sus celdas quedan vacías en la capa `walls`; la colisión sale del objeto. Bajo las puertas hay suelo, así que "sus tiles pasan a ser suelo" es simplemente quitar el bloqueo y mostrar el frame 1 (abierta, transparente en el placeholder).
- **Orientación.** La orientación de cada ventana y puerta sale del suelo interior adyacente. ~~En paredes verticales el sprite se rota 90°~~ → sustituido: hay variantes `window_planks_v` y `door_v` (ver más abajo).
- **Puntos de ventana derivados.** Punto exterior (donde el zombie arranca tablones) = centro + 0,75 tiles hacia fuera. Punto interior = centro del tile de dentro justo delante. El esquema de `ASSETS.md` no tiene objetos para ellos.
- **Distribución del mapa placeholder.** `inicio` 14×9 en (4,4); `pasillo` 16×5 en (4,14); `almacen` 8×8 en (21,17), desplazado hacia abajo para que la pared derecha del pasillo tenga un tramo exterior (W5) y otro compartido con el almacén (D2). Mapa de 33×28 tiles con 3 de margen para los spawns. Fuera del edificio no hay suelo (se ve `--ink`).
- **Tileset placeholder.** Los tiles con `collides` se pintan como pared y el resto como suelo; no hace falta más información en el `.tmj`.
- **Placeholder de personaje.** El cuadrado de 14×14 se centra en el ancla del frame de 48×48 (que es el centro de la hitbox). Cada fila del sheet dibuja la muesca/ojos hacia su dirección, así el render usa el mismo código con placeholders que con arte final.
- **`zombie_sprinter`** tiene su propia entrada en el manifiesto (placeholder con contorno rojo). Si no hay arte propio, puede apuntar a los PNG del corredor.
- **Sheets de 4 direcciones:** las diagonales usan la fila horizontal más cercana (SE/NE → este, SO/NO → oeste).
- **Hitbox:** manda `balance.ts`; `assets:check` avisa si el `hitbox.radius` del manifiesto no coincide.
- **`assets:import`:** sin un export real de PixelLab no se puede saber su formato. De momento el script lista lo que encuentra en `art-src/pixellab/` y avisa; la normalización se escribirá con el primer export.
- **`assets:check`:** decodificador PNG mínimo propio (`node:zlib`) para comprobar transparencia y paleta sin dependencias. Si no existe `art-src/palette.hex`, la comprobación de paleta se omite con un aviso.

## Fase 2 · Movimiento

- **Zona del joystick:** un `div` transparente que ocupa el 40 % izquierdo a toda la altura. Los textos del HUD que caen dentro no bloquean (`pointer-events: none`); los botones sí, porque van por encima (z-index).
- **Reset de controles** también en `blur` y `visibilitychange`: si el dedo se levanta con la app oculta, nunca llega `pointerup`.
- **Teclado en escritorio** (WASD / flechas) para probar rápido en el navegador. Solo rellena el mismo `InputCommand`.
- **`stepSimulation`** es el único punto de entrada de la lógica por tick (lo que llamaría un servidor). Recibe un `SimContext` sin nada de Phaser.
- **Velocidad analógica:** el vector del comando ya lleva la magnitud (35–100 %). El sistema la limita a 1 por si llega un comando malformado (pensando en el online).

## Fase 3 · Disparo

- **Dianas de práctica.** Sin zombies todavía no se podía probar el auto-apuntado, así que hay 3 dianas estáticas (una de cada tipo) en `inicio` que reaparecen a los 2 s de morir (`TRAINING_DUMMIES` en `balance.ts`). Viven en el mismo pool que los zombies (`ai: 'dummy'`) y se quitarán en la Fase 4.
- **Dispersión** = ángulo total del cono: cada disparo se desvía como mucho ±dispersión/2 (±1° la pistola y ±3° la SMG). Usa el PRNG determinista del estado.
- **Cadencia exacta.** El enfriamiento conserva el resto por debajo de un tick mientras se mantiene el gatillo (la SMG a 11/s da 11 disparos por segundo de media a 60 Hz). Al soltar, se pone a 0 para que la siguiente pulsación dispare al momento.
- **Recarga automática** en cuanto el cargador llega a 0, aunque no se esté disparando, salvo durante el cambio de arma. No hay recarga manual.
- **Arma vacía con la otra cargada:** el botón de disparo no hace nada (hay que cambiar de arma). El golpe cuerpo a cuerpo solo sale cuando no queda munición en ninguna arma, como dice la spec.
- **Cuerpo a cuerpo:** golpea al zombie más cercano cuyo borde de hitbox esté a ≤ 20 px, dentro de un cono de ±60° hacia donde se apunta. El cono no estaba definido.
- **Pool de balas agotado:** el disparo gasta munición pero no se simula. Con 64 balas no debería pasar nunca (la SMG tiene unas 6 en vuelo).
- **Knob del disparo:** recorrido máximo de 34 px (lo que cabe dentro del botón: (112 − 44) / 2).
- **Velo del especial:** cubre el botón entero al activarse y su borde superior va bajando hasta desaparecer. Los segundos se muestran redondeados hacia arriba. Se actualiza en 64 pasos, no en cada frame.
- **Balas y ventanas:** atraviesan ventanas (ver Fase 1) y mueren al salir del mapa o al agotar el alcance.
- **Teclado en escritorio:** WASD mover, IJKL apuntar y disparar, Espacio disparar con auto-apuntado, Q cambiar de arma, Shift/E dash.
- **Balas y puntos de la línea de apuntado** están en el manifiesto como objetos (`bullet` 3×2 y `aim_dot` 2×2, placeholder ámbar), así también se podrán sustituir por arte.
- **HUD parcial:** de momento solo está la fila del arma (nombre, icono, cargador, reserva y barra de recarga). El resto del HUD A llega en fases posteriores.

## Variantes verticales (entre Fase 3 y 4)

- **`window_planks_v` y `door_v`** para paredes verticales, con los mismos frames y tamaño. El motor nunca rota estos sprites, porque la rotación rompía la luz de arriba a la izquierda. Documentado en `docs/ASSETS.md` §4 y exigido por `assets:check`.

## Fase 4 · Zombies

- **Arrancar tablones y trepar ya están en la Fase 4.** La máquina de estados de la spec los incluye y, sin ellos, los zombies no pueden entrar. La Fase 5 añade la reparación con el chip contextual, los puntos por tablón y su límite.
- **Spawns sin rondas todavía.** Hasta la Fase 7 aparecen zombies sin fin al intervalo de la ronda actual, con un máximo de 20 vivos. Las fórmulas de vida, mezcla, número de zombies e intervalo ya están en `waveFormulas.ts` con tests. El parámetro `?round=N` arranca en otra ronda para probar vida y mezcla.
- **Mezcla de tipos:** los corredores suben de forma lineal (20 % en la ronda 3, 35 % en la 4 y 50 % en la 5) y se quedan en 60 % desde la 6. Los sprinters aparecen en la ronda 8 con un 10 % y suben un 10 % por ronda hasta el 30 %. Su cuota sale de la de los caminantes.
- **Peso de los spawns:** `1 / (1 + distancia / 256 px)` al jugador vivo más cercano. Solo cuentan los spawns de ventanas de zonas desbloqueadas.
- **Flow field:** BFS de 4 vecinos (pasos en Manhattan) desde la casilla de cada jugador vivo, sobre suelo no bloqueado de zonas desbloqueadas o puertas abiertas. El zombie va hacia el centro del vecino (de los 8) con menor distancia, sin cortar esquinas: en espacio abierto eso da diagonales. Se recalcula cada 250 ms o cuando un jugador cambia de casilla. Si el zombie queda fuera del campo, va recto.
- **Varios zombies en la misma ventana** arrancan tablones a la vez (cada uno a su ritmo). Se considera que un zombie ha llegado a la ventana a 12 px del punto exterior.
- **Ataque:** el alcance de 16 px se mide desde el centro del zombie hasta el borde de la hitbox del jugador. Mientras está a su alcance, el zombie se queda quieto en lugar de empujar. El golpe solo entra si el jugador sigue a su alcance al acabar la preparación.
- **Los zombies son sólidos para el jugador:** no puedes atravesarlos andando (el dash sí, porque eres invulnerable) y pueden acorralarte. Ellos tampoco te empujan: si uno acaba encima de ti (por la separación), se aparta él. Solo el golpe te desplaza (los 6 px de la spec).
- **Multitudes:** separación suave (60 % del solape por tick) con 2 px de margen. Si un zombie tiene delante, tocándolo, a otro más cerca del jugador, se desplaza de lado al 60 % de su velocidad para rodearlo en vez de empujar. Así forman un anillo alrededor del jugador y no una bola. Los que trepan no reciben empuje.
- **Muerte del zombie:** el cadáver dura 0,6 s (la animación `death`) y después se libera el hueco del pool. Deja una mancha de sangre (3 variantes, objeto `blood` de 16×16 en el manifiesto) que se desvanece en sus últimos 4 s y desaparece a los 20 s. Con 40 manchas se reutiliza la más antigua.
- **Muerte del jugador (temporal):** aparece `HAS MUERTO` y la partida se reinicia a los 2,5 s. La pantalla de game over llega en la Fase 7.
- **HUD adelantado:** la fila de vida (corazón, barra de 10 segmentos, valor, latido y color de vida baja por debajo de 30) y `RONDA N` se añaden ya porque hacen falta para probar el daño. También el borde rojo pixelado de 200 ms al recibir un golpe. La vibración queda para la Fase 9.
- **Dianas eliminadas.** El estado `idle` (quieto) queda para tests y futuras herramientas de debug.

## Sprite del jugador (importación de PixelLab)

- **Primer export real:** `idle` del jugador en 8 direcciones, 48×48 y 1 frame por dirección (son rotaciones estáticas, sin animación). El export sin tocar queda en `art-src/pixellab/player/` y el sheet en `public/assets/sprites/player/idle.png`.
- **Placeholder por animación** en el manifiesto, y **las animaciones que faltan reutilizan el `idle` real.** Si no, al caminar el jugador se convertía en el cuadrado verde. Mientras no haya `walk`, `shoot`, `dash` y `death`, el personaje gira en 8 direcciones pero se desliza sin animar y, al morir, sigue de pie.
- **Ancla del jugador: `0.5, 0.875`** (pies en y = 42 de 48), medida sobre el arte. El importador informa de dónde caen los pies para poder revisarla.
- **Sin paleta todavía:** el sprite tiene 722 colores y no existe `art-src/palette.hex`, así que no se cuantiza. `assets:check` avisa de que supera los 32 colores de la biblia de estilo.
- **Balas y línea de apuntado a la altura del arma:** se dibujan 12 px por encima del plano del suelo (`DISPLAY.shotHeight`). Es solo render; las colisiones siguen a ras de suelo. Para que cuadre, los placeholders de personaje se apoyan sobre el ancla en vez de centrarse en ella, igual que el arte real en 3/4.
- **El importador reescribe `manifest.json`** con `JSON.stringify` (2 espacios). Se pierde la alineación manual de antes, pero el archivo pasa a estar gestionado por el script.

## Botín de munición y vida · velocidad del jugador

- **Velocidad del jugador: 120 px/s** (antes 88), porque la animación básica de movimiento será correr. El sprinter (84 px/s) queda al 70 % y sigue sin poder alcanzarte en línea recta. El nombre de la animación sigue siendo `walk` en el contrato: el importador ya traduce los exports `Run`/`Running` a `walk`.
- **Botín:** una tirada por baja: 10 % munición y 6 % vida (`PICKUPS` en `balance.ts`). Munición = +1 cargador a la reserva de cada arma, con tope `maxReserve` (igual a la reserva inicial: 64 y 120). Vida = +50 PV, hasta el máximo.
- **Solo se recoge si sirve:** con la reserva o la vida llenas, el objeto se queda en el suelo para más tarde. Se recoge al tocarlo (hitbox del jugador + 6 px). Dura 15 s y parpadea los últimos 3. Hay como máximo 12 en el suelo; si caen más, se reemplaza el más antiguo.
- **Bajas fuera del edificio** (en la ventana o viniendo del spawn): el botín cae en el punto interior de su ventana, porque fuera el jugador nunca podría cogerlo.
- **Aviso al recoger:** se emite `pickup:collected` (servirá para sonido y vibración). El HUD refleja el cambio de munición y vida con sus eventos de siempre.

## Animación de correr del jugador

- **Export completo del personaje** (`Idle` + `Running` en 8 direcciones × 6 frames + `Walking` solo hacia el sur). Sustituye al primer export en `art-src/pixellab/player/` (las rotaciones `Idle` son idénticas).
- **`Running` → `walk`**, que en el contrato es el bucle de movimiento. `Walking` se omite porque solo trae la dirección sur. Si en el futuro llegan las dos completas, gana `Running`.
- **Frames de 56×56:** PixelLab generó la dirección sur en un lienzo mayor con el personaje centrado. Se centran en 48×48 (se quitan 4 px por lado) en lugar de alinearlos por la fracción del ancla, que los dejaba 3 px más altos que el resto. Así los pies caen donde en el `idle` sur. Notas para el arte: en esa dirección el personaje sale algo más pequeño, y en este/noreste/noroeste/oeste los frames 4–6 giran el cuerpo más hacia atrás que los 1–3.
- **12 FPS para la carrera** (antes 10, pensado para caminar). A 120 px/s el ciclo de 6 frames recorre 60 px.
- **El ritmo de la carrera sigue la velocidad analógica** (`timeScale` = factor de velocidad del joystick, mínimo 0,5) para que trotar despacio no parezca patinar. Al girar sin soltar el joystick, el ciclo continúa en vez de reiniciarse.

## Fase 5 · Barricadas

- **Arrancar tablones y trepar** ya estaban hechos desde la Fase 4. Esta fase añade la reparación con el chip contextual y los puntos.
- **Alcance de reparación:** 40 px medidos desde el centro de la ventana. El jugador puede acercarse hasta 22 px (el borde de la pared más su radio), así que hay que pegarse a la ventana, a unos 18 px de la pared como mucho. Si hay dos ventanas a tiro, se repara la más cercana.
- **Mantener pulsado:** cada tablón necesita 0,6 s seguidos. Al soltar, el contador vuelve a 0. Mientras repara, el jugador mira hacia la ventana; puede moverse, pero si sale del alcance deja de reparar.
- **Límite de 500 puntos por ronda:** pasado el límite se puede seguir reparando, pero sin puntos (como en BO1), y el chip deja de mostrar el `+10`. El contador se reinicia cuando cambia la ronda (lo hará el sistema de rondas de la Fase 7).
- **Contador de puntos adelantado:** el jugador empieza con 500 y el HUD ya muestra `PUNTOS`. La reparación emite `points:gained`, que usarán los textos flotantes `+N` de la Fase 6.
- **Reparar mientras un zombie arranca** funciona sin más: los dos cambian el mismo contador de tablones. Un zombie que ya ha empezado a trepar termina de entrar aunque repares.
- **El chip** es un control DOM que solo aparece cuando la simulación ofrece una acción (`contextAction` en el estado, publicado con `action:context`). Ya muestra el formato de puertas (`ABRIR PUERTA` / `FALTAN X`) para la Fase 6. En escritorio, F o Enter equivalen al chip.

## Fase 6 · Puntos y puertas

- **La baja vale 60:** cada impacto da +10 a quien dispara (el dueño de la bala o quien golpea cuerpo a cuerpo), y el impacto que mata suma además +50, como en BO1. Los impactos a zombies que están fuera (en la ventana) también cuentan.
- **Textos flotantes:** cada suma del jugador local aparece como `+N` en ámbar en la fila 3 del bloque derecho (bajo la munición). El más nuevo va abajo, sube, se desvanece en 600 ms y se apilan. Hay un pool de 8 elementos DOM; si todos están ocupados (la SMG a 11 disparos/s), se reutiliza el más antiguo.
- **Alcance de puertas:** 48 px desde el centro de la puerta (en una de 2 tiles, se llega también desde un extremo).
- **Ventana y puerta a la vez:** el chip ofrece la más cercana. Todo esto lo decide un `InteractionSystem` en la simulación.
- **Comprar es un toque:** hace falta el flanco de pulsación (`actionPressed`). Mantener el chip no compra, así no se gastan puntos sin querer al reparar cerca de una puerta.
- **Sin puntos suficientes:** el chip se atenúa, muestra `FALTAN X` (X = coste − puntos) y tiembla al tocarlo. El temblor es solo feedback de la interfaz; la simulación simplemente no compra.
- **Al comprar** se desbloquean las zonas a los dos lados de la puerta (por si alguna vez se compra desde el lado cerrado), sus spawns empiezan a funcionar y el flow field se recalcula en el acto. Se emite `door:opened` para la vibración media de la Fase 9.

## Animaciones de disparo y destello

- **Export completo del jugador** con un segundo estado, `standing in a firing`: disparo quieto (`shoot`, en bucle a 12 FPS) y disparo caminando (`shoot_walk`, animación nueva, en bucle a 12 FPS). Las rotaciones de ese estado no se importan, porque la animación ya ocupa el nombre `shoot`.
- **Tomas elegidas** (guardadas en `art-src/pixellab/player/import.json`): norte `36c131c0` (la otra lanza chispas por encima de la cabeza y se recortaría) y sureste `805cba59` (la otra deriva hacia el este a mitad del ciclo).
- **11 y 13 frames según la dirección:** se estiran a 13 repitiendo frames de forma uniforme.
- **Disparar ralentiza:** el jugador pasa de correr (120 px/s) a andar al 60 % (72 px/s) mientras dispara, porque el arte es un paso andando; a velocidad de carrera las piernas patinarían. Es un cambio de juego: a partir de la ronda 8, los sprinters (84 px/s) pueden alcanzarte mientras disparas. `PLAYER.shootingSpeedFactor = 1` lo desactiva.
- **Retroceder disparando** reproduce `shoot_walk` al revés cuando el movimiento va en contra de la dirección de apuntado (producto escalar negativo). El ritmo sigue a la velocidad analógica, igual que la carrera.
- **Destello propio en cada bala:** 50 ms (3 ticks de simulación, así no depende del ritmo de render), alternando dos formas, en la boca del arma. La boca se mide por dirección en el arte y se guarda en el manifiesto (`muzzle`).
- **Balas y línea de apuntado salen de la boca del arma** y vuelan a esa altura toda la trayectoria, alineadas con la línea. La colisión sigue a ras de suelo. Consecuencia temporal: hacia el este y el oeste las balas pasan por encima de los zombies placeholder (cuadrados de 14 px); con arte real (unos 40 px de alto) irán a la altura del pecho.
- **Restos de destello en el arte:** quedan chispas blancas en la punta del arma en el disparo quieto noreste y noroeste (frames 2, 3, 7 y 10) y en el disparo caminando este y oeste (frame 5). Conviene limpiarlas o regenerarlas para que no se dupliquen con el destello del motor.

## Ajustes tras probar en el móvil (reparación, controles, balas, velocidad)

- **Reparar a toques** (sustituye al "mantener" de la Fase 5): cada toque del chip repone un tablón (+10) y los toques más rápidos que 0,2 s se ignoran (`repairTapCooldown`, unos 5 toques por segundo; una ventana completa en 1 s). Mantener pulsado ya no repara. El borde del chip parpadea entre azul y ámbar para indicar que hay que tocar varias veces.
- **El `+10` de reparar sale de la propia ventana**, como texto flotante en el mundo (pool de 8 textos Phaser con la fuente pixel, que se carga antes de arrancar la escena). Los toques seguidos en la misma ventana se suman en un solo texto (`+20`, `+30`…) en vez de amontonarse. Los puntos por impacto y por baja siguen flotando en el HUD.
- **Joystick o disparo trabados:** cuando se perdía un `pointerup` (la captura del puntero falla o el sistema lo entrega en otro sitio), el control se quedaba activo con el último vector e ignoraba los toques nuevos. Ahora:
  1. las liberaciones se escuchan también a nivel de ventana;
  2. en cada tick se comprueba si el navegador sigue manteniendo la captura que tomamos, y si no, el control se suelta;
  3. un dedo nuevo toma el control solo si el anterior ya no tiene captura (un segundo dedo con el primero aún pulsando se sigue ignorando).
  
  Los botones `ARMA` y `ESPECIAL` aceptan siempre la pulsación, aunque no llegara la liberación anterior.
- **Balas:** trazadora de 5×2 (la spec decía 3×2 ámbar) de naranja a blanco, para distinguirla de la línea de apuntado. Alcance de la pistola de 260 a 340 px y de la SMG de 220 a 300 px, para que pasen de sobra el final de la línea (120 px). El auto-apuntado sigue usando el alcance del arma, así que ahora engancha zombies algo más lejanos.
- **Velocidad:** corriendo pasa a 140 px/s (antes 120) y disparando al 50 % (70 px/s, antes 72). La carrera sube a 14 FPS para acompañar la velocidad.

## Spec 02 · Fase M1 (assets del mapa)

- **Medir y no copiar:** `tiles:import` vuelve a medir en cada ejecución las esquinas de los Wang (colores de las 4 esquinas de cada tile, agrupados en 2 terrenos a partir de los tiles puros de la fila 3) y las piezas de los kits (cajas delimitadoras). Falla si no salen las 16 combinaciones o las 20 piezas de la plantilla.
- **Filas de los kits por solapamiento vertical:** la pieza de suelo empieza 18 px más abajo que sus vecinas; agrupando por el borde superior quedaba en otra fila y se desordenaba la plantilla.
- **Suelos con celdas más pequeñas que la rejilla** (11 de 16 tienen márgenes transparentes): se recorta cada celda a su contenido antes de reducirla de 48 a 32. Rellenar el margen estiraba el borde oscuro del arte y salían franjas negras.
- **`map_special`** (vacío y exterior oscuro) lo genera el importador, porque no hay arte para ello.
- **Rutas de imagen en los `.tsj`:** relativas a `public/assets/tiles/`, para que Tiled las encuentre; `map:build` (Fase M3) las reescribe para el juego.

## Spec 02 · Fase M2 (varios tilesets)

- **Las capas guardan GIDs** (identificadores globales de Tiled, 0 = vacío) en vez de índices locales del único tileset. Los flags por tile (`collides`, `water`, `void`) se precalculan en una tabla indexada por GID, así la rejilla de colisión no necesita saber de qué tileset viene cada tile. Los bits de volteo de Tiled se descartan: no se usan.
- **Agua y vacío** bloquean a jugador y zombies pero dejan pasar balas y visión, igual que una ventana (`BLOCK_BODIES`). Una casilla sin suelo bloquea al jugador como red de seguridad.
- **Paredes y tiles que no miden 32×32** (paredes 3/4 de 32×48, por ejemplo) se pintan como imágenes ancladas abajo a la izquierda de su casilla, con la profundidad de un actor situado en el borde inferior de la casilla. Así el jugador queda detrás de la pared cuando está encima de ella y delante cuando está debajo. Los tiles de 32×32 de suelo y decoración siguen en capas de tilemap.
- **`?map=<clave>`** elige el mapa del manifiesto. Si la clave no existe se avisa por consola y se usa `room01`.

## Spec 02 · Fase M3 (generador, build y validador)

- **Paredes por vecinas:** cada casilla de pared elige pieza según sus vecinas (las puertas y ventanas cuentan como pared para no cortar el trazo):
  - con vecina a izquierda o derecha, cara horizontal (pieza 1);
  - si además baja una barra desde arriba, la cara alta (pieza 12), para que la barra empalme sin hueco;
  - solo vecinas arriba o abajo, barra vertical centrada (pieza 17);
  - sin vecinas, pilar (pieza 6).
- **Las piezas 7, 8, 18 y 19 no son esquinas, son marcos de puerta:** al verlas colocadas, el dintel con su jamba forma un hueco de unos 46 px entre dos piezas. No se usan todavía; quedan para dibujar los marcos de las puertas en Tiled.
- **Suelo oscuro bajo las paredes** (`map_special`, id 1): la colisión ocupa la casilla entera y las barras verticales solo miden 12 px. Con el suelo de la habitación debajo, el jugador se paraba a 10 px de la barra sin entender por qué; con la franja oscura se lee toda la casilla como pared.
- **Una variante de suelo por habitación:** las cuatro variantes de cada material de `floors_interior` son muy distintas (madera oscura, clara, manchada y rojiza) y mezcladas al azar formaban un damero. Cada habitación usa una sola (columna fija en el generador). Se pueden repintar en Tiled.
- **Exterior sin suelo:** fuera de la casa, de la calle y de las islas no hay tiles. El jugador no puede salir de las zonas (sin suelo bloquea al jugador) y los zombies de ventana caminan hacia su ventana sin consultar la rejilla, como en `room01`. No se usa el "exterior oscuro" de `map_special` como suelo, porque es transitable y abriría paso alrededor de la casa.
- **Terrenos Wang a partir de los vértices:** el generador decide el terreno de cada vértice de la rejilla y busca el tile con esas 4 esquinas en el wangset del `.tsj`, así que pinta las mismas transiciones que la brocha de terrenos de Tiled. Agua en los vértices x 25–39, y 8–10: los tiles con 2 o más esquinas de agua quedan en 24–39 × 7–10 salvo las 4 esquinas, que se pisan.
- **Patio:** franja de 2 filas junto a la fachada trasera (filas 13–14) con la transición en la fila 12; el resto del jardín es césped.
- **Coche, estanterías, pilares y chimeneas** se dibujan con piezas de pared de su kit hasta que tengan arte propio.
- **Decals:** 14 en el asfalto y 18 en el césped (fuera de la piscina), en posiciones pseudoaleatorias con semilla fija; el generador es determinista.
- **Ids de portal:** cada extremo es `P1a`/`P1b`… y `pair` apunta al otro. Propiedad nueva `kind` (`stairs`, `ladder`, `hatch`) para el texto del chip.
- **El validador comprueba la alcanzabilidad casilla a casilla** (rejilla de colisión con todas las puertas abiertas y saltos entre los extremos de cada portal), no solo el grafo de zonas: detecta una puerta mal colocada que no conecta. También comprueba que cada puerta toca sus dos zonas y que los portales quedan dentro de la suya.
- **`npm run build` ejecuta antes `assets:check`** (`prebuild`), así un mapa con tilesets externos o que no pasa el validador no llega al build.
- **`room01` no pasa por el validador** (tiene 3 zonas): solo se validan los mapas con fuente en `art-src/tiled/`.

## Spec 02 · Fase M4 (agua, vacío y spawns abiertos)

- **Un solo índice de spawns:** primero los de ventana (`map.zombieSpawns`) y después los abiertos (`map.openSpawns`). `pickSpawn` y `spawnWeight` los tratan igual: peso 0 si su zona está bloqueada y, si no, `1 / (1 + distancia / 256)`. Los abiertos además valen 0 con un jugador vivo a menos de 8 tiles (`WAVES.openSpawnMinDistanceTiles`, en tiles como `directChaseTiles`).
- **`emerging`** dura 0,6 s (`ZOMBIES.emergeTime`): no se mueve ni ataca, cuenta como vivo (recibe balas y bloquea al jugador) y usa la animación `climb` (o `walk` si no hay). Mira hacia el jugador más cercano al aparecer.
- **Zombies de ventana con el exterior accesible:** si su casilla tiene distancia en el flow field (la zona exterior está desbloqueada y conectada con el jugador), pasan a `chasing` en vez de seguir hacia la ventana o arrancar tablones. Con la calle o el jardín bloqueados no cambia nada, porque el flow field no entra en zonas bloqueadas.
- **Agua y vacío** ya bloqueaban cuerpos desde M2; esta fase añade los tests sobre la mansión: las balas cruzan la piscina, el flow field la rodea y el jugador no puede salir de la azotea.

## Spec 02 · Fase M5 (portales)

- **Segundas entradas:** un portal `secondary` solo se puede comprar cuando **sus dos zonas** ya están desbloqueadas, se compre desde el lado que se compre. Así nunca abre nada nuevo: ni la isla ni, desde la isla, el jardín o la calle. Mientras tanto el chip sale atenuado con `BLOQUEADA` y sin precio.
- **Llegada al centro del otro extremo** con `prevX/prevY` igual a la nueva posición (sin interpolar el salto). Ese extremo queda bloqueado para el viajero (`portalLock`) hasta que su centro sale de él, así no rebota.
- **Zombies:** solo los que persiguen usan portales, y solo si alguna casilla del otro extremo tiene menos distancia en el flow field que la suya. Se compara con la casilla más cercana del otro extremo y no con su centro: el centro cae en la casilla más lejana de las dos y el zombie se quedaba atascado en la trampilla.
- **Flow field:** al expandir una casilla de un portal abierto, se visitan las casillas del otro extremo con coste 1. `MapData.cellPortal` guarda el extremo de cada casilla para no buscarlo.
- **Cámara:** el jugador lleva un contador `teleports`; cuando cambia, `GameScene` centra la cámara de golpe en vez de dejar que el lerp cruce el mapa.
- **Placeholder `portal`:** cuatro peldaños vistos desde arriba, oscuros con candado ámbar si está cerrado y claros con bordes ámbar si está abierto. Un sprite por casilla, como las puertas.
- **Chip:** el evento `action:context` lleva `kind: 'portal'`, `portal: 'stairs' | 'hatch'` (escalera y escalera de mano dicen `ABRIR ESCALERA`, la trampilla `ABRIR TRAMPILLA`) y `locked`. Los campos nuevos solo se envían para portales.
- **Evento `portal:opened`** para la vibración de la Fase 9, como `door:opened`.
- **Alcance del chip:** `PORTALS.interactRange` = 48 px, igual que las puertas.

## Mansión por defecto (adelantado de la Fase M7)

- A petición, la mansión pasa a ser el mapa por defecto antes del balance de M7. `?map=room01` sigue cargando el mapa de prueba. Si el manifiesto no tuviera la mansión, se usa `room01`.

## Spec 02 · Fase M7 (balance de la mansión y rendimiento)

- **Costes sin cambios.** Con 10 puntos por impacto y 50 por baja, gastándolo todo en puertas se abre el anillo de habitaciones (4750) hacia la ronda 3–4 y el mapa entero (17 750: puertas 11 750 + portales 6000) hacia la ronda 6–7 con pistola. Es una progresión parecida a la de los mapas de Black Ops 1 y respeta el rango 750–2000 de la spec. Cuando haya otras formas de gastar (armas), se revisará.
- **Pesos de spawn por distancia a pie:** medido con partidas simuladas sin cabeza (jugador quieto e inmortal, ventanas sin tablones, 4 minutos por caso), el peso `1 / (1 + distancia en línea recta / 256)` hacía que, con el mapa abierto, los zombies tardasen de media 25–37 s en llegar (p90 hasta 68 s), porque la cola de spawns lejanos pesa mucho con 23 puntos. Ahora:
  - la distancia es la del flow field (a pie, atravesando puertas y portales), no la línea recta: una ventana al otro lado de una pared ya no cuenta como cercana;
  - un spawn de ventana que está en una zona exterior abierta cuenta desde donde aparece, porque ese zombie persigue directamente (M4);
  - peso `1 / (1 + tiles / 8)` (`WAVES.spawnFalloffTiles`);
  - se descartan los spawns a más de 28 tiles a pie mientras haya alguno más cerca (`WAVES.spawnMaxPathTiles`); si todos están lejos, se usan todos.
- **Resultado** (media de llegada, ronda 1 / ronda 5, y spawns distintos usados):

  | Etapa | Antes | Ahora | Spawns |
  |---|---|---|---|
  | Solo recibidor | 7,8 / 6,4 s | 7,8 / 6,4 s | 2 |
  | Anillo de la casa | 19,7 / 16,7 s | 12,9 / 11,0 s | 5 |
  | Casa + exterior (en la cocina) | 30,6 / 25,1 s | 16,7 / 13,5 s | 3 |
  | Todo abierto, en el jardín | 32,0 / 26,2 s | 9,1 / 7,3 s | 3 |
  | Todo abierto, en la azotea | 37,4 / 30,1 s | 12,4 / 9,9 s | 5 |

  Con un corte de 24 tiles llegaban antes, pero la cocina se quedaba con solo 2 ventanas; con 32 había más variedad, pero el p90 pasaba de 25 s.
- **Consecuencia en la calle:** los spawns abiertos están en los extremos (x 1 y x 70). Con el jugador en el centro de la calle quedan fuera del corte y los zombies llegan por las ventanas de la fachada, cuyos spawns están en la acera. Si se quieren zombies saliendo del asfalto en el centro, hay que añadir spawns abiertos en Tiled.
- **Ritmo de rondas:** las fórmulas de la spec 01 (número de zombies, intervalo, mezcla) no cambian. Con llegadas de 10–17 s, el intervalo de 2 s de la ronda 1 da rondas de unos 25–30 s. El descanso entre rondas y el cartel llegan con la Fase 7 de la spec 01 y se volverán a medir allí.
- **Rendimiento** (MacBook, Chrome; no se ha podido medir en un iPhone 12):
  - simulación sola, con todo abierto, 20 zombies y 30 balas: 0,03 ms por tick de media y 0,3 ms en el peor (incluye el BFS de 5400 casillas, 0,14 ms cada 250 ms);
  - frame completo (simulación + render) con un viewport de móvil en apaisado (canvas de 1688×780) y 711 objetos en escena: 0,1–0,2 ms de CPU de mediana y 2,4–3 ms en el p99 (máximo 3,8 ms);
  - aunque el iPhone fuera 3 veces más lento en CPU, quedaría por debajo de 12 ms en el p99, frente a los 16,7 ms de presupuesto. No hace falta optimizar (ni agrupar las ~520 paredes en una capa). La confirmación final es jugar en el iPhone con `?debug=1` (contador de FPS).

## Mansión rehecha desde un plano ASCII (skill level-design)

- **El plano ASCII sustituye al generador de la spec 02** (`map:mansion` y `scripts/gen-mansion-map.ts` desaparecen). La fuente es `maps/src/mansion.txt` (un carácter por tile, con las tablas de ids debajo) y su programa está en `maps/src/mansion.md`. `map:build` lo compila a `art-src/tiled/mansion.tmj`, lo embebe y lo valida.
- **Parcela de esquina:** a petición, una calle vertical a la izquierda cruza la horizontal. Para que quepa en 100 tiles, la parcela se desplaza 9 tiles y las islas pasan a 16 de ancho. El hueco de valla F3 da ahora a la acera de la calle lateral; la rejilla S2 pasa a la pared sur del sótano. El mapa mide 100×68.
- **Zonas por relleno desde una semilla:** paredes, vallas, puertas de pago, barricadas y vacío cierran cada zona; los huecos `o` unen habitaciones de la misma zona. El compilador cubre cada región con rectángulos (de forma voraz) y el `MapLoader` une los objetos `zone` con el mismo id; una bandera puesta en cualquiera de ellos vale para toda la zona.
- **Transiciones Wang por vértices:** un vértice toma el terreno interior si al menos 2 de sus 4 tiles lo son (calle y patio: la fila de acera junto al asfalto se convierte en bordillo), o los 4 (piscina: el agua no sale de las casillas `w`, así que bloquea lo mismo que dice el plano).
- **Suelo bajo cada marca:** las puertas, huecos, portales y spawns toman el suelo vecino (antes el interior); las vallas, el césped si hay al lado; las paredes de la casa, el suelo oscuro de siempre.
- **Protección de retoques:** el `.tmj` compilado guarda un hash de su contenido (tiles, objetos y propiedades, sin ids ni formato). Si al recompilar no coincide, se ha editado en Tiled: no se pisa sin `--force`. Reformatear el archivo no cuenta como retoque.
- **Tierra provisional:** `map_special` gana un tile de tierra (id 2, ruido marrón determinista) hasta que haya un tileset Wang de tierra; apuntado en `docs/ASSETS-TODO.md`.
- **`map:preview`** pinta las capas como el juego (paredes desde su esquina inferior izquierda, ordenadas por fila) y marca lo que el juego dibuja en tiempo de ejecución (barricadas, puertas, escaleras, spawns y jugador). Las zonas grandes se parten en recortes de hasta 40×28 tiles.

## Decoración de la mansión (skill level-design §4)

- **Sin MCP de PixelLab en la sesión:** el atrezo son placeholders del tamaño de su huella, coloreados por material (madera, tela, metal, electrodomésticos, cartón, vegetación, coches, sangre) según palabras de la clave (`src/game/assets/propColors.ts`, compartido por el juego y la vista previa). Los 61 objetos, con su tamaño y un prompt sugerido, están en `docs/ASSETS-TODO.md`.
- **Arte generado provisional:** `decals_interior` (16 decals de interior hechos con ruido: sangre, arrastres, polvo de yeso claro para que se vea sobre madera oscura, escombros, astillas, grietas, pisadas, papeles) y `map_shadows` (bandas negras semitransparentes de 6 px). De los decals de PixelLab de calle y césped solo se usan las celdas con el borde transparente (menos del 25 % opaco); las demás son texturas cortadas que se verían cuadradas.
- **Variantes de suelo:** principal al 70 % y raras solo si se parecen a la principal (madera oscura con manchada, linóleo con linóleo gastado, hormigón con hormigón). Las raras se agrupan con un ruido suave; repartidas por igual formaban un punteado. El salón (madera rojiza) y el comedor (madera clara) no tienen variante parecida y van con una sola.
- **Densidad:** los decals normales paran en el 20 % de cada zona contando el atrezo; solo el desgaste de las barricadas (escombros, astillas, sangre y el primer arrastre) puede pasar de ahí porque cuenta lo que pasó.
- **Atrezo con colisión** bloquea a jugadores, zombies y balas, pero no la línea de visión. El validador exige más de 2 tiles (Chebyshev) hasta las barricadas, puertas y portales de su misma zona (una pared en medio ya deja el paso libre), que no tape el spawn del jugador, que toda casilla libre junto a un mueble forme parte de algún cuadrado libre de 2×2 (pasos de 2 tiles) y que no deje casillas aisladas.
- **Una clave, un tamaño:** cada objeto de atrezo es un sprite, así que el compilador rechaza la misma clave con dos huellas (un seto de 3 y uno de 4, o un botellero vertical y otro horizontal, son arte distinto). `map:build` ajusta el tamaño de los placeholders a su huella y nunca toca el de un objeto con arte real.
- **Rendimiento:** con 88 objetos de atrezo, 849 decals y 866 sombras hay 1871 objetos en escena; el frame completo cuesta 0,5 ms de mediana y 2,4 ms en el peor caso (antes 0,2 ms) con el viewport de móvil en el Mac.

## Fase 7 · Rondas y flujo de partida

- **Fases de la ronda en el estado** (`wave.phase`: `active`, `rest`, `over`). El primer zombi de cada ronda sale cuando acaba el cartel `RONDA N` (2,5 s), no en cuanto empieza la ronda: así el cartel se lee y hay un respiro. La ronda acaba cuando ya no queda ninguno por salir y no hay vivos; entonces hay 8 s de descanso y empieza la siguiente.
- **El game over lo decide la simulación** (todos los jugadores muertos → `over`, evento `game:over` una sola vez y no salen más zombies). La escena espera 2 s para que se vea la muerte (`HAS MUERTO`) y muestra la pantalla por encima de la partida congelada.
- **"HAS SOBREVIVIDO N RONDAS"** usa la ronda alcanzada, como en Black Ops (morir en la ronda 1 es "1 RONDA"). **Puntos:** todos los ganados en la partida (`score`), también los gastados en puertas; los puntos que quedan en el bolsillo no dicen lo bien que se ha jugado.
- **Escenas:** `Boot → Title → Game`, y `GameOver` se lanza encima de `Game`. Las pantallas (título, pausa, game over) son DOM, como el HUD, y solo llaman a funciones: no conocen Phaser.
- **Pausa:** congela la simulación y las animaciones, suelta los controles (un dedo apoyado no queda pulsado al volver) y al continuar descarta el tiempo pasado en pausa. Se abre con el botón de arriba en el centro, con el botón atrás de Android (que también la cierra) y sola cuando la app pasa a segundo plano: `visibilitychange` en web y `appStateChange` de `@capacitor/app` en iOS y Android. `REINICIAR` empieza una partida nueva.
- **Dependencia nueva: `@capacitor/app`** (plugin oficial de Capacitor, pequeño), necesaria para el botón atrás de Android y el estado de la app, como pide la spec. Hay que ejecutar `npm run cap:sync` para que llegue a los proyectos nativos.
- **Tests de sistemas:** el flujo de rondas está apagado por defecto en los fixtures (`wave.auto = false` y sin espera del cartel), para que los tests de zombies, puertas o balas no cambien de ronda solos. Los tests del `WaveSystem` lo encienden; uno juega de la ronda 1 a la 10 en la mansión matando a cada zombi al aparecer y comprueba que cada ronda saca los de su fórmula.

## Hitbox de las balas y más munición

- **Las balas impactan en el cuerpo tal como se dibuja.** Las balas vuelan y se dibujan a 12 px del suelo (la altura del arma), pero colisionaban con un círculo de 6 px en los pies del zombie. En diagonal, ese desfase de 12 px separaba la línea de colisión unos 8,5 px de la que se ve, más que el alcance (7 px): una bala que atravesaba el costado del sprite no le hacía nada. Ahora cada zombie tiene un cuerpo de 16×24 px de los pies hacia arriba (`ZOMBIES.hurtbox`) y la bala impacta si lo cruza a su altura de vuelo (prueba segmento–caja en cada tick, así no se lo salta aunque vaya rápida).
- **La altura de vuelo pasa a `balance.ts`** (`BULLETS.flightHeight`), porque ahora interviene en las colisiones; `DISPLAY.shotHeight` la toma de ahí.
- **Alto del cuerpo = 2 × altura de vuelo:** así el centro del cuerpo a la altura del arma cae justo en la posición del zombie, que es adonde apunta el auto-apuntado. El cuerpo es algo más alto que el placeholder (14 px) y algo más bajo que el arte real previsto (unos 30 px).
- **Munición:** probabilidad de que un zombie la suelte del 10 % al 22 %, y cada caja da 2 cargadores de cada arma en vez de 1 (16 balas de pistola y 60 de SMG, con el tope de reserva de siempre). Con un 70 % de acierto, el botín sostiene el gasto hasta la ronda 5 y desde la 8 cubre alrededor del 80 %, así que la munición sigue siendo un recurso que vigilar. La vida no cambia (6 %).

## Hitbox del cuadrado del zombie, zonas a oscuras e islas apartadas

- **La causa real del fallo de la hitbox:** la simulación suponía que la bala vuela a 12 px del suelo, pero la vista la dibuja saliendo de la boca del arma del arte, que cambia con la dirección (mirando al este, 23 px por encima de los pies; en diagonal hacia abajo, otra altura). Al disparar en horizontal un poco hacia abajo, la bala dibujada cruzaba al zombie unos 11 px más arriba que la línea con la que se calculaba el choque: se veía el impacto y no hacía daño. La sección anterior lo arreglaba solo para una altura fija.
- **Ahora la simulación conoce las bocas del arte:** la escena le pasa una tabla con el punto de la boca para cada una de las 8 direcciones (`MuzzleTable`, sacada del manifiesto). Sin arte, se calcula con `muzzleDistance` y `BULLETS.flightHeight`. Cada bala guarda su desfase de dibujo (`drawX`/`drawY`). Las paredes se siguen comprobando en el suelo, pero los zombies se comprueban en la línea que se ve.
- **La hitbox es todo el cuadrado del zombie:** 16×28 px desde los pies hacia arriba (`ZOMBIES.hurtbox`), el mismo rectángulo que se dibuja. El placeholder del zombie crece a ese tamaño para que lo que se ve y lo que recibe daño coincidan. Una bala que toca el cuadrado dibujado le hace daño.
- **El auto-apuntado** apunta desde la boca al centro del cuerpo dibujado, en dos pasadas porque la boca depende de la dirección. Si el zombie está casi encima del arma, apunta a sus pies. Un disparo a quemarropa (zombie entre el pecho del jugador y la boca) también impacta, salvo que haya una pared entre ellos.
- **Zonas bloqueadas a oscuras:** cada zona sin desbloquear se tapa con un negro opaco por encima del mapa y por debajo de las balas. La oscuridad cubre su suelo y sus paredes y muebles interiores (tabiques, columnas), así que no se sabe qué hay dentro. Al comprarla, su oscuridad se desvanece en 0,6 s.
- **Bordes también a oscuras:** una pared de borde, puerta, ventana o valla solo se ve si toca (en sus 8 vecinas) una zona desbloqueada. Desde el recibidor se ven sus propias paredes, puertas y ventanas, pero ni un trozo de las paredes del salón, la biblioteca o el comedor que salen de sus esquinas. Una primera versión miraba las zonas a menos de 3 tiles y dejaba ver esos trozos. Esa distancia de 3 tiles (`FOG_EDGE_TILES`) solo se usa ya para las casillas que no tocan ninguna zona (la parcela vecina tras una valla, el centro de un muro grueso). La cara exterior de un muro doble queda a oscuras hasta abrir la zona de fuera.
- **Lo que está a oscuras no asoma:** las paredes miden 1,5 tiles y su parte alta se dibuja en la casilla de encima, así que una pared oculta asomaba por encima de la oscuridad. Ahora los sprites del mapa (paredes, muebles, decals, barricadas, puertas y escaleras) se ocultan mientras su casilla está a oscuras. Al desbloquear, la oscuridad de los bordes también se desvanece en 0,6 s (`DISPLAY.fogFadeMs`), como la de la zona.
- **Niveles y cámara:** las zonas unidas por puertas forman un nivel (planta baja, sótano y azotea); las escaleras y la trampilla llevan a otro nivel. La cámara no sale nunca del nivel donde está el jugador. Si el nivel es más pequeño que la pantalla, queda centrado con vacío alrededor. Al cruzar un portal, la cámara salta al nuevo nivel en el mismo frame.
- **Islas más lejos:** el sótano y la azotea se mueven 8 tiles a la derecha y el mapa pasa a 108×68. La calle y lo que hay debajo de las islas acaban en la columna 81, para que la planta baja no se acerque a ellas. El validador sube el máximo a 120×70. Con la cámara limitada a cada nivel no hace falta más distancia: desde una isla no se ve nada del resto del mapa, por mucho que te pegues a sus paredes.

## Suelo junto a las paredes y zombies en la oscuridad

- **Por qué las paredes verticales parecían tener sombra a los dos lados:** en los cuatro kits, una pared vertical es una franja de 12 px en el centro de su casilla (x 10..21). Debajo de todas las paredes iba el «suelo oscuro» de `map_special`, que asomaba 10 px a cada lado de la franja. A eso se sumaba la banda de sombra de la casilla de la derecha. Las paredes horizontales tenían lo mismo por arriba: su cara ocupa los 25 px de abajo, así que asomaba una franja oscura de 7 px encima.
- **Ahora cada lado muestra su suelo:** bajo una pared vertical, la capa `floor` lleva el suelo de la izquierda entero y la capa `decor`, la mitad derecha del suelo de la derecha. Las mitades vienen del tileset `floor_halves`, que genera `tiles:import`: la mitad derecha de cada suelo interior, de las baldosas lisas de cada terreno y de los tiles especiales. Así no hace falta un tileset por mapa y Tiled lo enseña igual que el juego. Bajo una pared horizontal va el suelo del norte. Nunca se pone agua ni vacío bajo una pared, porque cambiarían lo que es la casilla. Se usa el suelo «liso» de cada lado: la variante principal de la zona o el tile sin transición del terreno.
- **Sombra por un solo lado:** la luz viene de arriba a la izquierda, así que una pared vertical sombrea solo el suelo a la derecha de su franja, dentro de su propia casilla (nuevo tile `wallV` de `map_shadows`). Ya no proyecta la banda en la casilla de al lado, que quedaba separada de la pared. Las horizontales siguen sombreando la casilla de abajo.
- **Capa `decor` entre el suelo y las sombras** (`DEPTH.floorDetail`), para que la sombra caiga también sobre la media baldosa. Hasta ahora estaba vacía.
- **Zombies en la oscuridad:** no se dibujan mientras pisan una casilla a oscuras (aparecen y desaparecen en 150 ms). Se ven mientras están en una ventana, rompiendo tablones o trepando, y entonces se dibujan por encima de la oscuridad (`DEPTH.actorsOverFog`, aún ordenados por altura y por debajo de las balas), porque el jugador tiene que ver qué rompe la barricada. Antes la niebla tapaba casi todo su cuerpo y solo asomaba la cabeza por encima de la pared. Un zombie que muere conserva lo que tenía, así que su animación de muerte en la ventana se ve. Los zombies solo van a ventanas de zonas desbloqueadas, y esas ventanas siempre se ven.

## Importación de kits, Wang y suelos rehecha

- **Kits sin rejilla.** Las piezas se extraen por componentes conexos del canal alfa; los cuatro kits comparten una plantilla de 20 piezas, clasificada mirando las hojas de contactos (`npm run tiles:review`, nuevo) y comprobada en cada importación por número y tamaño. La clasificación está en `docs/ASSETS.md` §7.2.
- **Autotile de paredes de 16 casos** (máscara N/E/S/O) en tiles de 32×32, con las reglas de la 3/4. Una pared horizontal muestra su cara al sur; las demás, solo el borde superior. El espejo horizontal está siempre permitido, y rotar o voltear en vertical solo en partes sin cara.
- **Lo que no se usa del kit:** las esquinas de PixelLab dibujan la pata vertical como cara, así que no se usan; las uniones en T, el cruce y las esquinas se componen.
- **Ya no hay paredes de 1,5 tiles:** las paredes caben en su casilla y no asoman sobre la de arriba.
- **Muros gruesos: 4 tiles más.** Toda pared dentro de un cuadrado de 2×2 paredes usa un tile macizo (borde superior ancho de la pieza #11 y cara solo al sur). Con solo 16 casos, la chimenea y la columna del salón, el muro doble de la fachada, el cobertizo y las chimeneas de la azotea salían como una escalera de bandas.
- **Wang sin suponer el orden.** Los dos terrenos puros son los dos tiles de colores medios más lejanos, y cada esquina se compara con ellos. Se afina con 2-medias porque la tierra del bordillo está casi a la misma distancia del asfalto que de la acera. Los terrenos se nombran por color.
- **Terreno por vértices.** Mapa de (ancho+1)×(alto+1) vértices; cada tile se elige por sus 4 esquinas. Pares con transición: acera↔asfalto, cubierta↔agua y patio↔césped; además acera↔césped y cubierta↔césped con el tileset del jardín, la acera y la cubierta haciendo de patio. Cualquier otro par hace fallar a `map:build` con el par y el vértice. El umbral de cada par es una proporción de las casillas de terreno del vértice, para que valga igual en el borde del mapa.
- **Plano de la mansión** (decidido con el usuario):
  - la terraza de patio que llevaba a la piscina pasa a ser cubierta;
  - el porche, el camino de entrada y el de coches pasan a ser acera, porque patio↔acera y cubierta↔patio no tienen tileset;
  - el patio queda para el jardín trasero.
- **No existe `tileset_asphalt_grass`:** no hay bordes de calzada rota.
- **Suelos sin cuadrícula.** El export de suelos no es una rejilla regular, y el corte a paso fijo metía en cada baldosa el contorno oscuro de la celda. Ahora cada celda se detecta como pieza, se recorta su contorno y se escala su mayor cuadrado centrado. Completar con espejo las celdas cortas dejaba simetrías repetidas.
- **Variantes por material, no por zona** (decidido con el usuario):
  - cada suelo usa su variante limpia al 70 % y las manchadas como raras, repartidas por igual y nunca dos iguales juntas, tampoco en diagonal;
  - las rayadas no se usan; toda la madera pasa a ser la clara;
  - la columna `suelo` de la tabla de zonas desaparece;
  - las raras ya no se agrupan con ruido: en las manchas densas caían una sí y otra no, y formaban un tablero.
- **Volteos de suelo guardados en el tileset** (64 tiles). Cada baldosa va en un volteo al azar para que ninguna marca se repita en cuadrícula. Phaser 4 dibuja en negro los tiles de una capa con `flipX`/`flipY`, así que los volteos se guardan en el tileset y no se hacen en tiempo de ejecución.

## Paredes unidas: un borde superior para toda la casa

- **El problema:** cada pared tenía un solo kit, yeso (`#`) o lamas de fachada (`H`). Donde un tabique tocaba la fachada (el aseo del recibidor, las esquinas de cada habitación), la casilla de unión dibujaba con su kit el tramo hacia el tabique. El tabique cambiaba de material a mitad de franja y parecía que entre las dos paredes quedaba un hueco.
- **Primer intento descartado:** repintar en cada unión los brazos con el kit de la pared vecina. No bastaba, porque un tramo recto también cambia de material cuando la fachada pasa de mirar afuera a mirar hacia una habitación, y ahí no hay unión.
- **La solución, en 3/4:**
  - el borde superior de todas las paredes de la casa es de yeso;
  - la cara (el lado sur) muestra el material del lado al que mira: lamas si da afuera, yeso si da a una habitación. Va en la capa nueva `wall_faces`, con tiles de solo cara;
  - por eso las paredes norte de las habitaciones, que son de fachada, ya no enseñan lamas por dentro.
- **Valla contra la casa:** sus bordes superiores son distintos. Los brazos de la casa hacia la valla se repiten con el kit de la valla en la capa `wall_joins`, y manda el kit de menos rango (valla < yeso < fachada). En la mansión hay 2 uniones así.

## Recarga, botón de recargar y zombies que rompen barricadas

- **Ráfaga al terminar de recargar.** El enfriamiento del disparo guardaba el resto de cada tick mientras se mantenía el gatillo, para que la cadencia media fuera exacta. Pero seguía bajando sin límite mientras no se podía disparar (recarga, cambio de arma), y al acabar la recarga salía una bala por tick hasta ponerse al día. Ahora ese resto nunca pasa de un tick: nunca hay más de un disparo por tick ni disparos atrasados.
- **Botón de recargar** justo encima del botón de disparo (a 124 px de su centro), con el texto «RECARGAR» y un icono de anillo con flecha.
  - Recarga si al cargador le falta munición y queda reserva; si no, se ve atenuado.
  - Mientras recarga, un velo se vacía con el progreso.
  - En el ordenador, la tecla R hace lo mismo.
  - El botón especial se desplaza a la izquierda para dejarle sitio: queda a (−84, −106) del centro del de disparo.
  - Es un comando `reload` del `InputCommand` (regla 2).
- **Zombies que rompen lo que se les pone delante.** El campo de flujo pasa de BFS a Dijkstra, y una ventana con barricada es un paso más con su coste: 1 casilla, más 0,5 por tablón y 1 por trepar. Una ventana entera cuesta 5 casillas de camino (`NAVIGATION` en `balance.ts`).
  - **Persiguiendo:** si el siguiente paso del campo es una ventana, el zombie va a ella, rompe los tablones y trepa. Si el jugador está fuera, lo hace de dentro afuera.
  - **Yendo a su ventana:** el zombie que sale de un spawn sigue con ella aunque la calle o el jardín estén abiertos, salvo que el campo conozca un camino al menos 2 casillas más corto (por ejemplo, el jugador ha salido a por él). Antes pasaba a perseguir en cuanto el campo lo alcanzaba y daba el rodeo largo por las puertas abiertas.
  - **Puertas de pago:** siguen siendo un muro para los zombies.

## Daño por unidades y zombies que se arrastran

- **La vida de los zombies se cuenta en unidades de daño.** Una bala de pistola hace 1 y una de metralleta 0,5. Un zombie aguanta 3 en las rondas 1 y 2, y uno más cada 2 rondas: 4 en las rondas 3–4, 5 en las 5–6… (12 en la ronda 20). Sustituye a la fórmula anterior (50 + 25 por ronda hasta la 9, luego ×1,1), que desde la ronda 10 crecía mucho más deprisa.
- **Cuchillo (cuando no queda munición):** 3 unidades, para que siga matando de un golpe a los zombies de las rondas 1–2, como antes, que hacía 50 contra 50 de vida.
- **Arrastre:** con 1 unidad de vida o menos, un zombie se mueve al 45 % de su velocidad (`ZOMBIES.crawlAtHp` y `crawlSpeedFactor`). Su animación de andar se ralentiza igual, para que no patine. Romper tablones, trepar y atacar no cambian. Más adelante se verá como un zombie sin piernas.
- **Ejemplos en la ronda 1:** con la pistola, el zombie se arrastra tras el segundo disparo y muere con el tercero. Con la metralleta, se arrastra tras la cuarta bala y muere con la sexta.
- **Puntos:** cada impacto sigue dando 10 puntos. Con la metralleta se hacen más impactos por zombie (6 en vez de 4), así que da algo más de puntos por baja.
- **Cambio posterior (pedido por el usuario):** la vida sube 1 unidad cada ronda, no cada 2: 3 en la ronda 1, 4 en la 2, 5 en la 3… (22 en la ronda 20). El cuchillo, con 3, mata de un golpe solo en la ronda 1.

## Cuchillo con botón propio

- **El cuchillo** (`MELEE`) tiene ahora botón propio, «CUCHILLO», a la izquierda del de cambiar arma: a (−176, 0) del centro del de disparo. En el ordenador va con la tecla V. Se puede usar en cualquier momento, aunque haya munición e incluso recargando, y es un comando `melee` del `InputCommand`. El botón de disparo sigue usando el cuchillo cuando todas las armas están vacías.
- **Hacia dónde golpea:**
  - Desde el botón, el jugador se gira hacia el zombie más cercano a su alcance (20 px del borde de su cuerpo), en cualquier dirección, como el autoapuntado. Si no hay ninguno, da el tajo hacia donde mira.
  - Desde el botón de disparo sin munición sigue golpeando en un cono de ±60° hacia donde apunta.
  - Una pulsación durante la pausa de 0,6 s entre golpes se ignora.
- **Animación provisional:** durante 0,25 s (`MELEE.swingTime`) se dibuja delante del jugador un tajo en arco, girado hacia el golpe (`melee_slash`, placeholder generado de 4 fotogramas). Mientras dura, el jugador sigue mirando hacia el tajo aunque se mueva.
- **Animación final:** cuando llegue, entra como animación `melee` del jugador en el manifiesto. El importador normaliza «Knife», «Stab», «Slash» o «Melee» a `melee`. Si existe, el personaje la reproduce en cada cuchillada, desde el principio, y el tajo provisional deja de dibujarse sin tocar el código.

## HUD al estilo Wild Rift y sin zoom

- **Zoom bloqueado.** La meta del viewport (`user-scalable=no`) y el `touch-action: none` de la página no bastan en Safari de iOS, que seguía ampliando al pellizcar y al tocar muy rápido (machacar el botón del cuchillo ampliaba la vista sin poder volver). `src/ui/noZoom.ts` cancela:
  - los gestos de pellizco de Safari;
  - los movimientos táctiles con dos dedos;
  - el segundo toque en menos de 350 ms;
  - el doble clic.
  Los controles leen eventos de puntero, que llegan antes que esos eventos táctiles, así que no les afecta.
- **Botones más pequeños**, como en Wild Rift:
  - el de disparo pasa de 112 a 96 px;
  - los botones de acción, de 64 a 48 px y solo con icono;
  - el recorrido del pomo de apuntar baja a 28 px.
- **Junto al disparo**, solo recargar (justo encima) y cuchillo (a su izquierda).
- **Cambio de arma:** desaparece el botón. Las armas se eligen en una barra inferior, centrada al 55 % del ancho como los hechizos de invocador de Wild Rift, con un botón por arma (como máximo `LOADOUT.maxWeapons`, 3). Cada uno lleva su icono y las balas de su cargador, y se resalta el activo. Tocarlo envía el comando `selectWeapon` con el índice del hueco, y el cambio tarda lo de siempre. En el ordenador valen 1, 2 y 3, y Q sigue pasando a la siguiente.
- **Especial (esquivar):** como al lado del disparo solo caben recargar y cuchillo, va al final de esa barra inferior, como el Destello de Wild Rift, con su cuenta atrás.
- **Acción contextual:** el chip de abajo («REPARAR +10», «ABRIR PUERTA 750») pasa a ser un botón redondo en el borde derecho, encima de recargar. Lleva un martillo para reparar, y una puerta o una escalera para comprar. Debajo, en una etiqueta, los puntos por tablón, el coste o lo que falta (en rojo, con «−»). Sigue parpadeando al reparar y temblando si no se puede.
- **Iconos provisionales en píxeles:** pistola, fusil automático (para la SMG), martillo, puerta, escalera, recarga y cuchillo (`src/ui/icons.ts`). Los finales llegarán más adelante.
- **Cambio posterior:** el fusil automático (la SMG) también hace 1 unidad por bala, como la pistola: 3 balas para un zombie de la ronda 1. Se diferencian en la cadencia y el cargador.
- **Velo de los botones redondos** (cuenta atrás del especial, progreso de la recarga): era un círculo que se aplastaba hacia abajo y dejaba ver el truco, porque al rehacer el CSS los botones perdieron el recorte. Ahora el velo es un rectángulo dentro de un contenedor recortado al círculo interior del aro (`overflow: hidden` y además `clip-path`, porque WebKit no siempre recorta a los hijos escalados). Baja como un nivel dentro del icono y el aro queda siempre visible.

## Fase 8 · HUD completo (al estilo Wild Rift)

- **La referencia del HUD pasa a ser Wild Rift**, por decisión del usuario. La spec 01 (§2.3, §2.4, §5 y el criterio de la Fase 8) ya describe esa disposición, en lugar del mockup A.
- **Debug completo** (§8):
  - además de FPS, zombies, balas, ronda y tick, el panel tiene botones para pasar a la ronda siguiente (vacía el mapa y empieza la siguiente al momento), sumar +1000 puntos y activar el modo dios (`PlayerState.godMode`: los zombies no le hacen daño);
  - interruptores para dibujar las hitboxes (círculos del jugador y de los zombies, el cuerpo dibujado que reciben las balas, las balas) y el flow field (una flecha por casilla visible hacia su siguiente paso, y en ámbar las ventanas por las que pasa el camino);
  - las acciones actúan directamente sobre el estado: son herramientas, no jugabilidad;
  - el panel se mueve bajo el bloque de arriba a la izquierda para no tapar el botón de pausa.
- **Filas reservadas:** una fila vacía bajo cada bloque superior, para estadísticas y ventajas futuras.
- **Sin solapes en las tres pantallas de la spec**, comprobado midiendo los rectángulos del HUD en 844×390 (iPhone con Dynamic Island), 800×360 (Android 20:9) y 640×360 (Android 16:9 a 720p), con el botón de acción visible y tres textos «+N»:
  - los «+N» pasan a la izquierda de los puntos, porque bajo el arma alargaban la columna derecha hasta el botón de acción;
  - el botón de acción baja a 52 px y se coloca para caber entre esa columna y el botón de recargar desde 360 px de alto;
  - recargar queda a (0, −78) del disparo.

## Fase 9 · Pulido nativo

- **Sin `@capacitor/status-bar`.** Capacitor 8 trae `SystemBars` en el núcleo: con `SystemBars: { hidden: true }` en `capacitor.config.ts` oculta desde el arranque la barra de estado y el indicador de inicio en iOS, y las barras del sistema en Android. Se ahorra una dependencia (regla 8).
  - El indicador de inicio no se puede ocultar desde nuestro `ViewController`: Capacitor ya sobrescribe `prefersHomeIndicatorAutoHidden` en una extensión pública (no `open`) de `CAPBridgeViewController`, y lo controla con `SystemBars`.
- **iOS:**
  - `Info.plist`: `UIRequiresFullScreen`, `UIStatusBarHidden` a `true` y `UIViewControllerBasedStatusBarAppearance` a `false`, como pide la spec.
  - `ViewController.swift` (subclase de `CAPBridgeViewController`, registrada en `Main.storyboard`): gestos del sistema diferidos en todos los bordes y `isIdleTimerDisabled`.
- **Android, en `MainActivity`:**
  - `FLAG_KEEP_SCREEN_ON`;
  - recortes en `shortEdges`;
  - modo inmersivo con `WindowInsetsControllerCompat` y barras transitorias al deslizar, aplicado otra vez al recuperar el foco (diálogos, teclado, multitarea).
- **Pantalla encendida durante toda la app, no solo la partida.** Es un juego que se usa en primer plano, y así no hace falta un plugin keep-awake ni avisar de cada cambio de escena. El sistema la deja apagarse al ir a segundo plano.
- **Vibración** (`src/native/haptics.ts`):
  - escucha el EventBus como el HUD: ligera al recibir daño y media al comprar una puerta o un portal (spec 01 §4.2 y §4.7), solo para el jugador local;
  - la muerte no vibra aparte: ya vibra el golpe que la causa;
  - en el navegador usa `navigator.vibrate` donde existe (Chrome en Android); en Safari y en escritorio no hace nada.
- **Preferencias** (`src/native/preferences.ts`): `localStorage` dentro de try/catch. Si falla, se usan los valores por defecto (vibración activada) y el cambio dura solo esa sesión. El interruptor está en el menú de pausa (`VIBRACIÓN: SÍ/NO`).
- **Foco de los menús:** el botón principal solo se enfoca solo cuando hay ratón (`hover: hover` y `pointer: fine`). En iOS, el foco automático dibujaba el aro azul de WebKit alrededor de JUGAR. Con teclado, el foco se ve con un contorno ámbar.
- **Comprobado** en el simulador del iPhone 17 Pro (iOS 26.5): horizontal, sin barra de estado, indicador de inicio oculto y HUD dentro de las safe areas (la Dynamic Island queda fuera del margen). **Falta Android:** este Mac no tiene Java ni el SDK de Android. Para compilarlo:
  1. instalar Android Studio;
  2. `npm run cap:sync`;
  3. `npm run cap:android`;
  4. Run sobre un dispositivo conectado.

## Spec 03 · Fase M1 (magos: puntos, aparición y teletransporte)

- **Puntos de aparición (`merchant_spot`):**
  - en la mansión van en una tabla `## Magos` del plano, sin carácter propio: la casilla conserva su suelo, como el atrezo. Hay 2 por zona (20 en total), revisados en las vistas previas;
  - room01 tiene 5, en rincones;
  - el validador comprueba todas las reglas de la spec. La distancia de más de 3 tiles se mide en línea recta entre centros, también al spawn del jugador, para que el mago nunca aparezca encima de él al empezar. «Pegado a una pared» quiere decir una casilla vecina de la capa `walls`; las chimeneas de la azotea cuentan.
- **Configuración en `src/config/merchants.ts`** (color, `enabled`, `firstRound`, catálogo con precios y `maxPurchasesPerVisit`), con las reglas comunes en `MERCHANT` de `balance.ts`.
  - El rojo y el dorado no tienen todavía regla de aparición: `firstRound: 2` es provisional y solo importará cuando el debug los active (M4).
  - El azul nuevo es el token `merchantBlue` de `theme.ts`.
- **Elección del sitio:** con varias opciones, se sortea entre todos los puntos candidatos con el RNG de la partida (las zonas con 2 puntos pesan el doble). Orden de preferencia:
  1. la primera vez, un punto de la zona del spawn del jugador;
  2. otra zona desbloqueada sin otro mago;
  3. otro punto de su propia zona;
  4. otra zona aunque haya otro mago;
  5. quedarse donde está. En este caso no hay humo ni aviso.

  Así «dos magos nunca comparten zona si hay alternativa» tiene prioridad sobre cambiar de zona.
- **Cuándo se mueve:** en el mismo tick en que empieza la ronda (`WaveSystem` y después `updateMerchants`), así que se mueve con el cartel de ronda. Con `?round=N` aparece desde el principio en la zona inicial.
- **Primera aparición:** solo humo, sin aviso. El aviso «EL MAGO AZUL SE HA MOVIDO» sale en los teletransportes, bajo el cartel de ronda, que se ve a la vez, y en el color del mago.
- **Cuerpo:** sólido para los jugadores, incluso con el dash, que sí atraviesa zombies. Si aparece encima del jugador, lo empuja hacia un lado libre. Los zombies lo atraviesan: ni lo atacan ni lo esquivan, y no cambia el flow field.
- **Humo:** en el punto de llegada y en el de salida, durante 300 ms. Se mide en ticks del estado, así que se congela con la pausa.
- **Flecha fuera de pantalla** (dibujada en Phaser, en coordenadas del mundo):
  - va en el borde visible menos las safe areas del HUD (`--pad-x`, `--pad-top`, `--pad-bottom`, medidas en CSS px) más 6 px;
  - no se muestra si el mago está en otro nivel (sótano o azotea): esos niveles están en otra parte del mapa y la flecha apuntaría a un sitio que no lleva a ellos;
  - se desactiva con `MERCHANT.offscreenIndicator`.
- **Debug:** los círculos de colisión de los magos se dibujan con HITBOX. Los botones de la spec 03 §7 llegan en M4. Para ver el teletransporte basta con RONDA +1.

## Spec 03 · Fase M2 (tienda y munición máxima)

- **Tienda en el estado:** `PlayerState.shopMerchant` es el mago con la tienda abierta. El botón de acción la abre y la cierra. La compra es un comando (`InputCommand.shopBuy`, con el índice del artículo) y el sistema la valida como lo haría un servidor: tienda abierta, a menos de 64 px, puntos, que el artículo sirva y el límite por visita. La X envía `shopClose`.
- **Cierre automático:** al alejarse más de 64 px, al morir o si el mago desaparece. Al teletransportarse siempre queda lejos, así que también se cierra.
- **Estados del botón,** en este orden: `limit` (VUELVE EN OTRA RONDA), `unavailable` (el motivo), `short` (FALTAN X) y `buy`.
  - Si no hay puntos y además no sirve, se muestra el motivo, que informa más.
  - Con FALTAN X el botón tiembla y no se envía nada.
- **Límite por visita:** se cuenta por mago y por jugador (`MerchantState.visitPurchases`) y se reinicia cada vez que el mago se mueve.
- **Artículos de fases posteriores:** la mejora de la ronda (M3) y las mejoras de arma (M4) están en el catálogo pero no salen en el panel hasta que exista su efecto (estado `hidden`). En M2 el mago azul muestra solo la munición máxima.
- **Munición máxima:** llena cargador y reserva de todas las armas y cancela una recarga en curso, porque ya no queda nada que recargar.
  - Las capacidades salen de `weaponStats.ts` (`magazineSize`, `maxReserve`), que también usan la recarga y el botín de munición. Así el nivel 1 de M4 solo tendrá que cambiar ese archivo.
- **«-750» en rojo** en la misma pila que los «+N», a la izquierda de los puntos (desde la Fase 8 van ahí y no debajo).
- **Vibración media** al comprar (`merchant:purchase`).
- **Botón de acción junto al mago:** sombrero de mago provisional en su color, con el nombre («MAGO AZUL») en la etiqueta.
- **Posición del panel:**
  - centrado, justo debajo de los bloques superiores del HUD (`--pad-top` + 92 px), sin tapar la vida, la ronda, los puntos ni el arma;
  - 380 px de ancho como máximo; en pantallas estrechas mide el hueco entre el joystick y el disparo (`100% − 2·pad-x − 300 px`, mínimo 280 px);
  - comprobado sin solapes con el joystick, el disparo, recargar, el cuchillo, la barra de armas, el botón de acción y la pausa en 844×390, 800×360 y 640×360, también con dos filas;
  - a 640×360 con dos filas roza el cuchillo por 2 px; se ajustará en M3, cuando haya dos filas de verdad;
  - el panel tapa la parte alta de la zona en la que se puede empezar a mover el joystick (el 40 % izquierdo de la pantalla), pero no el joystick dibujado. Con el panel abierto, el joystick y el disparo siguen funcionando (comprobado con dos dedos simulados).

## Spec 03 · Fase M3 (mejoras temporales)

- **Botón de la mejora:** está en el arco alrededor del disparo, como una habilidad de Wild Rift: arriba a la izquierda del disparo, a (−60, −100), entre el cuchillo y recargar.
  - La spec lo ponía en el borde derecho, entre el bloque superior derecho y el botón especial. Con el HUD de Wild Rift el especial está en la barra inferior, y en el borde derecho, entre los puntos y el botón de acción, no caben 56 px.
  - Spec 03 §5 actualizada.
  - Comprobado sin solapes en 844×390, 800×360 y 640×360, también con el panel de la tienda y el botón de acción a la vista.
- **Ranura:**
  - `PlayerState.boostStored` guarda la mejora; al activarla pasa a `boostActive`, con `boostTimer` contando desde 10 s.
  - La cuenta atrás se descuenta en el paso fijo, así que la pausa (que no avanza ticks) la congela.
  - Comprar otra mejora la pone en la ranura y termina la que estuviera en marcha.
  - Se pierden las dos al morir.
  - Activar es un comando (`InputCommand.boost`); en teclado, la B.
- **Sorteo:**
  - el mago sortea su «mejora de la ronda» cada vez que aparece o se teletransporta (`MerchantState.boost`), con el RNG de la partida;
  - la fila de la tienda muestra cuál toca, con su icono (rayo o «x2») y descripción;
  - siempre se puede comprar: aunque tengas otra, sustituirla es una decisión del jugador.
- **Efectos:**
  - la velocidad multiplica solo la marcha, no el dash;
  - el doble daño multiplica el daño de cada bala al dispararla y el del cuchillo (`damageFactor`), así que se acumulará con el nivel 3 de M4.
- **Señales:**
  - estela de 4 siluetas ámbar (el color del rayo) con el último fotograma del jugador cada 45 ms; solo se ve al moverse;
  - balas en azul claro (`boostDamage`, `#8ec9ff`), en modo de tinte de relleno: el trazo naranja y blanco multiplicado por azul quedaba turbio;
  - las balas guardan si se dispararon con el doble daño, así que no cambian de color si la mejora termina con ellas en el aire.
- **Anillo de la cuenta atrás:** un círculo SVG que se vacía en el sentido de las agujas del reloj desde arriba, con los segundos en el centro. El presentador lo cuantiza en 64 pasos para tocar poco el DOM.

## HUD: dash junto a recargar, armas en columna y toques con margen

Petición del usuario tras probar M3 en el móvil.

- **Mejora guardada entre rondas:** el usuario vio que la mejora comprada se perdía al cambiar de ronda.
  - No lo he podido reproducir. El estado la conserva con el flujo real (fin de ronda, descanso y ronda siguiente) y el botón sigue visible. Lo cubre un test nuevo con `wave.auto` activado.
  - Lo más probable es que se activara con un toque sin querer: estaba en el camino del pulgar, dura 10 s y desaparece.
  - Al activarla ahora sale un aviso («¡VELOCIDAD!» en ámbar, «¡DOBLE DAÑO!» en azul claro) y una vibración ligera, así que una activación accidental ya no pasa desapercibida.
- **Arco del disparo** (centros respecto al del disparo): cuchillo (−88, −4), mejora (−64, −60), recargar (−12, −86) y dash (+40, −78).
  - El dash queda a la derecha de recargar. Su borde derecho entra 4 px en el margen de seguridad, así que sigue a 20 px o más del borde físico.
  - La barra inferior desaparece.
- **Armas en columna:** vertical arriba a la derecha, 3 huecos de 44 px con 8 px de separación.
  - En pantallas de 360 px de alto no caben entre el bloque de puntos y el arco, así que el bloque de puntos y arma (y el botón de acción) se desplazan 56 px a la izquierda.
  - La columna ocupa la esquina superior derecha.
- **Botón de acción:** a la izquierda de la columna, encima de recargar.
- **Toques con margen de error:** un `::before` invisible más grande en cada botón redondo, el disparo, el botón de acción y la pausa, y uno más pequeño en COMPRAR y en la X de la tienda.
  - Medidas: 10 px por defecto, 14 px el disparo y 6 px entre armas.
  - Donde dos zonas se tocan gana el botón que está encima (el orden del DOM), así que el disparo no roba toques a los botones del arco.
- **Tienda en pantallas estrechas** (≤ 700 px de ancho): filas más apretadas (letra de 7–8 px, botón de 80 px) y el panel baja a `pad-top + 96` px. Con dos filas no toca el cuchillo ni el bloque de puntos.
- **Comprobado** midiendo círculos (botones redondos) y rectángulos (paneles) en 844×390, 800×360 y 640×360, con la tienda abierta, el botón de acción, la mejora guardada y 3 huecos de arma a la vista: sin solapes y con al menos 4 px de hueco entre botones.

## HUD: botones más pequeños y fila inferior

Petición del usuario.

- **Más pequeños,** todos menos el joystick (sin cambios) y el disparo (96 px):
  - recargar, cuchillo y dash: 40 px (antes 48);
  - armas: 38 (antes 44);
  - botón de acción: 44 (antes 52);
  - mejora: 46 (antes 56);
  - pausa: 38 (antes 44);
  - los iconos bajan en proporción;
  - el margen de toque pasa de 10 a 12 px para compensar.
- **Arco del disparo** (centros respecto al del disparo): cuchillo (−80, −4), recargar (−14, −80) y dash (+34, −72). Más compacto, y el dash ya no entra en el margen de seguridad.
- **Fila inferior,** centrada al 55 % del ancho, donde estaba la barra de armas:
  - la mejora a la izquierda y el botón de acción a la derecha, más cerca del pulgar derecho;
  - posiciones fijas: con un contenedor flexible, la mejora saltaría de sitio cada vez que aparece o desaparece el botón de acción (al acercarse a una ventana, puerta o mago);
  - la etiqueta del botón de acción va encima, porque debajo quedaría pegada al borde.
- **Comprobado** en 844×390, 800×360 y 640×360 con la tienda abierta, la mejora, el botón de acción y 3 armas a la vista: sin solapes y al menos 6 px entre botones.

## HUD: armas bajo los puntos, total de puntos y arma a la izquierda

Petición del usuario.

- **Arriba a la derecha:**
  - `PUNTOS`, debajo `TOTAL` con todos los puntos ganados en la partida (`PlayerState.score`, el mismo dato de la pantalla final; `points:changed` lleva ahora también `score`);
  - justo debajo, pegada al borde derecho, la columna de armas: 38 px por hueco y 4 px entre ellos, que deja hueco al dash en pantallas de 360 px de alto;
  - el bloque de puntos vuelve al borde.
- **Arriba a la izquierda,** bajo la ronda: el arma en mano con su cargador, su reserva y la barra de recarga.
  - La fila reservada para futuras estadísticas queda solo a la izquierda; bajo los puntos ya está la columna de armas.
- **Dash:** baja a (+40, −66) del centro del disparo, para quedar a 8 px de la tercera arma a 640×360.
- **Panel de debug:** solo sus botones reciben toques. Su fondo tapaba la zona del joystick en pantallas bajas y no se podía empezar a mover desde ahí.
- **Comprobado** en 844×390, 800×360 y 640×360 con la tienda abierta, la mejora, el botón de acción y 3 armas: sin solapes, midiendo el contenido de los bloques del HUD y los círculos de los botones.

## HUD: botones aún más pequeños

Petición del usuario: todo menos el joystick y el disparo, que siguen igual.

- **Tamaños:** recargar, cuchillo y dash 34 px; armas 32; botón de acción 38; mejora 40; pausa 32. Los iconos bajan en proporción (16–19 px).
- **Margen de toque:** 14 px por defecto (también en la pausa) y 4 px entre armas, para que la zona que responde siga cerca de 60 px aunque el botón dibujado sea pequeño.
- **Arco recolocado** para los 34 px: cuchillo (−76, −4), recargar (−14, −76) y dash (+38, −66).
- **Comprobado** en las tres pantallas con todo a la vista: sin solapes. Un toque 12 px fuera del cuchillo sigue cayendo en el cuchillo.
- **Limitación:** por debajo de unos 30 px de diámetro, los iconos de 12×12 píxeles ya no se pueden reducir sin perder la rejilla de píxeles (habría que dibujarlos a 8×8).

## Balas y paredes: colisión con la forma dibujada

Bug del usuario: al disparar rozando la esquina de una pared, la bala desaparecía sin tocarla.

- **Causa:** cada casilla de pared paraba las balas entera (32×32), pero las paredes finas del kit en 3/4 solo dibujan una franja de 12 px (verticales) o la banda y la cara desde y = 7 (horizontales). En los extremos y las esquinas, las balas chocaban con el suelo vacío de la casilla.
- **Solución:** las balas y la línea de visión del autoapuntado usan la silueta que dibuja el autotile (`CollisionGrid.shapes`, leída de la propiedad `mask` de los tiles del kit):
  - pared fina: franja central (x 10–21) desde arriba si la pared sigue al norte, si no desde la banda (y 7), hasta abajo, más los brazos este y oeste desde la banda;
  - muro grueso: la casilla entera, desde la banda si el norte está abierto;
  - puertas, muebles, las paredes sin kit (room01) y el exterior del mapa siguen siendo casillas completas.
- **Recorrido por segmento:** las balas recorren el segmento de cada tick con un rayo por casillas y un test de rectángulos, y paran en el punto exacto de la pared. Ya no se comprueba solo el extremo del tick, que con franjas de 12 px podía saltarse una pared fina a 520 px/s.
- **El zombi y la pared:** si en el mismo tick la bala alcanza un zombi y una pared, gana lo que esté más cerca.
- **Cuerpos sin cambios:** jugador y zombis siguen chocando con casillas completas; el flow field y el movimiento no cambian.
- **Debug:** el modo HITBOX dibuja en verde lo que para las balas en pantalla.

### Corrección: base de la pared y punto bajo la bala dibujada

El usuario siguió viendo balas que desaparecían al disparar en diagonal junto a la esquina de la primera habitación.

- **Causa:** la comprobación usaba la silueta dibujada (banda y cara, y = 7–31) con el punto del suelo de la trayectoria. La bala se dibuja unos 12 px más arriba, así que desaparecía unos 12 px antes de tocar la pared, en el aire, encima de la esquina.
- **Modelo 3/4:**
  - las paredes del kit se comprueban contra su **base**: lo que tapa su parte de arriba bajada a la altura de la pared (18 px), es decir, y 25–31 en los brazos horizontales y en el extremo norte de la franja vertical;
  - se comprueba con el **punto del suelo justo debajo de la bala dibujada** (`drawn + flightHeight`);
  - así la bala se para cuando se la ve tocar la cara, y pasa si se la ve pasar junto a la esquina o por delante de la cara.
- **Cosas planas** (muebles, puertas, paredes sin kit como las de room01): bloquean desde la altura de vuelo (12 px) hacia abajo de su casilla.
  - Desde el norte, la bala se para al tocar visiblemente su borde superior; antes desaparecía 12 px antes.
  - Pegado a ellas por el sur se sigue pudiendo disparar de lado.
- **Muros gruesos del kit:** `WALL_SHAPE_SOLID` (casilla entera) y `WALL_SHAPE_SOLID_NORTH_OPEN` (desde la base).
- **Comprobado** con un barrido en tres esquinas de la mansión (1.707 disparos desde 8 posiciones × 3 alturas × 29 ángulos): ninguna bala se para sin tocar visiblemente una pared o un mueble dibujados.
- El modo HITBOX dibuja estas zonas a la altura de las balas.

## Zombis atascados en las rejillas del sótano

Bug del usuario: en la rejilla sur del sótano (S2), los zombis se quedaron fuera sin poder entrar y la ronda no terminaba.

- **Causa:** las rejillas del sótano (S1 y S2) dan al vacío, y el spawn de sus zombis está dos casillas fuera, dentro del vacío.
  - Ir a la ventana y arrancar tablones se hace en línea recta, sin chocar con el mapa, a propósito.
  - Pero cada tick la separación entre zombis los «sacaba» de las casillas bloqueadas, y en el vacío eso los lanzaba casilla a casilla: el zombi no llegaba nunca a menos de 12 px del punto exterior de la ventana.
  - También podía pasar que la separación empujara a un zombi del interior contra la rejilla y lo expulsara al otro lado. Ahí, fuera del flow field, se quedaba empujando la pared para siempre.
- **Arreglo:**
  - los zombis que van a una ventana o arrancan tablones ya no se empujan fuera de las casillas bloqueadas (sí se separan entre ellos);
  - un zombi que persigue fuera del flow field vuelve a entrar por la ventana más cercana a 3 casillas o menos (`NAVIGATION.lostWindowRange`);
  - sin ventana cerca, a los 6 s (`NAVIGATION.lostRespawnTime`) sale del mapa y vuelve a aparecer desde un spawn (`toSpawn + 1`), para que un atasco nunca bloquee el final de una ronda.
- **Tests:** seis zombis entrando por S1 y por S2 con el jugador justo dentro; un zombi expulsado al vacío que vuelve a entrar; y uno perdido sin ventana cerca que reaparece.

## Sangre podrida al impactar

Petición del usuario: sangre algo viscosa de rojo oscuro, como podrida, en cada impacto de bala, y los charcos de los zombis en el mismo tono.

- **Paleta** (`PLACEHOLDER_COLORS`): borde casi negro `#2a0a08`, cuerpo rojo marrón `#4a120e`, zona más clara `#621a12` y brillo marrón `#8c3c24`. El brillo y el borde oscuro le dan aspecto espeso y húmedo.
- **Impacto:** `damageZombie` acepta el punto del golpe y su dirección y emite `zombie:hit` con el punto dibujado, la dirección y los pies del zombi.
  - La bala da el punto donde se la ve tocar el cuerpo.
  - El disparo a quemarropa y el cuchillo usan el centro del cuerpo dibujado.
  - El cuchillo también salpica, porque usa la misma función de daño.
- **Vista `BloodSprayPool`** (pool de 180 gotas; si se agota, se reutiliza la más antigua):
  - por impacto, 5–8 gotas hacia donde iba el disparo (±34°), una hacia atrás y dos que caen de la herida; al matar, 5 más;
  - vuelan despacio, con mucho frenado y algo de altura, se estiran cuando van rápidas y caen a la línea de los pies del zombi;
  - al caer dejan una salpicadura pequeña bajo los personajes que se desvanece en unos 2,6 s;
  - es solo visual: usa `Math.random`, no el RNG de la partida;
  - se congela con la pausa;
  - en los zombis sobre la oscuridad (en una ventana del exterior) la sangre se dibuja sobre la niebla y no deja salpicadura.
- **Charcos de muerte** (`blood`): redibujados con formas orgánicas y la paleta podrida. Siguen siendo uno por zombi muerto (40 como máximo).
- Los charcos de sangre del atrezo y los decals del mapa no cambian: el usuario pidió los que dejan los zombis.

## Sangre del jugador y manchas hasta curarse

Petición del usuario: sangre de color normal al recibir daño, y que el jugador quede manchado en sitios aleatorios hasta tener la vida al máximo.

- **Evento:** `player:damaged` lleva ahora los pies del jugador y de dónde vino el golpe (`x, y, fromX, fromY`).
- **Salpicadura:** la misma vista de gotas que la de los zombis (`BloodSprayPool`), con la paleta de sangre fresca (rojo vivo `#a3161a`, borde `#5c0c0d`, brillo `#ea6a4e`). Salen 4–6 gotas desde el pecho, en dirección contraria al golpe, más una hacia atrás y dos que gotean.
- **Manchas** (`PlayerBloodStains`):
  - cada golpe deja 1 o 2 manchas de 6×6 en sitios al azar del cuerpo, 10 como máximo;
  - siguen al sprite y se ocultan en la pose de muerte;
  - al volver a la vida máxima (con un botiquín) se desvanecen en 0,5 s; un golpe durante ese desvanecido las conserva.
- **Dónde caen las manchas:** al empezar la partida se leen los fotogramas de idle, walk, shoot y shoot_walk del jugador (también con placeholders). Solo valen los píxeles opacos en al menos el 85 % de los fotogramas y cuyas cuatro vecinas también lo son (`bodySpots`). Así una mancha nunca queda flotando fuera de la silueta, aunque cambien la pose o la dirección.
  - Con el sprite actual salen 260 sitios, del pecho a las piernas.
  - Las manchas no siguen a una parte concreta del cuerpo al girar: se quedan en el mismo punto respecto a los pies.
- Son solo visuales: usan `Math.random`, no el estado de la partida.

## Sin regeneración de vida

Petición del usuario: la vida ya no se recupera con el tiempo, por ahora solo con botiquines.

- Se quitan `updateHealth`, `PLAYER.regenDelay` y `PLAYER.regenPerSecond`, y `PlayerState.lastDamageTime`, que solo servía para eso. La spec 01 (§4.1) lo recoge.
- Los botiquines siguen igual: +50 de vida y un 6 % de probabilidad por zombie muerto (`PICKUPS.healthChance`). Sin regeneración la partida es más dura; si hace falta, se puede subir esa probabilidad o la cantidad que curan.
- Las manchas de sangre del jugador siguen hasta que vuelve a la vida máxima, ahora solo con botiquines.

## Spec 03 · Fase M4 (mejoras de arma, magos rojo y dorado, debug)

- **Estado:** cada arma lleva `level` (0–3) y `special`. Todas las capacidades salen de `weaponStats.ts` (`magazineSize`, `maxReserve`, `fireRate`, `bulletDamage`), con los factores en `WEAPON_UPGRADES` de `balance.ts`. La especial de cada arma está en `WEAPON_SPECIALS` (pistola `fan`, SMG `pierce`). *(Desde la spec 04, A1: catálogo en `weapons.ts`, con las mejoras propias de cada arma.)*
- **Nivel 1:** el arma se rellena solo al llegar a ese nivel, que es cuando cambia la capacidad («al subir de nivel» está en la fila del nivel 1). Los niveles 2 y 3 no rellenan.
- **Daño:** nivel 3 por doble daño da ×4; se calcula al disparar cada bala.
- **Abanico de la pistola:** 3 balas (centro y ±12°) a partir del ángulo con la dispersión normal. Gastan una sola bala del cargador y cada una hace el daño completo, también a quemarropa.
- **SMG que atraviesa:**
  - cada bala lleva `pierce` (golpes que le quedan) y `hits`, los zombis ya alcanzados, en un array del pool sin crear memoria;
  - tras atravesar un zombi, la bala sigue desde el punto del golpe en el tick siguiente y nunca vuelve a golpear al mismo;
  - las paredes la paran igual.
- **Aspecto de las balas** (`BulletState.look`): con la especial, doradas (ámbar); con el doble daño, azul claro; desde el nivel 3, más claras (`#fff4d0`). Si coinciden, manda ese orden.
- **Tiendas:**
  - el rojo («Mejorar arma actual», 3000, una compra por visita) sube un nivel el arma en mano y muestra NIVEL MÁXIMO al llegar a 3. Su fila dice el arma y el paso de nivel («PISTOLA: nivel 1 → 2»);
  - el dorado («Mejora especial», 10000) muestra una fila por arma, con su icono y lo que hace la especial, y YA TIENE ESPECIAL cuando ya la tiene. La compra lleva el arma en el comando (`InputCommand.shopSlot`).
- **Rojo y dorado** siguen desactivados en partida normal (`enabled: false`; lo comprueba el test de M1). Un mago necesita un punto libre: con 3 magos y solo la zona inicial abierta (2 puntos), el tercero aparece cuando haya otra zona abierta.
- **HUD:** una estrella pixelada por nivel junto al nombre del arma (las fuentes no tienen «★»), y el nombre en ámbar con la especial.
- **Debug (§7):** +NIVEL ARMA, ESPECIAL ARMA (enciende y apaga), DAR MEJORA (velocidad y doble daño por turnos), MOVER MAGOS, ROJO/DORADO (los activa y los coloca al momento, o los retira) y +10000.
  - El panel pasa a 3 columnas, más compacto.
  - Al tocar sus estadísticas se pliegan los botones, que a veces tapan la tienda.
- **Tests:** capacidades, cadencia, daño y su acumulación con el doble daño, abanico de la pistola, SMG que atraviesa hasta 3 zombis y se para en las paredes, y tiendas roja y dorada (límite por visita, nivel máximo, una fila por arma, ya tiene especial).

## Puntos y dinero separados

Petición del usuario: diferenciar los puntos del dinero para comprar.

- **Estado:** `PlayerState.money` (dinero para gastar, empieza en 500 $) y `PlayerState.score` (puntos, empiezan en 0). Cada ganancia suma lo mismo a los dos (`awardPoints`). Puertas, portales y magos solo gastan dinero (`spendMoney`).
  - El campo `points` pasa a llamarse `money` para que el código no confunda dinero y puntos.
  - El evento de gasto pasa a `money:spent`.
- **HUD** (la disposición no cambia):
  - arriba a la derecha, `PUNTOS` con los puntos (más pequeños, 14 px) y debajo el dinero en verde sin etiqueta (`560$`); la columna de armas sigue justo debajo;
  - la ronda baja a 16 px.
- **Verde dinero:** `COLORS.money`, `#62d26f`. Lo usan el dinero del HUD, los `+N$` del HUD y los de las ventanas reparadas.
- **Cantidades con `$`:** los costes del botón de acción (puertas y escaleras, y lo que falta), el `+10$` de reparar y los precios y el FALTAN de la tienda. Así no se confunden con los puntos.
- **Botones de debug:** +1000 y +10000 dan dinero.
- **Pantalla final:** muestra los puntos (la puntuación), como antes.

## Marco rojo de vida con ruido de televisión

Petición del usuario: un indicador de daño rojo alrededor de la pantalla que parpadee una vez con cada golpe y vaya creciendo, con ruido de televisión sin señal, cuanta menos vida quede. Leve, para no estorbar.

- **Sustituye** al borde rojo pixelado de 200 ms. `PLAYER.hitFlashDuration` desaparece; los números van en `HURT_VIGNETTE` (`balance.ts`).
- **Intensidad:** `hurtIntensity` = (vida perdida / vida máxima) ^ 1,6. A 90 PV apenas se ve (0,03), a 50 PV es leve (0,33), a 30 PV se nota (0,57) y a 10 PV es fuerte (0,85).
- **Fundido:** una sombra interior roja en CSS. Su opacidad máxima es 0,6 y gana grosor con la intensidad.
- **Ruido:** un lienzo pequeño (un píxel de ruido por cada 3 px) escalado en `pixelated`.
  - Seis fotogramas pre-dibujados, ciclados a 12 fps. Motas de rojo oscuro a rosa pálido, en franjas horizontales como una tele sin señal.
  - La máscara de borde (64 px, más fuerte en las esquinas) va en el alfa de los fotogramas, así que no hace falta `mask-image`.
  - El bucle solo corre mientras el ruido se ve: con la vida llena se para. Los fotogramas se rehacen al cambiar el tamaño de la pantalla.
- **Parpadeo:** con cada golpe del jugador local, las dos capas suben de golpe (+0,55 el fundido y +0,35 el ruido) y vuelven en 350 ms al nivel que marca la vida. Con la vida llena se ve como un brillo rojo fino con estática.
- **Capas:** va al fondo del HUD. Los textos del HUD y los controles quedan encima y nunca bloquea toques.
- **Curarse:** con un botiquín el marco se desvanece suavemente (la misma transición).
- Sin assets nuevos: el ruido se genera en runtime.

## Vida de los zombies cada 3 rondas y fila de vida más pequeña

Petición del usuario.

- **Vida de los zombies:** sube 1 unidad de daño cada 3 rondas, no cada ronda (`ZOMBIES.hpRoundsPerExtraHit` = 3). Queda en 3 en las rondas 1 a 3, 4 en las 4 a 6, 5 en las 7 a 9… y 9 en la ronda 20 (antes, 22).
  - El cuchillo, con 3, vuelve a matar de un golpe en las tres primeras rondas.
  - La spec 01 §4.4 conservaba la fórmula original (50 + 25 por ronda); se reescribe con la vigente.
- **Fila de vida más pequeña.** La vida sigue en 100; solo cambia el tamaño:
  - el corazón pasa de 21 a 14 px (escala ×2 del icono de 7×6, nítido);
  - la barra, de 176×14 a 112×10 px (10 segmentos de 9 px exactos);
  - el valor, de 10 a 8 px (el tamaño nativo de Press Start 2P).

## Animaciones del zombi y del jugador (PixelLab)

Petición del usuario: integrar las animaciones del zombi y nuevas del jugador.
- **Zombi:** andar, gatear sin piernas, zarpazo de pie, zarpazo sin piernas y un pequeño dash al entrar por las ventanas (`climb`).
- **Jugador:** la muerte en varias direcciones y una carrera hacia el norte que sustituye a la anterior.

- **Fuentes.** El export del jugador sustituye al anterior en `art-src/pixellab/player/`: es el mismo personaje y solo cambian la carrera al norte y la muerte, que es nueva. El del zombi va en `art-src/pixellab/zombie_walker/`.
- **Un solo zombi para los tres tipos.** Corredores y sprinters usan las hojas del caminante (`alsoFor` en `import.json`, sin duplicar PNG). Su ritmo va con su velocidad:
  - andar a 9, 15 y 21 fps (caminante, corredor y sprinter: unos 3,7 px de avance por fotograma);
  - gatear a 8, 14 y 20 fps.
- **Lienzo de 68×68 para los zombies.** El cuerpo arrastrándose mide hasta 52 px y el zarpazo se sale más, así que 48 recortaba hasta 249 píxeles por dirección. El jugador sigue en 48×48: su export no pierde nada. El ancla del zombi (0,8) ya cae en sus pies (y ≈ 54).
- **Direcciones por animación** (`AnimationDef.directions`): el climb llega en 4 direcciones y el resto en 8. Antes el manifiesto tenía una sola cifra por personaje y la última animación importada la pisaba.
- **Muerte del jugador en 3 direcciones** (sur, este y oeste). El importador completa las demás con la más cercana (§6 de ASSETS.md):
  - norte y noreste → este;
  - noroeste y suroeste → oeste;
  - sureste → este.

  De las dos tomas del este se usa la que suelta la pistola, como el nombre de la animación. Dura 11 fotogramas a 8 fps (1,4 s), antes de los 2 s de la pantalla final.
- **Caminata del zombi en 9 fotogramas.** Seis direcciones traen 9 y las dos diagonales del norte 11. En vez de estirar las seis (dos fotogramas repetidos por ciclo, tirones visibles), se reducen las dos diagonales (`"frames": { "walk": 9 }` en `import.json`).
- **Zarpazos sincronizados:**
  - el daño llega a los 0,35 s (`attackWindup`). El zarpazo de pie va a 12 fps (impacto en el fotograma 4) y el del suelo a 15 fps (impacto en el 5); medido en partida: el golpe cae en esos fotogramas;
  - al arrancar tablones, el zarpazo empieza ese mismo tiempo antes de que caiga el tablón, y entre tablón y tablón se queda en la pose inicial;
  - el zarpazo se termina de ver aunque el zombi eche a andar al acabar el golpe;
  - si le quitan las piernas a mitad, sigue desde el mismo punto en el suelo.
- **Sin piernas** (vida ≤ `crawlAtHp`): se arrastra (`crawl`), ataca y arranca tablones con `crawl_attack` y cruza las ventanas arrastrándose en vez de con el dash.
- **Muerte del zombi:** no venía en el export. Mientras no llegue, cae al suelo con el primer fotograma de `crawl` y se desvanece durante `ZOMBIES.corpseTime` (0,6 s). Queda en `ASSETS-TODO.md`.
- **Importador:**
  - nombres nuevos: `claw` y `swipe` → `attack`; `crawl` y `dragging` → `crawl`; un ataque dentro del estado de arrastrarse → `crawl_attack`; `staggers` y `collapse` → `death`;
  - la muerte se comprueba antes que el disparo, porque «drops the handgun» contiene «gun»;
  - `assets:check` acepta el arte compartido y mide cada hoja con sus propias filas.
- **Pendiente** (`ASSETS-TODO.md`): la muerte del zombi, la del jugador al norte y en diagonal, el dash del jugador y, si se quiere, un aspecto propio para corredores y sprinters.

## Zombi gateando a su tamaño y hurtbox ajustada al arte

Petición del usuario: el zombi sin piernas se veía más grande que de pie, y la hurtbox debía ajustarse al tamaño del zombi.

- **Escala del zombi gateando.** PixelLab dibujó el estado de arrastrarse 1,5 veces más grande: 6 px entre los ojos y ojos de 2 px, frente a 4 px y ojos de 1 px de pie.
  - El importador reduce `crawl` y `crawl_attack` a 2/3 (`"scale"` en `import.json`), alrededor de los pies, para que siga en el mismo sitio.
  - Cada píxel toma el color más repetido de 9 muestras; en caso de empate gana el opaco y luego el más oscuro, así se conserva el contorno.
  - Escalar pixel art lo ensucia un poco, pero el contrato prohíbe escalar en el motor. Si se regenera el estado en PixelLab al tamaño correcto, basta con quitar `scale`.
- **Hurtbox de pie: 20×40** (antes 16×28, el tamaño del placeholder). El arte mide unos 41 px de alto y 24–29 de ancho con los brazos; la caja va de cabeza a pies y cubre el cuerpo sin las puntas de los brazos.
- **Hurtbox sin piernas: 24×24** (`ZOMBIES.crawlHurtbox`), medida sobre el arte ya escalado: 23–28 px de alto y 21–30 de ancho.
  - Se usa con la misma regla con la que se arrastra (vida ≤ `crawlAtHp`): `hurtboxOf(z)`.
  - La usan las balas, el disparo a quemarropa, el autoapuntado (apunta al centro de la caja), el punto del que sale la sangre y el dibujo de hitboxes del debug.
- Efecto en el juego: de pie es más fácil acertar (la caja es más grande). Sin piernas, un disparo a la altura del pecho de uno de pie le pasa por encima, como se ve.

## Mago azul con arte (respirar y abrir la gabardina)

Petición del usuario: incluir al mago azul con su animación de respirar de pie y la de abrir la gabardina al abrir la tienda.

- **Personaje de 1 dirección.** El export trae 8 rotaciones quietas, pero las dos animaciones solo miran al sur, y el mago no se mueve: siempre mira a cámara.
  - El manifiesto admite ahora `"directions": 1`, además de 4 y 8. Con 1, el importador toma solo la fila `south` y todas las direcciones del juego usan esa fila.
  - El mago pasa a ser el personaje `merchant_blue`, en 68×68 (el lienzo de sus animaciones), con los pies en y = 54 (ancla 0,8) y la hitbox `MERCHANT.radius`.
  - El objeto `merchant_blue` se queda en el manifiesto como reserva, por si el personaje faltara.
- **Animaciones:**
  - `idle` = respirar, 9 fotogramas a 6 fps (1,5 s por ciclo, lento);
  - `open_coat` = 9 fotogramas a 14 fps (0,64 s).
- **La gabardina** sigue a la tienda de ese mago (`shopMerchant` de algún jugador), con un pequeño autómata puro (`merchantCoat.ts`):
  - cerrada (respira) → abriéndose → abierta (último fotograma quieto) → cerrándose (la misma animación al revés) → respira;
  - si la tienda se cierra a medio abrir, o se reabre a medio cerrar, se da la vuelta desde el fotograma que se ve;
  - si el mago se teletransporta con la tienda abierta, la tienda se cierra sola y la gabardina también.
- **Sin rombo para los magos con arte.** El dibujo ya dice quién es (sombrero y gabardina azules). El rojo y el dorado siguen con rectángulo y rombo hasta que tengan arte.
- **La cámara baja con la tienda abierta.** El panel va centrado arriba (spec 03 §3) y el mago, que está a menos de 40 px del jugador en el centro de la pantalla, quedaba justo debajo, así que no se veía abrir la gabardina.
  - Mientras la tienda está abierta, la cámara desplaza la vista hacia abajo lo justo para que la cabeza del mago quede 8 px por debajo del panel. El seguimiento suave de la cámara hace el movimiento, a la ida y a la vuelta.
  - Nunca baja más del 30 % de la vista, para que el jugador siga en pantalla, y no se mueve si el mago ya se ve.
  - Es solo vista (`followOffset`); el cálculo es una función pura (`shopCamera.ts`).
  - **Cambio posterior (pedido por el usuario):** el movimiento va al revés. La vista se desplaza hacia el sur, así que en pantalla el mundo sube, hasta que los pies del mago quedan 8 px por encima del panel, en la franja libre entre la pausa y la tienda. El panel no se mueve. Los mismos límites: como mucho el 30 % de la vista, y nada si el mago ya se ve por encima.
- **Cambio posterior (pedido por el usuario):** a 2/3 el zombi del suelo se veía más pequeño que de pie. Con la cabeza igual, el cuerpo tumbado tiene menos masa visible. Se sube a **0,8**: la cabeza queda un poco mayor que de pie y el conjunto se percibe del mismo tamaño. La hurtbox sin piernas pasa a **28×28**, medida de nuevo (28–34 px de alto y 25–36 de ancho).
- **Segundo ajuste (pedido por el usuario):** a 0,8, el zombi del suelo mirando hacia abajo (sur, sureste y suroeste) se veía más grande que de pie; hacia arriba, bien. Mirando a cámara enseña la cara de frente, que abulta más que la nuca o el perfil.
  - `"scale"` admite ahora un factor por dirección. Esas tres filas bajan a **0,7**; el resto sigue en 0,8.
  - La hurtbox sin piernas se queda en 28×28: mirando al sur mide unos 22×27 px, y por los lados, más.

## Tinte para corredores y sprinters

Petición del usuario: como los tres tipos de zombi comparten el dibujo, distinguir corredores y sprinters con un tinte.

- **Tinte multiplicado sobre el arte del caminante:**
  - corredor `#ffc98a` (en el zombi gris verdoso queda ocre);
  - sprinter `#ff8a7a` (rojizo, más peligroso a la vista);
  - el caminante no lleva tinte.
- Los colores son tokens en `theme.ts` (`COLORS.zombieRunnerTint` y `zombieSprinterTint`).
- El destello blanco al recibir un disparo tiene prioridad; al acabar, vuelve el tinte del tipo. Un sprite del pool que pasa a otro tipo cambia de tinte.
- Si llegan dibujos propios para corredor y sprinter, se quita el tinte (`KIND_TINT` en `Zombie.ts`).

## Spec 04 · Aclaraciones previas con el usuario

Antes de empezar se aclararon las contradicciones con el estado actual del juego:

- **Daño de la escopeta: 0,9 por perdigón.** La spec decía 18, en la escala antigua en la que la pistola hacía 20. Ahora la vida se cuenta en unidades de daño (pistola 1), así que se mantiene la proporción. Un disparo completo a quemarropa hace 5,4.
- **Cambio de arma: se mantiene la columna de huecos** bajo los puntos, uno por arma (1, 2 o 3), y se toca el que se quiere. No vuelve el botón de rotar. Con una sola arma solo se ve su hueco.
- **Precios con el formato «1000$»**, como en el resto del juego, no «$1000»: «SMG 1000$», «FALTAN 500$», «-1000$».
- **Vitrina del comedor centrada en la pared norte.** El punto de mago M6, que estaba en esa pared, se mueve a otra que cumpla sus reglas.
- **Salón:** el «mueble central» es la columna del centro (casillas 24–25, 33–34); la vitrina va justo al sur, mirando al sur.

Resueltas sin preguntar, por ser solo nombres o huecos de la spec:

- **`walk_aim`** es la animación que ya existe como `shoot_walk`.
- **`weaponSlots`** es `LOADOUT.maxWeapons` (3).
- **Los magos rojo y dorado** siguen sin aparecer en partida normal (spec 03); se prueban desde el debug.
- **El nombre de cada arma** sigue en `STRINGS.weapons`, no en `weapons.ts`: los textos visibles van en `strings.ts` (CLAUDE.md).

## Spec 04 · A1 (catálogo de armas por datos)

- **`src/config/weapons.ts`** reúne:
  - `WEAPONS` (estadísticas, `category`, `upgrades` y `special` de cada arma);
  - `UPGRADE_EFFECTS` (factores de `ammo_x2`, `fire_rate` y `damage_x2`);
  - `WEAPON_SPECIALS` (números del abanico y de atravesar).

  Desaparecen `WEAPON_UPGRADES` y la tabla común de especiales de `balance.ts`. `LOADOUT` sigue en `balance.ts`.
- **Niveles por arma.** El nivel N aplica los N primeros efectos de la lista del arma; si un efecto se repite, se multiplica. `levelStats(def, nivel)` es pura y sirve también para armas ficticias en los tests. Ninguna parte supone 3 niveles: el máximo es la longitud de la lista.
- **`ammo_x2` rellena** el arma hasta el nuevo máximo en el nivel en que esté, no solo si es el nivel 1.
- **`fire_rate` acelera la recarga** solo si el arma lo indica (`fireRateSpeedsReload`). Ni la pistola ni la SMG lo llevan.
- **Tinte claro de las balas:** desde que el arma tiene un nivel de `damage_x2`, en vez de «nivel 3». Con las listas de la pistola y la SMG es lo mismo.
- **Mago rojo:** el siguiente nivel de la lista del arma en mano. Su fila dice también qué hace ese nivel: «PISTOLA: nivel 1 → 2, cadencia ×1,5». Deshabilitado con NIVEL MÁXIMO al final de la lista, o con NO MEJORABLE si la lista está vacía.
- **Mago dorado:** una fila por arma; deshabilitada con YA TIENE ESPECIAL o con SIN MEJORA ESPECIAL si el arma no tiene ninguna.
- La pistola y la SMG no cambian: siguen pasando los tests de la spec 03.

## Spec 04 · A2 (escopeta de caza y efecto de fuego)

- **Escopeta** (`WEAPONS.shotgun`):
  - 6 perdigones por cartucho, 0,9 de daño cada uno (ver las aclaraciones previas);
  - 22° de apertura repartidos por igual, con ±1,5° de variación aleatoria por perdigón (`pelletJitter` 3). Con perdigones, el centro del abanico va justo al apuntado; el error aleatorio lo pone la variación;
  - cadencia 1,4/s, cargador 2 y reserva 24, recarga 1,8 s, alcance 150 px y perdigón a 520 px/s;
  - daño completo hasta 60 px del jugador y luego baja de forma lineal hasta el 40 % en el alcance (`falloff`; el perdigón lleva su recorrido);
  - cada perdigón da los puntos de impacto habituales.
- **Empuje de 3 px por perdigón**, solo a zombis que persiguen o atacan. A uno que está en una ventana, trepando o saliendo del suelo no se le mueve, para no sacarlo de su camino.
- **Fogonazo un 60 % más grande y retroceso de 2 px**, solo de vista. El jugador dibujado retrocede por el apuntado y vuelve en unos 80 ms. Usa las animaciones de disparo de la pistola hasta que haya arte con escopeta.
- **El nivel `fire_rate` de la escopeta acelera también la recarga** ×1,5 (`fireRateSpeedsReload`). Con 2 cartuchos, la recarga es casi todo su ritmo de disparo.
- **Fuego (`BurnSystem`), reutilizable:**
  - `igniteZombie(z, dañoDelImpacto, dueño)` y `updateBurns` después de las balas;
  - la quemadura total es el 40 % del daño final del perdigón (tras caída, nivel 3 y doble daño), en 10 ticks de 0,15 s durante 1,5 s;
  - un impacto nuevo reinicia la duración sin apilar fuegos y se queda con el mayor daño por tick; el ritmo de ticks de un zombi que ya ardía no se reinicia;
  - los ticks no dan puntos de impacto (`damageZombie(…, hitPoints = false)`) ni sangre; si muere quemado, la baja es para quien lo prendió;
  - los números están en `WEAPON_SPECIALS.fire` (`fireDamageFactor`, `fireTickInterval`, `fireDuration`).
- **Aspecto del fuego:**
  - perdigones naranjas (`BulletLook 'fire'`);
  - el zombi en llamas parpadea entre dos naranjas (`COLORS.fire`, más intenso que el ámbar de los corredores), con prioridad sobre el tinte de su tipo; el destello blanco del impacto va por delante;
  - suelta llamas pequeñas (`BurnFlames`, pool de 72 y objeto placeholder `flame`), que se congelan con la pausa.
- **Inventario adelantado de A3** (`InventorySystem.giveWeapon`): un arma nueva va a un hueco libre y se equipa; con los tres llenos sustituye a la de la mano. Lo usan los botones de debug.
- **Debug:**
  - DAR SMG y DAR ESCOPETA (el arma en la mano, con munición llena);
  - el botón de dinero pequeño pasa de +1000 a +5000$, y el grande se rotula +10000$.
- **Corregido de paso:** el botón de recargar comparaba con el cargador base y se apagaba tras un nivel `ammo_x2` aunque se pudiera recargar. Ahora `weapon:state` lleva la capacidad del arma a su nivel (`capacity`).

## Spec 04 · A3 (inventario)

- **Se empieza solo con la pistola** (`LOADOUT.startingWeapons`).
  - Los tests que daban por hecha la SMG en el segundo hueco usan el fixture `withSmg`, que la añade sin equiparla, como antes.
- **Tres huecos y la columna de armas** (decisión previa con el usuario).
  - La columna muestra un hueco por arma: con una sola, solo el suyo, y tocarlo no hace nada.
  - Con dos o tres se toca la que se quiere; en el teclado, el cambio rota en orden.
- **Comprar un arma** (`InventorySystem.giveWeapon`):
  - con un hueco libre, se añade y se equipa, con el tiempo normal de cambio de arma;
  - con los tres llenos, sustituye a la de la mano y se pierden sus niveles y su especial;
  - si ya se lleva, solo se equipa.
- **Confirmación** (`needsSwapConfirm`): solo si el arma que se va tiene algún nivel o la especial. El botón de acción la pide en la vitrina (A4).
- **Tests de sustitución.** Con solo tres armas básicas nunca hay una cuarta que comprar con los tres huecos llenos, así que las funciones de inventario aceptan el número de huecos (3 por defecto) y los tests de sustitución usan 2.

## Spec 04 · A4 (vitrinas de armas)

- **Objeto `weapon_case`** (rectángulo de 1 tile, documentado en `ASSETS.md` §5):
  - `weapon`, `cost`, `facing` (`south`, `east` o `west`; `north` se rechaza al cargar) y `zone`;
  - en el plano ASCII, tabla `## Vitrinas`, que `map:build` convierte en el objeto;
  - `MapLoader` comprueba que el arma existe, el precio es positivo y la zona existe.
- **Colisión:** como el atrezo sólido (`BLOCK_PROP`), bloquea a jugador, zombis y balas, pero no la vista. El flujo de los zombis la rodea.
- **Reglas de colocación** (`validate-map`): casilla libre delante; 3 tiles o más (de centro a centro) hasta las barricadas, puertas y puntos de mago; ningún paso de menos de 2 tiles.
  - Solo cuenta lo que está en su misma zona, como con el atrezo: con una pared en medio no hay conflicto posible.
  - Así la vitrina del comedor queda centrada, aunque al otro lado de la pared norte, en la cocina, está el punto de mago M9 (a 2,8 tiles).
- **Colocación:**
  - **SMG, 1000$:** salón, casilla (24,35), mirando al sur, justo al sur de la columna central (24–25, 33–34). La columna tiene 2 tiles y la vitrina 1, así que queda bajo su mitad izquierda.
  - **Escopeta, 1500$:** comedor, casilla (53,30), mirando al sur, centrada en la pared norte, a 3,2 tiles de la puerta de la cocina (D4) y frente a la mesa.
  - **M6 se mueve** de (55,30) a (58,37), pared este del comedor bajo el aparador, a 3,2 tiles de la ventana W7.
- **Interacción** (`WeaponCaseSystem`):
  - el botón de acción aparece solo delante del frente, a menos de 40 px del centro de su borde delantero (`WEAPON_CASES.interactRange`) y con la zona desbloqueada;
  - las vitrinas guardan 3 tiles con lo demás de su zona, así que no tapan otras acciones (se miran después de los magos).
- **El botón:**
  - icono del arma y «SMG · 1000$»; «FALTAN 500$» atenuado si no llega el dinero;
  - con el arma ya en las manos, «MUNICIÓN SMG · 500$» (la mitad, `caseAmmoPriceFactor`), o «MUNICIÓN COMPLETA» atenuado si no hace falta.
- **Confirmación:** si la compra sustituiría un arma con niveles o especial, el primer toque no compra.
  - El botón pasa a «CAMBIAR SMG ★★ POR ESCOPETA» en ámbar, con las estrellas dibujadas como en el HUD y el anillo parpadeando.
  - El segundo toque compra. La confirmación caduca a los 3 s (`swapConfirmTime`) o al alejarse de esa vitrina.
- **Al comprar:** se resta el dinero y aparece «-1000$» en rojo junto al dinero (el mismo aviso que en los magos). Vibración media (`weaponCase:purchase`). El arma se equipa; la munición rellena cargador y reserva.
- **Placeholder** (`weapon_case` 28×18 y `weapon_case_v` 18×28 para este y oeste, en espejo al oeste):
  - mueble marrón oscuro con cristal azulado y la silueta del arma (un fotograma por arma en el orden de `WEAPON_IDS`);
  - se ordena con los actores como el atrezo sólido;
  - encima, el precio en ámbar a menos de 96 px (el de la munición si ya se lleva el arma).
- **`map:preview`** dibuja las vitrinas con una marca ámbar en su frente.
- **Tests de las vitrinas:** como solo hay tres armas básicas, en los tests de sustitución el tercer hueco lo ocupa una segunda pistola, que hace de un arma futura.

## Prueba: HUD con las piezas de PixelLab (rama `prueba-hud-pixellab`)

Petición del usuario, de prueba: si no le gusta, se vuelve al HUD de antes (`main`, sin esta rama).

- **Limpieza** (`npm run hud:import`, `scripts/import-hud.ts`), por color y forma, sin coordenadas fijas:
  - **Aros:** en cada dirección, el primer píxel hueso que se encuentra desde fuera es el borde interior. Las direcciones que no lo encuentran (un remache encima) toman el radio típico. Dentro, se conserva la línea oscura pegada al borde y el resto pasa al color de la cara (`#332d29`).
  - **Botón:** el texto naranja (y un píxel alrededor) se pinta con el color de la cara.
  - **Barra:** el canal es la zona negra conectada (también en diagonal), empezando por su parte vacía. Su interior pasa a negro y la cruz, que queda fuera, se conserva.
  - **Hoja de revisión:** `maps/preview/hud/hud-antes-despues.png`.
- **Escala siempre entera (1×, `pixelated`):**
  - el aro grande mide 97 px y el botón de disparo 96, así que va a 1× y sobresale medio píxel por lado;
  - el mediano mide 65 px: a 1× los botones pequeños doblarían su tamaño (32–34 px). Se reduce exactamente a la mitad al importar (2:1, cada píxel el color más repetido de su bloque, y en los empates gana el claro para que el borde hueso no se pierda) y se muestra a 1× en 33 px. Los botones pasan de 34 y 32 a 33 px.
- **Dónde va cada pieza:**
  - aro grande en rojo para el disparo;
  - aro mediano para especial, recargar, cuchillo y huecos de arma, en ámbar el especial y el arma en mano. Iconos y símbolos encima, como antes;
  - el botón de acción contextual y el de la mejora no estaban en la lista y no cambian.
- **Vida:** el marco con la cruz sustituye al corazón. Los 10 segmentos van en el canal con un margen que les da un ancho entero (9 px, 2 de separación) y 1 px arriba y abajo. El latido del corazón por debajo de 30 PV desaparece con él; queda el color de vida baja de los segmentos.
- **Tienda:** el panel con 9-slice (20 px), con los bordes y el centro repetidos píxel a píxel (`repeat`), nunca escalados.
- **Botón rectangular:** se usa en los botones COMPRAR de la tienda y en los de las pantallas de título, pausa y fin de partida, con 9-slice (12 px).
- **Rutas por manifiesto** (regla 5): nueva sección `ui`. `applyUiSkin` las pasa al CSS como variables con URL absoluta. Si falta alguna pieza, no se activa y el HUD queda como antes.

### Segundo kit del HUD (sustituye al primero, en la misma rama)

Petición del usuario: un kit nuevo de PixelLab que ya viene vacío (aro grande, aro mediano, panel, placa y marco de vida con corazón).

- **Fuente:** el zip del export (`art-src/pixellab/hud/`). El usuario también pasó la hoja `botones.png`: tiene las mismas piezas, del mismo tamaño, con unos pocos píxeles de color distintos. El importador acepta las dos formas (la hoja se recorta por componentes conexos del alfa) y nombra las piezas por su forma.
  - Hoja de contactos con nombres y tamaños: `maps/preview/hud/hud-kit.png`.
  - Los tintes, el pulsado y la atenuación son por código; ya no se genera arte (desaparecen los aros teñidos y la reducción a la mitad del primer kit).
- **Aros a 1×** (97 y 65 px), solo escalas enteras.
  - El mediano mide 65 px, así que el especial, recargar y cuchillo pasan de 33 a 65 px y se recolocan en arco alrededor del disparo: centros a 89 px del suyo, a 90°, 135° y 180°, con los círculos sin tocarse.
  - **Los huecos de arma** (65 px, más de los 44 pedidos) pasan de columna a **fila bajo el dinero**: tres en columna (205 px) no caben en una pantalla de 390 px de alto junto al arco. Se ha comprobado a 844×390 y a 640×360.
- **Placa** (9-slice, cortes de 8 px): el botón COMPRAR de la tienda y el chip de acción contextual, que pasa de botón redondo con etiqueta encima a placa con el icono y el texto al lado (44 px de alto, el texto puede ocupar dos líneas).
  - El chip queda centrado abajo (50 % − 60 px) y la mejora a su izquierda, para no pisar el cuchillo en pantallas estrechas.
  - Los botones de las pantallas (JUGAR…) vuelven a su aspecto anterior: el usuario no los pidió con la placa.
- **Panel** (9-slice, cortes 35/45/35/45). Sus bordes no tienen tramos lisos (óxido y arañazos) y lleva pletinas en el centro de cada lado. Con esos cortes, las esquinas incluyen los extremos inclinados de las pletinas y entre medias se repite su parte plana, sin deformar nada.
- **Barra de vida:** el corazón del marco sustituye al icono. Una copia del propio recorte del corazón, superpuesta, late por debajo de 30 PV. Los segmentos se ajustan al hueco interior: 10 de 9 px con 2 de separación, 5 px de margen en los extremos redondos y 1 px arriba y abajo.
- **Símbolos** (recargar, rayo, cruceta, pausa y bala) en una rejilla de 12×12 con trazo de 2 unidades, dibujados a 2× (24 px) sobre los aros y la pausa, y la bala a 1× (12 px) en la fila del arma.
  - Los demás iconos del HUD (armas, martillo, puerta, escalera, sombrero) también se dibujan a múltiplos enteros de su rejilla (`iconSize`).
- **Estados:** tinte rojo en el aro de disparo y ámbar en el especial y el arma en mano, en un canvas al cargar, sin tocar la cara del aro; huecos no equipados al 60 % de opacidad; pulsado a 0,94 durante 60 ms en aros, chip y COMPRAR.
- **Capturas sobre suelo claro y oscuro:** `maps/preview/hud/hud-suelo-claro.jpg` y `hud-suelo-oscuro.jpg`.

### Botones pequeños con el aro pequeño (misma rama)

Petición del usuario: los botones que no son joysticks, más pequeños, con el aro pequeño del kit. Opción elegida: la mitad exacta, 33 px.

- **El kit no trae un aro pequeño propio:** se saca del mediano reducido 2:1 al importar (`halve`: cada píxel toma el color más repetido de su bloque de 2×2 y, en los empates, gana el claro para que el borde hueso no se pierda). `npm run hud:import` escribe `ui/ring_small.png` (33×33) y lo registra como `ringSmall`. Es la misma técnica del primer kit.
- **Especial, recargar, cuchillo y huecos de arma** usan el aro pequeño a 1× (33 px), con los iconos a 1× de su rejilla (12 px). Vuelven a sus posiciones de antes del kit: el arco de `controls.css` y la columna de armas bajo el dinero. El aro mediano (65 px) queda en el manifiesto, sin usar.
- **Huecos de arma de 45 px al tocar** (se pedían 44): margen invisible de 6 px y 12 px de separación entre huecos, para que los márgenes se junten sin que un hueco robe toques al aro del vecino. La columna mide 123 px.
  - En pantallas de 360 px de alto la columna baja hasta el especial y el margen de 14 px del especial tapaba los 3 px de abajo del último hueco. La columna se pinta por encima del especial (`z-index` 21): los huecos ganan donde se cruzan los márgenes, y su margen de 6 px no llega al aro del especial.
  - Comprobado a 844×390 y a 640×360, sin solapes. Captura: `maps/preview/hud/hud-aros-pequenos.jpg`.

### JUGAR, botones de la tienda y parpadeo de reparar (misma rama)

Petición del usuario: la placa en el botón de empezar y en los botones de mejora del mago, y que vuelva el parpadeo del borde del botón de reparar.

- **JUGAR** (solo el de la pantalla de inicio, como se pidió) va sobre la placa a 2×: esquinas de 16 px, que casan con el título grande. Mide 50 px de alto, el doble de los 25 de la placa, así que su centro solo se estira a lo ancho. REINTENTAR y los botones de pausa conservan su aspecto.
- **Botones de la tienda:** la placa salía solo en COMPRAR y en «FALTAN…». Cuando el artículo no haría nada («NIVEL MÁXIMO», «MUNICIÓN COMPLETA»…) o ya se ha llegado al límite de la visita («VUELVE EN OTRA RONDA», justo después de comprar una mejora), quedaba un recuadro fino sin diseño. Ahora todos los botones llevan la placa: estos dos estados, oscurecida al 60 % (`brightness`) y con el motivo en hueso.
- **Reparar:** el parpadeo de antes animaba un `box-shadow` que la placa tapa, así que no se veía. Ahora parpadea un borde ámbar de 2 px que sigue el contorno de la propia placa (cuatro `drop-shadow` sin desenfoque). Mismo ritmo de antes: 0,5 s por ciclo, a pasos, la mitad encendido y la otra mitad apagado. Igual que antes, mientras dura la sacudida de un toque que no hace nada, el parpadeo se para.
- **Capturas:** `maps/preview/hud/hud-inicio.jpg`, `hud-tienda-limite.jpg` y `hud-reparar.jpg` (esta última con el borde encendido).

### Menús, botón de pausa y botón de la mejora del mago azul (misma rama)

Petición del usuario: la placa también en REINTENTAR, la pausa, CONTINUAR, REINICIAR y vibración, y el diseño en los botones de las mejoras del mago azul.

- **Todos los botones de los menús van sobre la placa:**
  - REINTENTAR, CONTINUAR y REINICIAR a 2× y 50 px de alto, como JUGAR;
  - el interruptor de vibración, que es secundario, a 1× y 36 px. Su texto sigue apagado cuando está en «NO».
- **«Pausa»** se ha entendido como el botón de pausa del HUD, ya que los del menú se piden aparte. Es redondo, así que lleva el aro pequeño (33 px), como los demás botones redondos, con el símbolo a 1× (12 px). La placa es rectangular y no encaja en un botón redondo.
- **Mago azul:** los botones de su tienda ya tenían la placa desde el cambio anterior; «MUNICIÓN COMPLETA» sale oscurecida. Lo que no tenía diseño era el botón de la mejora de la ronda que vende (velocidad o doble daño), que se quedaba en un cuadrado oscuro de 40 px.
  - Ahora es el aro pequeño teñido del azul del mago (por código, como el rojo y el ámbar), con el símbolo a 1×, a la izquierda del chip y centrado con él.
  - Mientras la mejora está activa, el aro va sin teñir y la cuenta atrás azul se vacía sobre su metal, con los segundos en el centro.
  - Sin la skin, el símbolo también pasa a 1×, como en los demás botones de acción.
- **Capturas:** `maps/preview/hud/hud-pausa.jpg`, `hud-fin.jpg`, `hud-tienda-azul.jpg`, `hud-mejora-guardada.jpg` y `hud-mejora-activa.jpg`.

### Aro pequeño nativo y piezas con más lados (misma rama)

El usuario vio irregulares los botones pequeños. El CSS los dibujaba a 1:1, pero su imagen era el aro mediano reducido al importar (65 → 33 px, ×0,508), y una línea de 1 px de pixel art no aguanta ninguna reducción. Pasó un kit nuevo de PixelLab con un aro pequeño dibujado a su tamaño, un hexágono y un octógono.

- **Aro pequeño:** el nuevo, a 1×. El usuario lo pidió de 32×32, pero su contorno real mide 33×33, así que no se mueve nada del layout ni de las zonas de toque. El velo de recarga y los tintes se ajustan solos a su cara (se mide al cargar).
- **Aro grande:** se queda el antiguo (97 px). El nuevo viene cortado por la izquierda y por arriba (87×95 de contorno), así que no se puede usar.
- **El panel, la placa y la barra de vida del kit nuevo no se usan:** el usuario solo pasó el kit por los botones.
- **Importación:** el kit nuevo se guarda en `art-src/pixellab/hud/botones/`. `art-src/pixellab/hud/import.json` dice qué piezas se toman de él: aro pequeño, hexágono y octógono. Se nombran a mano porque detectarlas por su forma no es fiable con un aro cortado y dos polígonos casi cuadrados.
- **Hexágono (56×65) y octógono (74×74):** se importan, pero de momento no se usan. Miden de 1,7 a 2,2 veces el aro pequeño, y reducirlos los estropearía igual que al aro. Falta que el usuario decida cómo usarlos.

### Hexágono, octógono y barra de vida a su tamaño (misma rama)

El usuario pasó un kit más (`art-src/pixellab/hud/botones-2/`) con el hexágono y el octógono a unos 32 px y una barra de vida nueva. Pidió usar esas tres piezas.

- **Las formas distinguen los grupos de botones:**
  - huecos de arma: hexágono (28×33);
  - habilidades (especial y mejora de la ronda): octógono (34×34);
  - recargar, cuchillo y pausa: redondos (aro pequeño).
  
  El usuario no dijo qué forma iba con cada grupo; es la opción que se le propuso. Todas las piezas van a 1×.
- **Zona de toque de los huecos de arma:** el hexágono mide 28 de ancho, así que el margen invisible pasa a 8 px a los lados y 6 arriba y abajo: 44×45. Con 12 px entre huecos, los márgenes no se pisan.
- **El especial y la mejora,** a 34 px, se quedan donde estaban. La mejora sigue centrada con el chip (`bottom` +17 px). El velo de enfriamiento del especial se recorta en octógono sobre su cara.
- **Tintes:** antes se tomaba como cara el círculo inscrito, que en un polígono dejaba sin tapar las esquinas de la cara. Ahora la cara es todo lo que encierra el borde claro, rellenando desde el centro con vecindad de 4. Si el relleno se escapa, se vuelve al círculo.
- **Barra de vida nueva** (149×22): el corazón es de color oliva y el hueco tiene borde claro con contorno negro. PixelLab la entrega medio llena de oliva.
  - El importador vacía el hueco fila a fila con el color de su extremo vacío (`prepareHealthBar`).
  - El hueco es lo que encierra el contorno: 114×13 en (28, 6). El corazón es la mancha de color más grande a su izquierda, con el contorno: 16×14.
  - Los segmentos salen de 9×11 px.
  - Si el hueco mide un número impar de píxeles, el margen derecho se queda el píxel sobrante, para que los segmentos sigan siendo enteros.
- **El aro con engranaje de ese kit no se usa:** no se pidió.
- **Capturas:** `maps/preview/hud/hud-poligonos.jpg`. Comprobado a 844×390 y a 640×360, sin solapes y sin que unos botones roben toques a otros.
- **Disparo sin tinte rojo:** el usuario pidió quitar el borde rojo del botón de disparo, así que el aro grande se ve con su propio metal. Ya no se tiñe nada de rojo. Captura: `maps/preview/hud/hud-disparo-sin-tinte.jpg`.

La rama `prueba-hud-pixellab` se unió a `main` (sin commit de merge) y después se borró.

## Arreglos: golpes a los tablones y puntos por bala

### Los zombis solo golpean los tablones pegados a ellos y quietos

Petición del usuario: los zombis empezaban el golpe antes de llegar a los tablones, y a veces golpeaban mientras se movían, como si flotaran. Solo pasaba en las ventanas.

- **Causas:**
  - un zombi que arrancaba tablones se podía empujar como cualquier otro, y los que llegaban detrás lo desplazaban mientras golpeaba;
  - empezaba a arrancarlos en cuanto estaba a 12 px (`windowArriveRadius`) del punto de entrada, que podía estar 12 px por delante de los tablones.
- **Llegar a los tablones:** a menos de 12 px del punto de entrada, el zombi camina recto hasta la línea de los tablones (la recta que pasa por el punto de entrada a lo largo de la ventana). Conserva su posición a lo largo de ellos, hasta ±12 px, para que dos quepan uno al lado del otro. Solo empieza a arrancarlos al llegar a esa línea.
- **Anclado mientras arranca tablones:** no lo empuja ningún zombi (el otro se lleva todo el empuje) y no se aparta del jugador. Si se solapan, es el jugador el que se aparta, como ya hacía `MovementSystem`. Así nunca se mueve mientras golpea.
- **Si no hay sitio:** el zombi que llega detrás espera empujando hasta que el primero trepa. Los zombis que trepan no empujan. Se ha comprobado con un test que los dos acaban dentro.
- **Primer golpe:** al llegar a los tablones se estrena un identificador de golpe (`actionTick`). Antes reutilizaba el del golpe anterior (o −1 recién salido del spawn), y la vista no animaba el primer tablón.
- **Vista:** un golpe a un jugador sigue terminando aunque el zombi eche a andar; uno a los tablones, no. Si deja la ventana a medio golpe, camina al momento en vez de deslizarse con el brazo fuera (`letsStrikeFinish`).

### 5 puntos por bala acertada

Petición del usuario: cada bala que acierta da 5 de puntos y dinero, en vez de 10 (`POINTS.hit`). Cada perdigón de la escopeta cuenta como una bala.

- El cuchillo sigue dando 10 (`POINTS.meleeHit`): el usuario solo habló de balas.
- Las bajas (+50) y los tablones reparados (+10) no cambian.
- `damageZombie` recibe ahora los puntos del impacto en lugar de un sí o no: los del arma por defecto, los del cuchillo o 0 para el fuego.

### Un grupo de zombis arranca los tablones más rápido

Petición del usuario: si hay muchos zombis apelotonados en una ventana, que los tablones salgan más rápido. Así el jugador no puede contenerlos para siempre reparando. La velocidad depende de cuántos haya, hasta un máximo de 4 zombis de fuerza.

- **Quién cuenta:** los que arrancan tablones de esa ventana y los que van hacia ella y ya están a menos de 48 px de su punto de entrada (`ZOMBIES.tearCrowdRadius`), esperando detrás o al lado. Se cuentan una vez por tick, antes de mover a nadie.
- **Ritmo:** la fuerza del grupo (como mucho `ZOMBIES.maxTearCrowd` = 4) se reparte entre los que arrancan tablones.
  - Uno solo con tres esperando va 4 veces más rápido.
  - Dos al lado y nadie esperando van 1× cada uno, como antes.
  - Con más de 4, el total sigue siendo 4×. Es rápido, pero nunca instantáneo.
- **Animación:** el golpe se reproduce a esa misma velocidad (`tearRate`), así el zarpazo sigue cayendo cuando sale el tablón.
- **Frente a la reparación:** al hacer este cambio el jugador reponía un tablón por toque, como mucho uno cada 0,2 s. Quien tocara muy rápido aún aguantaba; se resolvió en el apartado siguiente.

### Reparar: libre sin zombis, un tablón cada 2 s con ellos

Petición del usuario: subir la espera entre toques de reparar. Con 0,2 s se podía hacer dinero en las ventanas reparando sin parar mientras los zombis arrancaban tablones, y nunca entraban. El objetivo es que entren aunque el jugador se quede reparando. Después precisó que, si no hay zombis, tiene que poder reparar sin límite; los límites, solo con zombis.

- **Sin zombis en la ventana:** un tablón cada 0,2 s (`BARRICADES.repairTapCooldown`), como antes. Una ventana vacía se repara entera en menos de 1 s.
- **Con zombis en la ventana:** un tablón cada 2 s (`BARRICADES.repairTapCooldownUnderAttack`).
  - Cuenta cualquier zombi, no solo los caminantes: el usuario dijo «caminantes» por los zombis en general. Hay zombis en la ventana si alguno arranca sus tablones o va hacia ella y está a menos de 48 px de su punto de entrada. Es el mismo grupo que acelera el arranque de tablones (`crowdsWindow`).
  - Esos 2 s tienen que ser más que lo que tarda el zombi más lento en arrancar un tablón (el caminante, 1,4 s): si no, un zombi solo nunca entraría. Un test lo comprueba con todos los tipos.
- **Cuando se va el último zombi** (ha trepado, por ejemplo), la espera larga se corta en ese momento. Solo se corta si el jugador está ante una ventana que puede reparar y sin zombis. Con la ventana llena no hay nada que reparar y la espera sigue corriendo; si no, se rellenaría al instante cada tablón arrancado.
- **Medido, desde que el primer zombi empieza a arrancar hasta que no queda ningún tablón,** con el jugador tocando todo lo rápido que puede:
  - un caminante: 19,6 s;
  - un corredor: 9,0 s;
  - dos caminantes: 5,6 s;
  - cuatro caminantes: 2,2 s.
- **Los puntos por tablón no cambian:** +10, con el tope de 500 por ronda.
- **El botón muestra la espera larga:** se atenúa, deja de parpadear y un toque lo sacude sin reparar nada. Cuando vuelve a valer un toque, se ilumina y parpadea. El +10 sigue en ámbar mientras espera: no es que falte dinero. Los 0,2 s de la reparación libre no se señalan, para que el botón no parpadee a cada toque.

## Spec 04 · A5 (documento de diseño)

- **`docs/GAME-DESIGN.md`:** registro vivo de las reglas, no del código. Enlazado desde `CLAUDE.md`, con la regla de actualizarlo en el mismo commit que cambie una regla o un precio.
  - Además del mínimo de la spec (armas, mejoras por arma, vitrinas, magos y economía), recoge las barricadas y los zombis. Las reglas de esta sesión (ritmo de reparación, fuerza del grupo de zombis, 5 por bala) estaban repartidas por `DECISIONS.md`.
- **Se hizo después de la spec 05** (O1–O3), así que ya refleja al mago rojo invocado en la piscina. Los objetos especiales y las activaciones se añaden en la O4.

## Spec 05 · Objetos especiales

Antes de empezar se resolvieron dos choques con el usuario:
- **El inventario no cabía a la derecha de la vida** en 640×360: entre el número de vida y la pausa quedan unos 80 px, y cuatro huecos con 44 px de toque necesitan 176. Va en una fila horizontal a la izquierda de los puntos; si hace falta sitio, la pausa se mueve un poco a la izquierda (fase O2).
- **El mago rojo «sale de la piscina»,** pero los dos puntos de mago del jardín (M13, junto al árbol, y M14, contra el cobertizo) estaban a 25–33 tiles del agua. M13 pasa al borde de la piscina; el validador acepta el borde del agua como «pared» (fase O3).

### O1 · Objetos en el mapa y recogida

- **Catálogo por datos** (`src/config/items.ts`): `living_heart` y `worn_wand`, con su color y su regla de aparición (`spawn: { when: 'match_start', excludeStartZone: true }` en la varita). El corazón va en `STARTING_ITEMS` y se da al empezar en la O2, con el inventario visible. Los números van en `ITEMS` (`balance.ts`) y los textos en `STRINGS.items`.
- **Puntos de objeto:** tabla `## Objetos` del plano, con ids `I1`–`I19` (las `O` ya eran de los spawns abiertos). Hay 19: dos por zona y uno en el recibidor, la zona inicial, donde la varita nunca aparece. Cada uno está junto a algo que cuenta una historia:
  - la caja fuerte abierta del estudio;
  - la puerta abierta del coche del garaje;
  - la barbacoa volcada;
  - el colchón del refugio del sótano;
  - el campamento de la azotea.
- **Validador** (`validate-map`): 1 o 2 por zona; casilla libre de su zona y alcanzable a pie; a 2 tiles o más (de centro a centro) de barricadas, puertas, portales, spawns, puntos de mago y vitrinas. La distancia se mide sea cual sea la zona del otro elemento, como en los puntos de mago. El plano rechaza los que caen bajo cualquier atrezo, con o sin colisión.
- **«Sobre una mesa baja» choca con «casilla transitable»:** las mesas tienen colisión y bloquean su casilla. Los objetos van junto al mueble, no encima.
- **Sorteo de la varita:** con el RNG de la partida, al crear el estado (`placeMatchItems` en `createGameState`), entre los puntos de cualquier zona salvo la inicial y sin repetir punto entre objetos. Si no hay punto disponible no se gasta ningún número aleatorio, así que el mapa de pruebas (sin puntos) mantiene su secuencia.
- **Estado:** el inventario es de cada jugador (`PlayerState.items`, en orden de recogida); los objetos del suelo son de la partida (`GameState.groundItems`, que se quedan inactivos al recogerse).
- **Recogida:** acción contextual `pickup`, la última en prioridad, cuando no hay nada más a mano.
  - El orden de las demás no cambia: mago, vitrina, puerta o portal, reparar. La spec lo da distinto, pero los puntos guardan distancia entre sí y no coinciden.
  - El botón dice `RECOGER VARITA DESGASTADA` con el icono del objeto. Con el inventario lleno dice `INVENTARIO LLENO` y se sacude.
  - Al recoger, evento `item:picked`: vibración ligera y el nombre en el aviso del HUD durante 1,5 s.
- **En el suelo**, a petición del usuario, un foco circular como los marcadores de misión de GTA San Andreas: un círculo de luz ámbar que se suma al suelo y late cada 1,2 s, con su borde, y el objeto dentro.
  - La varita es, de momento, un palo sin detalles. El usuario dará más adelante el diseño de la varita y del corazón.
  - El icono es el mismo que el del HUD, con colores fijos para poder dibujarlo en el canvas.
  - Se dibuja con los pickups, por debajo de la oscuridad de las zonas cerradas: allí se ve como el resto de cosas de la habitación, sin indicador.

### O2 · Inventario, corazón desde el inicio y uso

- **El corazón vivo se lleva desde el inicio** (`STARTING_ITEMS`, en `createPlayerState`).
- **Inventario** (`src/input/ItemBar.ts`, `controls.css`): una fila a la izquierda de los puntos, a su altura.
  - Está anclada a la distancia que ocupan los puntos con 6 cifras (141 px), así que los huecos no se mueven cuando sube la puntuación. Con pocas cifras queda un hueco entre la fila y los puntos.
  - Crece hacia la izquierda: el primer objeto recogido queda junto a los puntos y uno nuevo no mueve a los demás. El orden de recogida va, por tanto, de derecha a izquierda.
  - Solo se dibujan los huecos ocupados.
  - Cada hueco mide 28 px, un cuadrado de la placa del kit (9-slice) con el icono a 1×. Se toca en 44×44 (8 px de margen invisible) y hay 16 px entre huecos, para que los márgenes se junten sin pisarse.
- **La pausa se mueve a la izquierda solo cuando hace falta:** `left: min(50%, …)` calcula el borde de la fila con 4 objetos y 6 cifras. En 844×390 y 800×360 sigue centrada; en 640×360 pasa 49 px a la izquierda, sin tocar la fila de la vida.
  - Comprobado con 1, 2 y 4 objetos y con 0 y 999999 puntos: sin solapes con la pausa, los puntos ni la vida.
- **Los «+N$» flotantes pasan debajo del dinero,** a la izquierda de los huecos de arma. A la izquierda de los puntos caían sobre el primer hueco en cuanto la puntuación tenía 5 cifras.
- **Uso:** el toque viaja como `InputCommand.useItem` (índice del hueco) y lo resuelve `ItemSystem.updateItems`.
  - En la O2 no hay ningún lugar donde usarlos: siempre sale `item:cantUse`. El objeto no se gasta, el hueco se sacude, hay vibración ligera y sale `AQUÍ NO SE USA` sobre el jugador durante 1,2 s.
  - Es un solo texto que sigue al jugador: un toque nuevo lo reinicia y no apila otro.
  - Va con el reloj de la escena, así que la pausa lo congela.
  - Un toque en un hueco vacío no hace nada.

### O3 · Activaciones e invocación del mago rojo

- **Catálogo por datos** (`src/config/activations.ts`): `summon_red_merchant`, que acepta el corazón y la varita en cualquier orden en el `site` `pool` y tiene como efecto `summon_merchant` del rojo. El estado es de la partida (`GameState.activations`, paralelo al catálogo): qué ha recibido, en qué orden, cuándo aterriza cada objeto, quién lo tiró y si está completa.
- **Lugar en el mapa:** tabla `## Activaciones` del plano → `activation_site` `pool`, el rectángulo del agua (40,7)–(50,9). El validador exige el sitio de cada activación.
- **Uso:** un objeto se acepta si el jugador está a menos de 40 px del borde del rectángulo (contando su hitbox), la activación no está completa, acepta ese objeto y aún no lo ha recibido; con `order: 'fixed'`, solo el que toca. Si no, sale `AQUÍ NO SE USA` como en la O2.
- **Tirar:** el objeto sale del inventario (los demás se recolocan) y vuela en arco 0,4 s hasta el punto del agua más cercano al jugador, donde salpica (un aro y cuatro gotas).
  - La piscina lo recuerda desde el toque, pero el agua solo cambia cuando el objeto ha caído.
  - **La invocación ocurre cuando cae el segundo objeto**, no al tocarlo: así el mago no aparece mientras el objeto aún vuela.
- **Agua** (`ActivationSiteViews`): con un objeto dentro, un tinte rojizo tenue (24 %) y cuatro burbujas lentas que se quedan. Al completarse, rojo al 50 % y catorce burbujas rápidas durante 1,5 s; luego, el agua normal para siempre.
- **El mago rojo:**
  - Sale en el punto de mago libre más cercano a la piscina dentro de su zona; si no hay, en el libre más cercano de cualquier zona. M13 se ha movido al borde sur de la piscina, (45,10), y el validador acepta el borde del agua como «pared» para los puntos de mago.
  - Aparece al momento, con su humo, marcado como la visita de esta ronda: se teletransporta desde la ronda siguiente.
  - Si ya estaba activo (por el botón de debug), se mueve a la piscina.
- **`merchants.ts`:** `enabled`/`firstRound` pasan a una regla `appears`:
  - azul, `{ by: 'round', round: 2 }`;
  - rojo, `{ by: 'activation', id: 'summon_red_merchant' }`;
  - dorado, sin regla (solo con el debug, que sigue funcionando y se salta el ritual).
  - Un test de las mejoras del rojo lo activaba a mano sin marcar su ronda, y ahora se teletransportaba en el siguiente paso; se le marca la ronda, como hacen el debug y la invocación.
- **Aviso** `EL MAGO ROJO HA SIDO INVOCADO` en el color del mago durante 2,5 s, para todos. Vibración fuerte para quien tiró el último objeto.
- **Pausa:** el agua, el vuelo, la salpicadura y `AQUÍ NO SE USA` van con el reloj de la simulación y se congelan. Los avisos del HUD (animaciones CSS) se congelan con la clase `is-paused` en la raíz del HUD.

### O4 · Debug y documentación

- **Debug:**
  - `DAR OBJETOS` da los objetos del catálogo que no se llevan, mientras haya hueco. Si alguno está en el suelo, desaparece de allí, porque los objetos son únicos.
  - `IR A LA VARITA` deja al jugador sobre la casilla de la varita mientras siga en el suelo; la cámara salta con él. Esa casilla siempre es transitable, así que la puede recoger al momento.
  - `MOSTRAR PUNTOS DE OBJETO` dibuja, por encima de la oscuridad, una cruz violeta en cada punto de objeto, un aro ámbar donde aún hay un objeto y el marco de los lugares de activación.
- **`ASSETS-TODO.md`:** el sprite `item` (corazón y varita, a la espera de los diseños del usuario), la salpicadura, las burbujas de la piscina y los iconos del HUD de los dos objetos.
- **`GAME-DESIGN.md`:** nueva sección de objetos especiales y activaciones.

## Cambio de gameplay: el mago rojo vende 3 mejoras a elegir

Petición del usuario: el mago rojo da 3 tipos de mejora a elegir (cadencia, munición y daño), con 3 niveles cada uno, y cada nivel más caro que el anterior. Antes cada arma tenía una sola cadena fija de 3 niveles (munición ×2, cadencia ×1,5, daño ×2) a 3000$ el nivel.

Respuestas del usuario a las preguntas:
- **Potencia por nivel, más fuerte que antes:** munición ×1,5/×2/×2,5; cadencia ×1,25/×1,5/×1,75; daño ×1,5/×2/×2,5. Es el total a cada nivel: los niveles de un tipo no se multiplican.
- **Precios:** 1500$, 3000$ y 5000$ por nivel, iguales para los tres tipos (`UPGRADE_PRICES` en `merchants.ts`).
- **Una compra por visita,** como antes, del tipo que sea.
- **HUD:** una marca por tipo (icono de 7 px: bala, rayo, cruceta) con una casilla por nivel, en ámbar al comprarlo, en lugar de las estrellas.

Cómo queda:
- **Catálogo** (`weapons.ts`): cada arma dice cuántos niveles admite de cada tipo (`upgrades: { ammo: 3, fire_rate: 3, damage: 3 }` en las tres básicas). La tabla común `UPGRADE_LEVELS` da los factores. Sigue valiendo «cada arma tiene sus propias mejoras»: un arma especial futura podrá admitir menos tipos o menos niveles.
- **Estado:** el `level` único del arma pasa a `levels` por tipo.
  - Los cargadores y las reservas salen enteros en todos los niveles (se redondean por si acaso).
  - La cadencia de la escopeta sigue acelerando también su recarga.
- **Tienda:** tres artículos (`upgrade_ammo`, `upgrade_fire_rate`, `upgrade_damage`) para el arma en mano.
  - El precio de un artículo puede ser fijo o uno por nivel; `itemPrice` da el del nivel que se compraría.
  - Cada fila dice el arma, el nivel al que sube y lo que da («PISTOLA: nivel 1 → 2, cadencia ×1,5»), con el icono de su tipo.
- **Vitrinas:** la confirmación para cambiar un arma mejorada sigue con una estrella por nivel comprado, sumando los tres tipos.
- **Debug `+NIVEL ARMA`:** sube un nivel del tipo que menos tiene, entre los que admiten más.
- **El icono de la mejora especial del mago dorado pasa a ser una estrella,** porque la cruceta es ahora la del daño.

## Cambio de gameplay: se desbloquean salas, no puertas

Petición del usuario: comprar una puerta desbloquea la sala, y entonces todos sus accesos están abiertos. No tenía sentido abrir A→B, entrar en C y encontrar cerrada la puerta de C a B: desde cualquier sala abierta se debe poder ir a una sala desbloqueada.

- **Regla** (`ZoneSystem`): una puerta o un portal está abierto en cuanto sus dos salas están desbloqueadas.
  - Al desbloquear una sala se abren sus accesos a las salas ya abiertas.
  - Las puertas hacia salas aún cerradas siguen cerradas y las venden: desbloquear una sala nunca abre gratis la siguiente, en cadena.
  - Al empezar la partida solo están abiertos los accesos entre salas iniciales (en la mansión, ninguno).
- **Respuestas del usuario:**
  - **Portales, igual que las puertas.** Las escaleras principales venden la sala del otro extremo. Las entradas secundarias (trampilla jardín–sótano, escalera de mano calle–azotea), que antes se compraban por 1000$ y 1250$ con las dos salas abiertas, pasan a ser atajos gratis que se abren solos; hasta entonces dicen «BLOQUEADA».
  - **Un precio por sala:** el de su acceso principal más barato. Salón y comedor 750$; biblioteca y cocina 1000$; garaje y calle 1250$; jardín 1500$; sótano 1750$; azotea 2000$.
    - Cambian dos compras: la calle desde el recibidor, de 1500$ a 1250$, y la biblioteca desde la cocina, de 1250$ a 1000$.
- **Mapa:** el precio pasa a la columna `precio` de la tabla `## Zonas` del plano (propiedad `cost` de las zonas en Tiled). Puertas y portales pierden su coste.
  - El validador exige un precio de 750$ a 2000$ a cada sala que empieza cerrada.
  - También exige que cada una tenga al menos una puerta o una escalera principal por la que comprarla.
  - El mapa de pruebas (`room01`) pasa a tener precio por sala: pasillo 750$, almacén 1000$.
- **Botón de acción:** «DESBLOQUEAR COCINA · 1000$», o «… · FALTAN 250$». Los nombres de las salas van en `STRINGS.zones`, por id; una zona sin nombre allí dice SALA. El evento `action:context` lleva la sala (`room`).
- `door:opened` y `portal:opened` (vibración media) solo salen por el acceso comprado; los que se abren solos no vibran.
- `openDoor` y `openPortal` (usados por los tests y el debug) desbloquean las dos salas y aplican la misma regla.


## Los zombis nunca aparecen donde puede andar el jugador: entran desde fuera del mapa

Petición del usuario: fuera de la casa, a veces aparecían zombis de la nada a su lado. Eran los spawns de las ventanas, 2 casillas por fuera, ya dentro de la calle o el jardín desbloqueados, y los spawns abiertos, que surgían del suelo en mitad de la calle. Dentro de la primera sala aparecen fuera de ella, y eso le parece bien.

- **Regla:** un zombi nunca aparece donde puede andar el jugador.
  - **Spawns de ventana:** el cargador guarda la zona en la que cae cada uno. Si esa zona está desbloqueada, el spawn se apaga.
    - Dentro de la casa no cambia nada: sus spawns caen en exteriores aún cerrados.
    - Al desbloquear el jardín o la calle se apagan los spawns de las ventanas que dan a ellos. Los zombis llegan a esas ventanas cruzando el exterior desde fuera del mapa.
  - **Spawns abiertos → spawns de entrada:** ya no van en el dibujo (`Z` desaparece de la leyenda). Van solo en la tabla `## Spawns de entrada`, con una casilla fuera del mapa o en el vacío.
    - El zombi aparece allí y entra andando en línea recta hasta la primera casilla de su zona. Es el estado `entering`, que sustituye a `emerging`: surgir del suelo era justo el «de la nada».
    - El cargador busca esa casilla en las 4 direcciones, a 3 casillas o menos y solo con vacío entre medias. Si no la encuentra, el mapa no carga.
  - **Vallas en el borde del mapa** (F1 y F2): su spawn caía en la fila 0, que la cámara enseña. El compilador lo pone una casilla más allá, fuera del mapa.
- **A 2 casillas del borde:** a una casilla, el sprite quedaba a 2 px de verse por los lados. Por abajo asomaba la cabeza, porque el sprite se ancla en los pies.
- **Entradas de la mansión:**
  - Calle, 8 entradas: los dos extremos de la calle lateral (E1, E2), su borde oeste (E3–E6) y el final de la calle de abajo (E7, E8). E7 y E8 caen en el vacío pasada la columna 81, donde termina la cámara.
  - Azotea: norte y este (E9–E11), desde el vacío.
- **Distancia:** una entrada no se usa con un jugador a menos de 8 casillas (`WAVES.openSpawnMinDistanceTiles`) de la casilla por donde entra. Así nadie le entra encima a quien espera en el borde. El peso por distancia andando cuenta desde esa casilla más el paseo de entrada.
- **Validador:** con todo desbloqueado tiene que quedar algún spawn: uno de ventana fuera de toda zona, o una entrada.
- **Ritmo:** en mitad de la calle de abajo, las entradas más cercanas estaban a unas 40 casillas. Un caminante tardaba unos 40 s, un corredor unos 22 s. Se resolvió abriendo las vallas de los vecinos del sur (sección siguiente).

## Huecos en las vallas de los vecinos del sur

Petición del usuario, tras la anterior: abrir huecos en las vallas de los vecinos para que los zombis lleguen antes al centro de la calle de abajo.

- **Plano:** la franja de los vecinos (filas 65-67, solo 3 casillas de fondo) pasa a ser 5 parcelas de 13, 14, 16, 12 y 11 casillas.
  - Las separan vallas que llegan hasta el borde del mapa.
  - Cada una se abre a la acera por un hueco descentrado de su valla del frente:
    - tres cancelas de 2 casillas, cada una con el sendero de acera hacia la casa del vecino, que queda fuera del mapa;
    - una entrada de coches de 3 casillas;
    - un tramo de 3 casillas reventado por la horda, con un rastro de tierra pisoteada desde el borde.
- **Zona:** las parcelas pasan a ser de la calle: el jugador puede entrar en ellas.
- **Entradas:** E12–E16, una bajo cada hueco, a 2 casillas del borde de abajo.
  - En mitad de la calle, la entrada más cercana queda a 17 casillas andando (antes, 41). Delante del porche, a 27.
- **Atrezo:** buzón, cubos, neumáticos, bidón, barbacoa volcada, astillas de la valla rota y una farola caída.
  - Con 3 casillas de fondo, los sólidos van pegados a la valla del frente o en los rincones; en la fila central dejarían un paso de 1 casilla.
  - Por eso no hay árboles: con 2×2, siempre dejan un paso de 1 casilla.

## Apuntar antes del primer disparo

Petición del usuario: al pulsar el botón de disparo, a veces el dedo cae descentrado, se apunta a mano sin querer y la primera bala falla hasta corregir la puntería. Hay que dejar un tiempo mínimo entre el primer apuntado y el primer disparo de cada arma.

- **Dónde:** en el sistema de armas, no en el control táctil. La entrada solo produce comandos (regla 2), y en el online el servidor aplicará la misma espera.
  - El estado del jugador lleva `aimTime` (segundos desde que empezó la pulsación) y `shotPending` (la pulsación aún no ha disparado).
- **Cuánto:** `firstShotDelay` en cada arma de `weapons.ts`, igual en las tres. Empezó en 0,15 s. El usuario no notaba la espera y pidió subirla a 1 s; después la bajó a 0,5 s y luego a 0,3 s.
  - Durante la espera la puntería se actualiza cada tick (manual o automática), así que el jugador ya gira y se ve hacia dónde va a disparar.
- **Toques cortos:** con una espera simple, un toque más corto que la espera (lo normal en el móvil) no dispararía nunca. Por eso un toque dispara una vez cuando se cumple el tiempo, hacia donde apuntaba en el último tick pulsado.
  - Si en ese momento no puede disparar (recargando, cambiando de arma, enfriamiento), el disparo se descarta. Así nunca sale una bala suelta segundos después.
- **Cada pulsación nueva espera de nuevo.** Mantener pulsado no vuelve a esperar entre balas.
- **El cuchillo no espera:** ni en su botón ni en el de disparo cuando no queda munición.
- **Tests:** el ayudante `holdFire` deja al jugador con el botón pulsado y la espera cumplida, para los tests que miran las balas y no la espera.

## La puerta no dice qué sala desbloquea

Petición del usuario: no saber a qué sala lleva una puerta hasta abrirla. Al desbloquearla sale en el centro «X desbloqueado/desbloqueada».

- **Botón:** «DESBLOQUEAR · 1000$» o «DESBLOQUEAR · FALTAN 250$». Las escaleras principales dicen lo mismo, y las secundarias siguen diciendo «BLOQUEADA».
  - El evento `action:context` ya no lleva la sala (`room`): el HUD no puede saber cuál es.
- **Aviso:** `unlockZone` emite `zone:unlocked` (id de la zona) solo si la sala estaba cerrada. El HUD lo enseña con el aviso del centro (el de los magos y los objetos), en color hueso y durante `DOORS.unlockedNoticeTime` (2 s).
  - Se ve para todos los jugadores, porque abre el mapa a todos.
  - Las puertas que se abren solas no avisan: la sala de detrás ya estaba desbloqueada.
- **Género:** «COCINA DESBLOQUEADA», «GARAJE DESBLOQUEADO». Cada sala lleva su género en `strings.ts`; una zona sin nombre dice «SALA DESBLOQUEADA». También tienen nombre las del mapa de pruebas (pasillo y almacén).

## Spec 06 · Fase H1 (tipos de ataque y katana)

- **Pregunta resuelta antes de empezar:** la mano empieza en el salón o el comedor, no en la calle. Desde el recibidor también se compra la calle (D8), pero el usuario prefiere que arranque dentro de la casa. La regla queda así: salas interiores que se compran desde la zona inicial.
- **`attack` en el catálogo** (`bullets`, `beam`, `melee`, `cone`). Lo que gasta cada arma sale de ahí con `ammoKind`: las de cuerpo a cuerpo nada, el rayo su batería y el resto balas.
  - Un arma sin balas deja cargador, reserva y recarga a 0. Así la recarga automática, los premios de munición y la munición máxima no le hacen nada sin código aparte.
  - `spread` y `bulletSpeed` pasan a ser opcionales, porque solo los usan las balas. `arc` (grados) es el arco de las de cuerpo a cuerpo y de cono.
  - Un arma especial en una vitrina hace fallar al cargador del mapa (`BASIC_WEAPON_IDS`).
- **Katana:**
  - Un barrido golpea a todos los zombis vivos cuyo borde está a 34 px o menos y dentro de ±70° del apuntado.
  - Una pared entre medias lo protege, con la misma prueba que las balas, así que una ventana no lo protege.
  - El empuje usa la regla de la escopeta: solo a zombis que andan libres. Pasa a `knockZombie`, compartido.
  - **Dirección sin arrastre:** el zombi más cercano a su alcance, 34 px más el radio del zombi. Va directo a él, sin la corrección del cañón de las balas. Sin ninguno cerca, hacia donde mira el jugador.
  - `firstShotDelay` 0: el barrido sale el primer tick de la pulsación, y luego cada 0,45 s mientras se mantiene, con el mismo enfriamiento que los disparos.
  - El movimiento no frena con un arma de cuerpo a cuerpo en la mano.
  - Con la katana en el inventario, el botón de disparo nunca saca el cuchillo por falta de munición (`hasAnyAmmo` cuenta las armas que no gastan balas).
- **Vista provisional:** el arco del cuchillo, 1,8 veces más grande y más separado (`meleeWide` en el estado del jugador). El cuchillo pone `meleeWide` a falso.
- **HUD:**
  - La fuente pixel no tiene el carácter ∞, así que es un icono pixel ámbar de 9×5 en lugar de la bala y los números.
  - En la columna de armas, el hueco de la katana no muestra número y nunca sale vacío.
  - `weapon:state` y `weapons:loadout` llevan `ammo` (`rounds`, `battery` o `none`).
- **Debug:** `DAR KATANA`.

## Spec 06 · Fase H2 (láser)

- **Golpes de daño:** son la cadencia del arma (`fireRate` 10, `damage` 0,6 por golpe a cada zombi: 6 por segundo) y van por el mismo enfriamiento de disparo que las balas. El primer golpe sale al empezar el rayo, después de la espera del primer disparo.
- **Geometría, la de las balas:** el rayo sale del cañón dibujado y las paredes se miden por el suelo justo debajo, así que el rayo se ve terminar en la cara de la pared. Toca a un zombi si su cuerpo dibujado corta la línea.
  - Un zombi pegado al jugador, entre el pecho y el cañón, también recibe, como con la pistola.
  - El largo medido (`beamLength`) queda en el estado del jugador para la vista.
- **Batería por arma** (`battery`, `batteryIdle`, `overheat` en el hueco del arma):
  - Se gasta en cada tick de rayo.
  - Fuera del rayo, el bloqueo por sobrecalentamiento corre hacia 0, y la recarga empieza tras `rechargeDelay` sin disparar.
  - Como el reposo cuenta también durante el bloqueo, al acabar los 3 s la recarga empieza en el acto ("luego recarga con normalidad").
  - Un láser enfundado también se recarga.
- **Solo pulsado:** un toque más corto que la espera del primer disparo no da ningún destello de rayo. La regla del toque corto que dispara una vez al cumplirse la espera es solo para las armas de balas.
- **Puntos cada 0,5 s:** cada zombi guarda el tick del último golpe continuo que puntuó (`contactScoreTick`), compartido con el lanzallamas.
  - Los golpes intermedios no dan puntos ni sacan sangre.
  - Un golpe que mata sí saca sangre y da la muerte.
  - En multijugador, el tick sería por zombi, no por jugador: lo más simple por ahora.
- **HUD:**
  - Barra ámbar de batería de 56×8 px en lugar de la bala y los números, en pasos de 2,5 % para no publicarla cada tick.
  - En sobrecalentamiento, la barra parpadea en rojo junto al texto `SOBRECALENTADO`.
  - En la columna de armas, el hueco del láser no muestra número.
- **Vista provisional (`LaserBeam`):** una línea de 2 px roja clara con un núcleo blanco de 1 px y un destello que parpadea al final, sobre todo lo demás, como las balas.
- **Debug:** `DAR LÁSER`.

## Spec 06 · Fase H3 (lanzallamas, quemadura generalizada y mejoras doradas)

- **Quemadura generalizada:** `igniteZombie(z, total, duración, dueño, infernal)`. Quien prende dice el daño total y la duración; el reparto por golpe es el total entre los golpes que caben en la duración, cada 0,15 s para todos.
  - La escopeta prende con el 40 % de su impacto durante 1,5 s, como antes. El lanzallamas, con 2 durante 2 s.
  - **Volver a prender un zombi que arde:** se queda la duración más larga y el mayor daño por golpe. Con la misma arma eso es reiniciar, sin apilar.
- **Lanzallamas:**
  - Dos ritmos aparte: los golpes de daño usan la cadencia y el enfriamiento de disparo, como el láser (`fireRate` 10, `damage` 0,4); el gasto de munición va con su propio contador, `fuelTimer`.
  - Gasta 12 por segundo: una unidad al empezar el chorro y luego una cada 1/12 s. Un chorro que para gasta una nueva al volver a empezar.
  - **Cono:** desde los pies del jugador, como la katana, a 90 px del borde del zombi, dentro de ±20° del apuntado y sin pared en medio.
  - Cada golpe prende primero y daña después, así que un zombi que muere por el chorro muere ardiendo.
  - Solo dispara mientras se mantiene pulsado, como el láser.
- **Fuego infernal, en dos pasos:**
  - Al matar a un zombi que arde con fuego infernal, `damageZombie` deja una explosión en la cola de la partida (`blasts`, del tamaño del pool de zombis).
  - `BurnSystem` las hace estallar ese mismo tick: daño 2, que no puntúa, y prende con el fuego del lanzallamas a todo zombi a 40 px de su borde y sin pared en medio.
  - Las explosiones que eso provoca se procesan en la misma pasada. La cadena termina porque cada zombi muere una vez.
  - Así el combate no depende de la quemadura (no hay dependencia circular), y no hay estado fuera de la partida.
  - **Error encontrado en los tests:** liberar el hueco de una explosión antes de terminarla dejaba que la explosión encadenada lo reutilizara a medias, cambiándole la posición. Ahora la posición se copia antes y el hueco se libera al final.
  - El evento `fire:blast` saca un anillo de llamas en la vista.
- **Sobrecarga** (láser): daño ×2 y gasto de batería ×0,5.
- **Filo de sangre** (katana): suma 2 de vida por cada zombi que mata el barrido, con un máximo de 10 por barrido y sin pasar de la vida máxima.
- **Magos:**
  - El rojo dice `NO MEJORABLE` con un arma especial, porque admite 0 niveles.
  - El dorado vende la especial de las tres.
  - La munición máxima del azul rellena el lanzallamas y no cuenta el láser ni la katana para «MUNICIÓN COMPLETA», porque un arma sin balas siempre está llena.
- **Vista provisional (`FlameJet`):** llamas del efecto de quemadura lanzadas desde el cañón en abanico sobre el cono, que vuelan hasta el alcance creciendo y desvaneciéndose, y un anillo de llamas por cada explosión.
- **Debug:** `DAR LANZALLAMAS`. La especial se activa con `ESPECIAL ARMA`, que ya existía.

## Ajuste tras probar las armas especiales en el móvil

- **Katana, recorrido ×3:** el alcance pasa de 34 a 102 px. El arco se queda en 140°, porque el triple no cabe en un círculo.
  - El tajo dibujado se escala con el alcance. `meleeRange` sustituye a la marca `meleeWide`: el arco del cuchillo, escalado por `meleeRange / MELEE.range`.
  - Al apuntar sola, la katana busca el zombi más cercano a 102 px más su radio.
- **Lanzallamas, alcance ×1,5:** de 90 a 135 px. El chorro dibujado lo sigue solo, porque lee el alcance del catálogo.

## Katana con enfriamiento de 5 s y cambios en el sorteo de la mano

Petición del usuario tras probar las armas especiales: el láser y el lanzallamas están bien, pero la katana necesita un enfriamiento de 5 s. Además, las armas especiales deben salir poco, la mano debe dar también las básicas, y a veces no debe dar nada.

- **Katana:** 5 s entre barridos (respuesta del usuario: «sí, 5 s entre barridos»).
  - El enfriamiento es del arma (`cooldown` en su hueco) y no del jugador. Corre también enfundada: cambiar a la pistola no lo salta, y la pistola dispara al momento sin esperar a la katana.
  - `fireRate` pasa a 1/5. El barrido usa el enfriamiento del arma, no el de disparo del jugador.
  - **HUD:** mientras se enfría, en el sitio del ∞ se ve la barra de la batería del láser, llenándose. `weapon:state` lleva `cooldown`, la parte que falta de 0 a 1, en pasos de 2,5 %.
- **Sorteo de la mano** (respuestas del usuario; cambia el §3.5 de la spec 06, que daba 35 % de especiales y 65 % de básicas):
  - 20 % arma especial, 70 % arma básica y 10 % nada.
  - Si no da nada, la mano se abre vacía tras las siluetas, se hunde y el pago (dinero o vida) se pierde. Cuenta como un uso para el cansancio.
  - Si un grupo de armas no tiene ninguna disponible (las lleva todas), su parte pasa al otro grupo. La de «nada» no cambia.

## Spec 06 · Fase H4 (la Mano del Demonio)

- **Puntos en el mapa** (`hand_spot`, tabla `## Mano` del plano): colocados con la skill `level-design`, uno por sala salvo el recibidor, en sitios con historia:
  - salón: ante el hogar;
  - comedor: a los pies de la mesa de la última cena;
  - biblioteca: al pie de las estanterías;
  - cocina: entre la isla y el horno;
  - garaje: junto a la mancha de aceite;
  - jardín: delante del cobertizo;
  - calle: una grieta en el asfalto frente al sendero;
  - sótano: frente a la caldera;
  - azotea: junto al campamento de los supervivientes.
- **Validador:**
  - Uno por zona y ninguno en la inicial.
  - En su zona, libre y con las cuatro vecinas libres, alcanzable a pie.
  - Dentro de un cuadrado libre de 3×3, que es la regla del paso de 3 tiles.
  - A 3 tiles o más de barricadas, puertas, portales, puntos de mago, vitrinas y puntos de objeto.
  - El mapa de pruebas (`room01`) tiene uno en el pasillo y otro en el almacén.
- **Dónde empieza:** en el punto de una sala interior que se compra desde la zona inicial, por una puerta o una escalera principal (respuesta del usuario: salón o comedor, no la calle).
  - En un mapa sin salas interiores así, vale cualquiera de las que se compran desde el inicio; si tampoco hay, cualquier sala con punto.
  - El sitio y los usos (de 4 a 8) se sortean con el RNG de la partida al crearla, después de los objetos especiales: con la misma semilla, la misma mano.
  - La colocación vive en `handSpawn.ts`, aparte de `HandSystem`, para que `GameState` no cargue los sistemas.
- **Sorteo:** el reparto que dio el usuario (10 % nada, 20 % especial, 70 % básica), nunca un arma que lleva el jugador y sin repetir la última que ofreció si hay otra en su grupo. Un grupo vacío pasa su parte al otro. Se sortea al pagar.
- **Botón de acción:** va detrás de magos, vitrinas, reparar, puertas y portales, y delante de recoger objetos.
  - Con la mano esperando:
    - `MANO DEL DEMONIO · 950$`;
    - si falta dinero, `PACTO DE SANGRE · 40 VIDA` en rojo;
    - con 40 de vida o menos, `FALTAN X$` atenuado (tiembla al tocarlo).
  - Con la mano abierta, solo para quien pagó: `COGER ESCOPETA` con el icono del arma. Si va a sustituir un arma mejorada, la confirmación de las vitrinas: `CAMBIAR SMG ★★ POR KATANA` y un segundo toque en menos de 3 s.
  - Mientras la mano está ocupada (subiendo, pasando siluetas, vacía o hundiéndose), el botón no la ofrece.
- **Pacto de sangre:** resta 40 de vida y emite `player:damaged` desde la propia posición del jugador (marco rojo y sangre, sin empuje). En modo dios también cobra: es voluntario.
- **Secuencia:** sube 0,6 s, pasa siluetas 2 s, se abre 8 s con el arma (parpadea los 3 últimos) o vacía 1,2 s, y se hunde 0,6 s.
  - Si el arma no se coge a tiempo, se hunde con ella y el pago se pierde.
  - El arma cogida entra con la munición completa, por `giveWeapon` y `refillWeapon`, igual que en una vitrina.
- **Arma especial:** al abrirse, `hand:offer` con `special` produce un destello (un aro blanco que se abre) y su nombre en rojo en el aviso del centro durante 1,5 s.
- **Vista provisional (`HandView`):**
  - La grieta tiene brasas que laten cada 0,4 s.
  - La mano crece y encoge desde la grieta, con el puño o abierta.
  - Las siluetas pasan cada vez más despacio y nunca adelantan el resultado. Son los iconos del HUD a ×1,5 (`weapon_icon`, generados desde `ui/icons.ts`).
  - Todo queda bajo la niebla de una sala bloqueada. La columna de brasas que se ve por encima llega en la H5.
- **`WEAPON_ICONS`** pasa de la barra de armas a `ui/icons.ts`, para que los placeholders lo usen sin depender de la entrada.

## Spec 06 · Fase H5 (cansancio y mudanza, columna de brasas, flecha y debug)

- **Cansancio:**
  - En cada sitio, `usesLeft` (de 4 a 8, sorteado) baja con cada pago normal. Una tirada sin arma también cuenta, como pidió el usuario.
  - El pago que la encuentra a 0 no sortea: la mano sube, pasa a `mocking` (1,5 s), devuelve el pago al terminar la burla (el dinero, o los 40 de vida sin pasar del máximo), se hunde y queda en `away` 2 s.
  - Después, `moveHand` la lleva al punto de otra zona, distinta de la actual y de las iniciales, abierta o no. Sortea sus usos de nuevo y emite `hand:moved`, que muestra «LA MANO SE HA MOVIDO» en rojo 2 s.
  - El HUD enseña la devolución del dinero como un «+950$» flotante.
  - Mientras está fuera, no se ve la grieta, ni las brasas, ni la flecha.
- **Columna de brasas:** 22 cuadraditos rojos y naranjas que suben 48 px desde la grieta, se balancean y se desvanecen, a una profundidad propia (`DEPTH.handEmbers`) por encima de la niebla y por debajo de las balas. La primera versión, de 16 brasas de 1-2 px, apenas se veía sobre la oscuridad; ahora son 22 de 2-3 px.
- **Flecha:** la misma de los magos (`edgeArrow`, la textura `offscreen_arrow`), teñida de rojo oscuro. Solo con la sala de la mano desbloqueada y en el nivel que enseña la cámara.
- **Debug:**
  - `MANO GRATIS`: activa y desactiva `hand.debugFree`. Los pagos no cobran, y una burla no devuelve nada porque no se pagó.
  - `MOVER MANO`: la muda en el acto.
  - `FORZAR BURLA`: pone sus usos a 0, así que el siguiente pago es la burla.
  - `MOSTRAR PUNTOS DE MANO`: una cruz roja en cada punto y un aro en el actual.

## Arte de la Mano del Demonio: la mano, su agujero y las brasas; el pacto de sangre

- **La mano (`demon_hand`), 32×48 y cuatro poses**, en lugar de los 20×28 y tres poses de la spec 06 §3.7, a petición del usuario:
  1. puño;
  2. garra abierta hacia arriba con la palma encendida, sosteniendo el arma;
  3. abierta y vacía;
  4. el gesto obsceno: el dedo corazón, con el dorso de la mano hacia la cámara. Sustituye al dedo que dice «no» de la spec, a petición del usuario, que eligió de entre los intentos el de la semilla 14 por más real.
- **Cuándo sale cada pose:**
  - el puño al subir y mientras pasan las siluetas;
  - la palma encendida mientras el arma está en la mano, también si se hunde con ella;
  - vacía cuando el arma se coge (se hunde con la palma apagada) o cuando el sorteo no da nada;
  - el gesto dura también mientras se hunde, y durante la burla da un golpe de 2 px hacia arriba (en vez del vaivén del «no»).
- **Cómo se hizo (PixelLab):**
  - La garra abierta salió de *Create Image (Pro)* a 32×48, con el zombi y el jugador como referencia de estilo: 1 de 16 candidatos.
  - Las otras tres poses salen de editar esa misma mano con *Pro Flash*, para que compartan antebrazo, base y colores y no haya saltos al cambiar de pose:
    - vacía apagando la palma;
    - el puño cerrándola;
    - el gesto girando el puño con *Pro Flash* (el intento de la semilla 14); conserva el antebrazo.
  - PixelLab generó el gesto a la primera: 4 intentos, todos válidos.
- **Retoques a mano** (en `retocado/`, junto a los originales):
  - puntas de brasa en las garras de las dos poses abiertas;
  - todo desplazado (+2, +6) px, para centrar el antebrazo y apoyar su base en el borde inferior, que es el ancla;
  - una paleta común de 32 colores, fusionando cada vez los dos colores más parecidos, sin inventar ninguno.
- **El arma sobre la mano:** flota a 28 px sobre esa línea de suelo, acunada por la garra justo encima de la palma encendida. Las siluetas del sorteo pasan a 44 px, por encima del puño.
- **Sale del suelo, no se estira.** La spec la hacía crecer desde la grieta (escala vertical), y se notaba el sprite doblado. Ahora la mano sube entera y se recorta a ras de suelo, 7 px por debajo del centro del agujero, hacia su parte delantera:
  - la base del antebrazo queda dentro del fuego;
  - el arma baja con ella y también se recorta.
- **El agujero** (sustituye a la grieta de 28×16), tres hojas de 48×40 con una paleta común. Mide 46 px de ancho por dentro de 34: la primera versión, de 26, se quedaba corta y los lados de la mano abierta (28 px) pisaban el borde.
  - `hand_crack`: sellado por una costra cuyas grietas laten. Es el estado de espera, a 5 fps.
  - `hand_crack_opening`: la costra rompiéndose, con un fogonazo.
  - `hand_crack_open`: abierto con el fuego dentro, a 10 fps.
  - El agujero abierto salió de *Create Image (Pro)* a 48×40, con el de 32 px como referencia (1 de 16 candidatos), y la costra de editarlo con *Pro Flash*. Las tres animaciones son *Animate Image* con el primer y el último fotograma fijados.
  - **Cierre:** son los fotogramas de la apertura al revés. Así la costra se vuelve a formar sobre el mismo borde.
- **Tiempos** (de la vista; las fases de `HAND` no cambian):
  - **Al subir:** el agujero se abre en 0,24 s y la mano empieza a salir a los 0,12 s, con el agujero a medio abrir; acaba de salir al final de los 0,6 s.
  - **Al hundirse:** la mano entra en 0,36 s y el agujero se cierra en los 0,24 s restantes.
  - **Al mudarse** (después de la burla): la costra se desvanece en 0,4 s donde estaba.
  - Las funciones puras `holeLook` y `handRise` lo calculan y tienen tests.
- **Brasas** (`hand_ember`): 5 chispas de PixelLab (de 2 a 6 px) en lugar de los cuadraditos dibujados por código.
  - Suben detrás de la mano, ordenadas con los personajes; delante tapaban la mano.
  - Ya no tienen profundidad propia (`DEPTH.handEmbers` desaparece).
- **Nada de una sala bloqueada se ve.** Esto cambia la spec 06 §3.2 y la fase H5, a petición del usuario: la columna de brasas se veía por encima de la oscuridad y delataba la mano a través de las paredes.
  - Ahora la columna solo se dibuja con la sala de la mano desbloqueada.
  - El agujero y la mano quedan bajo la niebla, como todo lo demás.
  - Al empezar, la mano no da ninguna pista: hay que abrir salas hasta dar con ella.
- **Importar objetos:** `assets:import` también lee `art-src/pixellab/objects/<clave>/`, con un `import.json` que ordena los fotogramas (`docs/ASSETS.md` §6).
  - Los placeholders del agujero, la mano y las brasas siguen los tamaños y fotogramas nuevos, por si falta algún PNG.
- **Pacto de sangre** (cambia la spec 06 §3.3, a petición del usuario: curándose, se podían pedir armas sin parar):
  - **Cuesta la mitad de la vida máxima** (`HAND.bloodShare`, 0,5: 50 de vida), en lugar de 40. Solo se ofrece con más de eso, así que sigue sin matar.
  - **Uno por jugador en cada sitio de la mano.** Lo anota `hand.bloodPacts`, con los ids de quienes lo hicieron, y se vacía cuando la mano se muda. Con dinero se sigue pagando sin límite.
  - Hecho el pacto y sin dinero, el botón dice «FALTAN X$», atenuado, como sin vida suficiente.
  - Si la mano estaba cansada, la burla devuelve los 50 de vida, y el pacto no se vuelve a ofrecer porque la mano se muda.
  - Con `MANO GRATIS` (debug) el pacto no cobra ni cuenta.

## Katana que se desgasta y láser que se rompe (petición del usuario)

- **Katana:**
  - Barre una vez por segundo (`fireRate` 1, antes 1/5).
  - Aguanta 60 barridos (`durability` en `weapons.ts`); cada barrido cuenta, dé o no a algún zombi.
  - Al quedarse sin usos **se queda rota en su hueco**, a elección del usuario: no corta, ocupa sitio y se puede sustituir como cualquier arma.
  - Rota no cuenta como «algo con lo que atacar»: si las demás armas no tienen munición, el botón de disparo da cuchilladas.
- **Reparar en el mago azul** (`repair`, 1500$):
  - Es una fila por arma que se desgasta (`shows` en `ShopSystem`): solo la katana, y solo si la llevas.
  - La devuelve a 60 usos, rota o solo gastada; con los 60 dice «COMO NUEVA».
  - No tiene límite de compras por visita, como el resto del mago azul.
- **Láser:** a la 8.ª vez que se sobrecalienta (`battery.breaksAfter`) se rompe del todo.
  - Sale del inventario (`removeWeapon`) y pasa a la mano el arma que quede en su hueco (la siguiente, o la anterior si era la última).
  - No se repara. Uno nuevo de la mano empieza de cero.
- **HUD:**
  - La katana muestra sus usos en lugar del ∞, en el HUD y en su hueco de la barra de armas; rota, en rojo con «ROTA» parpadeando, y su hueco sale vacío.
  - El láser muestra una casilla roja por cada sobrecalentamiento que aún aguanta, debajo de su barra de batería y repartidas a lo ancho de ella (a petición del usuario; al principio iban a su derecha).
  - Al romperse cualquiera de las dos, aviso en rojo en el centro (`weapon:broken`).

## Arte de los objetos especiales: la varita y el corazón (PixelLab)

- **Un sprite animado por objeto** (`item_<id>`, 24×24, 8 fotogramas en bucle), en lugar de la hoja `item` de 12×12 con un fotograma por objeto.
  - La misma hoja sirve en el suelo, en vuelo hacia la piscina y en el HUD.
  - Los fps viven en el catálogo (`items.ts`): el corazón a 10 (un latido cada 0,8 s) y la varita a 12.
- **Varita desgastada:** madera gastada con una tira de cuero, de *Create Image (Pro)* (1 de 64 candidatos, con el contorno y el sombreado de la mano). La animación son rayos blanco-azulados que chisporrotean en la punta, con *Animate Image* y el primer y último fotograma fijados.
  - **Flotar** lo hace el código (`floats` en el catálogo): en el suelo sube 5 px sobre su foco y oscila 2 px cada 1,6 s.
  - En el inventario no flota: se queda quieta con sus rayos.
- **Corazón vivo:** un corazón humano anatómico, con la aorta, la grasa y las venas coronarias (1 de 64 candidatos). La animación es el latido: se contrae dos veces y se relaja.
- **El foco del suelo** pasa de 11 a 15 px de radio, para que quepa el sprite de 24 px.
- **HUD:**
  - Los huecos del inventario pasan de 28 a 40 px (24 por dentro del marco de la placa), con el sprite a 1×. Se siguen tocando como 44×44.
  - El botón de recoger muestra el sprite en lugar del icono a 2×.
  - La animación es CSS (`steps()`) sobre la misma hoja del manifiesto: `src/ui/itemSprites.ts` las registra al arrancar desde `manifest.objects`, sin Phaser.
  - Un objeto sin arte sigue con su icono de píxeles.

## El fuego del juego con el arte de la mano

- **Llamas** (`flame`): pasan del placeholder de 6×8 a 3 lenguas de fuego de PixelLab de 8×12.
  - Usan la paleta del fuego del agujero de la mano, como referencia de estilo en *Create Image (Pro)* (3 de 64 candidatos).
  - Una es centrada, otra inclinada a la derecha y la tercera es esa misma en espejo, como el patrón del placeholder.
  - El fuego del agujero no sirve como llama suelta: es una hoja de 48×40 con el borde y los cascotes.
- **Chispas:** las brasas de la mano (`hand_ember`) salen mezcladas con las llamas: una de cada cuatro partículas.
  - **Lanzallamas y fuego infernal:** van a la mitad de velocidad y duran 1,4 veces más, así que siguen volando cuando las llamas ya se han apagado.
  - **Zombis ardiendo:** suben más rápido y más alto (40 px/s), se mecen más y duran 1,6 veces más.
  - Las chispas no cambian de tamaño ni de fotograma: solo se desvanecen.
- **Flecha hacia la mano:** negra (el `ink` del juego), en lugar de roja oscura, a petición del usuario.
- **Varita:** se sustituye por la versión que el usuario retocó en la galería de PixelLab: quitó el píxel claro suelto al final del mango en los fotogramas que lo tenían.
  - Se exportó con el banco de trabajo de PixelLab: una edición que no cambia nada devuelve la hoja de fotogramas.
  - Pasa por el mismo proceso que antes: fotogramas 1-8, alfa 0/255 y 32 colores.

## El dash, debajo del cuchillo

- A petición del usuario: con 3 armas, la columna de armas llegaba demasiado cerca del dash, que estaba a la derecha de recargar.
- **Posición:** el dash pasa a la izquierda del disparo, justo debajo del cuchillo y en la misma columna, con 14 px entre los dos.
  - Para que quepa, el cuchillo sube 10 px.
  - Centros respecto al del disparo, con la y hacia arriba: recargar (−14, +76), cuchillo (−76, +14) y dash (−76, −34).
- **Toques:** el cuchillo y el dash tienen 7 px de margen invisible cada uno, en lugar de 14, así que ninguno se queda los toques del otro (el límite cae en la mitad del hueco).
  - El dash queda fuera del círculo de toque del disparo.
- En 844×390 la columna de 3 armas acaba en y = 183 y el dash empieza en y = 323.

## HUD más limpio: sin cuenta atrás en el dash, sin número de vida y la ronda más pequeña

- Todo a petición del usuario.
- **Dash:** su botón ya no muestra los segundos que faltan. Como los demás botones, solo indica el enfriamiento con la sombra que baja hasta que vuelve a estar listo.
  - La mejora de la ronda sigue con sus segundos, porque cuentan lo que le queda activa, no un enfriamiento.
- **Vida:** se quita el número («100») junto a la barra. La barra ya lo dice, y su `aria-label` («Vida: 100») lo mantiene para lectores de pantalla.
- **Ronda:** el «RONDA N» bajo la barra de vida pasa de 16 a 11 px, con 2 px de sombra en lugar de 3. El aviso grande de inicio de ronda no cambia.

## Menos armas especiales en la mano

- A petición del usuario, el sorteo de la Mano del Demonio pasa a 10 % nada, **10 % arma especial** (antes 20 %) y **80 % arma básica** (antes 70 %), en `HAND.chances`.
- Las demás reglas del sorteo no cambian: nunca un arma que ya llevas, no repite la última y un grupo vacío pasa su parte al otro.

## Arte de PixelLab para las armas y los botones del HUD

- **Armas** (`weapon_icon`, 32×16, en el orden de `WEAPON_IDS`): cada una de perfil apuntando a la derecha, con *Create Image (Pro)* y los sprites del jugador y del zombi como referencia de contorno, sombreado y detalle (1 de 64 candidatos por arma).
  - **Las elegidas:**
    - pistola de corredera clara y cachas de madera;
    - SMG con culata plegable;
    - escopeta de dos cañones con culata de madera;
    - katana de empuñadura forrada;
    - láser con la célula roja;
    - lanzallamas de cuerpo de latón con depósito rojo y llama piloto.
  - **Dónde se ven:**
    - encima de la mano, a 1× (antes los iconos del HUD a 1,5×), tanto las siluetas del sorteo como el arma ofrecida;
    - en los huecos de armas;
    - en el botón de acción (vitrinas y «COGER …»).
  - La tienda sigue con los glifos teñidos del color del mago, como el resto de sus filas.
- **Sobresalen del botón a propósito** (petición del usuario): la escopeta y la katana ya salían del hueco y las demás quedaban justas, así que todas comparten ese estilo.
  - Las armas miden 30-31 px de ancho, en huecos de 32 px con aro: pisan el aro por los lados.
  - Los símbolos de los botones redondos van en un lienzo de 36×36, más grande que el botón (34 px). Las piezas en diagonal (cuchillo, martillo y llave) salen por las esquinas y el cargador lo cubre de arriba abajo.
  - La pistola, la SMG, el láser y el lanzallamas se volvieron a generar más grandes, con su versión anterior como referencia. La pistola grande salió apuntando a la izquierda y se usa en espejo.
- **Botones redondos** (`icon_reload`, `icon_repair`, `icon_knife`, `icon_dash`, 36×36), con las piezas del HUD (aros, octógono, hexágono, marco de vida) como referencia de estilo.
  - **Recargar:** dos cargadores con las balas doradas asomando. Sustituye a las flechas en círculo, que no se entendían.
  - **Reparar:** un martillo cruzado con una llave inglesa.
  - **Cuchillo:** un cuchillo de combate de hoja clara.
  - **Dash:** una bota ámbar con líneas de velocidad, en lugar del rayo (elección del usuario). El diseño sale de una tanda a 24 px que el usuario eligió, regenerado más grande con esa bota como referencia.
  - El rayo se queda en la mejora de velocidad, que no es el dash.
- **«Enrollados»:** muchos candidatos de PixelLab a estos tamaños venían con trozos pegados al borde contrario del lienzo (la corredera de la pistola abajo, la culata de la escopeta a la izquierda).
  - Se desenrollan desplazando filas y columnas en círculo hasta que el dibujo queda junto. Después se recorta y se centra.
  - Los originales sin tocar se guardan junto a `retocado/`.
- **En el HUD:** `src/ui/sheetIcons.ts` registra al arrancar las hojas `weapon_icon` e `icon_*` del manifiesto (regla 5) y corta el fotograma con CSS, a 1× y pixelado. Una hoja sin arte devuelve `null` y el botón conserva su glifo SVG. Los botones no recortan su contenido, así que el icono puede salirse.
- **Paleta:** la hoja de armas se reduce a 32 colores (de 225) sin diferencia visible, y cada icono redondo a 32 como mucho.

## Spec 07 · Fase B1 (catálogo, calendario, cuerpo de 2×2 y navegación propia)

- **Comprobación previa (pedida por el usuario):** con todas las puertas abiertas y el atrezo como transitable, un cuerpo de 2×2 llega a todas las salas de cada nivel de la mansión (planta baja, sótano y azotea). No hubo que tocar el mapa. El salón tiene un rincón de 2 posiciones que no conecta con el resto, sin importancia.
- **Datos:** `src/config/bosses.ts` tiene el catálogo (`BOSSES`), las variantes (`BOSS_VARIANTS`) y el calendario (`BOSS_SCHEDULE`). Las reglas comunes a todos los bosses van en `BOSS` de `balance.ts`.
  - Ids en inglés: el Matarife es `butcher`; las variantes, `base`, `rabid` (rabioso) y `putrid` (pútrido).
  - **Vuelta del ciclo:** «×1,3 por cada vuelta» se aplica compuesto. La ronda 36 lleva ×1,3, la 60 ×1,69.
  - **Vida:** base × variante × vuelta × jugadores (spec 07 §9).
- **Estado:** `GameState.bosses` es un pool de 2 huecos (`BOSS.maxAlive`). Cada boss guarda el centro de su huella, su vida, su fase, su objetivo (el jugador vivo más cercano) y su propia quemadura. `GameState.propsDestroyed` (paralelo a `MapData.props`) recuerda los muebles aplastados.
- **Navegación (`BossNav`):** un recorrido en anchura sobre las posiciones donde cabe la huella (su casilla de arriba a la izquierda), desde las posiciones que quedan a una casilla del objetivo.
  - **Lo paran:** paredes, agua, vacío, casillas sin suelo, ventanas, vitrinas, escaleras y trampillas (siempre), y puertas cerradas, salas bloqueadas, la casilla del agujero de la mano y la de cada mago (según la partida). El atrezo no lo para: lo aplasta.
  - **Ritmo:** recalcula al ritmo del campo de flujo (0,25 s) o en cuanto el objetivo cambia de casilla, y rehace entonces las casillas bloqueadas.
  - **Un `BossNav` por hueco de boss**, en `SimContext.bossNavs`: cada boss persigue a su propio objetivo.
- **Cuerpo:**
  - Choca con una caja 2 px más pequeña por lado que la huella (60×60), para que entre por una puerta de 64 px sin estar perfectamente alineado. Se mueve eje a eje y en pasos de 8 px como mucho.
  - Si choca en un eje, el resto del paso va por el otro hacia la siguiente posición. Sin esto se quedaba rozando las esquinas de las puertas a una fracción de su velocidad.
  - La huella entera (64×64) aplasta el atrezo con colisión que toca.
- **Muebles aplastados:** pierden la colisión para todos (`clearPropCells` rehace sus casillas con lo que hay debajo) y el campo de flujo de los zombies se recalcula. En el mapa, el mueble se vuelve transparente y en su huella aparece una mancha de astillas (`boss_rubble`, 32×32, repetida en mosaico).
- **Contacto:**
  - Al jugador lo saca de su huella sin hacerle daño: cuando el boss anda, hacia los lados de su marcha; si no, por el lado más cercano. El dash lo atraviesa.
  - A los zombies los aparta a los lados de su marcha.
  - Dos bosses nunca se pisan: se separan a medias por el eje en que menos se solapan.
- **Daño:** le dan todas las armas.
  - Balas, rayo y perdigones, por su caja de impacto (64×80) sobre el borde inferior de la huella. Las balas perforantes lo atraviesan como a un zombie (cuenta como uno de sus impactos).
  - Cuchillo, katana y lanzallamas, por el punto de su huella más cercano al jugador. Vale si ese punto o su centro caen en el arco o el cono, porque cualquier parte de un cuerpo tan grande cuenta.
  - Quemadura y estallidos del fuego infernal: arde como un zombie, pero al morir no estalla.
  - Nada lo empuja.
  - Puntos: los de cada impacto, como en un zombie. Su muerte no da los 50 de una baja: sus recompensas llegan en la B5.
  - El apuntado automático y el cuchillo eligen al boss si está más cerca que el zombie más cercano.
- **Muerte:** fase `dead` con el cadáver 1,5 s (se desvanece en el último medio segundo) y el evento `boss:killed`.
- **Barra de vida:**
  - Bajo el botón de pausa y centrada en él, porque en pantallas estrechas el botón se desplaza a la izquierda. Con dos bosses se apilan.
  - Lleva el nombre en rojo, una barra roja y una marca negra en el 50 %. Enfurecido, la barra se pone ámbar.
  - Con una tienda abierta se oculta, porque el mago se ve justo ahí, encima del panel.
  - Comprobado en 844×390, 800×360 y 640×360 con dos barras, tres armas, objetos y la mejora guardada: sin solapes y con al menos 4 px de hueco.
- **Debug:** `INVOCAR MATARIFE` lo pone a andar a 5 casillas o más del jugador (la regla del punto de entrada, sin `boss_spot` todavía) y nunca encima de otro boss. `MATAR BOSS` mata a los que haya. Con `HITBOX` se ven su huella (roja) y su caja de impacto (amarilla).

## Spec 07 · Fase B2 (puntos de boss, validador, entrada y reaparición)

- **Puntos en el mapa** (`boss_spot`, tabla `## Bosses` del plano): colocados con la skill `level-design`, 15 en total. Hay uno en cada sala interior y dos o tres en las grandes (jardín, calle, sótano y azotea), para que haya donde elegir a 5 casillas o más del jugador:
  - recibidor: donde se hundió la escalera (la aplasta al salir);
  - salón: bajo la barricada de muebles de los supervivientes;
  - comedor: bajo la mesa de la última cena;
  - biblioteca: entre las estanterías y la mesa de lectura;
  - cocina: en el office;
  - garaje: en el taller;
  - jardín: el césped del fondo y el del lado del garaje;
  - calle: el jardín delantero, la calzada frente a la entrada de coches y la calle lateral;
  - sótano: el refugio del colchón y el fondo;
  - azotea: cerca de la escalera y el rincón noroeste.
- **Validador:**
  - Al menos un punto por zona. Cada uno es el centro de un cuadrado de 3×3 de suelo sin paredes, ventanas, vitrinas ni portales (el atrezo vale), dentro de su zona.
  - A 3 tiles o más (de centro a centro) de puertas, portales, vitrinas, puntos de mago y puntos de la mano.
  - **Alcance de un cuerpo de 2×2 (pedido por el usuario):** con todas las puertas abiertas, el atrezo transitable y los puntos de la mano como sólidos, las posiciones de la huella de cada nivel forman un solo grupo que toca todas sus salas. Los portales llevan a otro nivel y el boss no los usa, así que se comprueba nivel a nivel. La mansión cumple sin tocarla.
- **Tabla nueva en el compilador:** el plano solo leía las tablas cuyo título empezaba por una palabra conocida; se añade `bosses`.
- **Elección del punto:** el camino de 2×2 del boss mide «andando» la distancia de cada punto al jugador, y así un punto de otro nivel o de una sala bloqueada queda fuera solo. Nunca elige un punto por el que esté saliendo otro boss ni uno sobre el que haya un boss. Si ningún punto vale (un mapa sin puntos), sale en la posición libre más cercana a 5 casillas o más, como el debug de la B1.
- **Secuencia:**
  - **Aviso, 3 s:** se abre la grieta, que es el agujero de la mano dibujado al doble (96×80), con temblor de cámara todo el aviso y vibración media. Bajo tierra el boss no se ve, no choca y no recibe daño.
  - **Salida, 1,2 s:** aplasta el atrezo de las 3×3 casillas. Quien esté dentro recibe 20 × el daño de su variante (el dash y el modo dios lo esquivan, como cualquier golpe) y sale empujado por el lado más cercano de la grieta. Trepa cortado a ras de suelo, como la mano, y sigue sin recibir daño.
  - **Rugido, 1 s:** la barra aparece y desde entonces se queda (`introduced`). Ya se le puede hacer daño. Hay un golpe corto de cámara.
- **Reaparición:**
  - Si el jugador está en otro nivel que el boss (con los niveles de `computeLevels`; en un umbral de puerta no cuenta), se hunde al momento.
  - Si lleva 5 s sin camino hasta él, también.
  - Al hundirse (1,2 s) es invulnerable. Luego elige punto con la misma regla («el más adecuado de la zona del jugador» es el más cercano andando a 5 casillas o más, que suele estar en su sala) y repite el aviso. Conserva la vida.
- **La oscuridad:** solo cubre salas bloqueadas, y un boss solo sale y anda por salas desbloqueadas, así que la grieta va sobre el suelo, bajo los personajes, y nunca queda tapada.
- **Debug:** `INVOCAR MATARIFE` ya hace la entrada completa en el punto que toca.

## Spec 07 · Fase B3 (avisos en el suelo y embestida)

- **Ataques:** el boss pasa a la fase `attacking`, con el ataque en curso (`attack`) y su etapa (`stage`: preparación, carrera, aturdido, frenada, recuperación).
  - Al terminar vuelve a andar un tiempo al azar de `walkTime` (1,5 a 2,5 s) y reevalúa su objetivo: el jugador vivo más cercano (spec 07 §9).
  - Cuando se le acaba el tiempo de andar, elige ataque con las reglas de distancia de §4.4 (el elector completo llega en la B4). Si ninguno vale, sigue andando y vuelve a pensarlo 0,25 s después.
  - Los parámetros de cada ataque van en el catálogo (`BOSSES.butcher.charge`) y los tiempos de preparación se multiplican por la variante, nunca por debajo del 80 %. El momento en que se fija la dirección (0,3 s antes de salir) también se escala.
- **Avisos en el suelo (`BossZones`):** se calculan del estado del boss (`bossZone`), así que la simulación no guarda nada solo para dibujarlos.
  - Rojo translúcido que se va llenando (del 15 % al 50 % de opacidad) con un borde más marcado.
  - Van sobre el suelo y sus manchas y bajo los personajes. La oscuridad solo cubre salas bloqueadas, donde un boss nunca ataca, así que no los tapa.
- **Embestida:**
  - **Pasillo:** sale del borde delantero de la huella, con el ancho del cuerpo (64 px), y llega hasta donde va a llegar: si una pared lo para antes de 256 px, el pasillo acaba en la pared. Es la «zona exacta» de la spec y le dice al jugador dónde está a salvo.
  - **Choque:** cualquier cosa que pare su cuerpo cuenta como pared (paredes, puertas cerradas, ventanas, vitrinas, escaleras, magos, el agujero de la mano), aunque solo roce de lado en una carrera en diagonal. Aturdido 2 s, recibe el doble de daño de todo. Sin choque frena 0,6 s.
  - **Jugador alcanzado:** 45 × el daño de la variante, una vez por embestida, y sale lanzado 24 px en la dirección de la carrera; luego el cuerpo sólido del boss lo aparta a un lado. Si el dash lo salva, no cuenta como alcanzado.
  - **Zombies arrollados:** mueren sin dar puntos a nadie. Sí pueden soltar botín, como cualquier zombie que muere.
  - **Aviso al chocar:** el evento `boss:stunned` da un golpe corto de cámara.
- **Bloqueos al día:** las casillas que paran al boss se rehacen también al empezar cada ataque, no solo al andar, para que el pasillo y el choque usen las puertas y los magos tal como están en ese momento.
- **Debug:** `FORZAR EMBESTIDA` hace que embista en cuanto termine lo que esté haciendo, sin mirar la distancia ni si fue su último ataque. En la B3 es el único ataque, y como nunca repite, tras la primera embestida solo anda: el elector completo llega en la B4.

## Spec 07 · Fase B4 (triple mazazo, tres saltos, elección de ataque y furia)

- **Triple mazazo:**
  - Cada golpe dibuja antes su arco (160°, 84 px desde el centro). El primero se prepara 0,7 s y los siguientes 0,5 s, con el factor de la variante, porque esa espera es el aviso del golpe siguiente.
  - Da a quien esté a 84 px o menos del centro del boss, dentro del arco y sin pared en medio: 30 × la variante, con un empujón de 16 px en total.
  - **Giro y avance:** justo después de cada golpe gira hacia el jugador (45° como mucho) y avanza 16 px de una vez, así el arco del golpe siguiente se dibuja ya donde va a caer y la zona es exacta durante todo el aviso.
  - Los zombies no sufren el mazazo (la spec no lo pide).
- **Tres saltos:**
  - **Aterrizaje:** donde estaba el jugador al despegar, exactamente, si su cuerpo cabe ahí. Si no, en el hueco de 2×2 más cercano (a 6 casillas como mucho), nunca encima de otro boss.
    - Al principio se alineaba siempre a la rejilla, y eso acercaba el aterrizaje hasta 22 px a un jugador que huía. Con el punto exacto se cumplen las cuentas de la spec: corriendo en línea recta (140 px/s) ni el aterrizaje ni la onda alcanzan; andando (70 px/s) no alcanza el aterrizaje (queda a 49 px), pero sí la onda.
  - **Alcance:** cada salto llega como mucho a 360 px (`leap.maxRange`). La spec no le pone tope, pero sin él saltaría a través de medio mapa. Más lejos, el elector no elige saltos y el boss sigue andando; un segundo o tercer salto hacia un jugador que se ha alejado se queda a 360 px en su dirección.
  - **En el aire:** 0,7 s × la variante, en línea recta por encima de todo. No recibe daño ni choca. El dibujo sube y baja en arco con su sombra en el suelo, y el círculo de aterrizaje (44 px) se llena.
  - **Daños:** el aterrizaje hace 45 × la variante a quien esté a menos de 44 px de su centro (de centro a centro) y aplasta el atrezo bajo la huella. La onda es un anillo de 16 px que crece a 170 px/s hasta 130 px. Da 20 × la variante una vez por salto a quien esté en su banda con línea de visión al punto de aterrizaje: las paredes la paran y las ventanas no.
  - **Ritmo:** la onda sigue creciendo aunque el boss haga otra cosa y desaparece al llegar a su tamaño; antes del siguiente aterrizaje ya ha terminado. Entre saltos hay 0,5 s en el suelo y, tras el tercero, 1,5 s quieto.
  - Cada aterrizaje da un golpe de cámara y una vibración fuerte. Ni el aterrizaje ni la onda dañan a los zombies.
- **Elección de ataque:** con los pesos de la spec, guardados en el catálogo (`choice.close` y `choice.mid`), y medida del centro del boss al jugador. Nunca repite el último ataque; si no queda ninguno posible, sigue andando y vuelve a pensarlo en 0,25 s.
- **Furia:** al bajar del 50 %, ruge 1 s con un destello rojo (el dibujo parpadea en rojo) y queda enfurecido hasta morir: anda un 25 % más rápido y anda la mitad de tiempo entre ataques. Las preparaciones no cambian.
  - Si la furia llega en mitad de un ataque, ruge al terminarlo.
  - Las variantes rabiosa y pútrida empiezan enfurecidas, sin rugido de furia aparte.
  - La barra se pone ámbar.
- **Daño a los jugadores:** todos los golpes pasan por `damagePlayer`, así que el dash y el modo dios los esquivan. Un jugador que esquiva con el dash no cuenta como alcanzado, y si al acabar el dash sigue en la zona, el golpe aún puede darle.
- **Debug:** `FORZAR MAZAZO` y `FORZAR SALTOS`, como `FORZAR EMBESTIDA`.

## Panel de depuración a pantalla completa (petición del usuario)

- Con los botones de los bosses, la lista del panel pasaba del borde inferior en un móvil apaisado, y en el teléfono no se podía desplazar con el dedo.
- **Plegado:** solo se ven las estadísticas, arriba a la izquierda bajo el HUD. Al tocarlas se abre el panel.
- **Abierto:** una hoja sobre toda la pantalla con todos los botones a la vista, en una rejilla que se adapta al ancho y con botones de 34 px de alto. Se queda abierta mientras se usa y se pliega con `CERRAR`. Comprobado en 640×360, la pantalla más pequeña: caben los 29 botones sin desplazar nada.
- Los botones actúan al soltar el dedo.

## Spec 07 · Fase B5 (la ronda de boss, sus recompensas y el corazón vivo)

- **Ronda de boss** (las del calendario de `bosses.ts`):
  - La mitad de sus zombies, redondeando hacia arriba: 13 en la ronda 6.
  - Sus bosses salen 5 s después de que aparezca el cartel de ronda; la grieta se abre a los 5 s y el Matarife ruge hacia los 9 s.
  - Si hay dos y uno no cabe, se queda fuera.
  - `GameState.wave.bossDelay` guarda la espera (-1 si la ronda no tiene bosses) y `roundZombies` da los zombies de la ronda, la mitad en las de boss.
- **Fin de ronda:** cuando no quedan zombies por salir ni vivos, ningún boss vive y no hay ninguno por salir.
  - Cualquier boss vivo retiene la ronda, también uno invocado con el debug (respuesta al usuario).
- **Goteo:** con un boss vivo y los zombies de la ronda ya terminados, en cuanto no queda ninguno vivo empieza a entrar uno cada 6 s. Entra solo si hay menos de 4 vivos, y como mucho 20 en toda la ronda. Salen por los spawns normales.
- **Cartel:** el evento `round:changed` lleva `boss`. Debajo de «RONDA 6» sale «ALGO GRANDE SE ACERCA» en hueso, más pequeño, dentro del mismo cartel, así que el aviso de los magos sigue debajo sin pisarlo.
- **Flecha de borde hacia el boss:** roja como su barra, con el sistema de flechas de los magos. Sale mientras el boss vive, también durante su grieta, y solo en el nivel que enseña la cámara.
- **Recompensas al morir:**
  - **Puntos:** 500 puntos y 500$ a cada jugador vivo. La spec no dice a quién; así sirve igual en cooperativo, y en solitario es lo mismo. Su muerte no suma además los 50 de una baja; cada golpe sí puntúa.
  - **Botiquín y munición:** en la casilla transitable más cercana, separados 14 px.
  - **Corazón vivo:** solo con la primera muerte de un boss en la partida (`GameState.bossKills`), y si no está ya en juego (lo lleva alguien, está en el suelo o lo tiene una activación), porque los objetos son únicos. Cae donde muere el boss o, si ahí no se puede estar, en la casilla transitable más cercana de una sala abierta. Se queda en el suelo con su foco de luz hasta que alguien lo recoge.
- **Corazón vivo por datos:** `STARTING_ITEMS` queda vacío y la regla de aparición del corazón es `{ when: 'first_boss_kill' }` en `items.ts`, junto a la de la varita (`match_start`). Por tanto el mago rojo no se puede invocar antes de la ronda 6.
- **Objetos que aparecen a mitad de partida:** la vista de los objetos del suelo crea la del corazón cuando aparece. Pasa una vez por partida, así que no hace falta un pool.
- **Debug:** `IR A RONDA 6` limpia zombies y bosses y empieza la ronda 6. `RONDA +1` también quita los bosses.
- **Tests adaptados:** los que daban por hecho el corazón al empezar ahora lo dan a mano. El de las rondas 1 a 10 cuenta la mitad de zombies en la 6 y mata también al boss.

## Spec 07 · Fase B6 (variantes, dos bosses, rondas 12 en adelante, debug y documentación)

- **Variantes:** ya se aplicaban desde la B1 (vida, tinte, empezar enfurecido) y la B3–B4 (daño y preparaciones). La B6 añade el charco del pútrido.
- **Charco pútrido:** la spec no da sus números. Elegí:
  - **Tamaño:** el radio del aterrizaje, 44 px.
  - **Daño:** 10 por segundo en golpes de 5 cada 0,5 s, durante 4 s, sin multiplicar por la variante. Quedarse dentro todo el rato quita 40.
  - **Golpes:** no empujan (se dañan desde la posición del jugador) y el dash los esquiva. Los zombies lo cruzan sin daño.
  - Hay 8 charcos como mucho a la vez (el pool); si se llena, desaparece el que menos tiempo le queda. Se dibuja verde, desvaneciéndose en su último segundo.
- **Dos bosses:** solo uno puede empezar a preparar un ataque cada 0,8 s (`GameState.bossAttackAt`); el otro espera lo que falte. Afecta también a uno solo enfurecido, cuyas pausas (0,75 a 1,25 s) pueden quedar 0,05 s más largas.
  - Salen por puntos distintos (B2) y se separan si se tocan (B1). Si con las salas abiertas solo hay un punto libre (por ejemplo, todo cerrado salvo el recibidor), el segundo sale en la posición libre más cercana a 5 casillas o más.
- **Rondas 12 en adelante:** salen del calendario (B1) sin código aparte. Comprobado por test: rabioso en la 12, dos base en la 18, pútrido en la 24 y la 36 como la 12 con ×1,3 de vida.
- **Debug:**
  - **`SIGUIENTE RONDA DE BOSS`:** salta a la siguiente ronda del calendario con bosses (6, 12, 18, 24…), además de `IR A RONDA 6`. Es la forma de probar las rondas 12, 18 y 24 que pide la spec.
  - **`VARIANTE: BASE`:** cambia en cada toque la variante que usa `INVOCAR MATARIFE` (base, rabioso, pútrido). Es el selector de variante de la spec; el botón muestra la elegida.
  - **`MOSTRAR ZONAS DE DAÑO`:** dibuja en magenta dónde daña de verdad cada golpe de cada boss: el contacto de la embestida (su huella más el radio del jugador), el arco del mazazo tal como apunta ahora, el círculo de aterrizaje, la banda de la onda y los charcos.
  - El panel ya tiene 33 botones; con botones de 30 px y columnas de 116 px siguen cabiendo todos sin desplazar en 640×360.
- **Documentación final:**
  - `GAME-DESIGN.md` tiene la sección *Bosses* con las reglas tal como están, el corazón vivo como recompensa del primer boss y los 500 por boss en la economía.
  - `ROADMAP.md` marca las rondas especiales como hechas con este sistema, cierra la pregunta del corazón y corrige el reparto de la mano (10 % especial, 80 % básica), que se había quedado viejo.

## El rastro del pútrido y los golpes de los bosses contra los zombies (petición del usuario)

- **Rastro de la embestida:** el Matarife pútrido deja un charco cada 32 px de carrera, de 24 px de radio (más pequeño que el del aterrizaje, para que se lea como un rastro del ancho de su cuerpo). Dura y daña como los demás.
- **Los charcos ya no suman:** antes cada charco llevaba su propio reloj de daño. Con el rastro, que se solapa, un jugador dentro de varios habría recibido varias veces el daño.
  - Ahora hay un único tic para todos (`GameState.puddleTick`, cada 0,5 s), y quien esté dentro de al menos uno recibe el daño una vez.
  - Cada charco guarda su radio y el pool sube a 32.
- **Los golpes de los bosses dañan a los zombies normales**, con el mismo daño que al jugador (× la variante). La spec decía lo contrario para la onda.
  - **Grieta:** 20 a los zombies dentro de las 3×3 casillas al salir.
  - **Embestida:** ya los mataba.
  - **Mazazo:** en el arco y sin pared en medio, con el empujón de 16 px si sobreviven.
  - **Aterrizaje y onda:** los que están a menos de 44 px del aterrizaje, y una vez por anillo (un bit por hueco de boss en el zombie, `waveHits`, que se limpia en cada aterrizaje).
  - **Charcos:** 5 por tic a quien esté dentro.
  - Esas bajas no dan puntos a nadie (atacante -1), pero sí pueden soltar botín y salpican sangre.
- **Entre bosses no hay daño:** ningún golpe de un boss daña a otro boss (los golpes solo recorren jugadores y zombies).

## El arte del Matarife (PixelLab)

- **Personaje:** modo v3 de PixelLab, lienzo de 128 px, vista *high top-down* y la descripción de estilo de los zombis. Salió más musculoso que gordo y se aceptó así. Mide unos 116×118 px, casi 3 veces el alto del zombi normal; sobresale bastante de su huella de 2×2 casillas, algo más que el placeholder (96×110).
- **Direcciones:** cada animación se generó solo al sur, este y norte. El oeste es el este en espejo (`"mirror"` en su `import.json`), como pedía la spec, y en la animación quieta también las diagonales del oeste, para que el mazo no cambie de mano al pararse.
- **Tomas:**
  - Las plantillas de PixelLab no sirven para un cuerpo así: el andar perdía el mazo y la muerte salía con el maniquí del esqueleto.
  - Se repitieron con animaciones personalizadas (`walk_v3`, `death_v3`), igual que el salto hacia el sur y el este (acababa tumbado) y la embestida hacia el sur (casi no se movía).
  - Las tomas fallidas se quedan en el export y en la cuenta de PixelLab sin usarse; `"sources"` elige de dónde sale cada dirección.
  - De frente a cámara (sur), la embestida y el salto siguen moviéndose poco; el código pone el desplazamiento y el arco del salto.
- **Lienzo:** las animaciones personalizadas llegan en 168 o 172 px con el personaje centrado; todo se importa a 172×172 y los pies quedan en y = 146 (ancla 0,85).
- **Animaciones guiadas por el estado:** el boss no reproduce sus animaciones a su ritmo. `bossFrame` (`entities/Boss.ts`) elige el fotograma por su fase y su ataque:
  - La preparación de la embestida se reparte en lo que dura su windup (más corta en el rabioso).
  - El mazazo levanta el mazo hasta el golpe y lo baja en los fotogramas desde la marca `hit` justo después.
  - El salto está en el aire entre las marcas `air` y `land` mientras dura su vuelo, y aterriza con el resto.
  - El rugido dura lo que la fase de rugir, y la muerte se reproduce una vez y se queda en el último fotograma mientras se desvanece.
  - Andar, embestir y aturdido van en bucle a los fps del manifiesto.
- **Marcas en el manifiesto:** los fotogramas clave (`marks`) son del arte, no del juego, así que viven en el manifiesto junto a cada animación y no en `balance.ts`.
- **Placeholder:** si falta el arte, el boss sigue siendo el dibujo provisional del Matarife (cuerpo y mazo), ahora repartido por animaciones en vez de por poses.
- **Coste:** 112 generaciones (3 del personaje y el resto de animaciones y repeticiones).

## El boss cae del cielo, sus diagonales y el charco de ácido (petición del usuario)

- **Entrada desde el cielo** (sustituye la grieta de la spec 07 §3):
  - **Aviso (`warning`, 3 s):** el boss está en el cielo. En el suelo se llena un círculo rojo, como las zonas de sus ataques, de 48 px de radio (las 3×3 casillas del punto de salida). En el centro crece su sombra.
  - **Caída (`falling`, 0,6 s):** cae acelerando desde 360 px por encima del suelo, fuera de la vista, con los fotogramas en el aire del salto. No bloquea ni recibe daño.
  - **Impacto:** aplasta el atrezo del cuadrado de 3×3 casillas (como la grieta). Hace 20 (× la variante) a quien esté a menos de 48 px más su radio, y a los zombis dentro del círculo. Emite `boss:landed`, que sacude la pantalla y vibra fuerte como el aterrizaje de los saltos, y empieza el rugido.
  - Ya no empuja fuera del círculo: quien se queda debajo sale empujado de su cuerpo, que desde el impacto es sólido.
  - La sacudida larga del aviso desaparece: el suelo no tiembla hasta que cae. El aviso solo vibra el móvil.
- **Recolocarse (`rising`, 1 s):** en lugar de hundirse, salta al cielo con el salto (se agacha, despega y sube acelerando). Cae en el sitio nuevo con el mismo aviso. Se eligió así para que entrar y salir sean lo mismo.
- **La grieta del boss desaparece** de su vista. Su arte sigue siendo el agujero de la Mano del Demonio, que no cambia.
- **Diagonales:**
  - Andar, embestida, mazazo y salto tienen sureste y noreste, generados desde la vista diagonal del diseño base. Suroeste y noroeste salen en espejo.
  - Preparar embestida, aturdido, rugido y muerte siguen en 4 direcciones; en diagonal usan la vista de lado.
- **Descripciones concretas:** a partir de aquí, las animaciones de PixelLab se piden con la acción fotograma a fotograma: qué pasa en cada fotograma y qué no cambia (el mazo en la mano derecha, los pies en el suelo). Así no hay que rehacerlas cuando PixelLab decide por su cuenta.
  - El mazazo pide el impacto en el fotograma 7 y el salto despega en el 2 y aterriza en el 6, para que valgan las marcas `hit`, `air` y `land` del manifiesto.
  - En diagonal el mazo toca el suelo un fotograma antes (el 6). No se nota y no se ha separado la marca por dirección.
- **Tomas sobrantes:** cancelé a tiempo unas diagonales pedidas con las descripciones cortas, pero PixelLab las terminó igual (`walk_v3`, `slam`, `leap_v2` y `charge` tienen sureste y noreste). No se usan: en `import.json`, `sources` pone primero las tomas `_diag`.
- **Lienzo de 176 px:** las diagonales llegan en 176×176. Al centrarlas en 172×172 no se recorta nada del personaje.
- **Charco de ácido (`boss_puddle`):**
  - Imagen de 88×88 con *Create Image (Pro)* (el segundo de 4 candidatos, elegido por el usuario).
  - Burbujeo de 6 fotogramas con *Animate Image*, con el primer y el último fotograma iguales. Se descarta el último generado, casi igual al primero, para que el bucle no repita fotograma.
  - Se dibuja con un pool de sprites (uno por hueco del pool de charcos), escalado al radio de cada charco. Se voltea según su hueco y va desfasado para que el rastro de la embestida no se vea repetido. Se desvanece en su último segundo, como antes.
  - El verde lima del arte es más vivo que el tinte del pútrido; se deja así porque se lee bien como ácido.
- **Coste:** 81 generaciones: 30 de las diagonales buenas, 20 de la imagen del charco, 1 de su animación y 30 de las diagonales canceladas, que PixelLab terminó y cobró igualmente (cancelar un trabajo en marcha no lo devuelve).
- **Andar hacia el sur, rehecho:** el de `walk_v3` casi no movía las piernas de frente a cámara. Se repitió (`walk_south`, 4 generaciones) con la descripción fotograma a fotograma: qué rodilla sube en cada par de fotogramas y un pie siempre en el aire en los fotogramas 1-2 y 5-6. Ahora las piernas se alternan y el cuerpo se balancea.

## La niebla bajo los personajes y el empujón del boss contra las paredes (petición del usuario)

- **Niebla (`DEPTH.fog`):** pasa de la capa 29, por encima de los personajes, a la 9: encima del mapa, del atrezo y de lo que hay en el suelo, y debajo de los personajes.
  - Antes, la oscuridad de una sala bloqueada le cortaba la cabeza al boss cuando estaba junto a su pared, porque su dibujo sobresale 3,7 casillas hacia arriba. Al jugador le pasaba lo mismo, en menos.
  - Lo que está dentro de una sala bloqueada ya se escondía solo (zombis, boss, sangre). Faltaban las vitrinas y la mano del demonio, que dependían de la niebla: ahora se ocultan mientras su sala está bloqueada.
  - Los magos solo van a salas desbloqueadas.
  - La capa de los zombis en la ventana de la oscuridad (`actorsOverFog`) sobra: todos los personajes están ya por encima de la niebla y ordenados por su `y`.
  - El atrezo alto de una sala iluminada que asoma sobre una oscura sigue tapado por la niebla, como antes.
- **El empujón del boss** (`shoveOutOfBox` en `BossBody`):
  - Antes teletransportaba al jugador al borde de su cuerpo (hasta 38 px) y luego lo sacaba de la pared por el lado más cercano.
  - Una pared fina, cuya colisión es solo su base de 7 px (la del recibidor con la cocina), quedaba cruzada de un salto y el jugador acababa en la sala bloqueada.
  - Ahora el empujón avanza con `moveCircle`, en pasos de medio radio, y se para en las paredes. Si una pared lo retiene dentro del cuerpo del boss, sale por el lado más cercano del otro eje. Encajonado en una esquina, se queda donde le dejan las paredes, solapado con el boss hasta que este se aparta.
  - Igual para los zombis que aparta al andar (los que están en el suelo). Los de las ventanas solo se apartan, como antes.
  - Comprobado por fuerza bruta junto a esa pared: 748.440 combinaciones de posición del boss y del jugador, orientación y movimiento, y ninguna lo cuela.

## Sin avisos rojos en el suelo y el aturdido nuevo (petición del usuario)

- **Fuera las zonas rojas:** los ataques del boss ya no dibujan en el suelo el pasillo de la embestida, el abanico del mazazo ni el círculo de los saltos. La caída del cielo tampoco dibuja su círculo. Lo pidió el usuario («los indicadores, no la colisión»): los golpes, sus áreas y sus tiempos no cambian.
  - Se anuncian con la preparación de su animación (agachado escarbando, el mazo en alto, agachado para saltar) y, en los saltos y la caída, con la sombra que crece o le sigue.
  - Sigue el anillo naranja de la onda de los saltos: no es un aviso, es el golpe que avanza.
  - `bossZone` desaparece, y con él `runReach`, que solo servía para que el pasillo llegara hasta donde iba a chocar. `BossZones` pasa a llamarse `BossMarks` (anillos y sombras).
  - El panel de depuración «MOSTRAR ZONAS DE DAÑO» sigue dibujando en magenta dónde daña de verdad cada golpe.
- **Aturdido:**
  - El de antes parecía andar hacia la pared. Se rehízo (`stunned_dazed`, 20 generaciones) con la acción fotograma a fotograma: los pies clavados y sin pasos, las rodillas flojas, los brazos colgando, el mazo apoyado en el suelo y el torso balanceándose a un lado y al otro con la cabeza ladeada.
  - Ahora tiene 8 fotogramas en 5 direcciones (el oeste y sus diagonales en espejo), a 6 fps.
  - Mientras está aturdido, tres estrellas ámbar con contorno oscuro giran sobre su cabeza (dibujadas por código, 120 px sobre sus pies). Las de detrás se ven más pequeñas.

## La barra de vida entera y las barras del boss y del láser (petición del usuario)

- **Barra de vida cortada:** el elemento que exportó PixelLab (`Health_bar.png`, 150×22) venía recortado demasiado justo. Le faltaban el contorno de arriba (los remaches salían partidos), el de abajo y el extremo derecho. En la hoja del kit está entera, así que `import.json` admite ahora una pieza como rectángulo de una hoja (`{ "from", "rect" }`) y la vida sale de ahí (151×31). El canal mide lo mismo (114×13); el marco solo es más alto.
- **Investigación de diseño** (barras de jefe y medidores de arma):
  - **Jefe:** ancha, arriba en el centro, con el nombre y un marco propio para no confundirla con la del jugador. Marcas en las fases y una franja «fantasma» clara que se queda atrás para enseñar el daño recién hecho.
  - **Calor o batería del arma:** junto al arma, de un color propio, con aviso al llegar al límite y marcas de lo que queda. Si es pequeña o de un color que se pierde contra el fondo, cuesta de leer.
- **Diseño elegido:**
  - **Barra del boss:** marco de metal con remaches como el de la vida, una calavera agrietada en lugar del corazón y una muesca a la mitad, donde empieza la furia. El nombre va encima como texto. Por código: el relleno rojo (ámbar enfurecido), la marca de la mitad y la franja fantasma (`hud-boss__ghost`, 0,35 s de espera y 0,45 s de vaciado). Un boss que aparece empieza con la franja llena, sin vaciarse desde la del anterior.
  - **Medidor del láser:** corto y sin emblema, porque la katana usa la misma barra para su enfriamiento. Lleva el relleno ámbar, el hueco rojo parpadeante al sobrecalentarse y debajo los 8 testigos de sobrecalentamientos restantes, repartidos a lo ancho del hueco.
- **Generación:** una llamada a *Create UI Asset* (20 generaciones) con la barra de vida como referencia de estilo y dos piezas colocadas. PixelLab devolvió un kit entero de 256×256 en vez de solo las dos piezas, pero con ellas dentro: una barra con calavera de 147×27 y un medidor de 63×24, que se recortan de `barras/kit.png`. El resto del kit no se usa.
- **HUD:** el relleno de cada barra va dentro de un elemento canal (`hud-boss__trough`, `hud-battery__trough`). Con el skin (`has-ui-boss`, `has-ui-gauge`) se coloca en el hueco del marco; sin él ocupa toda la barra, como antes.

## La onda de los saltos no se dibuja sobre las paredes (petición del usuario)

- **Antes:** el anillo era un círculo completo dibujado por encima de las paredes (capa 4,5), aunque su daño ya se paraba en ellas (`segmentClearShaped` con `BLOCK_SIGHT` desde el aterrizaje).
- **Ahora:**
  - Se dibuja por 128 rayos. Cada uno llega hasta lo primero que le corta la vista, con el mismo criterio que el daño (las paredes por su base; las ventanas no la paran).
  - El alcance de cada rayo (`waveReach`) se calcula una vez por aterrizaje, en un `Float32Array` por hueco de boss.
  - La banda se pinta como cuadriláteros entre rayos consecutivos, con el borde exterior recortado donde se para cada rayo.
- **Capa:** las marcas del boss en el suelo (anillo y sombra) bajan a `DEPTH.floorMarks` (1,75), justo bajo las paredes. Así, la parte de arriba de una pared al sur, que la onda cruza antes de llegar a su base, la tapa.
- **Pendiente aparte:** en 14 de las 170 paredes verticales de la mansión, la celda con cara (una junta o el arranque de un tramo) solo tiene colisión en su base. Queda un hueco de 12 px por el que pasan la vista, las balas y el daño de la onda, y ahora también su dibujo, porque lo sigue fielmente.

## El boss se llama Matarife (petición del usuario)

- El nombre visible pasa de «EL MATARIFE» a «MATARIFE» (`STRINGS.bosses.names.butcher`), que es lo que sale sobre su barra de vida. Los comentarios y la ficha de `GAME-DESIGN.md` lo nombran igual. En las notas antiguas de este documento se queda como estaba.

## La pausa en la esquina y las barras de los bosses arriba del todo (petición del usuario)

- **Botón de pausa:** pasa de arriba en el centro a la esquina inferior derecha, en diagonal bajo el botón de disparo.
  - Cuelga de `--pad-x` y `--pad-bottom` igual que el disparo (`right: pad-x − 18 px`, `bottom: pad-bottom − 14 px`), así que su centro queda siempre a 61,5 px del del disparo en cada eje. Su zona táctil (14 px alrededor) nunca toca el círculo del disparo: hay 87 px entre centros frente a los 78,5 que sumarían.
  - Con los márgenes mínimos (24 y 20 px) queda a 6 px de los dos bordes. En un iPhone con muesca (47 y 21 px) se mete dentro de la esquina redondeada del área segura.
  - Comprobado a 667×375: a 6 px de cada borde, y pausa.
- **Barras de los bosses:** suben arriba del todo (`pad-top + 6 px`) con el nombre encima, y su marco queda a la altura del de la vida. Siguen centradas, y en las pantallas más estrechas se desplazan a la izquierda para no pisar la fila de objetos especiales (la misma fórmula que tenía la pausa).

## La katana corta solo hacia delante, y los tajos nuevos (petición del usuario)

- **Control de la katana:**
  - Con un arma cuerpo a cuerpo en la mano (hoy la katana), el apuntado es siempre hacia donde mira el jugador (`WeaponSystem.updateAim`): se ignoran el arrastre del botón y el giro automático hacia el zombi o el boss más cercano. Mientras corre, mira hacia donde se mueve, así que corta en esa dirección.
  - La regla vive en la simulación: el botón sigue enviando solo «disparar» (CLAUDE.md, regla 2).
  - El botón de disparo (`FireStick`) escucha `weapon:state`. Con un arma cuerpo a cuerpo muestra el icono de esa arma (su fotograma de la hoja de iconos de armas), no mueve la palanca y su etiqueta es «Cortar hacia delante».
  - Mantener pulsado sigue repitiendo el corte en cuanto se enfría (uno por segundo), como antes.
  - Rota y sin munición en las demás armas, el botón da cuchilladas hacia donde mira.
  - El cuchillo no cambia: en su botón sigue girándose hacia el zombi más cercano a su alcance.
- **Tajos de PixelLab** (sustituyen al arco provisional, que la katana ampliaba 5 veces):
  - Cada uno es una imagen de *Create Image (Pro)* elegida por el usuario (la katana, la 3 de 4; el cuchillo, la 1 de 16), animada con *Animate Image* («el tajo se disipa en el sitio»).
  - El dibujo va mirando a la derecha alrededor del centro izquierdo del fotograma (origen 0; 0,5), a 2 px (cuchillo) o 12 px (katana) delante del pecho del jugador, girado hacia el corte. Se ve en cuanto empieza el golpe y se desvanece en el último 40 % de sus 0,25 s.
  - **Cuchillo:** se descartó el último fotograma generado, que traía una línea discontinua suelta.
  - **Katana:** de su animación solo valen los 4 primeros fotogramas; los demás oscurecían la media luna sin adelgazarla, de ahí el desvanecido por código. Se importa en espejo (`"mirror": true` en su `import.json`): PixelLab la dibujó abultando hacia el lado contrario al pedido.
- **Coste:** 48 generaciones (25 y 20 de las imágenes, 2 y 1 de las animaciones).

## Las ventanas: un hueco en su pared y tablones de verdad (petición del usuario)

- **Antes:** la celda de una ventana no llevaba pared (las `W` no eran pared para el autotile), y el dibujo provisional rellenaba toda la celda de negro con rayas marrones encima. Sin tablones se veía un cuadrado negro.
- **La ventana es un hueco en su pared:** al compilar el mapa, cada ventana que no es de valla recibe el tramo de pared de su muro, con la máscara de sus vecinos y la cara del lado que mira (`faceKitOf` trata una `W` de fachada como la fachada). La colisión no cambia: la celda sigue siendo `BLOCK_WINDOW` entera, con la forma de pared anulada. La niebla la trata como pared, igual que el muro de alrededor.
- **Capa:** el sprite de la ventana va justo encima de su tramo de pared (`actorDepth` de la fila + 0,0001), porque las paredes se ordenan con los personajes. Un zombi que entra desde fuera queda delante mientras arranca tablones y pasa por detrás del muro al cruzar. Uno que llega por detrás asoma por encima del muro.
- **Materiales:** el usuario pidió usar lo que ya hubiera. Los kits de pared no traían ninguna ventana, así que el hueco salió de PixelLab (2 llamadas a *Create Image (Pro)*, 40 generaciones, 64 candidatos cada una; el usuario eligió el frontal 3 y el vertical 2). Los tablones salen de la madera del suelo interior, sin coste.
  - El hueco frontal medía 21×28 y la cara de la pared tiene 18 filas: se quitan filas del centro del cristal, que se parecen entre sí, en vez de reescalar.
  - PixelLab dibujó también de frente el hueco «visto desde arriba». Se usa girado un cuarto y recortado a la franja de 12 px del muro vertical (girar está permitido en piezas sin cara frontal).
- **Tablones:** 5 posiciones fijas por tipo, que se clavan en el orden 2, 0, 4, 1, 3 (el del centro primero). Cada uno tiene 4 px de alto, contorno oscuro, dos clavos y medio píxel de inclinación en algunos. Los arranca el último que se clavó.
- **Vallas:** los 3 huecos de valla del jardín tienen hojas propias (`fence_planks`, `fence_planks_v`): solo tablones de poste a poste y el fotograma 0 vacío.
- **`npm run windows:compose`** monta las cuatro hojas, las marca en el manifiesto y deja la hoja de revisión en `maps/preview/windows/barricadas.png`.
- **Revisión (petición del usuario):** la ventana de PixelLab, inclinada y pequeña dentro de mucha pared, quedaba irreal. La sustituye un hueco dibujado por código: recto con la pared, más hueco que pared alrededor y con el muro reventado (variante A de dos maquetas, elegida por el usuario frente a un hueco recto con marco).
  - Ocupa las columnas 2–29 y las filas 15–29 de la cara. Tiene el borde de arriba y los lados irregulares, contorno oscuro, astillas del revestimiento, cristales en las esquinas, oscuridad más honda arriba, el grosor del muro a los lados y el alféizar abajo.
  - En la pared vertical, la franja de 12 px rota con los extremos irregulares, el grosor del muro y el alféizar a lo largo del hueco.
  - Los tablones son los mismos, en posiciones ajustadas al hueco nuevo.
  - Se retiraron del repositorio los candidatos de PixelLab del hueco anterior (están en el historial; costaron 40 generaciones).
- **Sin píxeles sueltos (petición del usuario):** el usuario vio píxeles sueltos en el hueco y pidió rehacerlo con PixelLab, siguiendo el mismo diseño.
  - **Intentos con PixelLab, ninguno aprovechable (80 generaciones):**
    - *Create Image (Pro)* con el dibujo como referencia (20 + 20 generaciones). Los frontales salieron a la mitad de ancho, como una ventanita entre tablas abiertas en forma de lazo, y la franja vertical, como rectángulos blancos con un listón.
    - *Inpaint* sobre la pared real, con la caja del hueco como máscara (20 + 20). El frontal salió como un rectángulo negro sin alféizar ni borde roto, y el vertical como una tabla de madera.
    - *correct_pixelart* (0,6 generaciones, sobre el sprite y sobre la pared) y el `repair` del *workbench*. Conservan la forma: el primero solo ajusta la paleta, y el segundo puntúa el dibujo con 99/100 y no encuentra ningún píxel suelto.
  - **El origen era el dibujo:** el ruido cambiaba la altura del borde columna a columna. La fila de arriba alternaba un píxel de contorno y uno de pared, como un peine, y las astillas y algún cristal eran de un solo píxel.
  - **Arreglo en `window-art.ts`:**
    - El borde se rompe a escalones (`profile`): cada tramo tiene 2 px o más, y el ruido desaparece.
    - El contorno rodea el hueco por vecindad (`outline`), también en los escalones verticales, salvo junto al alféizar, que queda a ras de la pared.
    - Las astillas van de dos en dos y los cristales en grupos de tres.
    - Un test comprueba los tramos de 2 px y que ningún píxel quede aislado en su color.
  - Los candidatos descartados no se guardan en el repositorio; siguen en la galería de PixelLab.

## El atrezo con arte (petición del usuario)

- **Encargo:** el usuario dio 50 generaciones de PixelLab para el atrezo pendiente (61 objetos, todos placeholder), primero con el arte que ya hubiera.
- **Lo que ya había (gratis):** la farola y el árbol de la cuenta de PixelLab, y una mancha de los decals del asfalto como mancha de aceite. El árbol, de un verde vivo, va con la saturación a la mitad (petición del usuario) para casar con el césped seco. En la cuenta no había nada más que sirviera.
- **Lo generado (46 generaciones):**
  - *Create 1-Direction Object* con una descripción por hueco (`item_descriptions`): una tanda de 32 px con 64 huecos (20 objetos, 3 o 4 candidatos cada uno) y otra de 64 px con 16 objetos (un candidato cada uno). Cada tanda costó 20 generaciones.
  - El coche aparcado, con Pro Flash (6 generaciones).
  - Todos con el mismo estilo en el prompt (vista 3/4 alta, casa abandonada, paleta apagada, luz desde arriba a la izquierda; contorno oscuro en los que bloquean y sin contorno en los de suelo) y un recorte del jugador como referencia de estilo.
- **Elección (usuario):**
  - De la tanda de 32 px entran los 20, con los candidatos que propuse.
  - La de 64 px salió en diagonal, casi en isométrica, y desentona con las paredes rectas. Solo entran los 6 que lo disimulan (cajas, caldera, depósito, colchón, alfombra del hogar y estantería metálica corta); los otros 10 siguen como placeholder y su nota está en `docs/ASSETS-TODO.md`.
  - El coche salió de frente en vez de atravesado. Las dos huellas de `prop_coche` pasan en el plano de 4×2 a 2×2 casillas y el coche queda aparcado de frente.
- **Arte más grande que su huella:** `MapView` centra cada mueble sobre la base de su huella (antes lo alineaba a la izquierda). Así el árbol (96×105 sobre 64×64) sobresale por los dos lados y la farola (32×80) crece hacia arriba. La colisión sigue siendo la huella.
- **Quedan 31 objetos:** los 10 descartados y los 21 grandes (96 px o más: mesa del comedor, sofá, estanterías largas, setos, coches de la calle y del garaje, escalera derrumbada…).

## Audio: rehecho con la spec 08 nueva, fase S1 (petición del usuario)

- **Se deshizo todo el trabajo de la spec 08 anterior** (un commit de revert de las fases S1 a S4) para rehacerla con la nueva: sonidos grabados y montados por capas, candidatos, créditos y música. El motor, las preferencias, los ajustes de la pausa, el desbloqueo, el segundo plano y el panel de prueba de entonces encajan con la spec nueva y se recuperaron tal cual. Sus decisiones siguen valiendo:
  - el contexto de audio se crea al arrancar y lo despierta el toque de JUGAR, o cualquier otro toque como respaldo; en segundo plano se suspende y ningún toque lo despierta hasta volver;
  - `minInterval`, `maxVoices` y el límite global con prioridades están en el director, que lleva la cuenta de las voces con la duración del manifiesto;
  - EFECTOS y MÚSICA van en una fila junto a VIBRACIÓN, porque en el móvil apaisado no caben apilados;
  - el panel PRUEBA DE SONIDOS tiene una pestaña por familia para no desplazarse, funciona con partida y sin ella, y muestra las voces, las descartadas y el estado del contexto.
- **Familia `jingle` (Carteles):** los carteles de §6.5 duran hasta 2,5 s y no caben en las cuatro familias de §3.2. Cada familia tiene además una cola máxima en el informe:
  - 300 ms los golpes y 150 ms la interfaz (los sonidos frecuentes, §3.3 regla 6);
  - 600 ms los premios;
  - 1 s las amenazas;
  - 1,5 s los carteles.
- **Candidatos:**
  - Cada sonido tiene una receta, `audio-src/recipes/<id>.json`, con hasta tres candidatos y `chosen`.
  - Mientras `chosen` es `null`, el juego suena con A y los tres candidatos se escriben en `public/assets/audio/candidates/`, que solo se cargan con el debug activo.
  - Elegido uno, solo sale ese, y los demás se quedan en la receta sin ocupar sitio en el juego.
  - El panel marca el candidato que suena, y un «?» indica que está pendiente.
  - La elección se pide por el chat: el panel no puede escribir en el repositorio.
  - Los candidatos no cuentan para el presupuesto de 8 MB.
- **`audio:gen` desde S1, con capas sintéticas, mezcla, acabado e informe**, para que `ui.tap` salga de una receta. El taller completo (fuentes grabadas, proceso, créditos) llega en S2.
- **La menor natural:** las notas válidas son A, B, C, D, E, F y G, sin alteraciones. `audio:gen` falla con una nota fuera de la tonalidad.

## Audio: taller, fuentes y sonidos de armas y jugador (spec 08, fase S2)

- **Fuentes de partida:** Kenney (RPG Audio, Impact Sounds, Interface Sounds) y «80 CC0 RPG SFX» de OpenGameArt, enteros y CC0, en `audio-src/library/`, con un `credits.json` por carpeta. De Freesound solo se guardan los archivos que usa alguna receta: el resto de lo que baje `audio:search` se puede borrar y volver a buscar.
- **El proceso se hace en TypeScript, no con filtros de ffmpeg.** ffmpeg (`ffmpeg-static`) solo decodifica las fuentes a muestras de 44,1 kHz. Así el resultado no depende de la versión de ffmpeg y las mismas recetas dan siempre los mismos bytes. `ffmpeg-static` es GPL-3.0, pero es solo una herramienta de desarrollo: no va en la app.
- **Freesound solo da previsualizaciones con una clave de API.** Descargar el original exige OAuth2 con un usuario. Usamos la previsualización OGG de alta calidad (unos 192 kbps), que basta para sonidos que se recortan, se procesan y se mezclan. La clave se lee de `FREESOUND_API_KEY` (o de `.env`, fuera de git), va en una cabecera y nunca se imprime ni se escribe. El script comprueba de nuevo que cada resultado sea CC0 antes de guardarlo.
- **Fichas de licencia:** un `credits.json` por carpeta de fuentes, con los campos de la carpeta y los de cada archivo. Es lo más simple para packs enteros (una ficha) y para Freesound (una por archivo). `docs/AUDIO-CREDITS.md` se genera, no se edita a mano.
- **Cada fuente grabada se normaliza tras su recorte.** Las bibliotecas vienen a volúmenes muy distintos (de −10 a −55 dB de media). Así el `gain` de una capa se lee igual con cualquier fuente.
- **El archivo empieza donde el sonido llega a −40 dB de su pico,** el mismo umbral con el que el informe mide el silencio inicial, tras 1 ms de fundido. Una grabación trae ruido de sala antes del golpe, y recortarlo a −50 dB lo dejaba dentro.
- **Dos pasos más en el proceso:**
  - `glide`, un tono que se desliza, para el haz que se rompe y la campana que desciende;
  - `length`, la longitud final, que también corta la cola de la reverberación (así un golpe con sala no pasa de los 400 ms de su familia).
- **Familias de §6.1:** la sección se titula Golpe, pero la herida, la muerte, el latido, el sobrecalentamiento y el arma rota se miden como Amenaza (§3.2 pone ahí el daño recibido, y dos notas descendentes no caben en 400 ms).
- **Bucles (láser, lanzallamas, latido):**
  - El taller funde sus últimos 120 ms con el principio, sin recortar ni fundir los extremos.
  - El director los arranca con 60 ms de fundido de entrada y los para con 250 ms de salida. Esa es la «cola de brasas» del lanzallamas, en vez de un tercer archivo.
  - El tono del láser sube con el calor hasta una quinta (×1,5 de velocidad).
- **El latido es un bucle de un ciclo (unos 70 pulsos por minuto).** Que suene 5 s al bajar la vida es de S4 (vida baja), como dice la tabla de fases. Hasta entonces se oye en el panel. Un latido real tiene casi toda su energía por debajo de 100 Hz, que el altavoz de un móvil no da. Por eso los candidatos lo suben siete semitonos, lo saturan y le suman un golpe sordo filtrado entre 150 y 600 Hz.
- **Sin posición hasta S4:** `impact.flesh` y `weapon.flame.blast` ya son mono y posicionales en el catálogo, pero suenan centrados hasta que S4 añada la atenuación y el desplazamiento.
- **De quién son los sonidos:** el disparo, la recarga, el clic en vacío, el cambio de arma, el sobrecalentamiento, el arma rota, el cuchillo, el dash, la herida y la muerte solo suenan para el jugador local. Los impactos (`impact.flesh`, el corte de la katana) y la bocanada del lanzallamas suenan los provoque quien los provoque.
- **El cuchillo es solo el tajo.** El «golpe blando si acierta» de §6.1 ya lo pone `impact.flesh` con el `zombie:hit` del mismo golpe. Un acierto de katana suena con `weapon.katana.hit` en lugar de `impact.flesh`.
- **El clic en vacío** solo suena al apretar de nuevo el gatillo con un arma de balas sin cargador ni reserva, sin recargar ni cambiar de arma. Mantenerlo apretado no repite el clic.
- **SIMULAR COMBATE:** la SMG dispara 5 s a su cadencia real, con 7 de cada 10 disparos que aciertan y una baja cada 6 aciertos. La baja suena con `reward.kill`, con su racha.

## Audio: premios, rachas, la Mano, carteles e interfaz (spec 08, fase S3)

- **Eventos nuevos:**
  - `barricade:repaired`: cada tablón repuesto. Suena también cuando la ronda ya no da puntos por reparar.
  - `action:denied`: un toque que no se puede hacer. Puede ser por falta de dinero en una puerta, un portal, una vitrina, la Mano o la tienda; por un portal que aún no se puede comprar, o por el inventario lleno. En la tienda solo suena si falta dinero.
  - `hand:rolling`: el sorteo de la Mano empieza tras la subida (`HAND.risingTime`), no al pagar. Así `hand.roll` dura lo mismo que el sorteo (`HAND.rollingTime`) y para en cuanto la mano se abre.
  - `merchant:purchase` dice el nivel comprado de una mejora: es el peldaño de la racha `upgrade`.
- **La baja suena con `points:gained` (motivo `kill`)**, que ya dice qué jugador mató. `zombie:killed` no lo dice.
- **El dinero siempre suena con `buy.cash`** (la firma del dinero, en cada `money:spent`). Cada compra añade su propio sonido sin monedas: la firma del mago, la vitrina o el fuego de la Mano. Las puertas no gastan con `money:spent` y no llevan monedas, como pide la §6.2.
- **Munición de una vitrina:** suena como recoger munición (`pickup.ammo`). El arma comprada suena con `buy.weapon`.
- **Sonidos de mago:** `buy.merchant`, `merchant.arrive`, `ui.shop.open` y `ui.shop.close` tienen tres variantes, una por mago, y las elige el evento (`keyed`). Así cada mago tiene su firma sin multiplicar los ids de la spec. La tienda suena al abrirse y al cerrarse, no cuando cambian sus filas.
- **Rachas:**
  - Peldaño `n` = `AUDIO.ladder.steps[n]` semitonos sobre la nota de la capa de brillo, que siempre es un La o un Mi. Así todos los peldaños quedan en La menor.
  - La racha `upgrade` va por nivel: nivel 1, primer peldaño.
  - El cuerpo y el brillo salen en dos archivos que empiezan a la vez (el acabado recorta el silencio inicial de cada uno), con la misma variación de tono.
- **Retrasos del director:** las dos campanas de la sala desbloqueada suenan 0,35 s después del cerrojo de la puerta; el chapuzón de un objeto, al caer (`ITEMS.throwTime`); `jingle.boss.dead`, 1,2 s después de la muerte del boss, y `jingle.gameover`, 1 s después de la del jugador, para no pisar su sonido.
- **Familias:**
  - `denied`, `item.cantUse` y `ui.play` se miden como Interfaz: responden a un toque y duran 200 ms como mucho.
  - `buy.special`, `ritual.done` y `hand.offer.special` se miden como Carteles: son grandes momentos de más de 900 ms.
  - Las claves del manifiesto pasan de camelCase a snake_case (`item.cantUse` → `item_cant_use`).
- **Afinación de lo grabado:** las campanas, coros, gongs y tambores grabados se afinan a La menor con `semitones`, a partir de su pico de frecuencia más fuerte. Por ejemplo, la campanita +0,37 hasta La 5, el coro corto −0,24 hasta Si 4 y la campana de iglesia +0,83 hasta un acorde de Re menor.
- **Premio contra Golpe, por tono:** el informe compara el tono dominante (el pico más fuerte del espectro, de 80 a 5000 Hz), no el brillo. El ruido de un disparo tiene el centro del espectro más alto que una campana en La 5, aunque suene más grave.
  - Cada sonido se compara con la mediana de la otra familia, para que los clics metálicos de la recarga no la desplacen.
  - Un sonido de racha cuenta por su brillo, porque su cuerpo es un golpe a propósito.
  - El brillo sigue en la tabla y en la detección de variantes casi idénticas.
- **Los candidatos no van en git ni en la app:**
  - Son 16 MB que `audio:gen` vuelve a escribir igual y que solo carga el servidor de desarrollo con el debug.
  - `vite build` quita la carpeta y sus entradas del manifiesto, porque la §8 pide que el juego lleve solo los elegidos.
  - `assets:check` avisa, sin fallar, si faltan los archivos de los candidatos.
- **La pausa** suena al abrirse y al cerrarse (`ui.pause.open` y `ui.pause.close`). CONTINUAR ya no suena como un toque, para no sonar dos veces. JUGAR suena con `ui.play`.

## Audio: amenazas, posición, límite de voces y vida baja (spec 08, fase S4)

- **Eventos nuevos:**
  - `zombie:attack`: al empezar la preparación del golpe.
  - `zombie:crippled`: una sola vez, cuando el zombi pierde las piernas.
  - `barricade:plankBroken`: en el centro de la ventana.
  - `boss:windup`: al empezar cada ataque. Del mazazo, solo antes del primer golpe; los siguientes ya suenan con `boss:slam`.
  - `door:opened` y `portal:opened` llevan su posición, para que la puerta suene donde está.
- **`boss.dizzy.loop`:** id nuevo para el bucle de campanillas mareadas, que sigue a `boss.stunned` (el choque) mientras dura el aturdimiento.
- **Desde dónde se oye:** desde el jugador local, con el resumen de cada frame (posición y nivel). Los niveles salen de `levelAt` del mapa, que `GameScene` le da al director.
  - Un punto sin zona (una puerta, una ventana, fuera del mapa) cuenta como del mismo nivel.
  - Sin partida (pantalla de título, panel de prueba), nada se coloca: todo suena al centro y a volumen completo.
- **Qué suena en cualquier nivel:** el aviso del boss que cae y las tres preparaciones de sus ataques, que son «los avisos del boss» de §3.5. Los carteles no tienen posición.
- **Qué es posicional:**
  - los impactos, la bocanada del lanzallamas, las puertas, el chapuzón, los gruñidos, los zarpazos, el crujido y la rotura de tablones;
  - el galope y las campanillas del boss, que siguen al boss frame a frame.
  
  El resto de sonidos del boss son grandes y no se colocan, pero no suenan si el boss está en otro nivel.
- **Gruñidos:** suenan si hay un zombi a menos de 400 px. Gruñe el más cercano, cada 2 a 5 s al azar, y nunca dos a la vez (`maxVoices` 1).
- **Vida baja:** el latido suena 5 s al bajar de `PLAYER.lowHpThreshold`. No vuelve hasta que la vida suba y vuelva a bajar. Si la pausa lo corta, tampoco vuelve.
- **SIMULAR COMBATE**, para el criterio de S4 (20 zombies y la SMG): añade una multitud alrededor del jugador, con un zarpazo cada 4 disparos y un gruñido cada 25. Un test comprueba que nunca se pasa de 12 voces y que los disparos siguen sonando.
- **Presupuesto:** los efectos ocupan 7,0 MB de los 8. Lo que más pesa son los sonidos estéreo largos (carteles, compras grandes, el boss). Si al elegir candidatos se pasara, se harían mono los menos importantes.

## Audio: alternativas para las rachas y el cambio de ronda (petición del usuario)

- **Rachas** (`reward.kill`, `reward.repair` y `buy.upgrade`): la capa de brillo pasa de campana y cristal sintéticos a instrumentos grabados, afinados para que todos los peldaños queden en La menor:
  - glockenspiel en La 5;
  - caja de música en Re 6;
  - kalimba en Mi 6;
  - una copa de cristal golpeada, bajada a La 5;
  - un «ding» de cristal en Mi 6.

  La subida de cuatro notas de las mejoras es la misma nota grabada movida a cada altura.
- **Cambio de ronda** (`jingle.round.start`): en lugar de las cuatro notas de campana de §6.5, tres direcciones grabadas. Son un cuerno de guerra sobre tambores, un «braam» de metales de cine con timbal y tambores de guerra con un cuerno grave.
- Los candidatos anteriores siguen en el historial de git (commit `c02b291`) por si hubiera que recuperar alguno.
- **Segunda tanda** (el usuario se queda con el inicio de ronda y pide cambiar más sonidos):
  - El tablón en la ventana (`reward.repair`) cambia su cuerpo: un tablón y un clavo, dos martillazos, o un tablón que cae en su sitio. La nota de la racha no cambia.
  - El final de ronda (`jingle.round.clear`) queda grabado como el inicio y resuelve en La: un cuerno en La, Do-Mi-Sol-La de glockenspiel sobre el cuerno de batalla, o La-Do-Mi-La de caja de música con coro.
  - En cada acierto suenan a la vez el impacto (`impact.flesh`) y el toque de premio (`reward.hit`), así que se rehacen los dos:
    - El impacto: balas en carne, golpes de carne o golpes a zombis, todos grabados.
    - El toque: glockenspiel, una moneda o una kalimba.
- **Tercera tanda:** el toque de puntos al acertar (`reward.hit`) pasa a ser un hitmarker de shooter, más contundente, como pidió el usuario. Dura unos 135 ms y está comprimido y algo saturado. Las opciones son metal afinado a La 5 con peso, una lata en Do 5 con un tic de glockenspiel, o un golpe seco en Re 5 con el filo de una moneda. Su volumen en el catálogo no cambia (0,3): la compresión ya lo hace sonar más presente.
- **Cuarta tanda:**
  - **Sin `reward.hit`:** a petición del usuario, un acierto suena solo con su impacto en carne (`impact.flesh`). Se quita el sonido de puntos por acierto de la §6.2, del catálogo, del director y de las recetas.
  - **Muerte orgánica:** `reward.kill` suena a muerte, no a premio: un último estertor o quejido de zombi, la carne que revienta y el cuerpo que cae. Pasa de 1 a 3 variantes porque se oye muy seguido.
  - **Racha con nota metálica afinada:** un yunque en La 5 (con un filtro estrecho que atenúa su parcial de Sol#6), un «ding» de metal en La 5, o ese «ding» en Mi 6 con el golpe del yunque delante. Los metales son inarmónicos, así que se comprueba qué nota manda en cada archivo generado.
  - **Informe:** la nota de racha es la misma en todas las variantes a propósito, así que la detección de variantes casi idénticas solo compara los cuerpos.
- **Quinta tanda (nada de metal):**
  - La nota de racha de las bajas pasa a ser orgánica: una marimba en Mi 6, un pizzicato de cuerdas en Mi 5 o un xilófono en La 5, todos de madera o cuerda.
  - Los martillazos del boss (`boss.slam`) y su choque al quedar aturdido (`boss.stunned`) son golpes secos y destructivos: roca, piedra, ladrillo, hormigón, golpes sordos, un tom grave y escombros, con algo de saturación. Se descarta «big robot footstep», que podía llevar chasquidos metálicos.
  - El bucle de campanillas mareadas (`boss.dizzy.loop`) no cambia.
- **Sexta tanda (sin sonido de baja):** a petición del usuario, matar a un zombi no suena y no hay racha de bajas. Se quitan `reward.kill` y la racha `kill`. Las rachas que quedan son la de reparar tablones y la de mejoras. SIMULAR RACHA lanza ahora 8 tablones seguidos y SIMULAR COMBATE ya no lleva bajas. La bala que mata suena como cualquier otra, con su impacto en carne.
- **Séptima tanda (el boss aturdido se queja):** el bucle que suena mientras el boss está aturdido (`boss.dizzy.loop`) deja las campanillas mareadas de la §6.4 y pasa a ser un gruñido confuso, como una queja. Es un lamento grabado, más grave para una bestia grande, con un respiro antes de repetirse; cada vuelta dura unos 2 s, lo mismo que el aturdimiento. Su volumen sube de 0,45 a 0,6, porque una voz grave se oye menos que unas campanillas. Sigue siendo un bucle que sigue al boss y para al acabar el aturdimiento: es la señal de que toca pegarle.

## Audio: probar candidatos en partida (petición del usuario)

- **Probar en partida:** en PRUEBA DE SONIDOS, tocar A, B o C de un sonido lo reproduce y además lo pone a sonar en la partida, en lugar del elegido o del A. Así se oye en contexto: con la SMG, entre zombis, en el boss.
  - Las pruebas se guardan en el `localStorage` del dispositivo y aguantan al recargar.
  - BORRAR PRUEBAS vuelve a lo que lleva el juego.
  - Solo existe con el debug, que es el único que carga los candidatos.
- **Elegir de verdad sigue siendo por el chat:** el panel corre en el móvil y no puede escribir las recetas del Mac. COPIAR ELECCIÓN copia «id: letra», uno por línea, y el texto también se ve en el panel para copiarlo a mano. Por http en la red local no existe la API del portapapeles, así que se usa la copia de un cuadro de texto oculto.
- **Panel abierto = partida en silencio:** mientras está abierto, nada de la partida suena: efectos, bucles (láser, lanzallamas, boss, latido), gruñidos, menús y música. Al abrirlo se corta lo que estaba sonando. Solo suena lo que se prueba, incluidos SIMULAR COMBATE y SIMULAR RACHA, también en pausa. Al cerrarlo, la partida vuelve a sonar.
- **Octava tanda:**
  - **Latido sin parar con la vida baja:** el latido suena mientras la vida esté baja, hasta que el jugador se cure (o muera), y no solo los 5 s de la §3.5. La pausa y el panel de prueba lo cortan, y vuelve con la partida si la vida sigue baja.
  - **Colocar el tablón** (`reward.repair`) suena solo a madera, sin martillo ni clavo: un tablón que se desliza y encaja con un golpe macizo, un golpe seco con un crujido corto de la tabla, o un golpe hueco que se asienta.
  - **Nota de su racha:** pasa a ser orgánica, como la que tuvo la racha de bajas: marimba en Mi 6, xilófono en La 5 o pizzicato de cuerdas en Mi 5.
- **Novena tanda (tablón seco):** el usuario seguía oyendo el tablón metálico. Lo que resonaba era la nota de la racha (marimba, xilófono o pizzicato, casi medio segundo encima de cada tablón) y la sala.
  - Ahora `reward.repair` es seco: sin sala y de unos 200 ms. Es un golpe grueso de madera con otro más corto encima, dos golpes de apoyar y asentar, o un tablón macizo.
  - La capa de brillo de la racha es un «toc» corto de bloque de madera, de unos 120 ms, sin graves. Los golpes de madera no tienen una nota clara, así que la racha se oye como un toque que se agudiza más que como una melodía.

## Audio: la música (spec 08, fase S5)

- **Formato: M4A (AAC a 128 kbps, estéreo).** Safari en el iPhone no decodifica OGG en todas las versiones de iOS; AAC lo decodifican el iPhone y Android sin problema, y pesa menos que un MP3 de la misma calidad.
  - AAC (como MP3) puede añadir un retardo al principio que cada decodificador compensa a su manera. Por eso el archivo lleva 0,25 s del final del bucle delante de `loopStart` y 0,25 s de su principio detrás de `loopEnd`, y el motor repite entre esos dos puntos (`loopStart`/`loopEnd` del `AudioBufferSourceNode`). Un desplazamiento de menos de 0,25 s no rompe el bucle.
  - Los puntos se guardan al microsegundo. Redondeados a 0,1 ms, el bucle podía quedar una muestra largo o corto. Comprobado en Chrome: el archivo decodificado mide lo que dice el manifiesto, y el audio en `loopEnd` coincide muestra a muestra con el de `loopStart` (solo queda el ruido del códec).
- **Acabado (`finishMusic`):**
  - un paso alto a 40 Hz y fuera el silencio de los extremos;
  - los últimos 2 s fundidos sobre el principio. Si los dos extremos son la misma música (una fuente que ya era un bucle, con sus primeros 2 s añadidos detrás), el fundido es lineal y el bucle queda exacto. Si no lo son, es de potencia constante, como en los efectos.
- **Mismo volumen de media en todas (−18 dBFS RMS),** salvo que su pico pase de −1 dB. Las de calma quedan algo más bajas (de −21 a −23 dB), que les va bien.
- **Duración:**
  - las fuentes en bucle de menos de 30 s se repiten dos veces (calma B, ronda A);
  - las de más de 90 s se cortan (calma A en 80 s, boss B en 85 s, boss C en 88 s).
- **Candidatos:** tres por estado, todos CC0 de Freesound (los autores están en `docs/AUDIO-CREDITS.md`).
  - Título: pieza orquestal oscura, piano fantasmal o silbido inquietante.
  - Calma: ambiente frío, bucle de terror tenue o piano sigiloso.
  - Ronda: acción con percusión sobre un dron, ritmo tenso a 120 ppm o cinemática eléctrica.
  - Boss: batalla orquestal, ataque épico con tambores o pelea tensa con sintes.
- **Estados:**
  - `title` en la pantalla de título.
  - `boss` desde que cae un boss hasta que muere. Durante la alerta sigue la música de la ronda, porque el aviso ya baja la música.
  - `round` con la ronda en marcha y `calm` en el descanso.
  - `over` al acabar la partida.
- **Cambios:**
  - fundido cruzado de 1,5 s en cada cambio y apagado de 1 s al acabar la partida;
  - si solo una de `calm` y `round` tiene archivo, las dos usan esa pista y no se corta al cambiar;
  - un estado sin archivo es silencio.
- **Memoria:** la música y sus candidatos no se decodifican al cargar. El motor decodifica la pista de un estado cuando llega (`prepare`) y suelta las demás. Durante un fundido hay como mucho dos pistas, la que sale y la que entra; la que sale se suelta al acabar.
- **Primer toque:** el móvil no deja sonar nada hasta el primer toque. La pista pedida antes (la del título) arranca en cuanto el sonido se desbloquea. Si ese primer toque es JUGAR, la del título apenas se oye: entra y enseguida funde a la de la partida. Lo dejamos así porque es lo más simple.
- **Ceder el paso (§3.5):** la música baja 6 dB mientras suena un sonido con `duck` (carteles, compras grandes, el rugido o la muerte del jugador). Tarda 0,15 s en bajar y 0,4 s en volver.
- **Vida baja:** el bus de música pasa por un paso bajo que cae a 800 Hz mientras la vida está baja, y se abre al curarse.
- **Panel de prueba:**
  - Al abrirlo, se para la música de la partida, pero el bus de música sigue abierto para probar pistas. Esto corrige lo que decía «Panel abierto = partida en silencio».
  - Tocar una pista o uno de sus candidatos la pone en bucle, una sola a la vez, y otro toque la para.
  - **Probar en partida** también vale para la música: al cerrar el panel, cada estado suena con la pista que esté en prueba.
- **Peso:** las cuatro pistas del juego ocupan 3,2 MB, fuera del presupuesto de 8 MB de los efectos.

## Audio: documentación (spec 08, fase S6)

- **`docs/AUDIO.md`** reúne cómo está montado el audio, cómo se añade o cambia un sonido, el taller, las fuentes, la dirección de sonido tal como está (con los cambios del usuario sobre la spec), la música, el panel de prueba y los tests.
- **El taller sale de `docs/ASSETS.md`:** las recetas, el proceso, los acabados, las fuentes y `audio:search` estaban allí y ahora están en `docs/AUDIO.md`. `ASSETS.md` se queda con el formato de las entradas del manifiesto y lo que comprueba `assets:check`, y remite a `AUDIO.md` para lo demás. Así no hay dos copias que se desfasen.
- **`CLAUDE.md`** recoge:
  - `audio:gen` y `audio:search`;
  - Web Audio y ffmpeg en el stack;
  - la regla 9, «audio por id»;
  - `src/audio/`, `src/config/audio.ts`, `audio-src/` y `public/assets/audio/` en la estructura.
- **`docs/ASSETS-TODO.md`:** como ningún sonido tiene candidato elegido, recoge cómo elegir y los sonidos que el usuario pidió cambiar y aún no ha confirmado.
- **Arreglo en la música:** el recorte del silencio de los extremos quitaba alguna muestra a un bucle que empezaba o acababa en un paso por cero. Así, la calma B perdía 27 muestras por vuelta, la calma C 9 y la ronda B 51. Ahora solo se recorta un silencio de 20 ms o más (`AUDIO_GEN.music.silenceRun`). Un test comprueba que un bucle de 8 s sale con sus 8 s exactos y sin subida de volumen en el fundido.

## Mazmorra: modo de juego, generador del plano y vista previa (spec 09, fase M1)

- **Decisiones del usuario antes de empezar:**
  - **Puntos:** en Mazmorra solo cuenta el dinero de la spec (10$ por baja, 25$ por sala). Los impactos no dan nada y no se muestran PUNTOS: su sitio arriba a la derecha lo ocuparán el minimapa y las llaves, junto al dinero.
  - **Vida del boss:** 60, 110 y 180 son la vida final de cada planta. La variante del Matarife no multiplica la vida; aporta su daño, su preparación más corta y sus extras (furia, charcos).
  - **Récord de Supervivencia:** se guarda la mejor ronda y sale bajo su botón del título. No cambia ninguna regla del modo ni ninguno de sus tests.
- **Estado:** `GameState.mode` (`survival` o `dungeon`) y `GameState.run` (`RunState` en `src/core/RunState.ts`, null en Supervivencia). `createGameState` sigue dando Supervivencia si no se le dice otra cosa, así que todos los tests anteriores pasan sin tocarlos.
- **Semillas:** cada planta usa su sub-semilla, `subSeed(semilla, planta)`, un hash entero de las dos. El RNG de la partida (`state.rng`) es otro: lo que pase en una planta no cambia el plano de la siguiente, y un test lo comprueba con una partida «sucia» (llaves, salas, mejoras) que baja de planta.
- **Crecimiento del plano:** las vecinas se prueban siempre en el orden N, E, S, O; la moneda del 50 % ya da la variedad. Como una celda solo se añade con exactamente una vecina ocupada, el plano es un árbol: cada vecindad es una puerta, salvo las de la arena.
- **Arena del boss:** de los cuatro bloques 2×2 que contienen el callejón, se elige el que menos salas toque (esos lados se tapian) y, en empate, el primero por orden. La arena tiene **una sola puerta**, la del callejón hacia su sala padre; lo que toque con sus otras tres celdas queda tapiado. «El boss queda pegado a la sala inicial» se comprueba con las cuatro celdas de la arena, no solo con el callejón.
- **Élite sin llaves:** como las salas con llave (tesoro y boss) son siempre callejones, nunca son paso: la regla se cumple sola. Se comprueba igual, por si cambia la colocación.
- **Plantillas:** se sortea una dificultad por sala (planta 1: fácil o media; después: media o difícil) y se elige una plantilla **sin usar** de esa dificultad; si no queda, una sin usar de la otra dificultad permitida; solo si se han usado todas, se repite. La sala de inicio, el tesoro, la mano y el boss no tienen dificultad.
- **Banco provisional:** hasta que existan las plantillas (M2), `placeholderBank` da nombres con la forma `<ambiente>/<tipo>_<nn>` y los tamaños de la spec (8 de combate, 2 de élite, 2 de reto y 1 de cada especial). Las de combate se reparten entre las dos dificultades del ambiente.
- **Plantas infinitas (§12):** `floorConfig(n)` rota los ambientes a partir de la 4.ª, pone 10 salas con enemigos y multiplica la vida del zombi y del boss por 1,25 por cada planta sobre la 3.ª. El calendario de variantes de los bosses se conecta en M7.
- **URL:** `?mode=dungeon` deja el foco en MAZMORRA en el título (no salta el título, para que el toque desbloquee el audio como siempre); `?seed=N` fija la semilla. La semilla y el modo se ven siempre en las estadísticas del panel de depuración, en los dos modos.
- **Récords:** `src/native/records.ts`, en el dispositivo como las preferencias (`zombies.records`). La mejor ronda de Supervivencia no se guarda con el debug activo ni en una partida empezada con `?round=`.
- **Estado intermedio de M1:** MAZMORRA ya arranca una partida con `mode: 'dungeon'`, su semilla y el plano de la planta 1 en `state.run`, pero juega en la mansión con las reglas de Supervivencia hasta que M2 monte el mapa y las salas.
- **Vista previa de M1:** `npm run dungeon:preview <semilla>…` escribe `maps/preview/dungeon/<semilla>/planos.txt` (los tres planos en texto, con la plantilla, la dificultad, el espejo y las puertas de cada sala) y `planta-<n>-plano.png` (una celda por sala, coloreada por tipo; la puerta con llave en ámbar, la del boss en rojo, la del reto en rojo oscuro). M2 añade el PNG de cada planta montada.

