# Spec 06 · La Mano del Demonio y las armas especiales

**Objetivo:**
1. Añadir tres **armas especiales** con formas de atacar nuevas: láser, katana y lanzallamas infernal.
2. Añadir la **Mano del Demonio**: una grieta en el suelo de la que sale una mano que, por dinero o por sangre, ofrece un arma al azar. Es la única forma de conseguir las armas especiales.

El contexto de diseño está en `docs/ROADMAP.md` (§3.1).

**Convenciones:** números en `balance.ts` y `weapons.ts`, textos en `strings.ts`, arte con placeholders apuntado en `docs/ASSETS-TODO.md`. Se mantienen las reglas de `CLAUDE.md`. El daño va en las unidades actuales (una bala de pistola quita 1).

---

## 1. Tipos de arma (`weapons.ts`)

Hoy todas las armas disparan balas. Añade a `WeaponDef` un campo `attack` que diga cómo ataca:

| `attack` | Cómo funciona | Armas |
|---|---|---|
| `bullets` | Proyectiles, como hasta ahora | Pistola, SMG, escopeta |
| `beam` | Rayo continuo mientras se mantiene pulsado | Láser |
| `melee` | Barrido cuerpo a cuerpo | Katana |
| `cone` | Chorro en cono mientras se mantiene pulsado | Lanzallamas |

Las tres armas nuevas son `category: 'special'`:

- **No se venden en vitrinas.** Solo las da la mano.
- **No tienen niveles del mago rojo** (`upgrades: {}`): su tienda muestra `NO MEJORABLE`.
- **Sí tienen mejora especial del mago dorado.**
- Ocupan un hueco de arma como cualquier otra.

## 2. Las armas especiales

Los valores son un punto de partida para ajustar jugando.

### 2.1 Láser

Rayo continuo que atraviesa a todos los zombies de la línea.

| Parámetro | Valor |
|---|---|
| Daño | 6 unidades por segundo a cada zombie tocado, en ticks de 0,1 s |
| Alcance | 280 px. Las paredes lo paran; los zombies no |
| Batería | 100. Se gasta a 25 por segundo (4 s de rayo) |
| Recarga | Sola: 20 por segundo, tras 0,8 s sin disparar |
| Sobrecalentamiento | Si la batería llega a 0, el arma se bloquea 3 s y luego recarga con normalidad |

- **No usa munición.** Ni la munición máxima del mago azul ni los premios de munición le afectan.
- Respeta la espera del primer disparo (`firstShotDelay`).
- Mientras dispara, el jugador se mueve a la velocidad reducida de disparo.
- **Puntos:** un impacto puntuable por zombie cada 0,5 s de contacto, no uno por tick.
- **HUD:** en lugar de los números de munición, una barra de batería. En sobrecalentamiento parpadea en rojo con el texto `SOBRECALENTADO`.
- **Aspecto (placeholder):** línea de 2 px en rojo claro con un núcleo blanco, y un destello donde termina.
- **Mejora dorada, "Sobrecarga":** daño ×2 y la batería dura el doble.

### 2.2 Katana

Barrido cuerpo a cuerpo que golpea a todos los zombies del arco.

| Parámetro | Valor |
|---|---|
| Daño | 4 unidades a cada zombie dentro del arco |
| Arco | 140° delante del jugador |
| Alcance | 34 px |
| Tiempo entre barridos | 0,45 s |
| Empuje | 6 px a cada zombie golpeado |

- **No usa munición ni recarga.** En el HUD, donde irían los números, muestra `∞`.
- **Sin espera del primer disparo:** el barrido sale al pulsar.
- **Sin frenazo:** el jugador se mueve a su velocidad normal mientras ataca.
- **Dirección:** la del arrastre del botón de disparo. Sin arrastre, hacia el zombie más cercano, como el cuchillo.
- **Puntos:** como el cuchillo, por cada zombie golpeado.
- El cuchillo sigue en su botón y no cambia.
- **Aspecto (placeholder):** un arco claro más ancho que el del cuchillo.
- **Mejora dorada, "Filo de sangre":** cada zombie que muere por la katana cura 2 puntos de vida, con un máximo de 10 por barrido.

### 2.3 Lanzallamas infernal

Chorro de fuego a corta distancia que quema a todos los que toca.

| Parámetro | Valor |
|---|---|
| Daño directo | 4 unidades por segundo a cada zombie dentro del cono, en ticks de 0,1 s |
| Cono | 40° |
| Alcance | 90 px. Las paredes lo paran: un zombie sin línea de visión no se quema |
| Quemadura | Cada zombie tocado arde 2 s y pierde 2 unidades en total. No se apila: se reinicia |
| Depósito / reserva | 60 / 180 |
| Consumo | 12 por segundo (5 s por depósito) |
| Recarga | 2,5 s |

