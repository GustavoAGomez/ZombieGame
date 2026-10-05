# Spec 08 · Audio: efectos, premios sonoros y música

**Objetivo:**
1. Que todo lo que pasa en el juego **suene con acabado de juego grande**: sonidos grabados y montados por capas, no pitidos retro.
2. Poder **cambiar** cualquier sonido por otro sin tocar el código del juego.
3. Añadir **música** que cambie con la partida.

**Carácter:** fantasía oscura de acción, en la línea de *Wild Rift*. Golpes con cuerpo y peso, magia cristalina con brillo, premios de monedas y campanas, amenazas graves. Todo nítido, corto y agradable; nada estridente ni de 8 bits.

*Wild Rift* es solo la referencia de estilo. No se usa ni se extrae ningún sonido de ese juego ni de ningún otro.

**Convenciones:**
- Todos los números van en `src/config/audio.ts`. No hay volúmenes ni tiempos sueltos en el código.
- El audio es presentación: **nunca cambia la lógica** ni el resultado de un tick. Los tests del juego pasan igual con el audio apagado.
- Un sonido que falta es **silencio**, no un error (regla 5 de `CLAUDE.md`).
- Claude Code no puede oír. Por eso cada sonido se entrega con **varios candidatos** para que yo elija, y cada fase termina con un informe objetivo (sección 4.5) y una parada para escucharlos en el móvil.

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
| `ladder` | Racha a la que pertenece (sección 3.4), o ninguna |
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
- **Formato de los efectos:** WAV de 44,1 kHz y 16 bits. Se decodifica igual en iOS y Android.
  - **Mono** los sonidos posicionales y los que se repiten mucho.
  - **Estéreo** solo los grandes y no posicionales: carteles, compras importantes, la caída del boss.
- **Presupuesto:** todos los efectos juntos, menos de 8 MB.

---

## 3. Dirección de sonido

### 3.1 Cada sonido se monta por capas

Así trabajan los estudios grandes: varias fuentes grabadas, procesadas y sumadas, hasta que el resultado es más que sus partes. Un sonido tiene hasta cuatro capas:

| Capa | Qué aporta | Ejemplos de fuente |
|---|---|---|
| **Ataque** | El primer instante, lo que hace que se note | Chasquido, clic metálico, golpe seco |
| **Cuerpo** | El peso | Golpe grave, madera, carne, tambor |
| **Brillo** | La firma: lo que lo hace mágico o valioso | Campanilla, cristal, monedas, chispas, un barrido de aire |
| **Cola** | El espacio | Reverberación corta, eco, brasas que se apagan |

Los sonidos muy frecuentes llevan dos capas. Los grandes, las cuatro.

### 3.2 Cuatro familias

| Familia | Qué incluye | Cómo suena | Duración |
|---|---|---|---|
| **Golpe** | Armas, impactos, bajas | Ataque inmediato y cuerpo con peso; cola de sala muy corta | 80–400 ms |
| **Premio** | Dinero, puntos, recogidas, compras, mejoras | Monedas, campanas y cristal, con brillo; termina subiendo | 100–900 ms |
| **Amenaza** | Zombies, daño recibido, boss | Grave, orgánico, con aspereza; poco frecuente | 200–1500 ms |
| **Interfaz** | Botones y paneles | Toques suaves de cristal, piedra y tela | 40–200 ms |

### 3.3 Reglas

1. **Lenguaje común:** lo que es del mismo tipo comparte firma, para reconocerlo sin mirar.

| Tipo | Firma |
|---|---|
| Dinero | Monedas con una campanilla |
| Curación y vida | Campana cálida con un soplo de aire |
| Mago azul | Cristal y agua |
| Mago rojo | Fuego y brasas |
| Mago dorado | Campanas de metal y un coro lejano |
| Infierno (la mano, el corazón, el boss) | Retumbo grave, brasas y un gruñido |
| Negativo o denegado | Golpe sordo y apagado, sin brillo |

2. **Una sola tonalidad:** todo lo que tiene nota (campanas, cristal, carteles) está en **La menor**. Así suena bien aunque se solape.
3. **Lo bueno sube, lo malo baja.** Premios: notas ascendentes. Avisos y fallos: descendentes.
4. **Pensado para el altavoz del móvil:** la energía importante va entre 200 Hz y 5 kHz. Por debajo de 100 Hz el móvil no suena, así que el peso de un golpe se consigue entre 120 y 250 Hz. Recorta todo por debajo de 60 Hz.
5. **Cuanto más se repite un sonido, más corto, más bajo y con menos cola.** La ráfaga de la SMG suena menos que un cartucho de escopeta.
6. **Colas con medida:** hasta 300 ms en los sonidos frecuentes; hasta 1,5 s en los grandes momentos.
7. **Jerarquía:** cuanto mayor es el momento, más capas y más duración.

