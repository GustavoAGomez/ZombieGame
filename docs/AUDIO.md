# Audio

Cómo suena el juego, cómo se hace o se cambia un sonido y de dónde salen. La spec es `docs/specs/08-audio.md`. Lo que se decidió por el camino, y por qué, está en las secciones «Audio» de `docs/DECISIONS.md`. El formato de las entradas del manifiesto está en `docs/ASSETS.md`, en el apartado «Sonidos».

## 1. Las piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Catálogo y números | `src/config/audio.ts` | `SOUNDS`: cada sonido por su id (`weapon.pistol.fire`), con su familia, variantes, bus, volumen y límites. `AUDIO`: la mezcla. `AUDIO_GEN`: el taller. |
| Director | `src/audio/AudioDirector.ts` | Escucha los eventos del juego y el resumen de cada frame, y decide qué suena, con qué variante, tono, volumen y posición. También lleva la música. |
| Motor | `src/audio/AudioEngine.ts` | Web Audio: tres buses (efectos, menús y música) a un bus maestro con limitador. La música pasa además por un paso bajo. Sin Web Audio no suena nada y no falla nada. |
| Ciclo de vida | `src/audio/lifecycle.ts` | Cualquier toque desbloquea el sonido (el móvil empieza mudo). En segundo plano se suspende. |
| Preferencias | `src/native/preferences.ts` | EFECTOS y MÚSICA en el menú de pausa: ALTO, MEDIO, BAJO o NO. |
| Taller | `scripts/audio-gen.ts`, `scripts/lib/audio/` | `npm run audio:gen`: de las recetas a los archivos, el manifiesto, el informe y los créditos (sección 3). |
| Búsqueda | `scripts/audio-search.ts` | `npm run audio:search`: descarga sonidos CC0 de Freesound (sección 4). |
| Panel de prueba | `src/debug/DebugOverlay.ts`, `src/debug/soundTrials.ts` | PRUEBA DE SONIDOS (sección 7). |

**Reglas:**

- **El audio es presentación.** Nunca cambia la lógica ni el resultado de un tick, y los tests del juego pasan igual sin él.
- **El juego nombra los sonidos por su id.** Nunca usa la clave de un archivo ni su ruta: las variantes las pone el catálogo.
- **Un sonido sin archivo es silencio**, no un error.
- **Todos los números de audio** están en `src/config/audio.ts`.

**Cómo le llega el juego al audio:**

- **Por eventos** (`EventBus`): un disparo, un impacto, una compra o el aviso del boss. Lo que es solo del jugador local (sus disparos, sus recargas y su daño) se filtra por `AUDIO.localPlayerId`.
- **Por el resumen de cada frame** (`AudioSnapshot`, que rellena `GameScene`): la pausa, el láser o el lanzallamas encendidos y el calor del láser, la posición y el nivel del jugador, la vida baja, los zombis cerca, el boss embistiendo o aturdido, y el estado de la música. Con él arrancan y paran los bucles.

## 2. Añadir o cambiar un sonido

1. **Si es nuevo:**
   - añádelo al catálogo (`SOUNDS`) con su id, su familia, sus variantes (`keys(id, n)`), su bus, su volumen y sus límites;
   - haz que el director lo pida en su evento, con su test en `src/audio/AudioDirector.test.ts`.
2. **Escribe o cambia su receta** en `audio-src/recipes/<id>.json`, con hasta tres candidatos (A, B y C) de fuentes o montajes distintos (sección 3).
3. **Ejecuta `npm run audio:gen`.** Escribe los archivos, el manifiesto, el informe (`audio-src/preview/report.md`) y los créditos (`docs/AUDIO-CREDITS.md`).
4. **Lee el informe**, sobre todo sus avisos, como se revisa la vista previa de un mapa.
5. **Escúchalo en el móvil**, en PRUEBA DE SONIDOS (sección 7).
6. **Elige:** pon `"chosen": "B"` en la receta y vuelve a ejecutar `audio:gen`. Desde ese momento solo sale ese candidato, y los otros se quedan en la receta.

Cuando un sonido no convence, se pide con palabras: «más grave», «menos cola», «más seco», «nada de metal». Cada petición se convierte en un cambio de la receta. Claude Code no puede oír, así que siempre entrega varios candidatos y la decisión es de quien escucha.

## 3. El taller (`npm run audio:gen`)

El juego solo carga archivos: no hay síntesis en tiempo de ejecución. Las mismas recetas y las mismas fuentes dan siempre los mismos bytes.

### 3.1 La receta

`audio-src/recipes/<id>.json`:

```json
{ "chosen": null, "candidates": { "A": { "about": "…", "channels": 1, "variants": [ … ] }, "B": … } }
```

- **`about`:** una línea que cuenta qué prueba el candidato. Sale en el informe.
- **`channels`:** 1 (mono) para los sonidos posicionales y los frecuentes, y 2 (estéreo) para los grandes que no son posicionales y para la música.
- **`variants`:** una receta por variante del catálogo.
- **Con `chosen` a `null`:** el juego suena con A, y los tres candidatos van a `public/assets/audio/candidates/`. Esa carpeta no va en git (`audio:gen` la vuelve a escribir igual) ni en el build: `vite build` la quita, junto con sus entradas del manifiesto.
- **Con un candidato elegido:** solo sale ese.
- **Sin receta:** la variante del catálogo tiene una entrada `placeholder` y suena como silencio.

### 3.2 Tipos de receta

- **`file`:** una fuente grabada, `{ "type": "file", "source": "library/<origen>/<archivo>.ogg" }`. La ruta es desde `audio-src/` y puede estar en `library/`, `generated/` o `music/`. ffmpeg (`ffmpeg-static`, dependencia de desarrollo) la decodifica, y se normaliza a escala completa tras su recorte, así que el `gain` de una capa no depende del volumen al que se grabó.
- **`synth`:** una capa hecha por código, para apoyo. Lleva `timbre` (`bell`, `glass`, `sub`, `air` o `pad`) y sus parámetros: `note` o `notes` (solo de La menor), `duration`, `attack`, `freq`, `freqEnd`, `width` y `seed`. Si desentona junto a las grabadas, se cambia por una grabación.
- **`layers`:** una mezcla de capas, cada una `{ "recipe": {…}, "gain": 0..1, "delay": segundos }`. Es el sonido final: ataque, cuerpo, brillo y cola.

### 3.3 Proceso

Cualquier receta puede llevar `process`. Todo es opcional y se aplica en este orden:

- `start` y `end`: el recorte, en segundos;
- `reverse`: al revés, para las subidas mágicas que acaban en un golpe;
- `semitones` (tono y velocidad juntos) y `glide` (semitonos de más o de menos al final: un tono que se desliza);
- `lowcut`, `highcut` (Hz) y `peaks`: `[{ "freq": Hz, "gainDb": dB, "q": 1 }]`;
- `threshold` (dBFS) y `ratio` para comprimir, y `drive` (0 a 1) para saturar;
- `reverb` (`room` o `hall`) y `wet`;
- `width`: 0 mono, 1 tal cual, hasta 2 más ancho;
- `gainDb`;
- `length`: la longitud final, que corta también la cola de la reverberación o rellena con silencio;
- `fadeIn` y `fadeOut`.

### 3.4 Acabados

- **Común** (los efectos, en WAV de 44,1 kHz y 16 bits):
  - el archivo empieza donde el sonido llega a −40 dB de su pico (lo de antes es ruido de sala), tras 1 ms de fundido;
  - termina con al menos 5 ms de fundido;
  - no tiene nada por debajo de 60 Hz;
  - su pico está a −1 dB. El volumen relativo de cada sonido se ajusta en el catálogo (`volume`), no en el archivo.
- **Bucles** (`loop` en el catálogo: el láser, el lanzallamas, el latido, el galope y el gruñido del boss): sin recorte ni fundidos. Sus últimos 120 ms se funden con el principio, para que se repitan sin costura ni clic.
- **Música** (M4A, sección 6):
  - nada por debajo de 40 Hz;
  - fuera el silencio de los extremos, pero solo si dura 20 ms o más, para no quitarle a un bucle la muestra de un paso por cero;
  - sus últimos 2 s fundidos sobre el principio. Si los dos extremos son la misma música (una fuente que ya era un bucle, con sus primeros 2 s añadidos detrás en una receta `layers`), el fundido es lineal y el bucle queda exacto. Si no lo son, el fundido es de potencia constante;
  - 0,25 s del final del bucle delante de `loopStart` y 0,25 s de su principio detrás de `loopEnd`, para que un decodificador que desplace el audio un poco no rompa el bucle;
  - todas igual de fuertes de media (−18 dBFS RMS), salvo que su pico pase de −1 dB;
  - bucles de 30 a 90 s. Una fuente que ya es un bucle y es más corta se repite con `layers`; una más larga se corta con `end`.

### 3.5 Sonidos especiales del catálogo

