# Spec 01 · MVP de gameplay con placeholders

**Objetivo:** un bucle de juego completo y divertido en el móvil, con todo el arte en rectángulos. Incluye moverse, disparar, zombies que entran por las ventanas, reparar barricadas, comprar una puerta, rondas que suben de dificultad, game over y el HUD de la **Propuesta A**. El arte final de PixelLab sustituirá los placeholders sin tocar la lógica (ver `docs/ASSETS.md`).

**Plataformas:** iPhone y Android, siempre en horizontal. También debe funcionar en Safari y Chrome móvil para pruebas rápidas.

---

## 1. Pantalla, resolución y zoom

- **Canvas a pantalla completa.** Su tamaño interno está en píxeles físicos (tamaño CSS × `devicePixelRatio`, con un máximo de 3) y se escala por CSS para verse nítido.
- **Mundo en pixel art:** `pixelArt: true`, `roundPixels: true`, filtrado nearest.
- **Zoom de la cámara del mundo:** siempre entero, `max(1, floor(altoFísico / 270))`. Así se ven unos 270 px de mundo en vertical, o algo más. Se recalcula en `resize` y en cambios de orientación.
- **Tile:** 32×32 px de mundo.
- **La cámara sigue al jugador** con un lerp suave (0.15) y se limita a los bordes del mapa.
- **Safe areas:** el HUD usa `env(safe-area-inset-*)`. El margen horizontal es simétrico: `--pad-x: max(env(safe-area-inset-left), env(safe-area-inset-right), 24px)`. Así el layout no salta al girar el móvil 180°.

## 2. Controles (DOM, multitáctil)

Cada control usa Pointer Events con `setPointerCapture`. El joystick y el disparo funcionan a la vez con dedos distintos. Si llega `pointercancel` o `lostpointercapture` (por ejemplo, al bajar el centro de notificaciones), el control se resetea.

### 2.1 Joystick (abajo a la izquierda)

- **Tamaño:** base de 132 px y knob de 56 px (CSS px).
- **Posición:** `left: calc(var(--pad-x) + 12px)`, `bottom: calc(var(--pad-bottom) + 16px)`, con `--pad-bottom: max(env(safe-area-inset-bottom), 20px)`.
- **Zona de activación:** todo el 40 % izquierdo de la pantalla, salvo encima de otros botones. Al tocar en cualquier punto de esa zona, el knob se mueve según el vector desde el centro de la base.
- **Recorrido y respuesta:** el recorrido máximo del knob es de 44 px y la zona muerta del 12 %. La velocidad es analógica, entre el 35 % y el 100 % según la distancia.
- **Al soltar,** el knob vuelve al centro con una animación de 80 ms.

### 2.2 Botón de disparo con arrastre (abajo a la derecha)

- **Tamaño:** 112 px de diámetro, con un knob interno de 44 px.
- **Posición:** `right: calc(var(--pad-x) + 4px)`, `bottom: calc(var(--pad-bottom) + 12px)`.
- **Mantener pulsado dispara en automático** a la cadencia del arma.
- **Apuntado:**
  - Si el arrastre supera 12 px, la dirección de disparo es el vector entre el centro del botón y el dedo.
  - Si el arrastre es menor, se activa el **auto-apuntado**: el zombie vivo más cercano dentro del alcance del arma y con línea de visión. Si no hay ninguno, se dispara hacia donde mira el jugador.
- **Mientras se arrastra,** se dibuja en el mundo una **línea de puntos ámbar** desde el arma, de 120 px de mundo, en la dirección de apuntado. Es la que aparece en el mockup A.
- **Orientación del jugador:** mientras dispara, mira hacia la dirección de apuntado; si no, hacia donde se mueve. Se cuantiza a 8 direcciones para los sprites.

### 2.3 Arco del disparo, columna de armas y fila inferior (referencia: Wild Rift)

El HUD sigue la disposición de League of Legends: Wild Rift (decidido después de la Fase 7; ver `docs/DECISIONS.md`). Los botones son pequeños, redondos y solo llevan icono; solo el joystick y el disparo son grandes.

