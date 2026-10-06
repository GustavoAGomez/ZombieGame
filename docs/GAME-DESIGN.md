# Diseño del juego

Registro vivo de las **reglas del juego tal como están implementadas**: qué hay, cuánto cuesta y cómo funciona. No describe el código; para eso están las specs (`docs/specs/`) y `docs/DECISIONS.md`.

**Mantenlo al día:** cada vez que cambie una regla, un precio o un número de juego, o se añada un arma, un mago, un objeto o una activación, actualiza este documento en el mismo commit. Los números salen de `src/config/` (`balance.ts`, `weapons.ts`, `merchants.ts`, `items.ts`, `activations.ts`, `dungeon.ts`, `upgrades.ts`) y del plano del mapa (`maps/src/mansion.txt`). Las secciones hasta *Zombis* describen el modo **Supervivencia**; el modo **Mazmorra** va al final, con lo que cambia respecto a él.

## Armas

- **Categorías:**
  - `basic`: se compran en las vitrinas de armas. Pistola, SMG y escopeta.
  - `special`: solo las da la Mano del Demonio (spec 06), nunca una vitrina. No tienen niveles del mago rojo (su tienda dice «NO MEJORABLE»), pero sí mejora especial del mago dorado. La katana, el láser y el lanzallamas infernal.
- **Cómo atacan:** con balas (pistola, SMG, escopeta), con un barrido cuerpo a cuerpo (katana), con un rayo continuo (láser) o con un chorro en cono (lanzallamas).
- **Cada arma tiene sus propias mejoras:** cuántos niveles admite de cada tipo de mejora (munición, cadencia y daño), que vende el mago rojo y que el jugador elige; y, si la tiene, una mejora especial única que vende el mago dorado. Nada supone que haya tres niveles: un arma especial futura podrá admitir menos tipos o menos niveles.
- **Inventario de armas:** se empieza solo con la pistola y se llevan como mucho **3 armas**, una por hueco de la columna de armas. Tocar un hueco cambia de arma en 0,4 s.

| Arma | Daño por bala | Cadencia | Cargador | Reserva | Recarga | Alcance | Notas |
|---|---|---|---|---|---|---|---|
| Pistola | 1 | 4 disparos/s | 8 | 64 | 1,6 s | 340 px | La de inicio |
| SMG | 1 | 11 disparos/s | 30 | 120 | 2,2 s | 300 px | Dispersión de 6° |
| Escopeta de caza | 0,9 por perdigón | 1,4 disparos/s | 2 | 24 | 1,8 s | 150 px | 6 perdigones en un cono de 22°; daño completo hasta 60 px y luego baja hasta el 40 %; cada impacto empuja al zombi 3 px |

El daño se cuenta en las mismas unidades que la vida de los zombis: una bala de pistola o de SMG quita 1.

**Katana** (especial):
- **Barrido:** 4 de daño a cada zombi dentro de un arco de 140° delante del jugador, hasta 102 px del borde de su cuerpo. Empuja 6 px a cada uno.
- **Un barrido por segundo:** manteniendo pulsado, barre en cuanto puede. El enfriamiento es del arma y corre también enfundada: cambiar de arma no lo salta ni bloquea a las demás.
- **Se desgasta: 60 usos.** Cada barrido gasta uno, dé o no a algún zombi. El último la rompe: se queda en su hueco pero no corta, hasta que el mago azul la repara.
  - Aviso «LA KATANA SE HA ROTO».
  - Rota, y sin munición en las demás armas, el botón de disparo da cuchilladas.
- **Sin munición ni recarga.** En el HUD, donde irían los números, salen los usos que le quedan (también en su hueco de la barra de armas). Mientras se enfría, una barra que se va llenando aparece a su lado; rota, el número sale en rojo con «ROTA» parpadeando.
- **Al pulsar:** el barrido sale sin la espera del primer disparo, y el jugador corre a su velocidad normal mientras ataca.
- **Dirección:** solo hacia delante, hacia donde mira el jugador (la última dirección en la que se movió). Con la katana en la mano, el botón de disparo es un botón de acción con su icono: no se arrastra para apuntar ni gira hacia ningún zombi.
- **Bloqueos y puntos:** una pared entre medias protege al zombi (una ventana no). Puntúa como el cuchillo: 10 por cada zombi golpeado.
- El cuchillo sigue en su botón, sin cambios.

**Láser** (especial):
- **Rayo continuo** mientras se mantiene pulsado, desde el cañón hasta 280 px. Atraviesa a todos los zombis de la línea; las paredes lo paran, las ventanas no.
- **Daño:** 6 por segundo a cada zombi tocado, en golpes cada 0,1 s.
- **Puntos:** un impacto (5) por zombi cada 0,5 s de contacto. Muere como siempre: 50 por la muerte.
- **Batería de 100 en lugar de munición:** se gasta a 25 por segundo (4 s de rayo) y se recarga sola a 20 por segundo tras 0,8 s sin disparar, también enfundado. Ni la munición máxima ni los premios de munición le afectan.
- **Sobrecalentamiento:** si se vacía, el arma se bloquea 3 s y luego recarga con normalidad. En el HUD, la barra de batería parpadea en rojo con «SOBRECALENTADO».
- **Se rompe del todo a la 8.ª vez que se sobrecalienta:** se pierde, sin arreglo, y pasa a la mano el arma siguiente. Aviso «EL LÁSER SE HA ROTO».
  - Debajo de la barra de batería, una casilla roja por cada sobrecalentamiento que aún aguanta.
