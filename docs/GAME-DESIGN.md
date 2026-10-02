# Diseño del juego

Registro vivo de las **reglas del juego tal como están implementadas**: qué hay, cuánto cuesta y cómo funciona. No describe el código; para eso están las specs (`docs/specs/`) y `docs/DECISIONS.md`.

**Mantenlo al día:** cada vez que cambie una regla, un precio o un número de juego, o se añada un arma, un mago, un objeto o una activación, actualiza este documento en el mismo commit. Los números salen de `src/config/` (`balance.ts`, `weapons.ts`, `merchants.ts`, `items.ts`, `activations.ts`) y del plano del mapa (`maps/src/mansion.txt`).

## Armas

- **Categorías:**
  - `basic`: se compran en las vitrinas de armas.
  - `special`: las armas que lleguen más adelante, con menos niveles de mejora o ninguno.

  Hoy las tres armas son básicas.
- **Cada arma tiene sus propias mejoras:** una lista de niveles que vende el mago rojo y, si la tiene, una mejora especial única que vende el mago dorado. Nada supone que haya tres niveles.
- **Inventario de armas:** se empieza solo con la pistola y se llevan como mucho **3 armas**, una por hueco de la columna de armas. Tocar un hueco cambia de arma en 0,4 s.

| Arma | Daño por bala | Cadencia | Cargador | Reserva | Recarga | Alcance | Notas |
|---|---|---|---|---|---|---|---|
| Pistola | 1 | 4 disparos/s | 8 | 64 | 1,6 s | 340 px | La de inicio |
| SMG | 1 | 11 disparos/s | 30 | 120 | 2,2 s | 300 px | Dispersión de 6° |
| Escopeta de caza | 0,9 por perdigón | 1,4 disparos/s | 2 | 24 | 1,8 s | 150 px | 6 perdigones en un cono de 22°; daño completo hasta 60 px y luego baja hasta el 40 %; cada impacto empuja al zombi 3 px |

El daño se cuenta en las mismas unidades que la vida de los zombis: una bala de pistola o de SMG quita 1.

### Mejoras por arma

Un arma de nivel N tiene aplicados los N primeros efectos de su lista. Al comprar el nivel de munición, el arma se rellena hasta el nuevo máximo.

| Arma | Nivel 1 | Nivel 2 | Nivel 3 | Especial (mago dorado) |
|---|---|---|---|---|
| Pistola | Munición ×2 | Cadencia ×1,5 | Daño ×2 | **Abanico:** 3 balas por disparo, separadas 12°, por el gasto de una |
| SMG | Munición ×2 | Cadencia ×1,5 | Daño ×2 | **Perforante:** cada bala atraviesa hasta 3 zombis (las paredes la siguen parando) |
| Escopeta de caza | Munición ×2 | Cadencia ×1,5 (también acelera la recarga) | Daño ×2 | **Fuego:** cada perdigón que acierta prende al zombi, que arde 1,5 s y pierde en total el 40 % del daño del perdigón (no se acumula) |

- **Munición ×2:** cargador y reserva máxima ×2.
- **Cadencia ×1,5:** disparos por segundo ×1,5. La escopeta, con solo 2 cartuchos, recarga además 1,5 veces más rápido.
- **Daño ×2:** se multiplica con la mejora temporal de doble daño, hasta ×4.
- Las estrellas junto al nombre del arma en el HUD muestran su nivel; con la especial, el nombre se pone ámbar.

### Cuchillo

Botón propio, junto al disparo. Golpea en un cono delante del jugador.

## Vitrinas de armas básicas

- **Qué son:** muebles fijos del mapa que venden un arma básica.
- **Cómo se compra:** desde el frente de la vitrina, a menos de 40 px, con el botón de acción. El precio se ve sobre la vitrina al acercarse.
  - **Con un hueco libre:** se paga, el arma entra en el inventario y pasa a la mano.
  - **Si ya llevas esa arma:** vende su munición a **mitad de precio** (llena cargador y reserva). Con el arma llena no se puede comprar.
  - **Con los 3 huecos llenos:** el arma nueva sustituye a la que llevas en la mano. Si esa arma tiene mejoras o su especial, el botón pide confirmación («CAMBIAR PISTOLA ★★ POR SMG») y hace falta un segundo toque en menos de 3 s. Las mejoras se pierden con el arma.
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
| **Rojo** | Cuando se invoca en la piscina (ver *Objetos especiales*); desde la ronda siguiente se teletransporta como los demás | **Mejorar arma actual:** sube un nivel el arma en mano, según su propia lista. Una compra por visita. Al nivel máximo dice «NIVEL MÁXIMO» | 3000$ |
| **Dorado** | Todavía sin regla de aparición (solo con el panel de depuración) | **Mejora especial:** la especial de un arma que llevas, una fila por arma. Una vez comprada dice «YA TIENE ESPECIAL» | 10000$ |

**Relación con las mejoras de arma:** el rojo vende los niveles de la lista de cada arma; el dorado, su especial. Las mejoras pertenecen al arma: si la cambias en una vitrina, se pierden.

## Economía

- **Puntos y dinero:** cada ganancia suma lo mismo a los dos.
  - Los **puntos** solo suben: son la puntuación de la partida.
  - El **dinero** ($) es lo que se gasta: puertas, portales, vitrinas y magos.
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
| Puertas de la mansión | De 750$ a 1500$: recibidor–salón y recibidor–comedor 750$; salón–biblioteca y comedor–cocina 1000$; biblioteca–cocina, cocina–garaje y garaje–calle 1250$; recibidor–calle, cocina–jardín y biblioteca–jardín 1500$ |
| Portales (se abren los dos extremos a la vez) | Cocina–sótano 1750$; jardín–azotea 2000$. Entradas secundarias (solo se pueden comprar cuando sus dos zonas ya están abiertas; mientras, dicen «BLOQUEADA»): jardín–sótano 1000$; calle–azotea 1250$ |
| Vitrinas | SMG 1000$, escopeta 1500$; su munición, a mitad de precio |
| Magos | Munición máxima 750$, mejora de la ronda 1000$, mejorar arma 3000$, mejora especial 10000$ |

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
