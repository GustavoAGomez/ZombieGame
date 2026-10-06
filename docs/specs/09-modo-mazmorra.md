# Spec 09 · Modo Mazmorra (roguelike por salas)

**Objetivo:** un segundo modo de juego, al estilo de *The Binding of Isaac*:
1. Tres plantas generadas al azar, distintas en cada partida.
2. Salas que se cierran al entrar y se abren al matar a todos.
3. Llaves, tesoros, salas de reto y un boss por planta.
4. Una mejora permanente a la venta cada 5 salas, que dura hasta el final de la partida.

Se construye con lo que ya existe: jugador, armas, zombies, Matarife, magos, Mano del Demonio, HUD, audio y los kits de tiles.

**Regla principal:** el modo Supervivencia no cambia. Sus reglas, sus números y sus tests siguen igual.

**Convenciones:**
- Números del modo en `src/config/dungeon.ts`; mejoras y maldiciones en `src/config/upgrades.ts`. Todos los precios y probabilidades de esta spec son **valores de partida**, para ajustar tras probar.
- Textos en `strings.ts`. Arte nuevo con placeholders, apuntado en `docs/ASSETS-TODO.md`.
- Se mantienen las reglas de `CLAUDE.md`: lógica separada del render, entrada por comandos, juego → HUD por eventos.
- **Todo lo aleatorio sale de la semilla de la partida.** Misma semilla, misma mazmorra.

---

## 1. Los dos modos

- **Pantalla de título:** dos botones, `SUPERVIVENCIA` y `MAZMORRA`, cada uno con su subtítulo y su récord debajo. Cualquiera de los dos desbloquea el audio.
- **`GameMode`:** `survival` o `dungeon`, en los servicios y en `GameState`.
- **Lo que comparten:** movimiento, armas, balas, cuchillo, dash, zombies, boss, quemaduras, recogidas, HUD, audio y vibración.
- **Lo que es solo de Supervivencia** y no corre en Mazmorra: rondas, compra de salas, barricadas que se reparan, magos que pasean, vitrinas de pago, objetos especiales y activaciones, calendario de bosses.
- **Lo que es solo de Mazmorra:** todo lo de esta spec, bajo un `DungeonSystem` y un `RunState` dentro de `GameState`.
- Las diferencias de reglas se piden a un único sitio (las reglas del modo). No repartas `if (mode === …)` por los sistemas.
- Debug: `?mode=dungeon` y `?seed=<número>` en la URL.

---

## 2. Estructura de una partida

| Planta | Ambiente | Kits | Salas con enemigos | Boss |
|---|---|---|---|---|
| 1 | Mansión | `kit_interior`, suelos de interior | 6 | Matarife |
| 2 | Sótano | `kit_basement` | 8 | Matarife rabioso |
| 3 | Jardín | `kit_exterior`, `kit_fence`, césped y piscina | 10 | Matarife pútrido |

- **Duración buscada:** 15 a 20 minutos. Una sala normal se limpia en menos de un minuto.
- **Victoria:** al morir el boss de la planta 3.
- **Modo infinito:** tras la victoria se puede seguir (sección 12).
- **Cartel al empezar cada planta:** `PLANTA 1 · MANSIÓN`, con el cartel de ronda que ya existe.

### 2.1 Tipos de sala

| Tipo | Por planta | Qué hay | Puerta |
|---|---|---|---|
| `start` | 1 | Nada. Aquí empieza el jugador | Abierta |
| `combat` | Las de la tabla, menos una | Enemigos | Abierta |
| `elite` | 1 | Enemigos de élite. Al limpiarla suelta la **llave del boss** | Abierta |
| `treasure` | 1 | Un arma y un cofre (sección 6) | Pide llave |
| `hand` | 1 | La Mano del Demonio y el altar del pacto (sección 9) | Abierta |
| `challenge` | 0 o 1 (60 %) | Más enemigos a cambio de un premio mejor (sección 6.4) | Marcada en rojo |
| `boss` | 1 | El boss de la planta y la trampilla a la siguiente | Pide la llave del boss |

