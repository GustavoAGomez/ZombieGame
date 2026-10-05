# Spec 08 · Audio: efectos, premios sonoros y música

**Objetivo:**
1. Que el juego **suene desde el primer día** con efectos generados por código, sin descargar nada.
2. Poder **sustituir** después cualquier efecto por un sonido de biblioteca gratuita, sin tocar el código del juego.
3. Añadir **música** que cambie con la partida.

**Carácter:** arcade de acción, agradable y adictivo. Golpes secos y con cuerpo, premios brillantes y afinados, amenazas graves. Nada estridente.

**Convenciones:**
- Todos los números van en `src/config/audio.ts`. No hay volúmenes ni tiempos sueltos en el código.
- El audio es presentación: **nunca cambia la lógica** ni el resultado de un tick. Los tests del juego pasan igual con el audio apagado.
- Un sonido que falta es **silencio**, no un error (regla 5 de `CLAUDE.md`).
- Claude Code no puede oír. Por eso cada fase con sonidos nuevos termina con un informe objetivo (sección 4.4) y con una parada para que yo los escuche en el móvil.

---

## 1. Motor de audio (`src/audio/`)

Un motor propio sobre **Web Audio API**, fuera de Phaser, con el mismo patrón que `HapticFeedback`. Phaser sigue con `audio: { noAudio: true }`.

**Por qué fuera de Phaser:** los botones del HUD y los menús son DOM y también suenan. Con un solo motor, juego e interfaz comparten volumen, límite de voces y desbloqueo.

| Pieza | Qué hace |
|---|---|
| `AudioEngine` | Crea el `AudioContext`, carga y decodifica los archivos, y reproduce. No sabe nada del juego. |
| `AudioDirector` | Escucha el `EventBus` y decide qué suena, con qué tono y volumen. Aquí viven las rachas, la posición y la música. |
| `src/config/audio.ts` | Catálogo de sonidos y todos los números. |

- **Tres buses:** `sfx`, `ui` y `music`, cada uno con su volumen, hacia un bus maestro.
- **Limitador en el maestro:** un `DynamicsCompressorNode`, para que 12 sonidos a la vez no saturen.
- **Carga:** todos los efectos se decodifican al arrancar (`BootScene`), para que no haya retraso al primer disparo. `latencyHint: 'interactive'`.
- **Interfaz inyectable:** `AudioDirector` recibe el motor por parámetro, para probarlo con uno falso, como `HapticFeedback` con `Vibrate`.
- **HUD y menús:** los componentes DOM reciben una función `playUi(id)`. No importan el motor.

### 1.1 Catálogo (`src/config/audio.ts`)

Cada sonido se define por datos:

| Campo | Descripción |
|---|---|
| `id` | Nombre del sonido, por ejemplo `weapon.pistol.fire` |
| `variants` | Claves del manifiesto, de 1 a 4. Se elige una al azar sin repetir la anterior |
| `bus` | `sfx`, `ui` o `music` |
| `volume` | De 0 a 1 |
| `pitchVar` | Variación de tono al azar en cada reproducción, en ± % |
| `maxVoices` | Cuántas copias pueden sonar a la vez |
| `minInterval` | Tiempo mínimo entre dos reproducciones |
| `priority` | `low`, `normal` o `high`. Con el límite global lleno, se corta la voz de menor prioridad y más antigua |
| `positional` | Si se atenúa y se desplaza a izquierda o derecha según dónde ocurre |
| `ladder` | Racha a la que pertenece (sección 3.3), o ninguna |
| `duck` | Si baja la música mientras suena |

### 1.2 Manifiesto

Nueva sección `audio` en `public/assets/manifest.json`: clave → archivo, duración y `placeholder`. Para la música, además `loopStart` y `loopEnd`. Documéntala en `docs/ASSETS.md`.

`npm run assets:check` valida que cada variante del catálogo tenga entrada en el manifiesto y que el archivo exista.

### 1.3 Lo que el director necesita saber cada frame

Los sonidos sueltos llegan por eventos. Para lo continuo, `GameScene` pasa cada frame un resumen pequeño con `AudioDirector.update(snapshot)`:

- Posición y nivel (planta, sótano, azotea) del jugador local.
- Arma continua activa (láser o lanzallamas) y calor del láser, de 0 a 1.
- Vida baja, sí o no.
- Estado de la partida: título, descanso, ronda, ronda de boss, fin.
- Zombies cercanos: cuántos hay a menos de `AUDIO.groanRange` y la posición del más cercano.
- Boss embistiendo o aturdido, y su posición.
- Juego en pausa.