- **Usa munición normal:** la rellenan la munición máxima del mago azul y los premios de munición.
- **Quemadura:** generaliza `BurnSystem` para que quien prende indique el daño total y la duración. La escopeta sigue con sus valores.
- Respeta la espera del primer disparo y la velocidad reducida de disparo.
- **Puntos:** un impacto puntuable por zombie cada 0,5 s. Los ticks de la quemadura no puntúan, como ahora.
- **Aspecto (placeholder):** partículas de llama que salen en abanico, reutilizando `BurnFlames`.
- **Mejora dorada, "Fuego infernal":** un zombie que muere ardiendo estalla: hace 2 unidades de daño en 40 px y prende a los que alcanza. Las explosiones pueden encadenarse.

## 3. La Mano del Demonio

### 3.1 En el mapa

- **Nuevo objeto de Tiled:** `hand_spot` (punto), con la propiedad `zone`. En el plano ASCII, tabla `## Mano`. Documéntalo en `docs/ASSETS.md`.
- **Cantidad:** uno por zona, salvo la zona inicial. Usa la skill `level-design` y revisa la vista previa.
- **Reglas de colocación** (añádelas a `validate-map`):
  - Casilla de suelo transitable, con las cuatro casillas vecinas libres.
  - A 3 tiles o más de barricadas, puertas, portales, puntos de mago, vitrinas y puntos de objeto.
  - Nunca en un paso de menos de 3 tiles de ancho.
- **Solo hay una mano en la partida,** en uno de esos puntos.
- **No es sólida:** el jugador y los zombies pasan por encima de la grieta.

### 3.2 Dónde está

- **Al empezar la partida:** en el punto de una de las salas que se compran directamente desde la zona inicial. En la mansión, salón o comedor. Se sortea con el RNG de la partida.
- **Señal:** una columna de brasas rojas sobre la grieta. Se dibuja por encima de la oscuridad, así que se ve aunque la sala esté a oscuras.
- **Flecha en el borde de la pantalla,** en rojo oscuro, cuando la mano está fuera de la vista y su sala está desbloqueada. Usa el mismo sistema que la flecha de los magos, y como ella, no se muestra si la mano está en otro nivel.
- Si la mano está en una sala bloqueada, no hay flecha: hay que abrir salas hasta dar con ella.

### 3.3 Pagar

A menos de `HAND.interactRange` (40 px), el botón de acción ofrece una de estas opciones:

| Situación | Botón | Efecto |
|---|---|---|
| Dinero ≥ 950 | `MANO DEL DEMONIO · 950$` | Paga 950$ |
| Dinero < 950 y vida > 40 | `PACTO DE SANGRE · 40 VIDA`, en rojo | Paga 40 puntos de vida |
| Dinero < 950 y vida ≤ 40 | `FALTAN X$`, atenuado | Nada. Tiembla al tocarlo |

- **El pacto de sangre nunca mata:** exige tener más de 40 de vida. Al pagar, se dispara el marco rojo de daño y la sangre del jugador, como en un golpe.
- Mientras la mano está ocupada con una oferta, no acepta otro pago.
- Prioridad en el botón de acción: por delante de recoger objetos y por detrás de reparar, puertas, magos y vitrinas.

### 3.4 La secuencia

El arma se sortea **en el momento del pago**, con el RNG de la partida. El juego sigue corriendo durante toda la secuencia.

| Estado | Duración | Qué se ve |
|---|---|---|
| `rising` | 0,6 s | La mano sale de la grieta con el puño cerrado |
| `rolling` | 2,0 s | Sobre el puño pasan siluetas de armas, cada vez más despacio |
| `offering` | 8 s | La mano se abre con el arma flotando encima. Los últimos 3 s, el arma parpadea |
| `sinking` | 0,6 s | La mano se hunde |

- **Coger el arma:** durante `offering`, a menos de 40 px, el botón de acción dice `COGER LÁSER` (o el arma que sea).
  - Con un hueco libre, entra en el inventario y pasa a la mano del jugador.
  - Con los tres huecos llenos, **sustituye al arma en mano**. Si esa arma tiene mejoras o la especial, pide confirmación con un segundo toque, igual que las vitrinas.
- **Si no se coge a tiempo,** la mano se hunde con el arma y el pago se pierde.
- Las armas que da la mano llegan con la munición completa.
- **Si sale un arma especial:** destello al abrirse la mano y aviso en el HUD con su nombre, durante 1,5 s.

### 3.5 Qué arma sale

