# Spec 07 · Bosses

**Objetivo:**
1. Un **sistema de bosses por datos**: aparecen en rondas concretas y se reciclan en rondas altas con variantes más fuertes, de otro color o por parejas.
2. El primer boss, **el Matarife**: un zombie gordo con un mazo, del tamaño de una furgoneta, con tres patrones de ataque que se anuncian antes de golpear.
3. El Matarife suelta el **corazón vivo**, que deja de llevarse desde el inicio.

**Convenciones:** números en `balance.ts` y `bosses.ts`, textos en `strings.ts`, arte con placeholders apuntado en `docs/ASSETS-TODO.md`. Se mantienen las reglas de `CLAUDE.md`. El daño a zombies va en las unidades actuales (una bala de pistola quita 1); el daño al jugador, en puntos de vida (el jugador tiene 100 y no se regenera).

---

## 1. Catálogo y calendario (`src/config/bosses.ts`)

Todo por datos, en tres piezas:

- **`BOSSES`:** un boss por entrada, con su tamaño, vida base, velocidad y lista de ataques.
- **`BOSS_VARIANTS`:** modificadores reutilizables que se aplican encima de cualquier boss.
- **`BOSS_SCHEDULE`:** qué bosses salen en qué ronda, y con qué variante.

### Variantes

| Variante | Tinte | Vida | Daño | Preparación de los ataques | Extra |
|---|---|---|---|---|---|
| `base` | Ninguno | ×1 | ×1 | ×1 | — |
| `rabioso` | Rojizo | ×1,8 | ×1,25 | ×0,85 | Empieza ya enfurecido (sección 5) |
| `pútrido` | Verde enfermizo | ×2,5 | ×1,5 | ×0,85 | Enfurecido, y cada salto deja un charco que daña 4 s |

**Regla de dificultad:** la preparación de un ataque nunca baja del 80 % de su valor base. La dificultad sube con la vida, el daño, las parejas y los zombies que acompañan, no quitando el tiempo de reacción.

### Calendario

| Ronda | Bosses |
|---|---|
| 6 | Matarife `base` |
| 12 | Matarife `rabioso` |
| 18 | Dos Matarifes `base` |
| 24 | Matarife `pútrido` |
| 30 | Matarife `rabioso` y Matarife `base` |
| Cada 6 rondas después | Se repite el ciclo de las rondas 12 a 30, con la vida ×1,3 por cada vuelta |

Cuando existan más bosses, se intercalan en este calendario cambiando solo los datos.

## 2. El Matarife: tamaño y cuerpo

Tiene el tamaño de una furgoneta al lado de los personajes.

| Aspecto | Valor |
|---|---|
| **Huella en el suelo** | 2×2 casillas (64×64 px). Es lo que choca con paredes y lo que decide por dónde cabe |
| **Dibujo** | Unos 96 px de ancho y 110 de alto, anclado en el centro de la huella. Sobresale de la huella por arriba y por los lados |
| **Zona de impacto de las balas** | 64 px de ancho por 80 de alto. Es un blanco grande y fácil |
| **Vida** | 100 unidades de daño en la ronda 6 |
| **Velocidad al andar** | 38 px/s |

**Por qué la huella es de 2×2:** las puertas y los pasos de la mansión miden 2 casillas. Con una huella mayor no podría cruzar ninguna puerta. El dibujo sí es más grande que la huella, para que se vea enorme.

**Colisiones:**

- **Paredes, puertas cerradas, agua y vacío:** lo paran.
- **Atrezo (muebles):** lo **aplasta**. Cuando su huella toca un mueble con colisión, el mueble queda destruido para el resto de la partida: pierde la colisión para todos y su dibujo cambia a escombros.
- **No destruye:** vitrinas de armas, magos, el agujero de la mano, escaleras y trampillas. Para él cuentan como pared.
- **Zombies:** los aparta a los lados al andar.
- **Jugador:** es sólido. Si lo arrolla al andar, lo empuja sin hacerle daño. El dash del jugador lo atraviesa.

**Inmunidades:** no se le empuja, no pierde las piernas y no muere de un golpe por ningún efecto. Las balas perforantes lo atraviesan. La quemadura sí le afecta.