"Salas con enemigos" cuenta las `combat` y la `elite`. La de reto es aparte.

---

## 3. Generación de la planta

Un generador **puro y con semilla** (`src/game/dungeon/generateFloor.ts`): recibe la semilla, el número de planta y la configuración, y devuelve el plano. No depende de Phaser.

### 3.1 El plano

1. **Rejilla** de 9×7 celdas. La sala inicial va en el centro.
2. **Crecimiento en anchura:** se recorre una cola de celdas. Para cada una se intenta crecer hacia sus 4 vecinas. Una vecina se descarta si:
   - ya está ocupada,
   - tendría 2 o más salas vecinas (así no salen bloques compactos, salen ramas),
   - ya se ha llegado al número de salas,
   - o falla una tirada del 50 %.
3. **Callejones:** las celdas que no han podido crecer hacia ninguna vecina.
4. **Salas especiales**, por este orden:
   - `boss`: el callejón más lejano del inicio. Ocupa **2×2 celdas**: las otras 3 tienen que estar libres. Si no caben, se prueba el siguiente callejón más lejano.
   - `treasure`, `hand` y `challenge`: en callejones al azar.
   - `elite`: la sala con enemigos más lejana del inicio que quede.
   - El resto son `combat`.
5. **Validación.** Se regenera con la siguiente tirada si:
   - el número de salas no es el pedido,
   - faltan callejones para las especiales,
   - el boss queda pegado a la sala inicial,
   - o la sala de élite solo es alcanzable pasando por una puerta con llave.
6. **Salas a mano:** para cada celda se sortea una plantilla de su tipo, ambiente y dificultad, sin repetir en la misma planta mientras queden otras. La mitad de las veces se coloca **en espejo horizontal**.

Cada planta usa su propia sub-semilla, y el botín y las tiendas usan otras: lo que haga el jugador en una sala no cambia el plano de las siguientes.

### 3.2 Plantillas de sala

- **Formato:** el mismo plano ASCII de `maps/src/`, en `maps/src/rooms/<ambiente>/<nombre>.txt`, con la skill `level-design`.
- **Tamaño de una sala normal:** 16×7 casillas de suelo, 18×9 con las paredes. Cabe casi entera en la pantalla de un móvil. Si en la vista previa no queda bien, ajústalo y anótalo en `DECISIONS.md`.
- **Arena del boss:** el bloque de 2×2 celdas, como una sola sala grande.
- **Huecos de puerta:** uno por lado, de 2 casillas, siempre en la misma posición. El generador abre los que dan a otra sala y tapia los demás.
- **Tablas de la plantilla:**
  - `## Sala`: tipo, dificultad (`easy`, `medium`, `hard`) y ambiente.
  - `## Enemigos`: puntos de aparición.
  - `## Magos`: al menos un `merchant_spot` en toda sala con enemigos.
  - `## Cofre`: punto del cofre o del premio.
  - Atrezo, como en los mapas actuales. El atrezo con colisión es la cobertura y los obstáculos de la sala.
- **Banco inicial por ambiente:** 8 de combate, 2 de élite, 2 de reto, y una de cada una de inicio, tesoro, mano y boss. Son 16 por ambiente, 48 en total.
- **Dificultad:** la planta 1 sortea entre `easy` y `medium`; las demás, entre `medium` y `hard`.

**Validador de plantillas** (en `map:build` o un script propio):

- Los 4 huecos de puerta se conectan entre sí por un paso de 2 casillas.
- Cada punto de enemigo está a 4 casillas o más de todos los huecos de puerta.
- Ningún atrezo tapa un hueco de puerta ni la casilla de delante.
- La arena del boss cumple lo que pide el Matarife: su cuerpo de 2×2 llega a todo el suelo y hay un `boss_spot`.

### 3.3 Montaje del mapa