| Momento | Sonido |
|---|---|
| Impacto | Un toque |
| Baja | Un golpe con una campanilla |
| Compra | Monedas más dos o tres notas |
| Mejora de arma | Subida de cuatro notas con brillo |
| Ronda superada o boss muerto | Melodía completa |

8. **El premio llega al instante:** menos de 50 ms entre la acción y su sonido. Ningún archivo empieza con silencio.
9. **Sin pasos del jugador.** Se repiten demasiado y cansan.

### 3.4 Rachas

Una racha sube el tono de la capa de **brillo** en cada repetición seguida, por los grados de la escala. El cuerpo del sonido no cambia. Es lo que hace que encadenar bajas enganche.

- **Peldaños**, en semitonos sobre la nota base: 0, 3, 5, 7, 10, 12, 15, 17. Al llegar al último, se queda en él.
- La racha vuelve al primer peldaño si pasa su ventana de tiempo sin repetirse.
- Para poder subir solo el brillo, esos sonidos se entregan en dos archivos (cuerpo y brillo) que el director lanza a la vez.

| Racha | Sube con | Ventana |
|---|---|---|
| `kill` | Cada baja del jugador | 1,5 s |
| `repair` | Cada tablón reparado | 2 s |
| `upgrade` | El nivel de mejora comprado (1, 2 o 3). No es por tiempo | — |

### 3.5 Mezcla

- **Límite global:** 12 voces de efectos a la vez (`AUDIO.maxVoices`).
- **Posición:** un sonido posicional suena a volumen completo a menos de 160 px del jugador y baja de forma lineal hasta el 25 % a 480 px. Se desplaza a izquierda o derecha según su posición en horizontal, como mucho un 70 %.
- **Otro nivel:** lo que ocurre en un nivel distinto al del jugador no suena, salvo los avisos del boss y los carteles.
- **La música cede el paso:** los sonidos con `duck` la bajan 6 dB, con una rampa de 150 ms al entrar y 400 ms al salir. Nunca un corte brusco.
- **Vida baja:** la música pasa por un filtro que la deja apagada, y suena un latido durante los primeros 5 s. Después solo queda la música apagada. Como la vida no se regenera, un latido permanente sería insoportable.

---

## 4. Taller de sonidos

Los efectos nacen de **recetas** en `audio-src/recipes/`, y un script las convierte en archivos. El juego solo carga archivos: no hay síntesis en tiempo de ejecución.

`npm run audio:gen` → lee las recetas → escribe los WAV en `public/assets/audio/sfx/` → actualiza la sección `audio` del manifiesto → escribe el informe.

### 4.1 Tipos de receta

| Tipo | Qué es | Para qué |
|---|---|---|
| `file` | Un archivo de `audio-src/library/` o `audio-src/generated/`, con su recorte | Casi todo: ataques, cuerpos, colas |
| `synth` | Una capa generada por código (sección 4.3) | Apoyo: campanas, cristal, graves, aire |
| `layers` | Mezcla de varias recetas, cada una con su volumen, su retraso y su proceso | El sonido final |

### 4.2 Proceso

Cada capa y cada sonido final pueden pasar por esta cadena, definida en la receta:

- Recorte y fundidos de entrada y salida.
- Cambio de tono y de velocidad.
- Reproducción al revés, para las subidas mágicas que desembocan en un golpe.
- Ecualización: recorte de graves y agudos, y realce de una banda.
- Compresión y saturación suave, para dar pegada.
- Reverberación: `room` (corta) y `hall` (larga).
- Anchura estéreo o paso a mono.

Usa **ffmpeg** para decodificar y procesar (`ffmpeg-static`, dependencia de desarrollo). Las bibliotecas suelen venir en OGG, que iOS no decodifica bien: por eso el juego recibe siempre WAV.

**Acabado común** de todos los archivos:

- El sonido empieza en los primeros 5 ms.
- Fundido de salida de al menos 5 ms.
- Sin nada por debajo de 60 Hz.
- Pico normalizado a −1 dB. El volumen relativo se ajusta en el catálogo, no en el archivo.

