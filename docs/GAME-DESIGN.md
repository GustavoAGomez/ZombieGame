# Diseño del juego

Registro vivo de las **reglas del juego tal como están implementadas**: qué hay, cuánto cuesta y cómo funciona. No describe el código; para eso están las specs (`docs/specs/`) y `docs/DECISIONS.md`.

**Mantenlo al día:** cada vez que cambie una regla, un precio o un número de juego, o se añada un arma, un mago, un objeto o una activación, actualiza este documento en el mismo commit. Los números salen de `src/config/` (`balance.ts`, `weapons.ts`, `merchants.ts`, `items.ts`, `activations.ts`) y del plano del mapa (`maps/src/mansion.txt`).

## Armas

- **Categorías:**
  - `basic`: se compran en las vitrinas de armas.
  - `special`: las armas que lleguen más adelante, con menos niveles de mejora o ninguno.

  Hoy las tres armas son básicas.
- **Cada arma tiene sus propias mejoras:** cuántos niveles admite de cada tipo de mejora (munición, cadencia y daño), que vende el mago rojo y que el jugador elige; y, si la tiene, una mejora especial única que vende el mago dorado. Nada supone que haya tres niveles: un arma especial futura podrá admitir menos tipos o menos niveles.
- **Inventario de armas:** se empieza solo con la pistola y se llevan como mucho **3 armas**, una por hueco de la columna de armas. Tocar un hueco cambia de arma en 0,4 s.

| Arma | Daño por bala | Cadencia | Cargador | Reserva | Recarga | Alcance | Notas |
|---|---|---|---|---|---|---|---|
| Pistola | 1 | 4 disparos/s | 8 | 64 | 1,6 s | 340 px | La de inicio |
| SMG | 1 | 11 disparos/s | 30 | 120 | 2,2 s | 300 px | Dispersión de 6° |
| Escopeta de caza | 0,9 por perdigón | 1,4 disparos/s | 2 | 24 | 1,8 s | 150 px | 6 perdigones en un cono de 22°; daño completo hasta 60 px y luego baja hasta el 40 %; cada impacto empuja al zombi 3 px |

El daño se cuenta en las mismas unidades que la vida de los zombis: una bala de pistola o de SMG quita 1.

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
| Golpe de cuchillo que acierta | +10 |
| Baja (se suma a lo del golpe que la causa) | +50 |
| Tablón reparado (como mucho 500 por ronda; después se repara sin ganar nada) | +10 |

- **Precios vigentes:**

| Compra | Precio |
|---|---|
| Salas (el mismo precio por cualquiera de sus puertas o escaleras principales) | Salón y comedor 750$; biblioteca y cocina 1000$; garaje y calle 1250$; jardín 1500$; sótano 1750$; azotea 2000$ |
| Vitrinas | SMG 1000$, escopeta 1500$; su munición, a mitad de precio |
| Magos | Munición máxima 750$, mejora de la ronda 1000$, mejoras del rojo 1500$ / 3000$ / 5000$ por nivel, mejora especial 10000$ |

## Salas

- **Se desbloquean salas, no puertas.** Junto a una puerta cerrada, el botón de acción ofrece la sala del otro lado: «DESBLOQUEAR COCINA · 1000$». Cada sala tiene un solo precio, el mismo por cualquiera de sus puertas.
- **Al desbloquear una sala, se abren todas las puertas entre ella y las salas ya desbloqueadas:** se puede llegar a ella desde cualquier sala abierta. Las puertas hacia salas aún cerradas siguen cerradas: son las que las venden. Desbloquear una sala nunca abre gratis la siguiente.
- **Portales:**
  - Las escaleras principales (cocina–sótano, jardín–azotea) venden la sala del otro extremo, a su precio.
  - Las entradas secundarias (la trampilla jardín–sótano y la escalera de mano calle–azotea) no se compran: se abren solas cuando sus dos salas están desbloqueadas. Mientras, dicen «BLOQUEADA».
- Al desbloquear una sala se activan sus spawns de zombis.

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