- **Arco alrededor del disparo,** como las habilidades de Wild Rift. Los botones miden 40 px y sus centros se dan respecto al centro del botón de disparo (96 px):
  - **Cuchillo:** centro en `(-80, -4)`, a la izquierda. Ataque cuerpo a cuerpo en cualquier momento; el jugador se gira hacia el zombie más cercano a su alcance.
  - **Recargar:** centro en `(-14, -80)`, encima. Recarga si falta munición en el cargador y queda reserva; si no, se ve atenuado. Muestra el progreso de la recarga como un velo que baja dentro del círculo.
  - **Especial (dash):** centro en `(40, -66)`, a la derecha de recargar, en ámbar. Muestra la recarga como un velo que baja dentro del círculo, con los segundos restantes.
- **Columna de armas,** en vertical justo debajo de los puntos y el total, pegada al borde derecho (`right: var(--pad-x)`, `top: calc(var(--pad-top) + 60px)`, 4 px entre huecos).
  - Un hueco por arma que lleve el jugador, como máximo 3, de 38 px.
  - Cada hueco lleva su icono y las balas de su cargador; el activo se resalta en ámbar.
  - Tocarlo cambia a esa arma (comando `selectWeapon`). No hay botón de cambiar arma.
- **Fila inferior,** centrada al 55 % del ancho, como los hechizos de invocador de Wild Rift. Cada botón tiene un sitio fijo, así que ninguno se mueve cuando el otro aparece o desaparece:
  - a la izquierda, la mejora temporal guardada (spec 03 §5), de 46 px;
  - a la derecha, más cerca del pulgar derecho, el botón de acción (§2.4).
- **Pausa:** 38 px.
- **Toques con margen de error:** como en Wild Rift, cada botón responde también un poco fuera de su aro, con una zona invisible más grande (12 px; 14 px en el disparo y 4 px entre los huecos de arma). Donde se juntan dos zonas gana el botón que está encima, de modo que los botones pequeños del arco conservan su borde.

### 2.4 Botón de acción contextual

- **Qué es:** un botón redondo de 44 px que solo aparece cuando hay una acción disponible.
- **Posición:** en la fila inferior, a la derecha de la mejora temporal (`left: calc(55% + 10px)`, `bottom: calc(var(--pad-bottom) + 15px)`). Su etiqueta (`+10`, el coste, el nombre del mago) va encima del botón.
- **Acciones:**
  - **Reparar ventana:** icono de martillo y `+10` en ámbar en una etiqueta debajo. Cada toque repara un tablón; el aro parpadea para indicarlo.
  - **Abrir puerta:** icono de puerta y el coste debajo. Si no hay puntos suficientes, el botón se ve atenuado, la etiqueta muestra lo que falta en rojo (`-X`) y tiembla al tocarlo.
  - **Escalera o trampilla:** icono de escalera y el coste, con el mismo comportamiento que la puerta.

### 2.5 Botón de pausa

- 44×44 px, arriba en el centro. Es nuevo respecto al mockup y lleva un icono pixel minimalista.
- Abre un menú de pausa con `CONTINUAR` y `REINICIAR`.
- En Android, el botón atrás también abre la pausa.

## 3. Mapa de prueba (placeholder)

El script `scripts/gen-placeholder-map.ts` genera `public/assets/maps/room01.tmj` en formato Tiled, con el esquema de `docs/ASSETS.md`. Así el mapa real hecho en Tiled será un reemplazo directo.

**Zonas:**

- **`inicio`** (desbloqueada al empezar): habitación interior de 14×9 tiles con 3 ventanas: W1 en la pared superior, W2 en la izquierda y W3 en la derecha.
- **`pasillo`** (bloqueada): 16×5 tiles bajo `inicio`, con W4 en la pared inferior y W5 en la derecha. Se abre con la puerta **D1** (pared inferior de `inicio`, coste 750).
- **`almacen`** (bloqueada): 8×8 tiles a la derecha del `pasillo`, con W6. Se abre con la puerta **D2** (coste 1000).

**Reglas del mapa:**