- Respeta la espera del primer disparo y frena al jugador como las armas de fuego. Un toque más corto que la espera no dispara.

**Lanzallamas infernal** (especial):
- **Chorro** mientras se mantiene pulsado, en un cono de 40° hasta 135 px. Las paredes lo paran: un zombi sin línea de visión no se quema.
- **Daño directo:** 4 por segundo a cada zombi del cono, en golpes cada 0,1 s.
- **Quemadura:** cada zombi tocado arde 2 s y pierde 2 en total. No se apila: cada toque la reinicia.
- **Munición:** depósito de 60 y reserva de 180. Gasta 12 por segundo (5 s por depósito) y recarga en 2,5 s. La rellenan la munición máxima del mago azul y los premios de munición.
- **Puntos:** un impacto por zombi cada 0,5 s. Los golpes de la quemadura no puntúan; la muerte sí.
- Respeta la espera del primer disparo y frena al jugador. Un toque más corto que la espera no dispara.

- **Apuntar antes del primer disparo:** al pulsar el botón de disparo, la primera bala espera **0,3 s** (igual en las tres armas, ajustable por arma). Mientras tanto el jugador ya gira hacia donde apunta y se puede corregir arrastrando, por si el dedo cayó descentrado.
  - Manteniendo pulsado, después dispara a la cadencia del arma.
  - Un toque más corto que esa espera dispara una vez al cumplirse, hacia donde apuntaba al soltar. Si en ese momento no puede (recargando, cambiando de arma), el disparo se pierde: nunca sale una bala suelta después.
  - El cuchillo, en su botón o en el de disparo sin munición, no espera.

### Mejoras por arma

Tres tipos de mejora, cada uno con sus niveles, que se compran por separado y en el orden que quiera el jugador. El factor de cada nivel es el total a ese nivel: los niveles de un tipo no se multiplican entre sí.

| Tipo | Qué mejora | Nivel 1 | Nivel 2 | Nivel 3 |
|---|---|---|---|---|
| Munición | Cargador y reserva máxima (al comprarla, el arma se rellena hasta el nuevo máximo) | ×1,5 | ×2 | ×2,5 |
| Cadencia | Disparos por segundo (en la escopeta, también la recarga) | ×1,25 | ×1,5 | ×1,75 |
| Daño | Daño por bala (se multiplica con la mejora temporal de doble daño) | ×1,5 | ×2 | ×2,5 |

| Arma | Munición | Cadencia | Daño | Especial (mago dorado) |
|---|---|---|---|---|
| Pistola | 3 niveles (8 → 12 → 16 → 20 balas) | 3 niveles | 3 niveles | **Abanico:** 3 balas por disparo, separadas 12°, por el gasto de una |
| SMG | 3 niveles (30 → 45 → 60 → 75 balas) | 3 niveles | 3 niveles | **Perforante:** cada bala atraviesa hasta 3 zombis (las paredes la siguen parando) |
| Escopeta de caza | 3 niveles (2 → 3 → 4 → 5 cartuchos) | 3 niveles (también acelera la recarga) | 3 niveles | **Fuego:** cada perdigón que acierta prende al zombi, que arde 1,5 s y pierde en total el 40 % del daño del perdigón (no se acumula) |
| Katana | — | — | — | **Filo de sangre:** cada zombi que mata cura 2 de vida, hasta 10 por barrido |
| Láser | — | — | — | **Sobrecarga:** daño ×2 y la batería dura el doble |
| Lanzallamas infernal | — | — | — | **Fuego infernal:** un zombi que muere ardiendo estalla: 2 de daño a los que estén a 40 px (sin pared en medio), que también prenden. Las explosiones se encadenan |

- **HUD:** junto al nombre del arma hay una marca por tipo (bala, rayo y cruceta) con una casilla por nivel, que se rellena de ámbar al comprarlo. Con la especial, el nombre se pone ámbar.
- Un arma con todo al máximo y el doble daño temporal hace ×5 de daño.

### Cuchillo

Botón propio, junto al disparo. Golpea en un cono delante del jugador.

## Vitrinas de armas básicas

- **Qué son:** muebles fijos del mapa que venden un arma básica.
- **Cómo se compra:** desde el frente de la vitrina, a menos de 40 px, con el botón de acción. El precio se ve sobre la vitrina al acercarse.
  - **Con un hueco libre:** se paga, el arma entra en el inventario y pasa a la mano.
  - **Si ya llevas esa arma:** vende su munición a **mitad de precio** (llena cargador y reserva). Con el arma llena no se puede comprar.
  - **Con los 3 huecos llenos:** el arma nueva sustituye a la que llevas en la mano. Si esa arma tiene mejoras o su especial, el botón pide confirmación («CAMBIAR PISTOLA ★★ POR SMG», una estrella por nivel comprado de cualquier tipo) y hace falta un segundo toque en menos de 3 s. Las mejoras se pierden con el arma.
  - Sin dinero suficiente, el botón dice cuánto falta.
- **Orientación:** el frente mira al **sur, al este o al oeste, nunca al norte**, para que la cámara lo vea. Cada vitrina ocupa 1 casilla sólida, a 3 tiles o más de barricadas, puertas y puntos de mago.
- **En la mansión:**