El director no importa Phaser ni lee `GameState` directamente.

---

## 2. Móvil

- **Desbloqueo:** el `AudioContext` se crea o se reanuda dentro del toque de `JUGAR`. Como respaldo, también en el primer toque de cualquier otra pantalla.
- **Segundo plano:** al salir de la app se suspende el contexto; al volver se reanuda. Usa `appStateChange` de `@capacitor/app`, que ya está instalado, y `visibilitychange` en el navegador.
  - En iOS el contexto puede quedarse suspendido al volver. Si pasa, reanúdalo en el siguiente toque. El juego no debe quedarse mudo para el resto de la sesión.
- **Interruptor de silencio del iPhone:** corta el audio web. Es lo esperado en un juego: **no lo esquives**.
- **Pausa del juego:** se cortan los efectos y los bucles; la música sigue al 40 %.
- **Ajustes en el menú de pausa:** dos botones bajo el de vibración, `EFECTOS` y `MÚSICA`. Cada toque rota entre `ALTO`, `MEDIO`, `BAJO` y `NO`. Se guardan en `Preferences`. El bus `ui` sigue al de efectos.
- **Formato de los efectos:** WAV mono, 44,1 kHz, 16 bits. Se decodifica igual en iOS y Android.
- **Presupuesto:** todos los efectos juntos, menos de 2 MB.

---

## 3. Dirección de sonido

### 3.1 Cuatro familias

| Familia | Qué incluye | Cómo suena | Duración |
|---|---|---|---|
| **Golpe** | Armas, impactos, bajas | Grave y medio, seco, ataque inmediato: un clic más un cuerpo | 60–250 ms |
| **Premio** | Dinero, puntos, recogidas, compras, mejoras | Tonal, brillante, afinado a la escala; termina subiendo | 80–600 ms |
| **Amenaza** | Zombies, daño recibido, boss | Grave y áspero, poco frecuente | 150–1000 ms |
| **Interfaz** | Botones y paneles | Clics suaves y cortos | 30–120 ms |

### 3.2 Reglas

1. **Una sola escala:** todo sonido con nota usa **La menor pentatónica** (La, Do, Re, Mi, Sol). Así suenan bien aunque se solapen, y la escala menor da el tono de acción.
2. **Lo bueno sube, lo malo baja.** Premios: notas ascendentes. Avisos y fallos: descendentes.
3. **Cuanto más se repite un sonido, más corto y más bajo.** La ráfaga de la SMG suena menos que un cartucho de escopeta.
4. **Nada chirriante:** los sonidos frecuentes llevan un filtro que recorta los agudos por encima de 8 kHz. Ondas cuadradas y triangulares antes que dientes de sierra crudos.
5. **Jerarquía del premio:** cuanto mayor es el logro, más notas.

| Logro | Sonido |
|---|---|
| Impacto | Un tic |
| Baja | Una nota |
| Compra | Dos o tres notas |
| Mejora de arma | Cuatro notas |
| Ronda superada o boss muerto | Melodía completa |

6. **El premio llega al instante:** menos de 50 ms entre la acción y su sonido.
7. **Sin pasos del jugador.** Se repiten demasiado y cansan.

### 3.3 Rachas

Una racha sube el tono del sonido en cada repetición seguida, por los grados de la escala. Es lo que hace que encadenar bajas enganche.

- **Peldaños**, en semitonos sobre la nota base: 0, 3, 5, 7, 10, 12, 15, 17. Al llegar al último, se queda en él.
- La racha vuelve al primer peldaño si pasa su ventana de tiempo sin repetirse.

| Racha | Sube con | Ventana |
|---|---|---|
| `kill` | Cada baja del jugador | 1,5 s |
| `repair` | Cada tablón reparado | 2 s |
| `upgrade` | El nivel de mejora comprado (1, 2 o 3). No es por tiempo | — |

### 3.4 Mezcla

- **Límite global:** 12 voces de efectos a la vez (`AUDIO.maxVoices`).
- **Posición:** un sonido posicional suena a volumen completo a menos de 160 px del jugador y baja de forma lineal hasta el 25 % a 480 px. Se desplaza a izquierda o derecha según su posición en horizontal, como mucho un 70 %.
- **Otro nivel:** lo que ocurre en un nivel distinto al del jugador no suena, salvo los avisos del boss y los carteles.
- **La música cede el paso:** los sonidos con `duck` la bajan 6 dB durante su duración.
- **Vida baja:** la música pasa por un filtro que la deja apagada, y suena un latido durante los primeros 5 s. Después solo queda la música apagada. Como la vida no se regenera, un latido permanente sería insoportable.