- **Nunca un arma que el jugador ya lleva.**
- **35 % de probabilidad de arma especial** (`HAND.specialChance`) y 65 % de básica. Dentro de cada grupo, todas por igual.
- Si un grupo no tiene armas disponibles, sale del otro.
- **No repite** la última arma ofrecida, si hay alternativa.

### 3.6 La mano se cansa

- En cada sitio, la mano acepta un número de usos sorteado **entre 4 y 8** (`HAND.usesMin`, `HAND.usesMax`).
- Al pagar el uso siguiente, la mano sale y, en lugar de sortear, hace un **gesto de burla** (el dedo diciendo que no) durante 1,5 s, **devuelve el pago** (dinero o vida) y se hunde.
- Dos segundos después reaparece en el `hand_spot` de **otra zona**, sorteada entre todas menos la actual y la inicial, estén o no desbloqueadas.
- **Aviso en el HUD:** `LA MANO SE HA MOVIDO`, durante 2 s.
- En el sitio nuevo se sortea otro número de usos.

### 3.7 Placeholders

- **Grieta:** mancha oscura de 28×16 px con puntos rojos de brasa que laten.
- **Mano:** rectángulo rojo oscuro de 20×28 px con cinco dedos, que sube y baja desde la grieta. Tres poses: puño, abierta y burla.
- **Siluetas de armas:** las de las vitrinas, más tres nuevas para las especiales.
- **Columna de brasas:** partículas rojas que suben 48 px sobre la grieta.

## 4. Encaje con lo que ya existe

- **Mago rojo:** con un arma especial en la mano, sus tres filas dicen `NO MEJORABLE`.
- **Mago dorado:** vende la mejora de cada arma especial, como las de las básicas.
- **Mago azul, munición máxima:** rellena el lanzallamas. Ignora el láser y la katana.
- **Vitrinas:** sin cambios. No venden munición de armas especiales.
- **Doble daño temporal:** multiplica el daño de las tres armas nuevas.
- **Crawler:** las tres armas pueden dejar a un zombie sin piernas con las reglas actuales.
- **Futuro multijugador:** el estado de la mano (sitio, usos restantes, oferta en curso y para quién) es de la partida, no del jugador. La oferta solo la puede coger quien pagó.

## 5. Debug y tests

- **Debug:** `DAR LÁSER`, `DAR KATANA`, `DAR LANZALLAMAS`, `MANO GRATIS` (no cobra), `MOVER MANO`, `FORZAR BURLA` y `MOSTRAR PUNTOS DE MANO`.
- **Tests:**
  - **Láser:** daño por tick, atraviesa zombies, las paredes lo paran, batería, recarga y sobrecalentamiento, y puntos cada 0,5 s.
  - **Katana:** golpea a todos los del arco y a ninguno de fuera, empuje, y sin munición ni espera.
  - **Lanzallamas:** cono, línea de visión, consumo, y quemadura que se reinicia sin apilarse.
  - **Mejoras doradas** de las tres armas.
  - **Sorteo:** nunca un arma que ya llevas, proporción de especiales con semilla, no repite la última, y grupo vacío.
  - **Pago:** con dinero, con sangre, con vida insuficiente, y mano ocupada.
  - **Secuencia:** tiempos, coger, sustituir con confirmación, y perder el arma al caducar.
  - **Cansancio:** usos entre 4 y 8, devolución del pago en dinero y en vida, y nuevo sitio distinto del actual y de la zona inicial.
  - **Validador:** reglas de `hand_spot`.
  - **Magos** con armas especiales en la mano.

## 6. Fases

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **H1** | Campo `attack` en el catálogo y **katana**. HUD con `∞`. | Con el debug, la katana barre a varios zombies de un golpe. Las armas actuales no cambian y sus tests pasan. |
| **H2** | **Láser:** rayo, batería, sobrecalentamiento y barra en el HUD. | El rayo atraviesa una fila de zombies y la batería se comporta como dice la tabla. |
| **H3** | **Lanzallamas:** cono, depósito y quemadura generalizada. Mejoras doradas de las tres. | Las tres armas se pueden probar desde el debug. **⏸ Detente** para que las pruebe en el móvil. |
| **H4** | **La mano:** puntos en el mapa, validador, pago con dinero y con sangre, secuencia, sorteo y coger el arma. | Se puede pagar, ver la secuencia y coger o perder el arma. |
| **H5** | Cansancio y mudanza, columna de brasas, flecha, debug y documentación (`GAME-DESIGN.md`, `ROADMAP.md`, `ASSETS-TODO.md`). | La mano se muda tras 4 a 8 usos y se la puede encontrar. **⏸ Detente** para que lo pruebe. |

Al cerrar cada fase, sigue el cierre de fase de `CLAUDE.md`.