**Repetible:** las mismas recetas y las mismas fuentes dan siempre los mismos archivos.

### 4.3 Capas generadas por código

Un sintetizador propio y pequeño, solo para capas de apoyo. Nada de ondas cuadradas ni timbre de 8 bits.

| Timbre | Cómo se hace | Uso |
|---|---|---|
| `bell` | Suma de senos con armónicos de campana y caída larga | Notas de premio, rachas, carteles |
| `glass` | Como `bell`, más agudo y corto | Interfaz, mago azul |
| `sub` | Seno grave con caída rápida de tono | Peso de los golpes |
| `air` | Ruido filtrado con barrido | Barridos, soplos, colas |
| `pad` | Varios senos desafinados, ataque lento | Fondo de los carteles |

Con reverberación, estas capas no suenan a sintetizador barato. Si alguna desentona junto a las grabadas, sustitúyela por una fuente grabada.

### 4.4 Candidatos

Para cada sonido, prepara **hasta 3 candidatos** distintos (`A`, `B`, `C`), con fuentes o montajes diferentes. Yo elijo en el panel de prueba (sección 8) y el elegido pasa al catálogo. Los descartados se quedan en las recetas, sin ocupar sitio en el juego.

Cuando un sonido no me convenza, lo pediré con palabras ("más grave", "más corto", "menos cola", "más brillo"). Cada petición se traduce en un cambio de la receta.

### 4.5 Informe

`audio:gen` escribe `audio-src/preview/report.md` con una fila por archivo: duración, pico, volumen medio, brillo (centro del espectro), longitud de la cola y reparto de energía por bandas.

Avisa de lo que se salga de las reglas:

- Duración o cola fuera del rango de su familia.
- Silencio inicial o saturación.
- Más de un 25 % de la energía por debajo de 100 Hz: en el móvil no se oirá.
- Un sonido de la familia Premio más grave que los de Golpe, o al revés.
- Dos variantes del mismo sonido casi idénticas.
- Un archivo estéreo en un sonido posicional.

Revisa el informe antes de cerrar cada fase, igual que la vista previa de un mapa.

---

## 5. Fuentes de sonido

### 5.1 Licencias

- **Solo se usan fuentes CC0 o generadas por IA con licencia de uso comercial.** El repositorio es público: no vale ninguna biblioteca que prohíba redistribuir sus archivos (Sonniss, la mayoría de packs gratuitos de itch.io).
- `docs/AUDIO-CREDITS.md`: una fila por archivo de origen usado, con origen, autor, licencia y enlace. `assets:check` falla si una receta usa una fuente sin ficha.
- Las claves de API van en variables de entorno o en un `.env` fuera de git. Nunca en el repositorio.

### 5.2 Bibliotecas, en `audio-src/library/<origen>/`

Punto de partida, todo CC0:

| Origen | Para qué |
|---|---|
| Kenney: RPG Audio, Impact Sounds, Interface Sounds | Golpes, madera, metal, tela, monedas, interfaz |
| OpenGameArt: "80 CC0 RPG SFX" | Criaturas, monedas, hechizos, filos, cerrojos |
| Freesound, filtro CC0 | Lo concreto: disparos, gruñidos, fuego, agua, campanas, latido |

**Búsqueda en Freesound:** si existe la variable `FREESOUND_API_KEY`, `npm run audio:search "<consulta>"` busca con el filtro CC0 y descarga los mejores resultados a `audio-src/library/freesound/`, cada uno con su ficha. Comprueba en la documentación de la API qué calidad permite descargar la clave. Sin clave, pídeme los archivos que falten con una lista de búsquedas.

### 5.3 Generados por IA, en `audio-src/generated/` (opcional)

Para lo que no aparezca en las bibliotecas. Cada archivo se guarda con una ficha: el texto con el que se pidió, el modelo y su licencia. El archivo generado se guarda en el repositorio, porque no se puede regenerar idéntico.

- **Gratis:** un modelo local de efectos de sonido (por ejemplo Stable Audio 3 Small SFX), si mi equipo lo mueve. Comprueba su licencia antes de usarlo.
- **De pago, más adelante:** un servicio de generación con licencia comercial.

No instales nada de esto sin preguntarme.

---

## 6. Lista de sonidos

