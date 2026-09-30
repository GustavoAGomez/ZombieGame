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