| Vitrina | Arma | Precio | Munición | Dónde |
|---|---|---|---|---|
| V1 | SMG | 1000$ | 500$ | Salón, contra la cara sur de la columna central (mira al sur) |
| V2 | Escopeta de caza | 1500$ | 750$ | Comedor, centrada en la pared norte (mira al sur) |

## Magos

Magos con gabardina que venden munición y mejoras. Sus puntos de aparición son fijos (1 o 2 por zona). Al empezar cada ronda, cada mago activo se teletransporta, con su humo, a otra zona desbloqueada; dos magos no comparten zona si hay alternativa. Se abre su tienda con el botón de acción a menos de 40 px, y se cierra al alejarse más de 64 px.

| Mago | Cuándo aparece | Vende | Precio |
|---|---|---|---|
| **Azul** | Desde la ronda 2, primero en la zona inicial | **Munición máxima:** llena cargadores y reservas de todas las armas | 750$ |
| | | **Mejora de la ronda:** una mejora temporal sorteada en cada visita (velocidad ×1,5 o doble daño ×2). Se guarda en su botón y se activa cuando quieras; dura 10 s. Comprar otra sustituye a la guardada | 1000$ |
| | | **Reparar:** devuelve la katana a sus 60 usos, rota o solo gastada. Solo aparece si llevas la katana; sin gastar, dice «COMO NUEVA» | 1500$ |
| **Rojo** | Cuando se invoca en la piscina (ver *Objetos especiales*); desde la ronda siguiente se teletransporta como los demás | **Mejorar munición, cadencia o daño** del arma en mano, a elegir: una fila por tipo, con el nivel al que sube y lo que da. Una compra por visita, del tipo que sea. En el último nivel de un tipo dice «NIVEL MÁXIMO» | 1500$ el nivel 1, 3000$ el 2 y 5000$ el 3 |
| **Dorado** | Todavía sin regla de aparición (solo con el panel de depuración) | **Mejora especial:** la especial de un arma que llevas, una fila por arma. Una vez comprada dice «YA TIENE ESPECIAL» | 10000$ |

**Relación con las mejoras de arma:** el rojo vende los niveles de cada tipo que admite el arma; el dorado, su especial. Las mejoras pertenecen al arma: si la cambias en una vitrina, se pierden. Subir un tipo al máximo cuesta 9500$; las 9 mejoras de un arma, 28 500$.

## Objetos especiales y activaciones

- **Objetos especiales:** se recogen del mapa, se guardan en un inventario y se usan con un toque en lugares concretos. Cada objeto es único: no se apila ni hay dos iguales en la partida.

| Objeto | Cómo se consigue |
|---|---|
| Corazón vivo | Lo suelta el primer boss que muere en la partida (Matarife, en la ronda 6), donde cae; se queda en el suelo hasta que alguien lo recoge |
| Varita desgastada | Al empezar la partida aparece en un punto de objeto al azar de cualquier zona salvo la inicial, y se queda ahí hasta que alguien la recoge |

- **Puntos de objeto:** 1 o 2 por zona, también en el sótano y la azotea (19 en la mansión). Cada uno está junto a algo que cuenta una historia: la caja fuerte abierta del estudio, la puerta abierta del coche del garaje, la barbacoa volcada, el refugio del sótano… En el suelo, el objeto se ve dentro de un foco circular de luz ámbar: la varita flota sobre él con rayos chisporroteando en la punta. Los objetos se ven animados también en el inventario y en el botón de recoger: la varita con sus rayos y el corazón vivo latiendo. En una zona cerrada o a oscuras se ve como el resto de cosas de la habitación: no hay flecha ni indicador hacia él, hay que encontrarlo.
- **Recoger:** a menos de 32 px, el botón de acción ofrece «RECOGER VARITA DESGASTADA». Es la última opción del botón: cualquier otra acción cercana va antes.
- **Inventario:** como mucho 4 objetos, en una fila a la izquierda de los puntos, en el orden en que se recogieron (el primero, junto a los puntos). Se pueden usar en cualquier momento, también durante una ronda.
- **Usar:** un toque en el objeto.
  - Junto a un lugar que lo acepta, se tira y se gasta.
  - En cualquier otro sitio sale «AQUÍ NO SE USA», el hueco tiembla y el objeto no se pierde.
- **Activaciones:** lugares del mapa que aceptan ciertos objetos y hacen algo cuando los tienen todos. Recuerdan lo que han recibido, así que los objetos se pueden tirar por separado y en momentos distintos de la partida. Una activación completa no acepta nada más.

| Activación | Lugar | Objetos | Orden | Efecto |
|---|---|---|---|---|
| Invocar al mago rojo | El agua de la piscina del jardín (se usa a menos de 40 px de su borde) | Corazón vivo y varita desgastada | Cualquiera | El mago rojo sale de la piscina |

- **El ritual de la piscina:**
  - Cada objeto tirado vuela en arco hasta el agua y salpica.
  - Con uno dentro, el agua se queda con un tinte rojizo y burbujas lentas.
  - Al caer el segundo, el agua hierve en rojo 1,5 s, sale el aviso «EL MAGO ROJO HA SIDO INVOCADO» y el mago aparece con su humo en el punto de mago del borde de la piscina (si está ocupado, en el siguiente más cercano del jardín).
  - Desde la ronda siguiente se teletransporta como los demás.
  - El jardín empieza cerrado: para completar el ritual hay que desbloquearlo antes (1500$, por la puerta de la cocina o la de la biblioteca).
  - Como el corazón lo suelta el primer boss, el mago rojo no se puede invocar antes de la ronda 6.