**Navegación:** necesita su propio cálculo de camino, sobre las posiciones donde cabe una huella de 2×2. Recalcula con el mismo ritmo que el campo de flujo de los zombies. Añade al validador del mapa la comprobación de que una huella de 2×2 puede llegar de cualquier sala a cualquier otra por las puertas, contando el atrezo como transitable.

## 3. Cómo entra en escena

No cabe por las ventanas, así que **sale del suelo**, por una grieta del infierno como la de la Mano del Demonio.

- **Nuevo objeto de Tiled:** `boss_spot` (punto, centro de un hueco de 3×3 casillas), con la propiedad `zone`. En el plano ASCII, tabla `## Bosses`.
- **Cantidad:** al menos uno por zona, también en el sótano y la azotea. Usa la skill `level-design` y revisa la vista previa.
- **Reglas de colocación** (añádelas a `validate-map`): las 3×3 casillas son suelo transitable sin paredes; a 3 casillas o más de puertas, portales, vitrinas, puntos de mago y el punto de la mano. Puede haber atrezo encima: lo destruye al salir.
- **Elección del punto:** el `boss_spot` de una zona desbloqueada más cercano al jugador andando, entre los que estén a 5 casillas o más. Si no hay ninguno tan lejos, el más lejano.

**Secuencia de entrada** (5 s después del cartel de ronda):

| Paso | Duración | Qué pasa |
|---|---|---|
| Aviso | 3 s | El suelo tiembla y se abre una grieta con brasas en las 3×3 casillas. Vibración. Se dibuja por encima de la oscuridad |
| Salida | 1,2 s | El Matarife trepa fuera. Es invulnerable y no ataca. Quien esté dentro de la grieta recibe 20 de daño y sale empujado |
| Rugido | 1 s | Ruge y aparece su barra de vida |

**Reaparición:** si el jugador cambia de nivel (sótano o azotea) o el Matarife pasa 5 s sin camino posible hasta él, se hunde en el suelo (1,2 s) y vuelve a salir por el `boss_spot` más adecuado de la zona del jugador, con la misma secuencia de aviso. Conserva su vida.

## 4. Los tres ataques

**Regla común: todo ataque se anuncia.** Antes de golpear, el Matarife se queda quieto en una pose reconocible y **en el suelo se dibuja la zona exacta que va a recibir el daño**, en rojo translúcido, llenándose de intensidad hasta el momento del golpe. Las zonas se dibujan por encima de la oscuridad y por debajo de los personajes.

El dash del jugador es invulnerable y sirve contra los tres ataques.

### 4.1 Embestida

| Fase | Duración | Detalle |
|---|---|---|
| Preparación | 1,0 s | Se agacha y escarba. En el suelo, un pasillo rojo de 64 px de ancho en la dirección del jugador. La dirección sigue al jugador y **se fija 0,3 s antes de salir** |
| Carrera | Hasta 256 px o hasta chocar | A 300 px/s. Hace 45 de daño y empuja 24 px |
| Si choca con una pared | 2 s **aturdido** | Recibe el doble de daño. Es la recompensa por esquivar bien |
| Si no choca | 0,6 s de frenada | Sin bonificación de daño |

- Destruye el atrezo que atraviesa.
- **Arrolla a los zombies de su camino y los mata.** Así el jugador puede usarlo contra la horda. Esas bajas no dan puntos.
- Un jugador solo recibe el daño una vez por embestida.

### 4.2 Triple mazazo

Tres golpes seguidos de gran alcance.

| Parámetro | Valor |
|---|---|
| Zona | Arco de 160° delante de él, hasta 84 px del centro |
| Preparación del primer golpe | 0,7 s |
| Entre golpes | 0,5 s. En ese tiempo se reorienta hacia el jugador, como mucho 45°, y avanza 16 px |
| Daño | 30 por golpe, con empuje de 16 px |
| Recuperación tras el tercero | 1,2 s quieto. Momento para dispararle |

El arco de cada golpe se dibuja en el suelo antes de darlo, uno por uno.

### 4.3 Tres saltos