- Cada ventana tiene un `zombie_spawn` fuera, a 2 tiles, y un punto interior justo delante.
- Fuera del edificio solo pueden moverse los zombies. El jugador nunca atraviesa ventanas.

## 4. Mecánicas

Todos los valores de esta sección van a `balance.ts`. Los números son el punto de partida para ajustar.

### 4.1 Jugador

| Parámetro | Valor |
|---|---|
| Vida | 100 |
| Velocidad | 88 px/s |
| Hitbox | círculo de radio 6 en los pies |
| Regeneración | tras 3 s sin recibir daño, +40 PV/s hasta el máximo |

- **Al recibir daño:** borde de pantalla rojo pixelado durante 200 ms, empuje de 6 px y vibración ligera (háptica). Por debajo de 30 PV, el corazón del HUD late y la barra cambia a `--red-low`.

### 4.2 Armas

Se empieza con las dos para poder probar el cambio de arma. Más adelante habrá armas de pared.

| | Pistola | SMG |
|---|---|---|
| Daño | 20 | 14 |
| Cadencia | 4 disparos/s | 11 disparos/s |
| Cargador / reserva inicial | 8 / 64 | 30 / 120 |
| Recarga | 1,6 s | 2,2 s |
| Dispersión | 2° | 6° |
| Alcance | 260 px | 220 px |
| Velocidad de la bala | 520 px/s | 560 px/s |

- **Balas:** son proyectiles del pool que chocan con paredes y zombies. El trazado es de 3×2 px en ámbar.
- **Recarga automática** al vaciar el cargador. Cambiar de arma tarda 0,4 s y cancela la recarga en curso.
- **Sin munición en ninguna arma:** el botón de disparo da un **golpe cuerpo a cuerpo** con alcance de 20 px, 50 de daño y una pausa de 0,6 s.

### 4.3 Especial: dash

- Recorre 72 px en 0,18 s en la dirección de movimiento. Si el jugador está quieto, en la dirección a la que mira.
- Es invulnerable durante el dash, pero respeta las paredes.
- Recarga: 4 s.

### 4.4 Zombies

**Vida por ronda:**

- Rondas 1 a 9: `50 + 25 × (r − 1)`
- Desde la ronda 10: `vida(9) × 1,1^(r − 9)`

**Tipos por velocidad:**

| Tipo | Velocidad | Tiempo para arrancar un tablón |
|---|---|---|
| Caminante | 32 px/s | 1,4 s |
| Corredor | 58 px/s | 1,0 s |
| Sprinter | 84 px/s | 1,0 s |

**Mezcla por ronda:**

| Rondas | Mezcla |
|---|---|
| 1–2 | 100 % caminantes |
| 3–5 | Los corredores suben del 20 % al 50 % |
| 6 en adelante | 60 % corredores |
| 8 en adelante | Aparecen sprinters, del 10 % al 30 % |

**Ataque:**

- Alcance de 16 px, medido hasta el borde de la hitbox del jugador.
- Preparación de 0,35 s, 40 de daño y 1,1 s de espera entre ataques.

**Ciclo de comportamiento (máquina de estados):**

1. **`toWindow`:** aparece en su spawn y camina en línea recta hasta el punto exterior de su ventana.
2. **`tearing`:** si la ventana tiene tablones, arranca uno cada X s según su tipo.
3. **`climbing`:** con 0 tablones, trepa hasta el punto interior en 0,8 s, sin poder moverse ni recibir empuje.
4. **`chasing`:** persigue al jugador siguiendo el flow field (ver 4.5).
5. **`attacking`:** ataca cuando lo tiene a su alcance.
6. **`dead`:** deja una mancha de sangre que se desvanece a los 20 s (máximo 40 manchas a la vez).

**Separación:** los zombies se empujan suavemente entre sí para no apilarse en un mismo punto.

### 4.5 Navegación

- **Flow field:** un BFS desde el tile del jugador sobre los tiles interiores transitables, es decir, las zonas desbloqueadas y las puertas abiertas. Se recalcula cada 250 ms o cuando el jugador cambia de tile.
- **Movimiento:** 8 direcciones, sin cortar esquinas.
- **Persecución directa:** si el zombie está a menos de 2 tiles y tiene línea de visión, va recto hacia el jugador.