## Economía

- **Puntos y dinero:** cada ganancia suma lo mismo a los dos.
  - Los **puntos** solo suben: son la puntuación de la partida.
  - El **dinero** ($) es lo que se gasta: salas, vitrinas y magos.
  - Se empieza con 0 puntos y 500$. Los precios se escriben «1000$».
- **Ganancias:**

| Acción | Puntos y dinero |
|---|---|
| Bala que acierta (cada perdigón de la escopeta cuenta como una) | +5 |
| Golpe de cuchillo que acierta, y cada zombi que alcanza un barrido de la katana | +10 |
| Rayo del láser o chorro del lanzallamas (una vez cada 0,5 s por zombi) | +5 |
| Baja (se suma a lo del golpe que la causa) | +50 |
| Tablón reparado (como mucho 500 por ronda; después se repara sin ganar nada) | +10 |
| Boss muerto (a cada jugador vivo; sus impactos puntúan aparte, como en un zombi) | +500 |

- **Precios vigentes:**

| Compra | Precio |
|---|---|
| Salas (el mismo precio por cualquiera de sus puertas o escaleras principales) | Salón y comedor 750$; biblioteca y cocina 1000$; garaje y calle 1250$; jardín 1500$; sótano 1750$; azotea 2000$ |
| Vitrinas | SMG 1000$, escopeta 1500$; su munición, a mitad de precio |
| Magos | Munición máxima 750$, mejora de la ronda 1000$, mejoras del rojo 1500$ / 3000$ / 5000$ por nivel, mejora especial 10000$ |
| Mano del Demonio | 950$, o 50 de vida (la mitad de la vida máxima) con el pacto de sangre, uno por sitio |

## Mano del Demonio

Un agujero en el suelo, sellado por una costra con grietas de brasa, del que sale una mano que, por dinero o por sangre, ofrece un arma al azar. Es la única forma de conseguir las armas especiales. Solo hay una en la partida.

- **Dónde está:**
  - Hay un punto posible por sala, salvo en el recibidor.
  - Al empezar está en el salón o en el comedor (al azar), que son las salas interiores que se compran desde el recibidor.
  - Sobre el agujero sube una columna de brasas, pero solo con su sala desbloqueada: de una sala bloqueada no se ve nada, ni las brasas.
  - Con su sala desbloqueada y fuera de la vista, una flecha negra en el borde de la pantalla la señala, como la de los magos (nunca si está en otro nivel). En una sala bloqueada no hay flecha: hay que abrir salas hasta dar con ella.
  - No es sólida: se pasa por encima.
- **Pagar**, a menos de 40 px, con el botón de acción:
  - Con 950$ o más: «MANO DEL DEMONIO · 950$».
  - Con menos, si tienes más de 50 de vida: «PACTO DE SANGRE · 50 VIDA», en rojo. Cuesta la mitad de la vida máxima (50), con el marco rojo y la sangre de un golpe; nunca mata.
  - **Un pacto de sangre por sitio:** después, aunque te cures, la mano solo acepta dinero hasta que se muda a otra sala. Con dinero se paga sin límite.
  - Si no llega ni lo uno ni lo otro (o ya hiciste el pacto en este sitio): «FALTAN X$», atenuado.
  - Mientras está ocupada con una oferta, no acepta otro pago.
- **Qué sale:** se sortea al pagar.
  - 10 % nada; 10 % un arma especial (láser, katana o lanzallamas); 80 % un arma básica (pistola, SMG o escopeta).
  - Nunca un arma que ya llevas, y no repite la última que ofreció si hay otra.
  - Si un grupo no tiene ninguna disponible, su parte pasa al otro.
- **La secuencia** (el juego sigue mientras tanto):
  1. La costra se rompe y la mano sale del suelo con el puño cerrado (0,6 s).
  2. Pasan siluetas de armas, cada vez más despacio (2 s).
  3. Se abre con el arma flotando 8 s, que parpadea los 3 últimos. Si sale un arma especial, hay un destello y su nombre aparece en el centro de la pantalla 1,5 s. Si no sale nada, se abre vacía y el pago se pierde.
  4. Se hunde en el suelo y el agujero se cierra (0,6 s).
- **Coger el arma:** solo quien pagó, con «COGER LÁSER» (o el arma que sea). Llega con la munición completa.
  - Con un hueco libre, entra y pasa a la mano.
  - Con los tres llenos, sustituye al arma en mano. Si esa arma tiene mejoras o su especial, pide un segundo toque, como en las vitrinas.
  - Si no la coges a tiempo, se hunde con ella y el pago se pierde.
- **Se cansa:** en cada sitio acepta de 4 a 8 usos, al azar. Una tirada que no da nada también cuenta.
  - Al pago siguiente sale, hace un gesto obsceno (el dedo corazón, con el dorso de la mano hacia ti) durante 1,5 s, devuelve el pago (dinero o vida) y se hunde.
  - 2 s después reaparece en el punto de otra sala, distinta de la actual y del recibidor, esté abierta o no. Sale el aviso «LA MANO SE HA MOVIDO» y se sortean sus usos de nuevo.

## Bosses