---

## 4. Generador de sonidos

Los efectos nacen de **recetas** en `audio-src/recipes/`, y un script las convierte en archivos. El juego solo carga archivos: no hay síntesis en tiempo de ejecución.

`npm run audio:gen` → lee las recetas → escribe los WAV en `public/assets/audio/sfx/` → actualiza la sección `audio` del manifiesto → escribe el informe.

### 4.1 Tipos de receta

| Tipo | Qué es | Para qué |
|---|---|---|
| `sfxr` | Parámetros de un sonido retro (formato de jsfxr) | Disparos, impactos, barridos, explosiones |
| `notes` | Una secuencia de notas: onda, duración de cada nota, envolvente | Premios, melodías cortas, avisos |
| `layers` | Mezcla de varias recetas, cada una con su volumen y su retraso | Dar cuerpo: un clic más un golpe grave más una cola |
| `file` | Un archivo de biblioteca, con recorte y volumen (fase S5) | Sonidos grabados |

- **Dependencia:** `jsfxr` como dependencia **de desarrollo**; el juego no la incluye. Comprueba antes su licencia. Si no está clara, usa ZzFX (MIT) o escribe el sintetizador: es pequeño.
- **El tipo `notes`** es un sintetizador propio mínimo: onda cuadrada, triangular o seno, y ataque y caída por nota.
- **Las recetas guardan todos los parámetros.** Los preajustes de jsfxr son aleatorios: sirven de punto de partida, pero lo que se guarda es el resultado fijo.
- **Generación determinista:** las mismas recetas dan siempre los mismos archivos, byte a byte.

### 4.2 Acabado común

A todos los archivos generados:

- Sin silencio al principio: el sonido empieza en los primeros 5 ms.
- Fundido de salida de 5 ms, para que no haga clic al cortarse.
- Pico normalizado a −1 dB. El volumen relativo se ajusta en el catálogo, no en el archivo.

### 4.3 Ajustar un sonido a oído

- Una receta `sfxr` se puede abrir en la web sfxr.me, retocar escuchando y volver a traer. El script acepta el JSON de la web o su enlace comprimido, si la librería lo permite.
- Para cambiar un sonido, yo le paso a Claude Code el JSON o el enlace nuevo.

### 4.4 Informe

`audio:gen` escribe `audio-src/preview/report.md` con una fila por archivo: duración, pico, volumen medio y brillo (centro del espectro).

Avisa de lo que se salga de las reglas:

- Duración fuera del rango de su familia (sección 3.1).
- Silencio inicial o saturación.
- Un sonido de la familia Premio más grave que los de Golpe, o al revés.
- Dos variantes del mismo sonido casi idénticas.

Revisa el informe antes de cerrar cada fase, igual que la vista previa de un mapa.

---

## 5. Lista de sonidos

**Evento:** los marcados con ★ no existen todavía. Añádelos al `EventBus`, emitidos desde su sistema, con `playerId` y posición cuando tenga sentido.

### 5.1 Armas y jugador (Golpe)