### 4.6 Barricadas

- Cada ventana tiene 5 tablones.
- **Reparar:** el jugador tiene que estar a menos de 40 px de una ventana que no esté completa. Mientras mantiene pulsado el chip, se repone 1 tablón cada 0,6 s y suma +10 puntos por tablón.
- **Límite:** 500 puntos por reparación en cada ronda.
- Se puede reparar mientras un zombie está arrancando tablones.
- **Placeholder visual:** cada tablón es una barra marrón visible, de modo que el número de tablones se lee de un vistazo.

### 4.7 Puntos y puertas

- **Puntos:** se empieza con 500. Impacto +10, baja +50, tablón reparado +10.
- **Texto flotante:** cada suma aparece como `+N` en ámbar bajo el marcador del HUD. Sube, se desvanece en 600 ms y los textos se apilan.
- **Puertas:**
  - La acción contextual aparece cuando el jugador está a menos de 48 px de una puerta cerrada.
  - Al comprarla, sus tiles pasan a ser suelo, la zona destino se desbloquea y sus spawns empiezan a funcionar.
  - Vibración media al comprar.

### 4.8 Rondas

- **Inicio:** cartel `RONDA N` en el centro durante 2,5 s y, a la vez, la cifra de ronda del HUD parpadea.
- **Zombies por ronda:** `6 + 4 × (r − 1)`, con un máximo de 80.
- **Zombies vivos a la vez:** 20 como máximo (valor de rendimiento, configurable).
- **Intervalo de aparición:** `max(0,4 ; 2,0 − 0,1 × (r − 1))` s. Se usan solo los spawns de zonas desbloqueadas, repartidos al azar con peso según la cercanía al jugador.
- **Fin de ronda:** cuando mueren todos, hay 8 s de descanso y empieza la siguiente.

### 4.9 Flujo de partida

- **Título:** `JUGAR` a pantalla completa. Ese toque también desbloquea el audio para más adelante.
- **Partida.**
- **Game over:** `HAS SOBREVIVIDO N RONDAS`, los puntos y el botón `REINTENTAR`.
- **Pausa automática** cuando la app pasa a segundo plano (`@capacitor/app` `appStateChange` y `visibilitychange`).

## 5. HUD · Propuesta A

La referencia es un iPhone en horizontal de 844×390 CSS px. Todo se posiciona respecto a las safe areas.

**Tokens (`src/config/theme.ts` y variables CSS):**

| Token | Valor | Token | Valor |
|---|---|---|---|
| `--ink` | `#0f0e0c` | `--red` | `#c93a2b` |
| `--panel` | `#1a1714` | `--red-dark` | `#3a1511` |
| `--bone` | `#efe6d2` | `--red-low` | `#e8503a` |
| `--muted` | `#b8ad97` | `--amber` | `#e8b04a` |
| `--dim` | `#8a8070` | `--amber-dark` | `#b07a2a` |
| `--wall` | `#5a4636` | `--door` | `#3f5866` |
| `--floor` | `#3b332a` | `--wood` | `#8a6a3f` |

**Fuentes:**

- **Números y títulos:** Press Start 2P, en tamaños múltiplos de 2.
- **Etiquetas:** Silkscreen.
- **Sombras:** duras, `2–3px 2–3px 0 var(--ink)`, sin desenfoque.
- **Iconos:** SVG pixel con `shape-rendering: crispEdges` (corazón, bala, cruceta, rayo del especial, recarga, cuchillo, pistola, fusil, martillo, puerta y escalera). Los de los botones son provisionales hasta tener los finales.

**Arriba a la izquierda** (`left: var(--pad-x)`, `top: 14px`), en columna con 10 px de separación:

- **Fila 1:** corazón de 21×18, luego la barra de vida de 176×14 px (10 segmentos, 2 px de separación, marco `--wall`) y después el valor en Press Start 2P a 10 px.
- **Fila 2:** `RONDA N` en Press Start 2P a 20 px, color `--red`.
- **Fila 3:** nombre del arma (Silkscreen 11 px, `--muted`), icono de bala, cargador (Press Start 2P 14 px, `--amber`) y `/ reserva` (10 px, `--dim`). Durante la recarga, el cargador muestra una barra de progreso.

**Arriba a la derecha** (`right: var(--pad-x)`, `top: 14px`), alineado a la derecha, con 5 px de separación:

- **Fila 1:** `PUNTOS` (Silkscreen 11 px, `--muted`) y el marcador de puntos para gastar (Press Start 2P 20 px).
- **Fila 2:** `TOTAL` (Silkscreen 9 px) y todos los puntos ganados en la partida, gastados o no (Press Start 2P 10 px, `--muted`).
- **Debajo,** pegada al borde derecho, la columna de armas (§2.3).
- **Textos flotantes `+N`:** en una pila a la izquierda de los puntos, fuera de la columna, para que esta no crezca hacia abajo.

**Controles:**

- Circulares, pequeños y translúcidos (referencia Wild Rift), con borde interior de 2 px (3 px el de disparo) y los tamaños de la sección 2.
- **Disparo:** fondo `rgba(red, .28)` y borde `--red`. El knob se vuelve ámbar al arrastrar.
- **Especial y arma activa:** acentos en ámbar.
- **Pulsación:** cada botón se escala a 0,92 durante 60 ms.
- **Velos de recarga:** recortados al círculo interior del aro, como un nivel que baja dentro del icono.

**Actualización del DOM:** solo cuando cambia un valor, nunca en cada frame.

**Espacio para crecer:** deja una fila vacía reservada bajo el bloque izquierdo para futuras estadísticas y ventajas. Bajo el derecho va la columna de armas.

## 6. Placeholders de mundo

Dibujados en runtime a partir del manifiesto, con los mismos tamaños que tendrá el arte final.

| Elemento | Aspecto |
|---|---|
| Suelo | tile `--floor` con una línea de rejilla de 1 px `#2f2922` |
| Pared | `--wall` con borde superior `#735a45` |
| Hueco de ventana | `#14120f`, con los tablones como barras `--wood` |
| Puerta cerrada | `#2b3d47` con un candado ámbar de 2×2 |
| Jugador | cuadrado de 14×14 `#4b5a36` con una muesca `#d9b38c` que indica hacia dónde mira |
| Zombie | cuadrado de 14×14 `#7fa34a` con dos píxeles rojos de ojos |
| Distinción de tipos | corredor con un contorno de 1 px más claro, sprinter con contorno rojo |
| Bala | 3×2 `--amber` |
| Sangre | `#5e1c16` |

## 7. Adaptación a iPhone y Android

**Web (común a ambas plataformas):**

- **Viewport:** `width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover`.
- **CSS global:** `touch-action: none`, `overscroll-behavior: none`, `user-select: none`, `-webkit-touch-callout: none`, `-webkit-tap-highlight-color: transparent`. Fondo `--ink`.

**iOS:**

- **Info.plist:** solo `LandscapeLeft` y `LandscapeRight`, `UIRequiresFullScreen`, barra de estado oculta (`UIStatusBarHidden` a `true` y `UIViewControllerBasedStatusBarAppearance` a `false`).
- **ViewController propio** (subclase de `CAPBridgeViewController`):
  - `prefersHomeIndicatorAutoHidden` a `true`.
  - `preferredScreenEdgesDeferringSystemGestures` a `.all`, para que los gestos del sistema no roben toques en los bordes.
  - `isIdleTimerDisabled` a `true`, para que la pantalla no se apague.

**Android:**

- **Manifest:** `android:screenOrientation="sensorLandscape"`.
- **Pantalla completa inmersiva:** ocultar las barras del sistema con `WindowInsetsControllerCompat` y comportamiento *transient bars by swipe*.
- **Pantalla siempre encendida:** `FLAG_KEEP_SCREEN_ON` durante la partida (en iOS, el equivalente con `isIdleTimerDisabled`, o un plugin keep-awake).
- **Recortes de pantalla:** soporte para punch-hole y notch con `layoutInDisplayCutoutMode` en `shortEdges`.