Zombis enormes que caen del cielo en rondas fijas. Hoy hay uno, **Matarife**: un zombi gordo con un mazo, del tamaño de una furgoneta. Sus números están en `src/config/bosses.ts` (catálogo, variantes y calendario) y en `BOSS` de `balance.ts`.

- **Calendario:**

| Ronda | Bosses |
|---|---|
| 6 | Matarife |
| 12 | Matarife rabioso |
| 18 | Dos Matarifes |
| 24 | Matarife pútrido |
| 30 | Matarife rabioso y Matarife |
| Desde la 36, cada 6 | Se repiten las rondas 12 a 30, con la vida ×1,3 por cada vuelta (×1,3, ×1,69…) |

- **La ronda de boss:**
  - Bajo el cartel de ronda sale «ALGO GRANDE SE ACERCA».
  - Salen la mitad de los zombis que tocarían (redondeando hacia arriba), y los bosses 5 s después del cartel.
  - Termina cuando han muerto los bosses y todos los zombis. Cualquier boss vivo la retiene, también uno invocado con el debug.
  - Si se acaban los zombis con un boss vivo, entra uno cada 6 s mientras haya menos de 4 vivos, 20 como mucho.
  - Una flecha roja en el borde de la pantalla señala al boss cuando no se ve (solo en el nivel en el que estás).
  - Los magos y la mano funcionan igual.
- **Cómo entra:** cae del cielo sobre un punto de salida (1 a 3 por sala, también en el sótano y la azotea), el más cercano andando entre los que están a 5 casillas o más; si no hay ninguno tan lejos, el más lejano.
  - **Aviso, 3 s:** su sombra crece en el suelo donde va a caer (el impacto alcanza 48 px de radio, las 3×3 casillas del punto), y vibra el móvil. Hay tiempo de salir.
  - **Caída, 0,6 s:** cae desde fuera de la pantalla, sin poder recibir daño ni bloquear a nadie.
  - **Impacto:** aplasta el atrezo del círculo y quien siga dentro recibe 20 (× la variante); los zombis también. La pantalla se sacude. Si te cae encima, te aparta de su cuerpo.
  - **Rugido, 1 s:** aparece su barra de vida.
  - Si cambias de nivel (sótano, azotea) o pasa 5 s sin poder llegar hasta ti, salta al cielo (1 s, sin recibir daño) y vuelve a caer cerca, con el mismo aviso y la misma vida.
- **Matarife:**
  - **Cuerpo:** huella de 2×2 casillas, por eso cruza las puertas y los pasos de 2. Dibujo de unos 116×118 (arte de PixelLab; andar, embestida, mazazo y salto en 8 direcciones, el resto en 4) y caja de impacto de 64×80.
  - **Vida y velocidad:** 100 (× variante × vuelta × jugadores); anda a 38 px/s.
  - **Choques:** las paredes, puertas cerradas, ventanas, agua, vitrinas, escaleras, magos y el agujero de la mano lo paran. Los muebles con colisión los aplasta para el resto de la partida: pierden la colisión para todos y queda una mancha de astillas.
  - **Contacto:** aparta a los zombis y te empuja sin hacerte daño, nunca a través de una pared (si te aplasta contra una, te saca por un lado); el dash lo atraviesa. Andando no hace daño: solo dañan sus ataques.
  - **Inmunidades:** no se le empuja, no pierde las piernas y no muere de un golpe. Le dañan todas las armas, la quemadura incluida; las balas perforantes lo atraviesan.
- **Sus ataques:** todos se anuncian con su preparación: se queda quieto en una pose (agachado escarbando, el mazo en alto, agachado para saltar) hasta que golpea. En el suelo no se dibuja ninguna zona; en los saltos se ve su sombra. El dash es invulnerable y sirve contra los tres.
  - **Contra los zombis:** todos sus golpes dañan también a los zombis normales igual que al jugador: la caída del cielo, la embestida (los mata), el mazazo (los empuja si sobreviven), el aterrizaje, la onda y los charcos. Nadie gana puntos por esas bajas. Los bosses no se hacen daño entre ellos.

| Ataque | Aviso | Golpe | Después |
|---|---|---|---|
| **Embestida** | 1 s agachado escarbando, mirando hacia ti; la dirección te sigue y se fija 0,3 s antes de salir. Corre por un pasillo de 64 px de ancho | Corre hasta 256 px a 300 px/s: 45 de daño (una vez) y un empujón de 24 px; aplasta muebles y mata a los zombis de su camino, sin dar puntos | Contra una pared, aturdido 2 s (se tambalea sin moverse con estrellas girando sobre su cabeza) recibiendo el doble de daño; si no, frena 0,6 s |
| **Triple mazazo** | Levanta el mazo antes de cada golpe (0,7 s el primero, 0,5 s los siguientes); golpea un arco de 160° hasta 84 px | 30 por golpe y empujón de 16 px (también a los zombis), tres golpes; entre golpes gira hacia ti (45° como mucho) y avanza 16 px | 1,2 s quieto |
| **Tres saltos** | Salta hacia donde estabas al despegar, con su sombra debajo; 0,7 s en el aire, sin poder recibir daño | Aterrizaje: 45 a menos de 44 px de su centro. Onda: un anillo de 16 px que crece hasta 130 px a 170 px/s, 20 de daño una vez por salto; las paredes la paran. Corriendo en línea recta no te alcanza; andando (disparando), sí | 0,5 s entre saltos y 1,5 s quieto tras el tercero; salta como mucho 360 px |