Al empezar cada planta, el plano y sus plantillas se montan en **un único mapa** (`MapData`), y cada sala es una **zona**. Así sirven sin cambios las colisiones, las rutas de los zombies, la navegación del boss, la oscuridad de las zonas no visitadas y las puertas.

- **Opción preferida:** reutilizar en tiempo de ejecución el compilador de planos (`scripts/lib/ascii-map.ts`), moviendo su parte pura a `src/`. El generador escribe el plano ASCII de la planta entera y sus tablas, y el compilador hace el resto: paredes, sombras y suelos.
- **Si no es viable** (lee archivos, pesa demasiado o tarda), precompila las plantillas y cose sus capas. Anótalo en `DECISIONS.md`.
- **Tiempo:** montar una planta tarda menos de 300 ms en un móvil medio. Ocurre detrás del cartel de planta.

### 3.4 Vista previa

`npm run dungeon:preview <semilla>` escribe en `maps/preview/dungeon/` el plano de las 3 plantas (una celda por sala, con su tipo) y el PNG de cada planta montada, con el mismo render que `map:preview`. **Revísalo a ojo** con varias semillas antes de cerrar las fases M1 y M2.

---

## 4. Moverse por la planta

- **Cámara:** se queda dentro de la sala actual. Al cruzar una puerta, se desliza a la sala nueva en 0,35 s.
- **Salas no visitadas:** a oscuras, con la oscuridad de zonas que ya existe.
- **Entrar en una sala con enemigos sin limpiar:**
  1. Cuando el jugador está una casilla dentro, las puertas se cierran.
  2. Los enemigos aparecen en sus puntos tras un aviso de 0,8 s (una sombra en el suelo y un sonido). Nunca a menos de 4 casillas del jugador.
  3. Al morir el último, las puertas se abren, suena el aviso de sala limpia y cae el botín (sección 6.2).
- **Oleadas:** una sala `medium` o `hard` puede traer una segunda oleada, que aparece cuando quedan 2 enemigos o menos.
- **Salas limpias:** quedan abiertas y se puede volver por ellas.
- **Pasar de planta:** al morir el boss aparece una trampilla en su sala. El botón de acción muestra `BAJAR`. Al bajar se monta la planta siguiente; el jugador conserva vida, armas, munición, dinero, llaves normales, mejoras y maldiciones.

### 4.1 Puertas

| Puerta | Aspecto (placeholder) | Se abre |
|---|---|---|
| Normal | Madera | Sola, con la sala limpia |
| Con llave | Dorada con cerradura | Con el botón de acción, gastando una llave |
| Del boss | Roja con calavera | Con la llave del boss |
| De reto | Marco rojo | Sola. Al acercarse, el botón de acción avisa: `SALA DE RETO` |

### 4.2 Minimapa y HUD

- **Minimapa** en la esquina superior derecha: una celda por sala.
  - Se dibujan las salas visitadas y las vecinas de una visitada.
  - Las especiales llevan icono: tesoro, mano, reto, boss y mago.
  - La sala actual va resaltada.
  - No debe solaparse con la barra del boss ni con las armas. Compruébalo en las tres pantallas de prueba.
- **Contador del mago:** 5 marcas junto al minimapa, que se llenan con cada sala limpia. Que el jugador vea siempre cuánto falta.
- **Llaves:** número de llaves normales y el icono de la llave del boss, junto al dinero.
- **Menú de pausa:** una fila `MEJORAS` con los iconos de las mejoras y maldiciones que llevas. Al tocar una, su descripción.

---

## 5. Combate

### 5.1 Números del modo

| | Supervivencia | Mazmorra |
|---|---|---|
| Daño de un zarpazo | 40 | 20 |
| Vida del zombie base | 3, sube con las rondas | 3, 4 y 5 en las plantas 1, 2 y 3 |
| Munición de la pistola | Limitada | **Reserva infinita**; el cargador se recarga igual |
| Resto de armas | Limitada | Limitada, se repone con recogidas |
| Regeneración | No | No |
| Cura | Botiquines | Botiquines (+40), y +30 al matar a cada boss |