| Parámetro | Valor |
|---|---|
| Destino | Donde está el jugador al despegar, ajustado al hueco de 2×2 válido más cercano. Se marca con un círculo rojo |
| Tiempo en el aire | 0,7 s. En el aire no recibe daño |
| Aterrizaje | 45 de daño a quien esté a menos de 44 px del centro |
| Onda | Un anillo de 16 px de grosor que crece desde el aterrizaje hasta 130 px de radio, a 170 px/s. Hace 20 de daño |
| Entre saltos | 0,5 s en el suelo |
| Recuperación tras el tercero | 1,5 s quieto |

- **Las paredes paran la onda:** no alcanza a quien no tenga línea de visión con el punto de aterrizaje.
- Un jugador solo recibe la onda de cada salto una vez.
- **Cómo se esquiva:** corriendo en línea recta desde que aparece el círculo. A velocidad normal (140 px/s) la onda no alcanza al jugador. Si va disparando, que lo frena a la mitad, sí le alcanza. La alternativa es cruzar el anillo con el dash.
- El aterrizaje destruye el atrezo de la huella. La onda no daña a los zombies.
- Temblor de pantalla y vibración en cada aterrizaje.

### 4.4 Qué ataque elige

- Entre ataques, anda hacia el jugador durante 1,5 a 2,5 s.
- **Según la distancia al jugador:**
  - A menos de 90 px: triple mazazo (70 %) o saltos (30 %).
  - Entre 90 y 260 px, con línea recta despejada: embestida (60 %) o saltos (40 %).
  - Más lejos o sin línea recta: saltos, o sigue andando.
- **Nunca repite el mismo ataque dos veces seguidas.**
- Andando no hace daño por contacto: solo dañan los ataques.

## 5. Furia

Al bajar del 50 % de vida, el Matarife ruge 1 s (se anuncia con un destello rojo) y queda **enfurecido** hasta morir:

- Anda un 25 % más rápido.
- El tiempo que pasa andando entre ataques se reduce a la mitad.
- La preparación de los ataques no cambia.

## 6. La ronda de boss

- **Cartel:** el de ronda normal y, debajo, `ALGO GRANDE SE ACERCA`.
- **Zombies normales:** la mitad de los que tocarían en esa ronda.
- **El boss sale** 5 s después del cartel.
- **La ronda termina** cuando han muerto el boss y todos los zombies.
- **Si los zombies se acaban y el boss sigue vivo:** entra un zombie cada 6 s, con un máximo de 4 vivos y de 20 en total. Mantiene la tensión y da opciones de munición.
- **Con dos bosses:** solo uno puede empezar a preparar un ataque cada 0,8 s, para que sus avisos no se solapen del todo.
- **Flecha en el borde de la pantalla** hacia el boss cuando está fuera de la vista, con el sistema de la flecha de los magos.
- Los magos y la mano siguen funcionando igual durante la ronda.

### Barra de vida

- Arriba en el centro, bajo el botón de pausa, con el nombre `EL MATARIFE`.
- Con dos bosses, dos barras apiladas.
- Marca visible en el 50 %, donde empieza la furia.
- No debe solaparse con nada del HUD en las tres pantallas de prueba.

### Recompensas al morir

| Recompensa | Cuándo |
|---|---|
| **Corazón vivo**, en el suelo donde cae | Solo la primera vez que muere un boss en la partida |
| 500 puntos y 500$ | Siempre |
| Un botiquín y un premio de munición | Siempre |

- Cada impacto al boss da los puntos de impacto normales.
- El corazón se queda en el suelo hasta que alguien lo recoge, con las reglas de los objetos especiales. Si el boss muere sobre una casilla no válida, cae en la casilla válida más cercana.

## 7. El corazón vivo

- **Quita `living_heart` de `STARTING_ITEMS`.** Ya no se lleva desde el inicio.
- Su regla de aparición pasa a ser la primera muerte de un boss. Exprésala por datos en `items.ts`, igual que la de la varita.
- Consecuencia: el mago rojo no se puede invocar antes de la ronda 6.
- Actualiza `docs/GAME-DESIGN.md` y cierra la pregunta abierta del corazón en `docs/ROADMAP.md`. En el ROADMAP, las "rondas especiales" pasan a ser este sistema de bosses.