- **Qué ataque elige:** entre ataques anda hacia ti de 1,5 a 2,5 s. Luego, según la distancia: a menos de 90 px, mazazo (70 %) o saltos (30 %); hasta 260 px con línea recta despejada, embestida (60 %) o saltos (40 %); más lejos, saltos (si estás a un salto) o sigue andando. Nunca repite el mismo ataque dos veces seguidas.
- **Furia:** al bajar del 50 % de vida ruge 1 s con un destello rojo y queda enfurecido hasta morir: anda un 25 % más rápido y la mitad de tiempo entre ataques; las preparaciones no cambian. Su barra se pone ámbar.
- **Variantes:** el mismo boss teñido. La preparación de un ataque nunca baja del 80 % de la base.

| Variante | Tinte | Vida | Daño | Preparación | Extra |
|---|---|---|---|---|---|
| Base | — | ×1 | ×1 | ×1 | — |
| Rabioso | Rojizo | ×1,8 | ×1,25 | ×0,85 | Empieza enfurecido |
| Pútrido | Verde enfermizo | ×2,5 | ×1,5 | ×0,85 | Empieza enfurecido; cada aterrizaje deja un charco de 44 px y cada embestida un rastro de charcos de 24 px (uno cada 32 px de carrera). Los charcos duran 4 s y hacen 10 de daño por segundo a quien los pise, jugador o zombi; varios charcos solapados no suman |

- **Dos bosses a la vez:** solo uno puede empezar a preparar un ataque cada 0,8 s, para que sus avisos no caigan juntos. Salen por puntos distintos y nunca se pisan. Sus barras se apilan.
- **Barra de vida:** arriba del todo en el centro, con su nombre («MATARIFE»), una marca en el 50 % y una franja clara que enseña el daño recién hecho. Se oculta mientras hay una tienda abierta. El botón de pausa está en la esquina inferior derecha.
- **Al morir:** 500 puntos y 500$ a cada jugador vivo, un botiquín y una caja de munición, y la primera vez en la partida, el corazón vivo.

## Salas

- **Se desbloquean salas, no puertas.** Junto a una puerta cerrada, el botón de acción ofrece la sala del otro lado, pero sin decir cuál: «DESBLOQUEAR · 1000$» (o «DESBLOQUEAR · FALTAN 250$»). Cada sala tiene un solo precio, el mismo por cualquiera de sus puertas.
- **Solo al desbloquearla se sabe qué sala era:** sale en el centro de la pantalla durante 2 s, para todos los jugadores: «COCINA DESBLOQUEADA», «GARAJE DESBLOQUEADO». Las que se abren solas no avisan.
- **Al desbloquear una sala, se abren todas las puertas entre ella y las salas ya desbloqueadas:** se puede llegar a ella desde cualquier sala abierta. Las puertas hacia salas aún cerradas siguen cerradas: son las que las venden. Desbloquear una sala nunca abre gratis la siguiente.
- **Portales:**
  - Las escaleras principales (cocina–sótano, jardín–azotea) venden la sala del otro extremo, a su precio.
  - Las entradas secundarias (la trampilla jardín–sótano y la escalera de mano calle–azotea) no se compran: se abren solas cuando sus dos salas están desbloqueadas. Mientras, dicen «BLOQUEADA».
- Al desbloquear una sala se activan sus spawns de zombis (ver «De dónde salen» en Zombis).

## Barricadas

- Cada ventana tiene 5 tablones. Un zombi arranca uno cada 1,4 s (caminante) o cada 1,0 s (corredor y sprinter), siempre quieto y pegado a los tablones.
- **Varios zombis en la misma ventana** (los que arrancan y los que esperan a menos de 48 px) suman su fuerza: con 4 van 4 veces más rápido. Es el máximo, así que nunca es instantáneo.
- **Reparar:** un tablón por toque del botón de acción.
  - Sin zombis en la ventana, como mucho uno cada 0,2 s.
  - Con zombis, uno cada 2 s. Es más de lo que tarda cualquier zombi en arrancar uno, así que entran aunque repares sin parar.

## Zombis

- **Vida:** 3, y 1 más cada 3 rondas (3, 3, 3, 4, 4, 4, 5…). Con 1 o menos pierde las piernas y se arrastra a menos de la mitad de velocidad.
- **Ataque:** 40 de daño tras 0,35 s de preparación, con 1,1 s de espera entre golpes. El jugador tiene 100 de vida.
- **Tipos:**
  - Caminantes al principio.
  - Corredores desde la ronda 3: del 20 % al 50 % en la ronda 5 y el 60 % desde la 6.
  - Sprinters desde la ronda 8: el 10 %, un 10 % más cada ronda hasta el 30 %.