### 5.2 Enemigos

Los tres actuales (caminante, corredor, sprinter) y tres nuevos. Los nuevos usan el sprite del zombie con un tinte y un tamaño propios, sin arte nuevo.

| Enemigo | Aspecto | Vida | Comportamiento |
|---|---|---|---|
| **Escupidor** | Tinte verde | La base −1 | Se queda a unos 160 px con línea de visión. Cada 2,5 s se prepara 0,6 s (se hincha) y escupe un proyectil lento (140 px/s): 15 de daño. Donde cae deja un charco de 2 s, con el sistema de charcos del boss. A menos de 70 px ataca a zarpazos |
| **Explosivo** | Tinte rojo que late | La base | Corre como un corredor. Al morir, o al alcanzar al jugador, se hincha 0,5 s y estalla: 60 px de radio, 30 al jugador y 3 a los enemigos. Las explosiones se encadenan |
| **Bruto** | 1,5 veces más grande, tinte oscuro | La base ×5 | Lento (velocidad ×0,6). Zarpazo de 35. No se le empuja ni pierde las piernas |

- **Proyectiles enemigos:** sistema nuevo con pool. Las paredes y el atrezo con colisión los paran. El dash los atraviesa.
- **Élite:** cualquier enemigo con un aura dorada. Vida ×2,5, velocidad +15 % y dinero ×3.
- **Composición de una sala:** cada sala tiene un presupuesto según su dificultad y su planta, y se gasta en enemigos al azar.

| Enemigo | Coste | Desde la planta |
|---|---|---|
| Caminante | 1 | 1 |
| Corredor | 2 | 1 |
| Explosivo | 2 | 1 |
| Escupidor | 3 | 2 |
| Sprinter | 3 | 2 |
| Bruto | 5 | 2 |

| Presupuesto | Planta 1 | Planta 2 | Planta 3 |
|---|---|---|---|
| `easy` | 6 | — | — |
| `medium` | 9 | 12 | 15 |
| `hard` | — | 16 | 20 |

- Como mucho 2 escupidores y 1 bruto por oleada.
- **Sala de élite:** presupuesto `hard` de su planta, con 2 enemigos convertidos en élite.

### 5.3 Bosses

- El Matarife y sus variantes, sin cambios de reglas. Cae del cielo en el `boss_spot` de la arena 1,5 s después de cerrarse las puertas.
- Su vida se ajusta por planta en `dungeon.ts` (de partida: 60, 110 y 180).
- No hay goteo de zombies durante el boss.
- **Al morir:** una mejora gratis a elegir entre 3 (sección 7.3), +30 de vida y la trampilla.

---

## 6. Llaves, botín y tesoros

### 6.1 Llaves

- **Llave normal:** se acumulan y pasan de planta. Abren la sala del tesoro y los cofres cerrados.
- **Llave del boss:** una por planta. La suelta la sala de élite al limpiarse. No pasa de planta.
- Recogerlas es automático al pasar por encima.

### 6.2 Botín

| Origen | Qué da |
|---|---|
| Cada baja | Dinero: 10$ (bruto 30$; élite ×3). Además, munición (12 %) o un botiquín (4 %) |
| Sala limpia | 25$, y una tirada: llave (25 %), cofre cerrado (10 %) o nada |
| Cofre cerrado | Pide una llave. Da 150$ y munición o un botiquín |

**Para no quedarse sin llave:** mientras el jugador no tenga llaves y no haya abierto el tesoro de la planta, la probabilidad de llave sube 15 puntos por cada sala limpia sin premio.

### 6.3 Sala del tesoro

- **Un arma gratis:** una vitrina con un arma básica que el jugador no lleve (SMG o escopeta). Si ya lleva las dos, munición completa y 200$.
- **Un cofre abierto:** 150$ y un botiquín.

### 6.4 Sala de reto