- **Rachas** (`ladder` y `shine`: `reward.repair` y `buy.upgrade`): cada candidato lleva, además de `variants`, una receta `shine` por variante. Es la capa de brillo. Va a su propio archivo (`<variante>_shine`) y es la única que el director sube de tono con la racha; el cuerpo no cambia.
- **Sonidos de mago** (`keyed`: `buy.merchant`, `merchant.arrive`, `ui.shop.open` y `ui.shop.close`): tres variantes, una por mago (azul, rojo y dorado, en ese orden). No se eligen al azar: las elige el evento.
- **Longitud fija** (`length`): `hand.roll` dura lo que el sorteo (`HAND.rollingTime`) y `boss.warning` lo que el aviso (`BOSS.warningTime`). El informe avisa si se apartan más de 50 ms.

### 3.6 El informe

`audio-src/preview/report.md` tiene una fila por archivo con su duración, su cola, su pico, su volumen medio, su brillo (el centro del espectro), su tono dominante y el reparto de su energía por bandas. Debajo, una línea por candidato con su `about`.

Avisa de:

- una duración o una cola fuera del rango de su familia (sección 5.2), o una longitud fija que no se cumple;
- silencio al principio o saturación;
- más de un 25 % de la energía por debajo de 100 Hz, que en el móvil no se oye;
- un Premio más grave que los Golpes, o un Golpe más agudo que los Premios, por su tono dominante frente a la mediana de la otra familia (en las rachas cuenta solo el brillo);
- dos variantes del mismo sonido casi idénticas (solo se comparan los cuerpos, porque el brillo de una racha es el mismo a propósito);
- un archivo estéreo en un sonido posicional;
- un bucle de música fuera de 30 a 90 s;
- los efectos del juego por encima de 10 MB (`AUDIO_GEN.budgetBytes`; eran 8 con los 75 sonidos de Supervivencia).

**Avisos que se quedan a propósito:** `buy.door` es un cerrojo, más grave que los golpes, y `weapon.empty`, `weapon.reload.start` y `weapon.reload.end` son clics metálicos, más agudos que los premios. Son mecánicos y no se confunden con un premio. Lo mismo las puertas de la mazmorra (`dungeon.door.open`, `dungeon.door.shut`) y su trampilla (`dungeon.trapdoor`): madera y cerrojos.

## 4. Fuentes

- **Licencias:** solo fuentes CC0 o generadas por IA con licencia de uso comercial. El repositorio es público, así que no vale nada que prohíba redistribuir sus archivos (Sonniss, la mayoría de packs gratuitos de itch.io). No se usa ni se extrae ningún sonido de otro juego. *Wild Rift* es solo la referencia de estilo.
- **Carpetas, dentro de `audio-src/`:**
  - `library/<origen>/`, solo CC0: `freesound`, `kenney-impact-sounds`, `kenney-interface-sounds`, `kenney-rpg-audio` y `oga-80-cc0-rpg-sfx`;
  - `generated/`, para lo generado por IA. Cada archivo lleva además el `prompt` y el `model`, y se guarda en el repositorio porque no se puede volver a generar igual. Ahora mismo no hay ninguno.
  - `music/`, para las pistas que elija el usuario. Las de ahora vienen de Freesound y están en `library/freesound/`.
- **Fichas:**
  - Cada carpeta lleva un `credits.json` con `origin`, `author`, `license` y `url`, que valen para todos sus archivos. En `files` van los datos de cada archivo, como el autor y el enlace de cada sonido de Freesound.
  - `audio:gen` escribe `docs/AUDIO-CREDITS.md`, con una fila por archivo de origen que use alguna receta.
  - `assets:check` falla si una receta usa una fuente sin ficha completa.
- **`npm run audio:search "<consulta>" [--count 5] [--max 4]`:**
  - busca en Freesound con el filtro CC0 y descarga los mejores resultados a `library/freesound/<id>_<título>.ogg`, cada uno con su ficha;
  - la clave sale de `FREESOUND_API_KEY` (en el entorno o en `.env`, que está fuera de git) y nunca se imprime;
  - con la clave solo se bajan las previsualizaciones, que son OGG de alta calidad.
- **Fuentes sin uso:** antes de un commit se borran las que no usa ninguna receta, porque se pueden volver a bajar con la misma búsqueda.
- **Nada de modelos de IA ni servicios de pago** sin preguntar antes al usuario.

## 5. Dirección de sonido

**Carácter:** fantasía oscura de acción. Golpes con cuerpo y peso, magia cristalina con brillo y amenazas graves y orgánicas. Todo nítido, corto y agradable; nada estridente ni de 8 bits.

### 5.1 Capas

Cada sonido se monta con hasta cuatro capas. Los muy frecuentes llevan dos; los grandes, las cuatro.