- **Rondas:** 6 zombis en la primera y 4 más cada ronda, hasta 80; como mucho 20 vivos a la vez.
- **Botín al morir:** munición (22 %, dos cargadores para cada arma) o vida (6 %, +50). Dura 15 s en el suelo.
- **De dónde salen:** nunca aparecen donde puede andar el jugador.
  - Los de cada ventana aparecen 2 casillas por fuera, mientras ese exterior esté cerrado. En cuanto se desbloquea el jardín o la calle, se apagan los spawns de las ventanas que dan a ellos.
  - En la calle y en la azotea entran andando desde fuera del mapa, a 2 casillas del borde, donde la cámara no llega. Hay 16 entradas:
    - **Calle (13):** los dos extremos de la calle lateral y su borde oeste (4); los dos lados del final de la calle de abajo; y las 5 parcelas vecinas del sur, subiendo por sus senderos, su entrada de coches y el tramo de valla reventado.
    - **Azotea (3):** por el norte y el este.
  - Los de las vallas del jardín (F1, F2) también aparecen fuera del mapa, por el norte.
  - Una entrada no se usa con un jugador a menos de 8 casillas del punto por donde entra.
  - Se elige el spawn al azar, con más peso cuanto más cerca está del jugador andando. Mientras quede alguno a 28 casillas o menos, los más lejanos no se usan.

## Modo Mazmorra

El segundo modo del título (spec 09): una mazmorra de **tres plantas** generadas por semilla (mansión, sótano, jardín), sala a sala, con un boss al final de cada una. Se gana bajando por la trampilla del tercer boss; se pierde al morir (no hay segunda vida). Lo que no se nombra aquí funciona como en Supervivencia.

### La planta

- **Plano:** una rejilla de 9×7 celdas; la sala inicial en el centro y el resto crece por vecinos. Tipos de sala por planta: 1 inicial, las de combate de la tabla, 1 de élite, 1 del tesoro, 1 de la Mano, 0 o 1 de reto (60 %) y la arena del boss (2×2 celdas, a 3 salas o más del inicio, en un callejón).
- **Plantillas:** 16 por ambiente en `maps/src/rooms/<ambiente>/` (salas de 18×8 casillas de suelo; la arena 38×18), con sus puntos de enemigos, de mago, de cofre, de boss y de Mano. Una plantilla no se repite en la planta mientras queden otras; la mitad salen en espejo.
- **Puertas:** las normales están abiertas; la del tesoro pide una **llave**, la de la arena la **llave del boss**, y la del reto avisa («SALA DE RETO») antes de entrar. Al entrar una casilla en una sala con enemigos, sus puertas se cierran hasta matar al último.
- **Cámara por sala** y **minimapa** en el HUD (las salas visitadas y sus vecinas; marcas en tesoro, mano, reto, élite, arena y donde espera el mago), con las llaves en mano y el ⓘ de las mejoras debajo. El dinero va solo en la esquina de arriba a la derecha. El mago sigue apareciendo cada 5 salas limpias, aunque ya no se ve cuánto falta.

| Planta | Ambiente | Salas con enemigos | Vida base del zombi | Boss | Vida del boss |
|---|---|---|---|---|---|
| 1 | Mansión | 6 | 3 | Matarife | 60 |
| 2 | Sótano | 8 | 4 | Matarife rabioso | 110 |
| 3 | Jardín | 10 | 5 | Matarife pútrido | 180 |

### Combate

- **Números del modo:** el zarpazo hace 20 (no 25), el botiquín cura 40, la **pistola tiene reserva infinita** (se rellena al recargar). No hay rondas, ventanas ni puertas de pago.
- **Oleadas por presupuesto:** cada sala tiene una dificultad (planta 1: fácil o media; después media o difícil) con un presupuesto por planta —fácil 6/6/6, media 9/12/15, difícil 12/16/20— que se gasta en enemigos al azar. Tras 0,8 s de aviso (una sombra en cada punto) aparecen a 4 casillas o más del jugador. Una sala media o difícil trae una **segunda oleada** la mitad de las veces (la mitad del presupuesto, cuando quedan 2 enemigos); el reto siempre trae dos. Las salas de élite y de reto gastan el presupuesto difícil; el reto ×1,5.

| Enemigo | Coste | Desde la planta | Qué hace |
|---|---|---|---|
| Caminante | 1 | 1 | El de siempre |
| Corredor | 2 | 1 | El de siempre |
| **Explosivo** | 2 | 1 | Corre; al alcanzarte se para 0,5 s y estalla: 30 a ti y 3 a los enemigos a 60 px. Su cadáver también estalla. Las explosiones se encadenan |
| **Escupidor** | 3 | 2 | Se para a 160 px si te ve y cada 2,5 s escupe (0,6 s de hinchazón): 15 de daño si acierta y un charco de 2 s. Una vida menos que la base |
| Sprinter | 3 | 2 | El de siempre |
| **Bruto** | 5 | 2 | Vida ×5, velocidad ×0,6, zarpazo 35, 1,5 veces más grande; ni lo empuja la escopeta ni pierde las piernas |

Como mucho 2 escupidores y 1 bruto por oleada. **Élite:** vida ×2,5, velocidad ×1,15 y dinero ×3; los dos primeros enemigos de la sala de élite lo son.

- **El boss:** cae en la arena 1,5 s después de cerrarse las puertas (0,6 s de sombra), con la vida de la tabla tal cual. Al morir: puertas abiertas, +30 de vida, su cofre y la trampilla. Sin las recompensas de Supervivencia.

### Dinero, llaves y cofres