**Evento:** los marcados con ★ no existen todavía. Añádelos al `EventBus`, emitidos desde su sistema, con `playerId` y posición cuando tenga sentido.

**Capas:** son una guía para buscar las fuentes, no una receta cerrada.

### 6.1 Armas y jugador (Golpe)

| id | Cuándo | Cómo suena y capas |
|---|---|---|
| `weapon.pistol.fire` | ★ `weapon:fired` | Disparo seco con cuerpo. Chasquido mecánico + golpe grave + cola de sala corta. 3 variantes |
| `weapon.smg.fire` | ★ `weapon:fired` | Más corto y ligero que la pistola, casi sin cola. 4 variantes |
| `weapon.shotgun.fire` | ★ `weapon:fired` | El más grande: estampido ancho + golpe grave + cola de 400 ms |
| `weapon.katana.swing` | ★ `weapon:fired` | Acero cortando el aire: barrido + un canto metálico fino. 3 variantes |
| `weapon.katana.hit` | `zombie:hit` con la katana | Corte limpio: filo + golpe blando + un destello metálico |
| `weapon.laser.loop` | Resumen: láser activo | Haz arcano: zumbido cristalino con vibración grave, en bucle. **El tono sube con el calor**, para oír cuánto falta para sobrecalentarse |
| `weapon.laser.overheat` | ★ `weapon:overheat` | El haz se rompe: descenso de tono + vapor + cristal que cruje |
| `weapon.flame.loop` | Resumen: lanzallamas activo | Fuego real rugiendo, en bucle, con arranque y cola de brasas |
| `weapon.flame.blast` | `fire:blast` | Bocanada de fuego: soplo grave + llamarada. Posicional |
| `weapon.knife` | ★ `knife:swing` | Tajo corto; con un golpe blando si acierta |
| `weapon.reload.start` | ★ `weapon:reload` | Cargador saliendo: metal y muelle |
| `weapon.reload.end` | ★ `weapon:reload` | Cargador entrando + cerrojo + un toque de cristal muy leve de "listo" |
| `weapon.empty` | ★ `weapon:empty` | Clic metálico seco, bajo |
| `weapon.switch` | ★ `weapon:switched` | Roce de tela y metal, corto |
| `weapon.broken` | `weapon:broken` | Metal o cristal que se parte + dos notas descendentes apagadas |
| `impact.flesh` | `zombie:hit` | Golpe húmedo y corto con cuerpo. `pitchVar` 8 %. 4 variantes. Intervalo mínimo 40 ms. Posicional |
| `player.dash` | ★ `player:dash` | Ráfaga de aire con un destello de cristal al final |
| `player.hurt` | `player:damaged` | Golpe sordo con un gruñido corto de esfuerzo. No es un grito |
| `player.death` | `player:died` | Golpe grave largo + campana que desciende y se apaga |
| `player.heartbeat` | Resumen: vida baja | Latido doble grave, real, 5 s |

### 6.2 Premios

| id | Cuándo | Cómo suena y capas |
|---|---|---|
| `reward.hit` | `points:gained`, motivo `hit` | Toque de cristal mínimo y suave. Intervalo mínimo 40 ms |
| `reward.kill` | `zombie:killed` por un jugador | Golpe seco + una campanilla. Racha `kill` en la campanilla |
| `reward.repair` | ★ `barricade:repaired` | Martillazo sobre madera + un toque de campana. Racha `repair` |
| `pickup.ammo` | `pickup:collected` | Cartuchos y metal + dos notas ascendentes de cristal |
| `pickup.health` | `pickup:collected` | Campana cálida ascendente con un soplo de aire. Firma de curación |
| `pickup.item` | `item:picked` | Destello con aire de misterio: cristal al revés que desemboca en una nota |
| `buy.cash` | `money:spent` | Bolsa de monedas + campanilla. Firma de dinero |
| `buy.door` | `door:opened`, `portal:opened` | Cerrojo pesado + puerta de madera + un acorde grave que abre. Posicional |
| `buy.zone` | `zone:unlocked` | Dos notas de campana con cola, tras el cerrojo |
| `buy.weapon` | `weaponCase:purchase` | Cristal de la vitrina + arma que se monta + monedas |
| `buy.merchant` | `merchant:purchase` | La firma del mago que vende + monedas |
| `buy.upgrade` | `merchant:purchase`, mejoras | Fuego que prende + subida de cuatro notas. Racha `upgrade` |
| `buy.special` | `merchant:purchase`, especial | Campanas de metal + coro + golpe grave. La compra más grande. `duck` |
| `boost.on` | `boost:activated` | Subida de energía: aire que acelera + cristal que se abre |
| `denied` | ★ `action:denied` | Golpe sordo doble, apagado. No es un zumbido de error |
| `item.cantUse` | `item:cantUse` | Igual que `denied`, más bajo |
| `item.splash` | `item:thrown`, al caer | Chapuzón real. Posicional |
| `ritual.done` | `activation:completed` | Agua que hierve + subida larga + golpe grave con fuego. `duck` |
| `merchant.arrive` | `merchant:moved`, solo con `first` | Humo + la firma del mago que llega |