| id | Cuándo | Cómo suena |
|---|---|---|
| `weapon.pistol.fire` | ★ `weapon:fired` | "Pop" seco con una caída rápida de tono. 90 ms. 2 variantes |
| `weapon.smg.fire` | ★ `weapon:fired` | Más corto, agudo y suave que la pistola. 60 ms. 3 variantes |
| `weapon.shotgun.fire` | ★ `weapon:fired` | El más grande: golpe grave más una ráfaga de ruido ancha. 250 ms |
| `weapon.katana.swing` | ★ `weapon:fired` | Barrido de aire rápido. 150 ms. 2 variantes |
| `weapon.katana.hit` | `zombie:hit` con la katana | Corte metálico corto y afinado |
| `weapon.laser.loop` | Resumen: láser activo | Zumbido afinado en bucle. **El tono sube con el calor**, para oír cuánto falta para sobrecalentarse |
| `weapon.laser.overheat` | ★ `weapon:overheat` | Soplido descendente con dos avisos cortos |
| `weapon.flame.loop` | Resumen: lanzallamas activo | Rugido de ruido filtrado en bucle, con arranque y cola |
| `weapon.flame.blast` | `fire:blast` | Bocanada grave. Posicional |
| `weapon.knife` | ★ `knife:swing` | Silbido corto; un golpe sordo si acierta |
| `weapon.reload.start` | ★ `weapon:reload` | Clic de cargador saliendo |
| `weapon.reload.end` | ★ `weapon:reload` | Clic de cargador entrando más un tic brillante de "listo" |
| `weapon.empty` | ★ `weapon:empty` | Clic seco, bajo |
| `weapon.switch` | ★ `weapon:switched` | Clic deslizante corto |
| `weapon.broken` | `weapon:broken` | Chasquido metálico con dos notas descendentes |
| `impact.flesh` | `zombie:hit` | Golpe blando y corto. `pitchVar` 8 %. 3 variantes. Intervalo mínimo 40 ms. Posicional |
| `player.dash` | ★ `player:dash` | Soplo de aire con una subida ligera de tono |
| `player.hurt` | `player:damaged` | Golpe grave más una nota corta disonante. No es un grito |
| `player.death` | `player:died` | Arpegio descendente lento más un golpe grave |
| `player.heartbeat` | Resumen: vida baja | Latido doble grave, 5 s |

### 5.2 Premios

| id | Cuándo | Cómo suena |
|---|---|---|
| `reward.hit` | `points:gained`, motivo `hit` | Tic muy corto y suave. Intervalo mínimo 40 ms |
| `reward.kill` | `zombie:killed` por un jugador | "Pop" más una nota. Racha `kill` |
| `reward.repair` | ★ `barricade:repaired` | Golpe de madera más un tic. Racha `repair` |
| `pickup.ammo` | `pickup:collected` | Clic-clac más dos notas ascendentes |
| `pickup.health` | `pickup:collected` | Tres notas cálidas ascendentes |
| `pickup.item` | `item:picked` | Destello de tres notas con aire de misterio |
| `buy.cash` | `money:spent` | Caja registradora: monedas más campanilla |
| `buy.door` | `door:opened`, `portal:opened` | Cerrojo pesado más un acorde ascendente. Posicional |
| `buy.zone` | `zone:unlocked` | Dos notas de fanfarria, tras el cerrojo |
| `buy.weapon` | `weaponCase:purchase` | Montar un arma más dos notas |
| `buy.merchant` | `merchant:purchase` | Brillo mágico más dos notas |
| `buy.upgrade` | `merchant:purchase`, mejoras | Arpegio ascendente de cuatro notas. Racha `upgrade` |
| `buy.special` | `merchant:purchase`, especial | La fanfarria más larga de una compra, con brillo |
| `boost.on` | `boost:activated` | Barrido ascendente con energía |
| `denied` | ★ `action:denied` | Dos notas graves y suaves. No es un zumbido de error |
| `item.cantUse` | `item:cantUse` | Igual que `denied`, más bajo |
| `item.splash` | `item:thrown`, al caer | Chapuzón. Posicional |
| `ritual.done` | `activation:completed` | Subida mágica larga más un golpe grave. `duck` |
| `merchant.arrive` | `merchant:moved`, solo con `first` | Humo más tres notas |

Los magos que solo cambian de sitio no suenan: coincidirían con el cartel de ronda.

### 5.3 La Mano del Demonio

| id | Cuándo | Cómo suena |
|---|---|---|
| `hand.pay.money` | `hand:paid` | Monedas cayendo al fuego |
| `hand.pay.blood` | `hand:paid`, con sangre | Golpe húmedo y grave |
| `hand.roll` | Tras el pago, mientras elige | Tics que se aceleran. Dura lo mismo que el sorteo en `balance.ts` |
| `hand.offer` | `hand:offer` | Dos notas de revelación |
| `hand.offer.special` | `hand:offer`, arma especial | Fanfarria con brillo. `duck` |
| `hand.taken` | `hand:taken` | Agarrar un arma |
| `hand.refund` | `hand:refunded` | Tres notas descendentes de burla más monedas |
| `hand.moved` | `hand:moved` | Retumbo lejano |

### 5.4 Amenazas