- Presupuesto `hard` de su planta ×1,5, siempre en dos oleadas.
- **Premio:** un cofre grande con una llave, 300$ y un botiquín.
- Cuenta para el contador del mago.

---

## 7. Mejoras permanentes

### 7.1 El mago cada 5 salas

- **Contador:** suma cada sala con enemigos que se limpia (`combat`, `elite` y `challenge`). No se reinicia al cambiar de planta.
- **Al llegar a 5, 10, 15…:** un mago aparece con su humo en el `merchant_spot` de la sala recién limpiada.
- **Oferta:** 3 mejoras al azar. **Solo se compra una**; las otras dos desaparecen.
- **Color del mago:** el de la mejor mejora que ofrece. Azul común, rojo rara, dorado legendaria.
- **Se queda en esa sala** hasta que se compre o se baje de planta. Se puede volver cuando se tenga dinero; el minimapa lo marca.
- **Cambiar la oferta:** 50$ la primera vez, y 50$ más cada vez.
- **También vende,** una unidad por visita: una llave (150$) y un botiquín (200$).
- Usa el panel de tienda que ya existe, sin pausar el juego.

| Rareza | Precio | Probabilidad por hueco, plantas 1–2 | Planta 3 en adelante |
|---|---|---|---|
| Común | 300$ | 60 % | 45 % |
| Rara | 500$ | 30 % | 35 % |
| Legendaria | 900$ | 10 % | 20 % |

No se ofrece una mejora que ya esté al máximo de copias, ni dos iguales en la misma oferta.

### 7.2 Catálogo (`src/config/upgrades.ts`)

Cada mejora se define por datos: `id`, nombre, descripción corta, rareza, efecto y máximo de copias. Sus efectos se suman en **una única función** que calcula las estadísticas del jugador a partir de sus mejoras y maldiciones. Los sistemas leen ese resultado; no preguntan por mejoras concretas.

**Comunes**

| id | Nombre | Efecto | Copias |
|---|---|---|---|
| `vitality` | Vitalidad | +25 de vida máxima y cura 25 | 3 |
| `quick_hands` | Manos rápidas | Recarga un 25 % más rápida | 2 |
| `light_feet` | Pies ligeros | +10 % de velocidad | 2 |
| `magnet` | Imán | Recoge desde 3 veces más lejos; lo del suelo no caduca | 1 |
| `greed` | Codicia | +30 % de dinero | 2 |
| `deep_pockets` | Bolsillos hondos | +50 % de munición de reserva | 2 |
| `sharp_knife` | Filo | El cuchillo hace el doble de daño y llega un 30 % más lejos | 1 |

**Raras**

| id | Nombre | Efecto | Copias |
|---|---|---|---|
| `piercing` | Perforantes | Las balas atraviesan a un enemigo más | 2 |
| `ricochet` | Rebote | Las balas rebotan una vez en las paredes | 2 |
| `incendiary` | Incendiarias | 20 % de prender al enemigo, con la quemadura que ya existe | 2 |
| `volatile` | Volátiles | Los enemigos estallan al morir: 40 px, 2 de daño a otros enemigos | 2 |
| `leech` | Sanguijuela | Cura 5 cada 10 bajas | 2 |
| `second_wind` | Segundo aire | Un segundo dash | 1 |
| `adrenaline` | Adrenalina | Con la vida baja, +30 % de cadencia y de velocidad | 1 |

**Legendarias**

| id | Nombre | Efecto | Copias |
|---|---|---|---|
| `fan_fire` | Abanico | 2 proyectiles más a los lados, con la mitad de daño | 1 |
| `shadow_dash` | Paso de sombra | El dash hace 3 de daño a lo que atraviesa y deja un rastro de fuego de 1,5 s | 1 |
| `ward` | Amuleto | Absorbe el primer golpe de cada sala | 1 |
| `executioner` | Verdugo | 15 % de golpe crítico, con el triple de daño | 1 |