Los magos que solo cambian de sitio no suenan: coincidirían con el cartel de ronda.

### 6.3 La Mano del Demonio

Firma de infierno en todos.

| id | Cuándo | Cómo suena y capas |
|---|---|---|
| `hand.pay.money` | `hand:paid` | Monedas cayendo sobre brasas |
| `hand.pay.blood` | `hand:paid`, con sangre | Golpe húmedo y grave + un siseo |
| `hand.roll` | Tras el pago, mientras elige | Retumbo de tierra con crujidos de hueso que se aceleran. Dura lo mismo que el sorteo en `balance.ts` |
| `hand.offer` | `hand:offer` | Brasas + dos notas de revelación |
| `hand.offer.special` | `hand:offer`, arma especial | Llamarada + campanas + coro. `duck` |
| `hand.taken` | `hand:taken` | Agarrar un arma: metal y cuero |
| `hand.refund` | `hand:refunded` | Risa gutural corta + monedas que vuelven |
| `hand.moved` | `hand:moved` | Retumbo lejano que se aleja |

### 6.4 Amenazas

| id | Cuándo | Cómo suena y capas |
|---|---|---|
| `zombie.groan` | Resumen: zombies cerca | Gruñido orgánico grave y corto, bajo. 4 variantes. Uno cada 2 a 5 s, nunca dos a la vez. Posicional |
| `zombie.attack` | ★ `zombie:attack`, al empezar a preparar el golpe | Jadeo áspero + zarpazo en el aire. Avisa del golpe antes de que llegue. Posicional |
| `zombie.crawl` | ★ `zombie:crippled` | Crujido húmedo. Posicional |
| `barricade.break` | ★ `barricade:plankBroken` | Madera que se parte. Posicional |
| `boss.warning` | `boss:warning` | Algo enorme cayendo: silbido de aire grave que baja de tono durante los 3 s del aviso. `duck` |
| `boss.landed` | `boss:landed` | Impacto enorme: golpe grave + piedra y escombros + cola larga. Prioridad alta. Estéreo |
| `boss.roar` | `boss:roar` | Rugido de bestia grande, 1 s. `duck` |
| `boss.windup.charge` | ★ `boss:windup` | Dos resoplidos de toro y pezuñas escarbando |
| `boss.windup.slam` | ★ `boss:windup` | El mazo sube: barrido de aire pesado con metal |
| `boss.windup.leap` | ★ `boss:windup` | Gruñido de esfuerzo + suelo que cruje |
| `boss.charge.loop` | Resumen: boss embistiendo | Pisadas pesadas al galope, en bucle |
| `boss.slam` | `boss:slam` | Mazazo: metal contra suelo + grieta |
| `boss.stunned` | `boss:stunned` | Choque contra la pared; después un bucle de campanillas mareadas mientras dura el aturdimiento |
| `boss.killed` | `boss:killed` | Derrumbe largo con un último gruñido. Después suena `jingle.boss.dead` |

**Los tres avisos del boss tienen que distinguirse a ciegas.** Ya no se dibuja ninguna zona en el suelo, así que el sonido es el segundo aviso de cada ataque. El bucle de aturdido le dice al jugador que es el momento de pegar.

### 6.5 Carteles y melodías cortas

Campanas, coro o `pad` grave y percusión. Suenan por el bus de efectos, así que existen aunque no haya música. Estéreo.

| id | Cuándo | Cómo suena |
|---|---|---|
| `jingle.round.start` | `round:changed` | Golpe de tambor grave + cuatro notas ascendentes de campana, tensas. `duck` |
| `jingle.round.boss` | `round:changed`, con boss | Tambores + notas graves descendentes + retumbo. `duck` |
| `jingle.round.clear` | `round:cleared` | Melodía de campanas que resuelve, con brillo. La recompensa de la ronda. `duck` |
| `jingle.boss.dead` | Tras `boss.killed` | La melodía más larga del juego, hasta 2,5 s, con coro. `duck` |
| `jingle.gameover` | `game:over` | Campana grave y descenso lento |