| Capa | Qué aporta | Ejemplos |
|---|---|---|
| Ataque | El primer instante, lo que hace que se note | Chasquido, clic, golpe seco |
| Cuerpo | El peso | Golpe grave, madera, carne, tambor |
| Brillo | La firma: lo que lo hace mágico o valioso | Campanilla, cristal, monedas, chispas |
| Cola | El espacio | Sala corta, eco, brasas |

### 5.2 Familias

Los rangos de duración y de cola están en `AUDIO_GEN.families`, y el informe los comprueba.

| Familia | Qué incluye | Cómo suena | Duración | Cola máxima |
|---|---|---|---|---|
| Golpe (`hit`) | Armas, impactos, recarga, dash | Ataque inmediato y cuerpo con peso | 80–400 ms | 300 ms |
| Premio (`reward`) | Tablones, recogidas, compras, mejoras, magos | Madera, monedas, campanas, cristal; termina subiendo | 100–900 ms | 600 ms |
| Amenaza (`threat`) | Zombis, daño, el boss, la Mano | Grave, orgánico y áspero | 200–1500 ms | 1 s |
| Interfaz (`ui`) | Botones y paneles | Toques suaves | 40–200 ms | 150 ms |
| Carteles (`jingle`) | Inicio y final de ronda, boss, fin de partida, compras especiales | Melodía corta | 300–2500 ms | 1,5 s |
| Música (`music`) | Las cuatro pistas | Orquestal y oscura, con percusión | Bucles de 30–90 s | — |

### 5.3 Reglas

1. **Lenguaje común:** lo del mismo tipo comparte firma. El dinero son monedas con campanilla; cada mago tiene su timbre (azul, cristal y agua; rojo, fuego y brasas; dorado, campanas y coro); lo negativo es un golpe sordo y sin brillo.
2. **Una sola tonalidad:** todo lo que tiene nota está en La menor, para que suene bien aunque se solape.
3. **Lo bueno sube y lo malo baja.**
4. **Pensado para el altavoz del móvil:** lo importante va entre 200 Hz y 5 kHz, y el peso de un golpe entre 120 y 250 Hz. Por debajo de 60 Hz no hay nada.
5. **Cuanto más se repite un sonido, más corto, más bajo y con menos cola.**
6. **El premio llega al instante:** ningún archivo empieza con silencio, y el contexto de Web Audio es de baja latencia.
7. **Sin pasos del jugador**, porque se repiten demasiado.

**Cambios del usuario sobre la spec** (detalle en `docs/DECISIONS.md`):

- Matar a un zombi no suena y no hay racha de bajas. El acierto suena solo con su impacto en carne (`impact.flesh`), sin toque de puntos.
- El tablón en la ventana (`reward.repair`) es madera seca, sin metal ni sala, y su racha es un «toc» corto de bloque de madera.
- Los martillazos del boss (`boss.slam`) y su choque al quedar aturdido (`boss.stunned`) son golpes secos de roca y escombros, sin metal. Mientras está aturdido se queja con un gruñido confuso (`boss.dizzy.loop`).
- El latido suena todo el tiempo que la vida está baja, hasta curarse, y no solo 5 s.

### 5.4 Rachas

En cada repetición seguida, el brillo sube por estos peldaños, en semitonos: 0, 3, 5, 7, 10, 12, 15 y 17. En el último se queda (`AUDIO.ladder`).

- **`repair`:** cada tablón colocado. Vuelve al primer peldaño si pasan 2 s sin otro.
- **`upgrade`:** sube con el nivel de mejora comprado (1, 2 o 3), no con el tiempo.

### 5.5 Mezcla

- **Límite:** 12 voces de efectos a la vez. Con el límite lleno se corta la de menor prioridad y, entre iguales, la más antigua; si todas pesan más, el sonido nuevo se descarta. Cada sonido tiene además su `maxVoices` y su `minInterval`.
- **Posición** (los sonidos `positional`):
  - a menos de 160 px del jugador suenan a volumen completo;
  - de ahí bajan en línea recta hasta el 25 % a 480 px;
  - se desplazan a izquierda o derecha según su lado, como mucho un 70 %;
  - el galope y el gruñido del boss lo siguen frame a frame.
- **Otro nivel:** lo que pasa en un nivel distinto al del jugador no suena, salvo los avisos del boss (`AUDIO.anyLevel`). Los carteles no tienen posición.
- **Gruñidos:** si hay un zombi a menos de 400 px, gruñe el más cercano cada 2 a 5 s, nunca dos a la vez.
- **Volúmenes:**
  - la música está un 35 % por debajo de los efectos;
  - los menús siguen el nivel de los efectos.