| id | Cuándo | Cómo suena |
|---|---|---|
| `zombie.groan` | Resumen: zombies cerca | Gruñido grave y corto, bajo. 4 variantes. Uno cada 2 a 5 s, nunca dos a la vez. Posicional |
| `zombie.attack` | ★ `zombie:attack`, al empezar a preparar el golpe | Jadeo áspero corto. Avisa del golpe antes de que llegue. Posicional |
| `zombie.crawl` | ★ `zombie:crippled` | Crujido húmedo. Posicional |
| `barricade.break` | ★ `barricade:plankBroken` | Madera que se parte. Posicional |
| `boss.warning` | `boss:warning` | Silbido de caída que baja de tono durante los 3 s del aviso. `duck` |
| `boss.landed` | `boss:landed` | Golpe enorme y grave con escombros. Prioridad alta |
| `boss.roar` | `boss:roar` | Gruñido grave de 1 s. `duck` |
| `boss.windup.charge` | ★ `boss:windup` | Dos resoplidos mientras escarba |
| `boss.windup.slam` | ★ `boss:windup` | Barrido de aire ascendente, el mazo sube |
| `boss.windup.leap` | ★ `boss:windup` | Muelle grave que se comprime |
| `boss.charge.loop` | Resumen: boss embistiendo | Galope retumbante en bucle |
| `boss.slam` | `boss:slam` | Golpe pesado más una grieta |
| `boss.stunned` | `boss:stunned` | Choque contra la pared; después un arpegio de "mareo" en bucle mientras dura el aturdimiento |
| `boss.killed` | `boss:killed` | Derrumbe largo. Después suena `jingle.boss.dead` |

**Los tres avisos del boss tienen que distinguirse a ciegas.** Ya no se dibuja ninguna zona en el suelo, así que el sonido es el segundo aviso de cada ataque. El arpegio de aturdido le dice al jugador que es el momento de pegar.

### 5.5 Carteles y melodías cortas

Recetas `notes`. Suenan por el bus de efectos, así que existen aunque no haya música.

| id | Cuándo | Cómo suena |
|---|---|---|
| `jingle.round.start` | `round:changed` | Cuatro notas ascendentes, tensas. `duck` |
| `jingle.round.boss` | `round:changed`, con boss | Notas graves descendentes más un retumbo. `duck` |
| `jingle.round.clear` | `round:cleared` | Melodía brillante que resuelve. La recompensa de la ronda. `duck` |
| `jingle.boss.dead` | Tras `boss.killed` | La melodía más larga del juego, hasta 2 s. `duck` |
| `jingle.gameover` | `game:over` | Descenso lento |

### 5.6 Interfaz

| id | Cuándo | Cómo suena |
|---|---|---|
| `ui.tap` | Cualquier botón de menú | Tic suave |
| `ui.shop.open` / `ui.shop.close` | `shop:state` | Roce de tela: el mago abre y cierra la gabardina |
| `ui.pause.open` / `ui.pause.close` | Menú de pausa | Dos notas, descendentes y ascendentes |
| `ui.play` | Botón `JUGAR` | Nota firme más un golpe grave |

---

## 6. Sonidos de biblioteca (fase S5)

Sustituyen a los generados donde suenen mejor. El juego no cambia: solo la receta.

- **Dónde los dejo yo:** `audio-src/library/<origen>/`, por ejemplo `kenney-impact-sounds/` o `freesound/`.
- **Solo licencia CC0.** El repositorio es público, así que no vale ninguna biblioteca que prohíba redistribuir los archivos sueltos (por ejemplo, los paquetes de Sonniss).
- **Conversión:** `audio:gen` convierte la receta `file` a WAV mono con el acabado común. Kenney entrega OGG, que iOS no decodifica bien: por eso se convierte. Para decodificar, `ffmpeg-static` como dependencia de desarrollo.
- **Mezclas:** una receta `layers` puede combinar un archivo con una capa generada. Por ejemplo, un golpe grabado más la nota de la racha.
- **Candidatos:** para cada sonido a sustituir, propón hasta 3 candidatos de la biblioteca, elegidos por nombre de archivo y por el informe. Yo elijo en el panel de prueba (sección 8).
- **Créditos:** `docs/AUDIO-CREDITS.md`, con una fila por archivo usado: origen, autor, licencia y enlace.

Por dónde empezar: gruñidos de zombie, escopeta, madera de las barricadas, chapuzón y caja registradora. Son los que peor imita un sintetizador.

---

## 7. Música (fase S6)

| Estado | Cuándo | Carácter |
|---|---|---|
| `title` | Pantalla de título | Tranquila, con misterio |
| `calm` | Descanso entre rondas | Baja, deja respirar |
| `round` | Ronda en marcha | Ritmo de acción |
| `boss` | Ronda de boss, desde que cae | La más intensa |