- **Dinero:** solo cuenta el dinero (no hay puntos en pantalla). Baja 10$ (élite 30$); los impactos no pagan. Sala limpia: 25$ y una tirada: llave 25 %, cofre cerrado 10 %. Sin llaves y con el tesoro de la planta sin abrir, la llave es un 15 % más probable por cada sala sin premio. Munición 12 % y botiquín 4 % por baja.
- **Llaves:** abren la sala del tesoro o un cofre cerrado; pasan de planta. La **llave del boss** la suelta la sala de élite al limpiarla y no pasa de planta. Se recogen al pasar y no caducan.
- **Cofres:** abierto (tesoro: 150$ y botiquín), cerrado (una llave: 150$ y munición o botiquín), **grande** (reto: una llave, 300$ y botiquín, sin llave para abrirlo) y el **del boss** (ver mejoras).
- **Sala del tesoro:** su cofre y una vitrina con un arma básica que falte (SMG o escopeta); con las dos, munición completa y 200$.

### Mejoras permanentes

- **El mago** aparece en la 5.ª, 10.ª… sala con enemigos limpiada, en el centro bajo de esa sala: el **azul** si su mejor oferta es común, el **rojo** si es rara y el **dorado** si es legendaria. Vende 3 mejoras distintas (comprar una retira las otras), **CAMBIAR OFERTA** (50$, +50$ cada vez), una **LLAVE** (150$) y un **BOTIQUÍN** (200$, +40), uno por visita. Precios por rareza: común 300$, rara 500$, legendaria 900$. Probabilidades por hueco: 60/30/10 % hasta la planta 2, 45/35/20 % desde la 3. Nunca ofrece una mejora al máximo de copias.
- **El cofre del boss:** tres mejoras gratis a elegir una, al menos una rara o legendaria, con las probabilidades de la planta siguiente. Si no queda ninguna, paga como un cofre grande.
- **Las ⓘ** del HUD, de cada fila del mago y del altar abren la leyenda: qué hace cada mejora y cuáles llevas. El menú de pausa las lista.

| Mejora | Rareza | Copias | Efecto |
|---|---|---|---|
| Vitalidad | Común | 3 | +25 de vida máxima y cura 25 |
| Manos rápidas | Común | 2 | Recargas un 25 % más rápido (×0,75 cada copia) |
| Pies ligeros | Común | 2 | +10 % de velocidad (×1,1 cada copia) |
| Imán | Común | 1 | Recoges desde 3 veces más lejos y nada caduca en el suelo |
| Codicia | Común | 2 | +30 % de dinero (×1,3 cada copia) |
| Bolsillos hondos | Común | 2 | +50 % de reserva (×1,5 cada copia) |
| Filo | Común | 1 | El cuchillo hace el doble y llega un 30 % más lejos |
| Perforantes | Rara | 2 | Las balas atraviesan a un enemigo más por copia |
| Rebote | Rara | 2 | Las balas rebotan una vez por copia en las paredes; con Perforantes recuperan sus perforaciones al rebotar |
| Incendiarias | Rara | 2 | 20 % por copia de prender al enemigo |
| Volátiles | Rara | 2 | Los enemigos estallan al morir: 2 de daño por copia a 40 px; ardiendo, a 60 px y prenden |
| Sanguijuela | Rara | 2 | Curas 5 cada 10 bajas (cada 5 con dos copias) |
| Segundo aire | Rara | 1 | Un segundo dash antes del enfriamiento |
| Adrenalina | Rara | 1 | Con la vida por debajo de 30: +30 % de cadencia y de velocidad |
| Abanico | Legendaria | 1 | Dos proyectiles más a los lados (12°), con la mitad de daño |
| Paso de sombra | Legendaria | 1 | El dash hace 3 de daño y deja un rastro de fuego 1,5 s que prende |
| Amuleto | Legendaria | 1 | Absorbe el primer golpe de cada sala |
| Verdugo | Legendaria | 1 | 15 % de golpe crítico con el triple de daño |

### La Mano y el pacto

- **La Mano** está en su sala de cada planta: un arma al azar por **400$ o 30 de vida**, **un uso por planta** («LA MANO YA HA DADO LO SUYO» después).
- **El altar del pacto**, tres casillas al este de la grieta: una **legendaria gratis por una maldición** que dura toda la partida; las dos se ven en la leyenda antes de aceptar. `ACEPTAR PACTO` y un segundo toque lo sellan; uno por planta, y el altar se queda apagado hasta bajar. Sin altar si no quedan legendarias o maldiciones.

| Maldición | Efecto |
|---|---|
| Frágil | −25 de vida máxima |
| Acosado | Los enemigos corren un 15 % más |
| Diezmo | Los magos cobran un 30 % más |
| Fuga | −30 % de munición de reserva |

### Fin, récords y modo infinito

- **Pantalla final:** HAS CAÍDO o HAS ESCAPADO, planta, salas, bajas, tiempo, las mejoras y maldiciones que llevabas, la semilla y OTRA PARTIDA / MISMA SEMILLA / MENÚ (y SEGUIR al ganar).
- **Récords** en el dispositivo: mejor planta, más salas, victorias y mejor tiempo de victoria (y la mejor ronda de Supervivencia). Una partida con MISMA SEMILLA, `?seed=` o el debug activo no cuenta.
- **Modo infinito:** SEGUIR baja a la planta 4. Los ambientes rotan, hay 10 salas con enemigos por planta, la vida y el presupuesto de los enemigos y la vida del boss crecen ×1,25 por planta sobre la 3, y la arena recorre el calendario de bosses de Supervivencia (base, rabioso, pareja base+base, pútrido, pareja rabioso+base…), cada boss con la vida de la planta.