- Reutiliza lo que ya hay: el abanico de la pistola, las balas perforantes de la SMG y la quemadura.
- Las mejoras de balas no afectan a la katana, al láser ni al lanzallamas, salvo `executioner` e `incendiary`.

**Sinergias buscadas** (que funcionen y se prueben):

- `incendiary` + `volatile`: un enemigo que muere ardiendo estalla con un 50 % más de radio y prende a los que alcanza.
- `piercing` + `ricochet`: al rebotar, la bala recupera sus perforaciones.
- `fan_fire` + `incendiary`: cada proyectil tira su propio dado.
- `second_wind` + `shadow_dash`: los dos dashes dañan.
- `leech` + el pacto de sangre de la mano: la vida gastada se recupera matando.

### 7.3 Mejora del boss

Al morir un boss aparece un cofre en su sala. Al abrirlo, un panel con 3 mejoras: se elige una, gratis. Probabilidades de la planta siguiente, con al menos una rara o legendaria.

---

## 8. Armas

- **Inicio:** solo la pistola. Hasta 3 armas, como ahora.
- **SMG y escopeta:** en las salas del tesoro.
- **Katana, láser y lanzallamas:** solo en la Mano del Demonio.
- Las mejoras de arma del mago rojo y la mejora especial del mago dorado no existen en este modo: su papel lo hacen las mejoras permanentes.

---

## 9. La Mano del Demonio y el pacto

En la sala `hand` de cada planta.

- **La Mano:** como en Supervivencia, con sus números propios en `dungeon.ts`. Da un arma al azar por 400$ o por 30 de vida. Un uso por planta.
- **Altar del pacto**, junto a la mano (placeholder: un círculo de velas rojas):
  - Ofrece **una mejora legendaria gratis a cambio de una maldición**. Las dos se ven antes de aceptar.
  - El botón de acción muestra `ACEPTAR PACTO`; pide una segunda pulsación para confirmar.
  - Un pacto por planta. Si se rechaza, el altar sigue ahí hasta bajar de planta.

**Maldiciones** (duran toda la partida):

| id | Nombre | Efecto |
|---|---|---|
| `frail` | Frágil | −25 de vida máxima |
| `hunted` | Acosado | Los enemigos corren un 15 % más |
| `tithe` | Diezmo | Los magos cobran un 30 % más |
| `leak` | Fuga | −30 % de munición de reserva |

No se repite una maldición que ya se tiene.

---

## 10. Fin de la partida

**Al morir o al ganar,** una pantalla con:

- Título: `HAS CAÍDO` o `HAS ESCAPADO`.
- Planta alcanzada, salas limpiadas, bajas y tiempo.
- Los iconos de las mejoras y maldiciones que se llevaban.
- La semilla.
- Botones: `OTRA PARTIDA`, `MISMA SEMILLA` y `MENÚ`. Al ganar, además, `SEGUIR`.

**Récords**, guardados en el dispositivo como las preferencias: mejor planta, más salas, victorias y mejor tiempo de victoria. Se muestran bajo el botón del modo en el título. Una partida con `MISMA SEMILLA` o con el debug activo no cuenta para los récords.

---

## 11. Sonido

Los eventos nuevos pasan por el taller de la spec 08, con sus candidatos:

- Puertas que se cierran y se abren; sala limpia.
- Aviso de aparición de enemigos.
- Escupidor: se hincha, escupe, impacto. Explosivo: se hincha, explosión. Bruto: pisadas y zarpazo.
- Llave recogida, cerradura, cofre.
- Aparición del mago, compra de mejora (por rareza), cambio de oferta.
- Pacto aceptado y maldición.
- Trampilla y cartel de planta.

La música usa los estados que ya existen: `calm` con la sala limpia, `round` con enemigos y `boss` en la arena.

---

## 12. Modo infinito

Tras la victoria, `SEGUIR` baja a la planta 4.

- Los ambientes rotan: mansión, sótano, jardín.
- 10 salas con enemigos por planta.
- Vida y presupuesto de enemigos ×1,25 por cada planta por encima de la 3.
- Bosses: se recorre el calendario de variantes de `bosses.ts`, parejas incluidas.

