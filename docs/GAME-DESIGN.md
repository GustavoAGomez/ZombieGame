# Diseño del juego

Registro vivo de las **reglas del juego tal como están implementadas**: qué hay, cuánto cuesta y cómo funciona. No describe el código; para eso están las specs (`docs/specs/`) y `docs/DECISIONS.md`.

**Mantenlo al día:** cada vez que cambie una regla, un precio o un número de juego, o se añada un arma, un mago, un objeto o una activación, actualiza este documento en el mismo commit. Los números salen de `src/config/` (`balance.ts`, `weapons.ts`, `merchants.ts`, `items.ts`, `activations.ts`) y del plano del mapa (`maps/src/mansion.txt`).

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
- **Dirección:** la del arrastre del botón de disparo. Sin arrastre, hacia el zombi más cercano a su alcance, como el cuchillo.
- **Bloqueos y puntos:** una pared entre medias protege al zombi (una ventana no). Puntúa como el cuchillo: 10 por cada zombi golpeado.
- El cuchillo sigue en su botón, sin cambios.

**Láser** (especial):
- **Rayo continuo** mientras se mantiene pulsado, desde el cañón hasta 280 px. Atraviesa a todos los zombis de la línea; las paredes lo paran, las ventanas no.
- **Daño:** 6 por segundo a cada zombi tocado, en golpes cada 0,1 s.
- **Puntos:** un impacto (5) por zombi cada 0,5 s de contacto. Muere como siempre: 50 por la muerte.
- **Batería de 100 en lugar de munición:** se gasta a 25 por segundo (4 s de rayo) y se recarga sola a 20 por segundo tras 0,8 s sin disparar, también enfundado. Ni la munición máxima ni los premios de munición le afectan.
- **Sobrecalentamiento:** si se vacía, el arma se bloquea 3 s y luego recarga con normalidad. En el HUD, la barra de batería parpadea en rojo con «SOBRECALENTADO».
- **Se rompe del todo a la 8.ª vez que se sobrecalienta:** se pierde, sin arreglo, y pasa a la mano el arma siguiente. Aviso «EL LÁSER SE HA ROTO».
  - Junto a la batería, una casilla roja por cada sobrecalentamiento que aún aguanta.
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
| Corazón vivo | Se lleva desde el inicio de la partida (provisional: más adelante se conseguirá de otra forma) |
| Varita desgastada | Al empezar la partida aparece en un punto de objeto al azar de cualquier zona salvo la inicial, y se queda ahí hasta que alguien la recoge |

- **Puntos de objeto:** 1 o 2 por zona, también en el sótano y la azotea (19 en la mansión). Cada uno está junto a algo que cuenta una historia: la caja fuerte abierta del estudio, la puerta abierta del coche del garaje, la barbacoa volcada, el refugio del sótano… En el suelo, el objeto se ve dentro de un foco circular de luz ámbar. En una zona cerrada o a oscuras se ve como el resto de cosas de la habitación: no hay flecha ni indicador hacia él, hay que encontrarlo.
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
  - Con su sala desbloqueada y fuera de la vista, una flecha roja oscura en el borde de la pantalla la señala, como la de los magos (nunca si está en otro nivel). En una sala bloqueada no hay flecha: hay que abrir salas hasta dar con ella.
  - No es sólida: se pasa por encima.
- **Pagar**, a menos de 40 px, con el botón de acción:
  - Con 950$ o más: «MANO DEL DEMONIO · 950$».
  - Con menos, si tienes más de 50 de vida: «PACTO DE SANGRE · 50 VIDA», en rojo. Cuesta la mitad de la vida máxima (50), con el marco rojo y la sangre de un golpe; nunca mata.
  - **Un pacto de sangre por sitio:** después, aunque te cures, la mano solo acepta dinero hasta que se muda a otra sala. Con dinero se paga sin límite.
  - Si no llega ni lo uno ni lo otro (o ya hiciste el pacto en este sitio): «FALTAN X$», atenuado.
  - Mientras está ocupada con una oferta, no acepta otro pago.
- **Qué sale:** se sortea al pagar.
  - 10 % nada; 20 % un arma especial (láser, katana o lanzallamas); 70 % un arma básica (pistola, SMG o escopeta).
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