- **Cambio de estado:** fundido cruzado de 1,5 s. `calm` y `round` pueden compartir pista si solo hay una.
- **Fin de partida:** la música se apaga en 1 s y suena `jingle.gameover`.
- **Sin archivos, silencio.** El juego funciona igual.
- **Origen:** pistas CC0 o de licencia equivalente que yo elija. Las dejo en `audio-src/music/` y un script las convierte.
- **Formato:** M4A o MP3. Elige el que haga el bucle limpio en iPhone y Android, y anótalo en `DECISIONS.md`.
- **Bucle sin salto:** el script mide `loopStart` y `loopEnd`, y el motor los usa al repetir.
- **Memoria:** bucles de 30 a 90 s, y como mucho 2 pistas decodificadas a la vez (la actual y la siguiente).
- **Volumen:** por defecto, la música un 35 % por debajo de los efectos.

---

## 8. Debug y tests

**Panel `PRUEBA DE SONIDOS`** en el debug:

- Lista todos los sonidos por familia. Un toque reproduce el sonido tal como sonaría en el juego, con su variación y su racha.
- Si un sonido tiene candidatos de biblioteca, botones `A`, `B`, `C` para compararlos.
- Botón `SIMULAR RACHA`: 8 bajas seguidas.
- Muestra las voces activas y marca las reproducciones descartadas por el límite.
- En el escritorio, un enlace para abrir en sfxr.me la receta de cada sonido `sfxr`.

**Tests:**

- Catálogo: toda variante existe en el manifiesto; ningún id duplicado.
- Director, con un motor falso:
  - Cada evento de la sección 5 pide su sonido.
  - Un evento de otro jugador no dispara los sonidos que son solo del jugador local.
  - `minInterval` y `maxVoices` descartan lo que sobra.
  - Con el límite global lleno, se corta la voz de menor prioridad.
  - Rachas: sube un peldaño por repetición, se queda en el último y vuelve al primero al pasar la ventana.
  - Posición: volumen y desplazamiento según la distancia; nada de otro nivel.
  - Vida baja: el latido dura 5 s y no se repite hasta que la vida suba y vuelva a bajar.
  - Estados de la música y sus cambios.
- Preferencias: los niveles de efectos y música se guardan y se leen; valores corruptos vuelven al valor por defecto.
- Generador: las mismas recetas dan los mismos bytes; el acabado común se cumple; el informe avisa de un archivo fuera de rango.
- Con el audio apagado o sin `AudioContext`, el juego arranca y todos los tests de lógica pasan.

---

## 9. Fases

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **S1** | Motor, catálogo, sección `audio` del manifiesto, desbloqueo, segundo plano, ajustes en la pausa, panel de prueba vacío. Un sonido de prueba, `ui.tap`. | `ui.tap` suena en iPhone y Android tras tocar `JUGAR`, y vuelve a sonar después de mandar la app a segundo plano. |
| **S2** | Generador (`sfxr`, `notes`, `layers`), informe, eventos nuevos de armas y jugador, y los sonidos de la sección 5.1. | Disparar, recargar, cambiar de arma, el dash y los impactos suenan. **⏸ Detente** para que los escuche en el móvil. |
| **S3** | Premios, rachas, la mano, carteles e interfaz (secciones 5.2, 5.3, 5.5 y 5.6). | Encadenar bajas sube de tono. Cada compra tiene su sonido. |
| **S4** | Amenazas (5.4), posición, límite de voces, vida baja. | Los tres avisos del boss se distinguen sin mirar. Con 20 zombies y la SMG no se satura. **⏸ Detente.** |
| **S5** | Recetas `file`, candidatos, créditos. | Los sonidos elegidos se sustituyen sin tocar código del juego. **⏸ Detente** antes de empezar, para que deje las bibliotecas, y al terminar. |
| **S6** | Música: estados, fundidos, bucles, vida baja y música que cede el paso. | La música cambia entre descanso, ronda y boss sin saltos ni clics. **⏸ Detente.** |
| **S7** | `docs/AUDIO.md` (canal de trabajo y dirección de sonido), comandos y estructura en `CLAUDE.md`, `ASSETS-TODO.md`. | Todo documentado. |

Al cerrar cada fase, sigue el cierre de fase de `CLAUDE.md`, con commits `feat(fase-SN): …`.