---

## 13. Debug y tests

**Debug:**

- `REVELAR MAPA`, `DAR LLAVE`, `DAR LLAVE DEL BOSS`, `+500$`.
- `LIMPIAR SALA`, `IR AL BOSS`, `BAJAR DE PLANTA`.
- `DAR MEJORA` (con selector) y `LLAMAR AL MAGO`.
- La semilla de la partida, siempre visible en el panel.

**Tests:**

- **Generador**, sobre 1000 semillas y las 3 plantas:
  - Número exacto de salas de cada tipo.
  - Todas las salas conectadas con la inicial.
  - El boss es el callejón más lejano con sitio para 2×2 y no toca la sala inicial.
  - La sala de élite se alcanza sin llaves.
  - Ninguna plantilla repetida mientras queden otras.
  - Misma semilla, mismo resultado; semillas distintas, planos distintos.
  - Las acciones del jugador no cambian el plano de la planta siguiente.
- **Plantillas:** todas pasan su validador, también en espejo.
- **Salas:** las puertas se cierran al entrar y se abren al morir el último; la segunda oleada entra con 2 o menos; nadie aparece a menos de 4 casillas del jugador.
- **Llaves:** la del boss solo sale de la élite y no pasa de planta; la regla para no quedarse sin llave.
- **Mago:** aparece en la 5.ª, 10.ª… sala limpia; solo una compra; el cambio de oferta sube de precio; no ofrece mejoras al máximo ni repetidas.
- **Mejoras:** cada una cambia lo que dice; los límites de copias; cada sinergia de la sección 7.2; las maldiciones.
- **Enemigos nuevos:** distancia y cadencia del escupidor, explosiones encadenadas, inmunidades del bruto, multiplicadores de élite.
- **Modo:** con `survival`, ningún sistema de la mazmorra corre y todos los tests anteriores pasan sin tocarlos.

---

## 14. Fases

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **M1** | `GameMode`, título con dos modos, `dungeon.ts`, `RunState`, generador del plano con sus tests y `dungeon:preview` (solo el plano). | Los planos de 20 semillas se ven variados y correctos en la vista previa. Supervivencia funciona igual. |
| **M2** | Plantillas de la mansión, montaje del mapa, cámara por sala, puertas que se cierran y se abren, minimapa y contador, salas de combate con los zombies actuales. | Se recorre una planta entera de mansión sala a sala. **⏸ Detente** para que lo pruebe en el móvil. |
| **M3** | Llaves, botín, tesoro, cofres, élite, boss con su arena y trampilla. Plantillas de sótano y jardín. Las 3 plantas, victoria y pantalla final. | Una partida completa de principio a fin. **⏸ Detente.** |
| **M4** | Escupidor, explosivo, bruto, élites y presupuestos por sala. | Las salas se sienten distintas entre sí. |
| **M5** | Mejoras: catálogo, función de estadísticas, mago cada 5 salas, panel, cambio de oferta, cofre del boss y sinergias. | Dos partidas con mejoras distintas se juegan de forma distinta. **⏸ Detente.** |
| **M6** | Mano del Demonio en su sala, altar del pacto, maldiciones y salas de reto. | El pacto y el reto se pueden aceptar o evitar, y se nota la diferencia. |
| **M7** | Modo infinito, récords, `MISMA SEMILLA`, sonidos nuevos, debug, y documentación: sección «Modo Mazmorra» en `GAME-DESIGN.md`, `ROADMAP.md` y `CLAUDE.md`. | Todo documentado. **⏸ Detente.** |

Al cerrar cada fase, sigue el cierre de fase de `CLAUDE.md`, con commits `feat(fase-MN): …`.

---

## 15. Fuera de esta spec

Desbloqueos entre partidas, bosses nuevos, salas secretas, semilla diaria, arte propio para los enemigos nuevos y cooperativo.