**Plugins:** `@capacitor/app` y `@capacitor/haptics` (la vibración se desactiva desde el menú de pausa). Las barras del sistema se ocultan con `SystemBars`, que viene en el núcleo de Capacitor 8 (`hidden: true` en `capacitor.config.ts`), en lugar de `@capacitor/status-bar`.

**Pantallas que hay que comprobar:**

- iPhone con Dynamic Island (19,5:9).
- Android 20:9 con punch-hole.
- Android pequeño de 16:9 a 720p.

En ninguna pueden solaparse los controles ni el HUD.

## 8. Debug

Se activa con `?debug=1` o con un triple toque en la esquina superior izquierda. Incluye:

- FPS, zombies vivos, balas activas y ronda.
- Botones para saltar de ronda, sumar +1000 puntos y activar el modo dios.
- Visualización de hitboxes y del flow field.

## 9. Rendimiento

- **Objetivo:** 60 fps estables en iPhone 12 y en un Android de gama media con 20 zombies y 30 balas en pantalla.
- **Memoria:** sin tirones del recolector de basura. Todo con pools y sin reservar memoria en el bucle de update.

## 10. Fases

Implementa en orden. Al acabar cada fase, sigue el cierre de fase de `CLAUDE.md`.

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **0 · Setup** | Vite + TypeScript + Phaser 4 + Vitest + ESLint. Capacitor con plataformas iOS y Android. Viewport, CSS global y orientación horizontal. `EventBus`, `GameState`, paso fijo. | `npm run dev` abre una escena vacía en el móvil por la red local. `npx cap sync` funciona. Los tests de ejemplo pasan. |
| **1 · Mapa y cámara** | `gen-placeholder-map.ts`, `MapLoader`, placeholders desde el manifiesto, colisiones con paredes, zoom entero, cámara que sigue al jugador. | Se ve el mapa de 3 zonas con las puertas cerradas. El cálculo del zoom tiene tests. |
| **2 · Movimiento** | Joystick DOM, `InputCommand`, movimiento del jugador con colisiones y orientación en 8 direcciones. | Moverse se siente fluido y no se atraviesan paredes. Soltar el dedo detiene al jugador. `pointercancel` resetea el control. |
| **3 · Disparo** | Botón de disparo con arrastre, auto-apuntado, línea de apuntado, pistola y SMG, recarga, cambio de arma, dash con recarga. | Se puede moverse y disparar a la vez con dos dedos. **⏸ Detente aquí** para que pruebe los controles en iPhone y Android. |
| **4 · Zombies** | Spawns, máquina de estados, flow field, separación, ataque, daño, regeneración, muerte. | Los zombies llegan hasta el jugador rodeando obstáculos. El flow field tiene tests. |
| **5 · Barricadas** | Tablones, arrancado y reparación con el chip contextual, trepar la ventana. | Las ventanas se vacían y se reparan. El límite de puntos por reparación funciona. |
| **6 · Puntos y puertas** | `PointsSystem`, textos flotantes, compra de puertas y desbloqueo de zonas y spawns. | Al comprar D1 se abre el pasillo y empiezan a salir zombies por W4 y W5. |
| **7 · Rondas y flujo** | `WaveSystem` con las fórmulas y tests, cartel de ronda, descanso, título, game over, pausa (incluida la automática). | Se puede jugar de la ronda 1 a la 10. Las fórmulas tienen tests. |
| **8 · HUD completo** | Todo el HUD de las secciones 2 y 5 con la disposición de Wild Rift, respuesta de los botones al pulsarlos, estado de vida baja, overlay de debug completo (sección 8). | El HUD sigue la sección 5 y la disposición de Wild Rift, y nada se solapa en las tres pantallas de prueba de la sección 7. |
| **9 · Pulido nativo** | Ajustes de iOS y Android de la sección 7, vibración, pantalla siempre encendida, pantalla completa inmersiva. | Builds ejecutándose en un iPhone y un Android reales sin gestos del sistema que molesten. |