- **La música cede el paso:** baja 6 dB mientras suena un sonido con `duck`: los carteles, las compras y ofertas especiales, el ritual, el aviso, el rugido y la muerte del boss, y la muerte del jugador.
- **Vida baja:** la música se apaga con un paso bajo a 800 Hz y suena el latido, hasta curarse.
- **Pausa:** los efectos y los bucles se cortan, los menús siguen y la música queda al 40 %.

## 6. Música

| Estado | Cuándo | Pista |
|---|---|---|
| `title` | Pantalla de título | `music.title` |
| `calm` | Descanso entre rondas | `music.calm` |
| `round` | Ronda en marcha | `music.round` |
| `boss` | Desde que cae un boss hasta que muere (durante la alerta sigue la de ronda) | `music.boss` |
| `over` | Fin de partida | Se apaga en 1 s y suena `jingle.gameover` |

- **Cambios:** fundido cruzado de 1,5 s.
  - Si solo una de `calm` y `round` tiene archivo, las dos usan esa pista y no se corta.
  - Un estado sin archivo es silencio.
- **Formato:** M4A (AAC a 128 kbps, estéreo), que decodifican el iPhone y Android. El motor repite entre `loopStart` y `loopEnd`, guardados al microsegundo en el manifiesto.
- **Memoria:** la música no se decodifica al cargar. Cada pista se decodifica cuando llega su estado, y las demás se sueltan; durante un fundido hay como mucho dos.
- **Primer toque:** el móvil no deja sonar nada hasta el primer toque, y la pista pedida antes arranca en ese momento. Si ese toque es JUGAR, la del título apenas se oye.

## 7. Probar y elegir: PRUEBA DE SONIDOS

1. **Abrir el panel:**
   - arranca el juego con `npm run dev`;
   - en el móvil, abre la dirección de la red local con `?debug=1` (o toca tres veces la esquina de arriba a la izquierda);
   - toca el recuadro de FPS y luego PRUEBA DE SONIDOS.
2. **Antes, en el Mac:** ejecuta `npm run audio:gen`, porque los candidatos no están en git.

**Qué hace el panel:**

- **Pestañas:** una por familia, con un botón por sonido y sus candidatos A, B y C. El que suena en el juego está marcado.
- **Reproducir:** un toque en el sonido lo reproduce como en el juego, con su variación y su racha. Un bucle o una pista de música se para con otro toque, y la música suena de una en una.
- **Probar en partida:** tocar A, B o C pone ese candidato también en la partida, en lugar del elegido.
  - La prueba se guarda en el dispositivo (`localStorage`, clave `zombies.soundTrials`).
  - BORRAR PRUEBAS vuelve a lo que lleva el juego.
  - COPIAR ELECCIÓN copia «id: letra», uno por línea, para pasarlo por el chat y fijarlo con `chosen`. El panel corre en el móvil y no puede escribir las recetas.
- **Partida en silencio:** mientras el panel está abierto, la partida no suena y su música se para. Solo suena lo que se prueba, incluso en pausa.
- **Simulaciones:** SIMULAR COMBATE pone la SMG 5 s con impactos, una multitud alrededor, zarpazos y gruñidos. SIMULAR RACHA coloca 8 tablones seguidos.
- **Estado:** arriba se ven las voces activas, las descartadas por el límite y el estado del contexto de audio.

El juego normal no carga los candidatos: solo lleva los elegidos (o A).

## 8. Tests

- **`src/audio/AudioDirector.test.ts`**, con un motor falso:
  - cada evento pide su sonido, y lo que es solo del jugador local no suena por otro;
  - `minInterval`, `maxVoices` y el límite global;
  - las rachas, los magos, la posición y los niveles;
  - los gruñidos, el latido y los bucles del boss;
  - la música: estados, fundidos, pista compartida, memoria, primer toque, ceder el paso y vida baja;
  - el panel de prueba y las pruebas en partida.
- **`scripts/lib/audio/workshop.test.ts`:**
  - el taller repite los bytes y cumple el acabado común;
  - los bucles de efectos y de música quedan sin costura;
  - la música sale con el mismo volumen medio;
  - el informe avisa de lo que debe;
  - las fichas de licencia, y que `assets:check` falla sin ellas;
  - `audio:search` lee la clave sin imprimirla;
  - el build sale sin candidatos.
- **`assets:check`:**
  - cada variante del catálogo tiene entrada y archivo;
  - los efectos son WAV de 44,1 kHz y 16 bits;
  - la música es M4A con su bucle;
  - los efectos ocupan menos de 8 MB;
  - cada fuente tiene su ficha.
