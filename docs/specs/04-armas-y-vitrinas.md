# Spec 04 · Armas básicas, vitrinas y mejoras por arma

**Objetivo:**
1. El jugador empieza **solo con la pistola**.
2. Las demás armas básicas se compran en **vitrinas** repartidas por el mapa.
3. Se añade la **escopeta de caza**.
4. Cada arma define **sus propias mejoras** de mago, en lugar de una tabla común.

**Convenciones:**
- Los precios son en **dinero ($)**, no en puntos. Usa el sistema de dinero que ya existe.
- Todos los números van en `balance.ts` o `weapons.ts`. Los textos, en `strings.ts`.
- Arte: placeholders.

---

## 1. Catálogo de armas (`src/config/weapons.ts`)

Todas las armas se definen por datos, con esta forma:

- `id`, `name`
- `category`: `basic` o `special`
- estadísticas base
- `upgrades`: lista **ordenada** de 0 a 3 niveles, **propia de cada arma** (la vende el mago rojo)
- `special`: mejora única opcional (la vende el mago dorado)

**Reglas:**

- **Armas básicas** (`basic`): se compran en vitrinas. Tienen 3 niveles de mejora y una mejora especial.
- **Armas especiales** (`special`): llegarán más adelante. Pueden tener menos niveles, o **ninguno y solo la mejora del mago dorado**. El sistema no debe suponer que toda arma tiene 3 niveles.
- **Mago rojo:** vende el siguiente nivel de la lista del arma equipada. Si el arma no tiene más niveles, el artículo sale deshabilitado con `NIVEL MÁXIMO`, o con `NO MEJORABLE` si su lista está vacía.
- **Mago dorado:** vende la `special` del arma elegida. Deshabilitado si el arma ya la tiene, o si no tiene ninguna definida (`SIN MEJORA ESPECIAL`).
- Los efectos de los niveles se acumulan y se multiplican con las mejoras temporales del mago azul, igual que hasta ahora.

### Tipos de efecto de mejora

Cada nivel es un efecto de esta lista, para poder combinarlos libremente por arma:

| Efecto | Descripción |
|---|---|
| `ammo_x2` | Cargador y reserva máximos ×2. Al aplicarlo, el arma se rellena hasta el nuevo máximo. |
| `fire_rate` | Cadencia ×1,5 (y recarga ×1,5 más rápida en armas de recarga lenta, si se indica). |
| `damage_x2` | Daño ×2 |

### Armas básicas

| | Pistola | SMG | Escopeta de caza |
|---|---|---|---|
| Cómo se consigue | Arma inicial | Vitrina, $1000 | Vitrina, $1500 |
| Nivel 1 | `ammo_x2` | `ammo_x2` | `ammo_x2` |
| Nivel 2 | `fire_rate` | `fire_rate` | `fire_rate` |
| Nivel 3 | `damage_x2` | `damage_x2` | `damage_x2` |
| Especial (dorado) | 3 proyectiles en abanico por 1 bala | Cada bala impacta hasta 3 enemigos | **Daño de fuego** (ver detalle más abajo) |

Las estadísticas de la pistola y la SMG no cambian.

### Escopeta de caza (nueva)

| Parámetro | Valor |
|---|---|
| Proyectiles por disparo | 6 perdigones, que gastan 1 cartucho |
| Daño | 18 por perdigón |
| Apertura | 22° en total, repartidos con una pequeña variación aleatoria |
| Cadencia | 1,4 disparos/s |
| Cargador / reserva inicial | 2 / 24 |
| Recarga | 1,8 s |
| Alcance | 150 px |
| Caída de daño | Daño completo hasta 60 px; baja de forma lineal hasta el 40 % en el alcance máximo |
| Velocidad del perdigón | 520 px/s |
| Empuje | Cada perdigón que impacta empuja al zombie 3 px |

- Cada perdigón da los puntos de impacto habituales.
- Fogonazo un 60 % más grande que el de la pistola y retroceso de 2 px.
- Usa las animaciones `shoot` y `walk_aim` del jugador que ya existen.

### Mejora especial de la escopeta: daño de fuego

- Cada perdigón que impacta **prende al zombie**.
- **Daño de la quemadura:** el 40 % del daño del perdigón (`fireDamageFactor`), repartido en ticks cada 0,15 s (`fireTickInterval`) durante 1,5 s (`fireDuration`).
- **Varios perdigones sobre el mismo zombie:** no se apilan quemaduras. Cada impacto nuevo **reinicia la duración** y la quemadura usa el mayor daño por tick de los recibidos.
- El daño de fuego se calcula sobre el daño final del perdigón, así que le afectan el nivel 3 del arma, la mejora temporal de doble daño y la caída por distancia.
- Los ticks de fuego no dan puntos de impacto; si el zombie muere quemado, da los puntos de baja normales.
- Un zombie en llamas sigue comportándose igual. Puede pasar a crawler por un tick de fuego.
- **Feedback:** el zombie se tiñe de naranja y suelta partículas de llama mientras arde; los perdigones se tiñen de naranja.
- Deja el fuego como un efecto reutilizable (`burn`), porque lo usarán otras armas más adelante.

## 2. Inventario del jugador