## 8. Placeholders

- **Matarife:** cuerpo redondeado de 64×84 px en verde grisáceo oscuro, con una barriga más clara y un mazo marrón de 12×40 px. Poses distintas, aunque sean simples, para: andar, preparar embestida, embestir, aturdido, preparar mazazo, golpear, saltar, caer, rugir y morir.
- **Variantes:** el mismo dibujo teñido.
- **Zonas de aviso:** rojo translúcido con un borde más marcado.
- **Grieta de entrada:** la de la mano, a 3×3 casillas.
- **Escombros:** mancha de astillas del tamaño del mueble destruido.
- Apunta en `ASSETS-TODO.md` el arte definitivo: lienzo de unos 128 px, 4 direcciones (el oeste, espejo del este) y la lista de animaciones.

## 9. Futuro multijugador

- El boss persigue y ataca al jugador vivo más cercano, y lo reevalúa al terminar cada ataque.
- Su estado es de la partida, en `GameState`.
- La vida del boss se multiplica por el número de jugadores.

## 10. Debug y tests

- **Debug:** `INVOCAR MATARIFE` (con selector de variante), `FORZAR EMBESTIDA`, `FORZAR MAZAZO`, `FORZAR SALTOS`, `MATAR BOSS`, `IR A RONDA 6` y `MOSTRAR ZONAS DE DAÑO`.
- **Tests:**
  - **Calendario:** qué bosses y variantes tocan en las rondas 6, 12, 18, 24, 30 y 36, y el factor de vida por vuelta.
  - **Variantes:** multiplicadores, y que la preparación nunca baja del 80 %.
  - **Navegación:** cruza una puerta de 2 casillas, no cruza un paso de 1, y destruye atrezo pero no vitrinas.
  - **Entrada:** elección del punto, daño dentro de la grieta y reaparición al cambiar de nivel o quedarse sin camino.
  - **Embestida:** fijado de la dirección, daño único, choque y aturdimiento con doble daño, y zombies arrollados sin puntos.
  - **Mazazo:** arco, tres golpes, y límite de giro entre golpes.
  - **Saltos:** destino válido, daño de aterrizaje, onda bloqueada por paredes, daño único por salto, y que un jugador que corre en línea recta sin disparar no recibe la onda.
  - **Dash:** invulnerable frente a los tres ataques.
  - **Elección de ataque:** por distancia y sin repetir.
  - **Furia** al 50 %.
  - **Ronda:** mitad de zombies, goteo con sus límites y fin de ronda.
  - **Recompensas:** el corazón solo la primera vez.
  - **Corazón:** ya no está al inicio de la partida.

## 11. Fases

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **B1** | `bosses.ts`, calendario, cuerpo de 2×2, navegación propia, destrucción de atrezo, barra de vida y muerte. Sin ataques. | Con el debug, el Matarife anda hasta el jugador cruzando puertas y aplastando muebles, recibe daño y muere. |
| **B2** | `boss_spot` en el mapa, validador, secuencia de entrada y reaparición. | Sale del suelo con aviso en el punto correcto, y reaparece si el jugador cambia de nivel. |
| **B3** | Sistema de avisos en el suelo y **embestida**, con aturdimiento y zombies arrollados. | La embestida se ve venir, se puede esquivar y se puede hacer que choque contra una pared. |
| **B4** | **Triple mazazo** y **tres saltos** con su onda. Elección de ataque y furia. | Los tres patrones se distinguen de un vistazo. **⏸ Detente** para que lo pruebe en el móvil. |
| **B5** | Ronda de boss completa: cartel, mitad de zombies, goteo, flecha, recompensas y el corazón. | En la ronda 6 sale el Matarife y, al morir, suelta el corazón. El corazón ya no se lleva desde el inicio. |
| **B6** | Variantes, dos bosses a la vez, rondas 12 en adelante, debug y documentación. | Las rondas 12, 18 y 24 se pueden probar desde el debug. **⏸ Detente** para que lo pruebe. |

Al cerrar cada fase, sigue el cierre de fase de `CLAUDE.md`.