### 6.6 Interfaz

| id | Cuándo | Cómo suena |
|---|---|---|
| `ui.tap` | Cualquier botón de menú | Toque de cristal suave con un fondo de piedra |
| `ui.shop.open` / `ui.shop.close` | `shop:state` | Roce de tela: el mago abre y cierra la gabardina, con un destello de su firma |
| `ui.pause.open` / `ui.pause.close` | Menú de pausa | Dos notas de cristal, descendentes y ascendentes |
| `ui.play` | Botón `JUGAR` | Golpe grave con una campana firme |

---

## 7. Música (fase S5)

Orquestal y oscura, con percusión. Nada de chiptune.

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
- Botones `A`, `B`, `C` para comparar los candidatos de cada sonido, y una marca en el que está elegido.
- Botón `SIMULAR RACHA`: 8 bajas seguidas.
- Botón `SIMULAR COMBATE`: SMG disparando con impactos y bajas durante 5 s, para oír la mezcla.
- Muestra las voces activas y marca las reproducciones descartadas por el límite.

Los candidatos solo se cargan con el debug activo. El juego normal lleva solo los elegidos.

**Tests:**

- Catálogo: toda variante existe en el manifiesto; ningún id duplicado.
- Director, con un motor falso:
  - Cada evento de la sección 6 pide su sonido.
  - Un evento de otro jugador no dispara los sonidos que son solo del jugador local.
  - `minInterval` y `maxVoices` descartan lo que sobra.
  - Con el límite global lleno, se corta la voz de menor prioridad.
  - Rachas: sube un peldaño por repetición, solo en la capa de brillo; se queda en el último y vuelve al primero al pasar la ventana.
  - Posición: volumen y desplazamiento según la distancia; nada de otro nivel.
  - Vida baja: el latido dura 5 s y no se repite hasta que la vida suba y vuelva a bajar.
  - Estados de la música y sus cambios.
- Preferencias: los niveles de efectos y música se guardan y se leen; valores corruptos vuelven al valor por defecto.
- Taller: las mismas recetas dan los mismos archivos; el acabado común se cumple; el informe avisa de un archivo fuera de rango; una fuente sin ficha de licencia hace fallar `assets:check`.
- Con el audio apagado o sin `AudioContext`, el juego arranca y todos los tests de lógica pasan.

---

## 9. Fases

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **S1** | Motor, catálogo, sección `audio` del manifiesto, desbloqueo, segundo plano, ajustes en la pausa, panel de prueba. Un sonido de prueba, `ui.tap`, con una capa generada por código. | `ui.tap` suena en iPhone y Android tras tocar `JUGAR`, y vuelve a sonar después de mandar la app a segundo plano. **⏸ Detente:** dime qué bibliotecas descargar y dónde dejarlas. |
| **S2** | Taller (`file`, `synth`, `layers`, proceso, informe, candidatos, créditos), eventos nuevos de armas y jugador, y los sonidos de la sección 6.1. | Disparar, recargar, cambiar de arma, el dash y los impactos suenan, con candidatos para elegir. **⏸ Detente** para que los escuche en el móvil. |
| **S3** | Premios, rachas, la mano, carteles e interfaz (secciones 6.2, 6.3, 6.5 y 6.6). | Encadenar bajas sube la campanilla. Cada compra tiene su sonido y cada mago su firma. **⏸ Detente.** |
| **S4** | Amenazas (6.4), posición, límite de voces, vida baja. | Los tres avisos del boss se distinguen sin mirar. Con 20 zombies y la SMG no se satura. **⏸ Detente.** |
| **S5** | Música: estados, fundidos, bucles, vida baja y música que cede el paso. | La música cambia entre descanso, ronda y boss sin saltos ni clics. **⏸ Detente.** |
| **S6** | `docs/AUDIO.md` (taller, fuentes y dirección de sonido), comandos y estructura en `CLAUDE.md`, `ASSETS-TODO.md` con los sonidos que sigan sin convencer. | Todo documentado. |

Al cerrar cada fase, sigue el cierre de fase de `CLAUDE.md`, con commits `feat(fase-SN): …`.