- **Empieza solo con la pistola.** Quita la SMG del equipamiento inicial.
- **3 huecos de arma**, como ya está implementado (`weaponSlots` en `balance.ts`).
- **Botón de cambiar arma:** con una sola arma aparece atenuado y no hace nada. Con dos o tres, rota entre ellas en orden.
- **Al comprar un arma nueva:**
  - Con un hueco libre, se añade y se equipa.
  - Con los tres huecos llenos, **sustituye al arma equipada** en ese momento.
- **Las mejoras pertenecen al arma.** Si se sustituye un arma, se pierden sus niveles y su mejora especial. Antes de sustituir un arma mejorada, el chip pide confirmación: `CAMBIAR [ARMA] ★★ POR [NUEVA]`.

## 3. Vitrinas de armas básicas

Son muebles fijos del mapa que venden un arma básica.

### Objeto de Tiled

`weapon_case` (rectángulo de 1 tile), con estas propiedades:

| Propiedad | Tipo | Descripción |
|---|---|---|
| `weapon` | string | id del arma |
| `cost` | int | Precio en $ |
| `facing` | string | `south`, `east` o `west`. **Nunca `north`**: el frente tiene que verse desde la cámara. |
| `zone` | string | Zona a la que pertenece |

Documenta el objeto en `docs/ASSETS.md`.

### Comportamiento

- **Colisión:** sólida para jugador y zombies. Bloquea las balas.
- **Interacción solo por el frente:** a menos de 40 px del lado al que mira, el chip contextual muestra `COMPRAR SMG · $1000`.
- **Dinero insuficiente:** chip atenuado con `FALTAN $X`.
- **Si ya tienes el arma:** la vitrina vende su munición, `MUNICIÓN SMG · $500` (la mitad del precio del arma, `caseAmmoPriceFactor`). Deshabilitado si la munición está completa.
- **Al comprar:** se resta el dinero, texto flotante `-$1000`, vibración media y se equipa el arma.
- Solo funcionan si su zona está desbloqueada.
- Las vitrinas no se agotan.

### Placeholder

- Mueble de 28×18 px en marrón oscuro, con un cristal azulado y la silueta del arma dentro.
- Encima, el precio en ámbar, visible solo cuando el jugador está a menos de 96 px.

### Colocación en el mapa actual

Usa la skill `level-design` y revisa la vista previa.

| Vitrina | Dónde | Orientación | Precio |
|---|---|---|---|
| SMG | **Salón (5)**: en el centro de la habitación, justo delante (al sur) del mueble central | `south` | $1000 |
| Escopeta | **Comedor (6)**: arriba del todo, pegada a la pared norte | `south` | $1500 |

Comprueba que ninguna de las dos deja un paso de menos de 2 tiles ni queda a menos de 3 tiles de una ventana, puerta o `merchant_spot`. Si la posición exacta no cumple, muévela lo mínimo y dime dónde ha quedado.

## 4. Documentación de diseño

Crea `docs/GAME-DESIGN.md` como registro vivo de las reglas del juego (no del código), y enlázalo desde `CLAUDE.md`. Debe incluir como mínimo:

- **Armas:** categorías `basic` y `special`, y la regla de que **cada arma tiene sus propias mejoras**.
- **Tabla de mejoras por arma**, que se actualiza cada vez que se añada un arma.
- **Vitrinas de armas básicas:** qué son, cómo se compra en ellas, la regla de orientación y la lista de vitrinas del mapa con su precio.
- **Magos:** qué vende cada uno y su relación con las mejoras de arma.
- **Economía:** diferencia entre puntos y dinero, y precios vigentes.

## 5. Debug y tests

- **Debug:** `DAR SMG`, `DAR ESCOPETA`, `+$5000`.
- **Tests:**
  - Compra con hueco libre y con los tres huecos llenos.
  - Pérdida de mejoras al sustituir un arma.
  - Compra de munición en la vitrina de un arma que ya tienes.
  - Interacción solo por el frente.
  - Niveles por arma: cada arma lee sus niveles de su propia lista (prueba con un arma ficticia cuyo nivel 1 sea `damage_x2`).
  - Arma con lista de mejoras vacía y arma sin `special`.
  - Escopeta: 6 perdigones por cartucho, apertura y caída de daño.
  - Fuego: daño total del 40 %, ticks cada 0,15 s, reinicio de la duración sin apilarse, y sin puntos por tick.

## 6. Fases

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **A1** | Refactor a `weapons.ts`: mejoras por arma, categorías, magos rojo y dorado adaptados. | El comportamiento de la pistola y la SMG no cambia. Los tests de la spec 03 siguen pasando. |
| **A2** | Escopeta de caza y efecto `burn`. | Se puede probar desde el debug, con sus niveles de mejora y la especial de fuego. |
| **A3** | Inventario: inicio con pistola, 3 huecos, sustitución con confirmación. | El botón de cambio de arma se comporta bien con 1, 2 y 3 armas. |
| **A4** | Vitrinas: objeto de Tiled, compra, munición, placeholder y colocación en el mapa. | Se compran la SMG en el salón y la escopeta en el comedor. **⏸ Detente** para que lo pruebe. |
| **A5** | `docs/GAME-DESIGN.md`. | El documento refleja lo implementado. |