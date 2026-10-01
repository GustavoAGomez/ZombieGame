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
