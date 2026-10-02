# Spec 05 · Objetos especiales e invocación del mago rojo

**Objetivo:**
1. Añadir **objetos especiales**: se recogen del mapa, se guardan en un inventario visible en el HUD y se usan con un toque en lugares concretos para activar cosas.
2. Usarlos para la primera activación: **invocar al mago rojo** tirando dos objetos a la piscina.

El sistema tiene que servir para más objetos y más activaciones en el futuro, así que todo va por datos.

**Convenciones:** números en `balance.ts`, textos en `strings.ts`, arte con placeholders y apuntado en `docs/ASSETS-TODO.md`. Se mantienen las reglas de `CLAUDE.md` (lógica separada del render, entrada → `InputCommand`, juego → HUD por eventos).

---

## 1. Catálogo de objetos (`src/config/items.ts`)

Cada objeto especial se define por datos: `id`, color del placeholder y cómo se consigue.

| id | Nombre | Cómo se consigue |
|---|---|---|
| `living_heart` | Corazón vivo | **Provisional:** el jugador lo lleva desde el inicio de la partida (`startingItems`). Más adelante se conseguirá de otra forma. |
| `worn_wand` | Varita desgastada | Aparece al empezar la partida en un punto de objeto al azar (sección 2). |

- Los nombres visibles van en `STRINGS.items`.
- Un objeto es único: no se apila ni hay dos iguales en la partida.

## 2. Puntos de objeto en el mapa

Siguen el mismo patrón que los puntos de mago.

- **Nuevo objeto de Tiled:** `item_spot` (punto), con la propiedad `zone`. Documéntalo en `docs/ASSETS.md`.
- **En el plano ASCII:** una tabla `## Objetos`, sin carácter propio. La casilla conserva su suelo.
- **Cantidad:** 1 o 2 por zona, incluidos el sótano y la azotea. Usa la skill `level-design` y revisa la vista previa.
- **Reglas de colocación** (añádelas a `validate-map`):
  - Casilla transitable y alcanzable a pie desde su zona.
  - A 2 tiles o más de barricadas, puertas, portales, spawns, puntos de mago y vitrinas.
  - Nunca sobre agua ni vacío, ni tapado por atrezo.
  - Un sitio creíble: sobre una mesa baja, junto a un mueble, en un rincón. No en mitad de un pasillo.

### Aparición de la varita

- Al empezar la partida se sortea, con el RNG de la partida, un `item_spot` de **cualquier zona menos la inicial**.
- La varita se queda ahí hasta que alguien la recoge. No desaparece ni cambia de sitio entre rondas.
- Las reglas de aparición van por datos en `items.ts` (`spawn: { when: 'match_start', excludeStartZone: true }`), para que otros objetos puedan usar otras.

## 3. Objetos en el suelo

- **Placeholder:** icono de 12×12 del color del objeto, con un brillo que late (período de 1,2 s) y una sombra pequeña debajo, para que se vea sobre cualquier suelo. Corazón: rojo `#c93a2b`. Varita: madera `#8a6a3f` con la punta clara.
- **Recogida con el botón de acción:** a menos de `ITEMS.pickupRange` (32 px) aparece `RECOGER VARITA DESGASTADA`. Un toque la recoge.
- **Al recoger:** el objeto entra en el inventario, vibración ligera y aviso breve en el HUD, `VARITA DESGASTADA`, durante 1,5 s.
- Un objeto en una zona bloqueada o a oscuras se ve igual que el resto del atrezo de esa zona. No hay flecha ni indicador hacia él: hay que encontrarlo.
- Prioridad del botón de acción cuando coinciden varias: reparar ventana, puerta o portal, mago, vitrina y, por último, recoger objeto. Los puntos de objeto guardan distancia con todo eso, así que no deberían coincidir.

## 4. Inventario en el HUD

- **Posición:** una fila de huecos **a la derecha de la barra de vida**, en la parte superior izquierda de la pantalla, alineada con ella.
- **Huecos:** `ITEMS.maxSlots` (4). Solo se dibujan los ocupados; con el inventario vacío no se ve nada.
- **Cada hueco:** el icono del objeto dentro de un marco pequeño del estilo del HUD. El dibujo puede ser pequeño, pero el **área de toque mide al menos 44 px**, con margen, como en el resto de botones.
- **No debe solaparse** con el botón de pausa, que está arriba en el centro, ni con la fila de la ronda y el arma. Compruébalo en las tres pantallas de prueba.
- **Orden:** el de recogida. Al usar un objeto, los demás se recolocan.

## 5. Usar un objeto

- **Un toque en un hueco** intenta usar ese objeto. El toque viaja como comando (`InputCommand.useItem`, con el índice del hueco), no como lógica en el handler.
- **Si el objeto se puede usar ahí:** se ejecuta su activación (sección 6) y el objeto **se consume** y desaparece del inventario.
- **Si no se puede usar:**
  - Aparece el mensaje `AQUÍ NO SE USA` sobre el jugador, durante 1,2 s.
  - El hueco tiembla y hay una vibración ligera.
  - El objeto no se pierde.
  - Si se toca varias veces seguidas, el mensaje se reinicia, no se apila.
- Los objetos se pueden usar en cualquier momento de la partida, también durante una ronda.

## 6. Activaciones (`src/config/activations.ts`)

Una activación es un lugar del mapa que acepta ciertos objetos y hace algo cuando se completa. Se define por datos:

- `id`
- `site`: el lugar del mapa donde se usa
- `requires`: lista de objetos que acepta
- `order`: `any` (cualquier orden) o `fixed`
- `effect`: lo que ocurre al completarse

**Regla general:** un objeto se puede usar si el jugador está dentro del alcance de un `site` que acepta ese objeto y todavía no lo ha recibido.

### Lugares de activación

- **Nuevo objeto de Tiled:** `activation_site` (rectángulo), con las propiedades `id` y `zone`. En el plano ASCII, tabla `## Activaciones`.
- El jugador está "en el lugar" si su hitbox está a menos de `ITEMS.useRange` (40 px) del borde del rectángulo.

### Activación 1: invocar al mago rojo

| Campo | Valor |
|---|---|
| `id` | `summon_red_merchant` |
| `site` | `pool`: el rectángulo del agua de la piscina del jardín |
| `requires` | `living_heart` y `worn_wand` |
| `order` | `any` |
| `effect` | Activa al mago rojo |

**Funcionamiento:**

1. Junto a la piscina, un toque en el corazón o en la varita lo **tira al agua**. El objeto vuela en arco desde el jugador hasta el punto del agua más cercano y cae con una salpicadura (0,4 s).
2. **La piscina recuerda lo que ha recibido.** Los dos objetos se pueden tirar por separado, en cualquier orden y en momentos distintos de la partida.
3. **Con solo uno dentro:** el agua cambia de aspecto para avisar de que algo ha empezado. Pasa a un tinte rojizo tenue con burbujas lentas, y así se queda.
4. **Al tirar el segundo:**
   - El agua burbujea con fuerza y se vuelve roja durante 1,5 s.
   - Aviso en el HUD: `EL MAGO ROJO HA SIDO INVOCADO`, en el color del mago, 2,5 s.
   - Vibración fuerte.
   - **El mago rojo sale de la piscina al momento:** aparece con su humo en el `merchant_spot` del jardín más cercano a la piscina. Si ese punto lo ocupa otro mago, en el siguiente más cercano.
5. **Desde la ronda siguiente** se comporta como el azul: se teletransporta al empezar cada ronda a otra zona desbloqueada, con las reglas de la spec 03 (dos magos no comparten zona si hay alternativa).
6. Después de la invocación, el agua vuelve a su aspecto normal y la activación queda cerrada: no acepta más objetos.

**El mago rojo:**

- En `merchants.ts`, sustituye `enabled: false` y `firstRound` por una regla de aparición por datos: `appears: { by: 'activation', id: 'summon_red_merchant' }`. El azul queda como `appears: { by: 'round', round: 2 }`.
- Su tienda es la de la spec 04: `Mejorar arma actual`, 3000$, una compra por visita. No cambia.
- Sigue con el placeholder de rectángulo y rombo hasta que tenga arte.
- El dorado sigue sin regla de aparición.
- El botón de debug `ROJO/DORADO` sigue funcionando y se salta el ritual.

## 7. Partida y casos límite

- **La piscina está en el jardín,** que empieza bloqueado. Para completar el ritual hay que abrir antes la puerta al jardín. No hay atajo.
- **Si el jugador muere,** la partida termina igual que ahora. No hay nada que conservar.
- **Pausa:** congela los efectos del agua y los mensajes.
- **Futuro multijugador:** el inventario es de cada jugador, y el estado de las activaciones es de la partida. Guárdalos así en `GameState` desde ahora.

## 8. Debug y tests

- **Debug:** `DAR OBJETOS` (da los dos), `IR A LA VARITA` (teletransporta al jugador junto a ella) y `MOSTRAR PUNTOS DE OBJETO`.
- **Tests:**
  - Sorteo del punto de la varita: nunca en la zona inicial, repetible con la misma semilla.
  - Recogida: alcance, entrada en el inventario y límite de huecos.
  - Uso fuera de un lugar válido: mensaje, y el objeto no se pierde.
  - Uso en la piscina: se consume, la piscina lo recuerda, y no acepta dos veces el mismo objeto.
  - Los dos órdenes posibles invocan al mago.
  - El mago rojo no aparece por ronda, solo por la activación; después se teletransporta cada ronda.
  - Elección del punto de aparición junto a la piscina, también con el más cercano ocupado.
  - Una activación con `order: 'fixed'`, con datos ficticios, rechaza el objeto fuera de orden.
  - Validador del mapa: reglas de `item_spot` y existencia del `activation_site` que nombra cada activación.

## 9. Fases

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **O1** | `items.ts`, `item_spot` en el mapa y el validador, aparición de la varita, objeto en el suelo y recogida. | La varita aparece cada partida en una zona distinta de la inicial y se recoge con el botón de acción. |
| **O2** | Inventario en el HUD, corazón desde el inicio, uso con un toque y mensaje `AQUÍ NO SE USA`. | Los huecos se ven a la derecha de la vida sin solaparse con nada. Tocar un objeto lejos de la piscina muestra el mensaje y no lo gasta. |
| **O3** | `activations.ts`, `activation_site` de la piscina, tirar objetos, estados del agua e invocación del mago rojo. | Tirando los dos objetos, en cualquier orden, sale el mago rojo junto a la piscina y desde la ronda siguiente se teletransporta. **⏸ Detente** para que lo pruebe en el móvil. |
| **O4** | Debug, `ASSETS-TODO.md` (iconos de los dos objetos, salpicadura, burbujas) y actualización de `docs/GAME-DESIGN.md` si ya existe. | Todo documentado. |

Al cerrar cada fase, sigue el cierre de fase de `CLAUDE.md`.