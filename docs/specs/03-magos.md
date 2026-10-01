# Spec 03 · Magos vendedores y mejoras

**Objetivo:** añadir magos vendedores con gabardina que se mueven por la casa cada ronda y venden munición, mejoras temporales y mejoras de arma.

**Alcance de esta spec:**
- **Mago azul:** completo.
- **Sistema de mejoras de arma** (niveles 1 a 3 y mejora especial): completo, con botones de debug para probarlo.
- **Magos rojo y dorado:** definidos en la configuración pero desactivados. Se activarán más adelante con su regla de aparición.

**Arte:** placeholders, sin diseño final.

**Convenciones:**
- Todos los números van en `src/config/balance.ts`.
- Todos los textos van en `src/ui/strings.ts`.
- Se mantiene la separación lógica/render y entrada → `InputCommand` de `CLAUDE.md`.

---

## 1. Puntos de aparición en el mapa

1. **Nuevo tipo de objeto en Tiled:** `merchant_spot` (punto), con la propiedad `zone` (string). Documéntalo en `docs/ASSETS.md`.
2. **Añádelos al mapa actual:** 1 o 2 por zona, incluidas las islas (sótano, azotea). Deben cumplir estas reglas:
   - Pegados a una pared o en un rincón.
   - Sin estrechar ningún paso a menos de 2 tiles.
   - A más de 3 tiles de ventanas, puertas, portales y spawns.
   - Revisa la posición con la vista previa de la skill `level-design`.
3. **`MapLoader`** los lee y los agrupa por zona.

## 2. Entidad mago (común a los tres)

- **Configuración** en `src/config/merchants.ts`, una entrada por mago:
  - `id`: `blue`, `red` o `gold`
  - `color`
  - `enabled`
  - `firstRound`
  - catálogo de artículos
  - `maxPurchasesPerVisit` (opcional)

  Azul: `enabled: true`, `firstRound: 2`. Rojo y dorado: `enabled: false`.
- **Comportamiento en partida:**
  - Es invulnerable y los zombies lo ignoran (no lo atacan ni lo usan como objetivo).
  - Las balas lo atraviesan.
  - Tiene una colisión sólida circular de radio 8 px, así que el jugador no lo atraviesa.
- **Aparición:**
  - La primera vez aparece en un `merchant_spot` de la **zona inicial del jugador**, al empezar su `firstRound`.
  - **Al empezar cada ronda siguiente** se teletransporta a un `merchant_spot` aleatorio de **otra zona desbloqueada**, distinta de la actual. Si solo hay una zona desbloqueada, cambia a otro spot de la misma zona; si no hay otro, se queda donde está.
  - Dos magos nunca comparten zona si hay alternativa.
- **Efecto al teletransportarse:** puf de humo del color del mago, 300 ms, y aviso en el HUD `EL MAGO AZUL SE HA MOVIDO`, que dura 2 s.
- **Indicador fuera de pantalla:** si el mago no se ve en pantalla, aparece una flecha pequeña de su color en el borde, apuntando hacia él. Se puede desactivar en `balance.ts`.
- **Placeholder:**
  - Rectángulo de 14×20 px del color del mago, con contorno de 1 px más oscuro.
  - Encima, un rombo de 6 px del mismo color que flota (oscila 2 px, período de 1,2 s).
  - Colores: azul `#3a6fd8`, rojo `#c93a2b` (`--red`), dorado `#e8b04a` (`--amber`).

## 3. Tienda (panel)

- **Acceso:** a menos de 40 px de un mago, el chip contextual muestra `MAGO AZUL` (o el del color correspondiente). Al tocarlo se abre el **panel de tienda**.
- **El juego sigue corriendo** con el panel abierto. El panel va centrado en la mitad superior, justo debajo de los bloques superiores del HUD, y no tapa el joystick, el botón de disparo ni sus botones (HUD al estilo Wild Rift, spec 01 §2). Ambos controles siguen funcionando.
- **Cierre:** con el botón `X` (44×44) o automáticamente si el jugador se aleja más de 64 px.
- **Contenido:** una fila por artículo con icono provisional del color del mago, nombre, descripción corta, precio y botón `COMPRAR`.
- **Estados del botón:**
  - Puntos insuficientes: atenuado, con el texto `FALTAN X`. Al tocarlo tiembla.
  - No aplicable: deshabilitado, con el motivo (`MUNICIÓN COMPLETA`, `NIVEL MÁXIMO`, `YA TIENE ESPECIAL`).
- **Al comprar:**
  - Se restan los puntos y aparece el texto flotante `-750` en rojo bajo el marcador.
  - Vibración media.
  - Se aplica el efecto.
  - Si se ha alcanzado `maxPurchasesPerVisit`, el resto de artículos muestran `VUELVE EN OTRA RONDA`.
- **Estilo:** HUD de la propuesta A (`--panel`, `--bone`, Silkscreen y Press Start 2P). Todos los objetivos táctiles miden al menos 44 px.

## 4. Mago azul

**Catálogo:**

| Artículo | Precio | Efecto |
|---|---|---|
| Munición máxima | 750 | Rellena el cargador y la reserva de **todas** las armas hasta su máximo actual, que tiene en cuenta la mejora de nivel 1. Deshabilitado si todo está lleno. |
| Mejora de la ronda | 1000 | Una sola mejora temporal, sorteada al azar en cada teletransporte entre `speed` y `double_damage` (sección 5). |

## 5. Mejoras temporales

- **Ranura única:**
  - Comprar una mejora la guarda en la ranura.
  - Si ya había otra, guardada o activa, **la anterior desaparece**: la guardada se descarta y la activa termina en el acto.
  - Una mejora guardada se conserva entre rondas hasta que se usa.
- **Botón en el HUD:**
  - Cuando hay una mejora guardada, aparece un botón de 56 px en el **arco de botones alrededor del disparo**, como una habilidad de Wild Rift: arriba a la izquierda del disparo, con el centro en `(-64, -60)` respecto al suyo, entre el cuchillo y recargar. No se solapa con ningún otro control ni con el panel de la tienda en las pantallas de prueba.
  - Lleva el icono provisional de la mejora (rayo para velocidad, `x2` para daño) y el borde azul.
  - Al tocarlo, la mejora se activa **durante 10 s**. El botón muestra la cuenta atrás como un anillo que se vacía, con los segundos en el centro, y desaparece al terminar.
  - El botón se activa con un toque y no interfiere con el arrastre del botón de disparo.
- **Efectos:**
  - `speed`: velocidad del jugador ×1,5.
  - `double_damage`: daño ×2 en todas las armas y en el golpe cuerpo a cuerpo.
- **Acumulación de multiplicadores:** se multiplican entre sí. Por ejemplo, `double_damage` con un arma de nivel 3 hace ×4.
- **Feedback mientras está activa:**
  - Velocidad: estela tenue del color de la mejora tras el jugador.
  - Doble daño: balas tintadas de azul claro.
- **Se pierden al morir.** La pausa congela la cuenta atrás.

## 6. Mejoras de arma (mecánica completa; los magos rojo y dorado, desactivados)

**Niveles por arma**, de 0 a 3, acumulativos:

| Nivel | Efecto |
|---|---|
| 1 | Cargador y reserva máximos ×2. Al subir de nivel, el arma se rellena hasta el nuevo máximo. |
| 2 | Cadencia ×1,5 |
| 3 | Daño ×2 |

**Mejora especial,** una por arma, independiente de los niveles:
- **Pistola:** cada disparo lanza 3 proyectiles en abanico (centro, −12° y +12°), con el daño completo cada uno y **1 bala de munición** por disparo.
- **SMG:** cada bala impacta **hasta 3 enemigos** antes de desaparecer. Las paredes la detienen igual.

**Catálogos (definidos en la configuración, con los magos desactivados):**
- **Rojo:** `Mejorar arma actual`, 3000, sube un nivel el arma equipada. Deshabilitado en nivel 3. `maxPurchasesPerVisit: 1`.
- **Dorado:** `Mejora especial`, 10000. El panel muestra una fila por arma que posees, para elegir cuál mejorar. Deshabilitado si el arma ya la tiene.

**HUD:**
- Junto al nombre del arma, una estrella pequeña por nivel (`★★`).
- Si el arma tiene la especial, su nombre se muestra en `--amber`.

**Balas:** tinte más claro desde el nivel 3 y dorado si el arma tiene la especial.

## 7. Debug (overlay existente)

Botones añadidos al overlay de debug:
- `+NIVEL ARMA`
- `ESPECIAL ARMA`
- `DAR MEJORA` (alterna entre velocidad y doble daño)
- `MOVER MAGOS`
- `ACTIVAR ROJO/DORADO` (solo en debug)
- `+10000 PTS`

## 8. Tests (Vitest)

- Selección de spot: siempre en otra zona desbloqueada; sin repetir zona entre magos; casos con una sola zona o un solo spot.
- Sorteo de la mejora de la ronda con semilla.
- Ranura de mejora: guardar, reemplazar una guardada, reemplazar una activa, cuenta atrás y pausa.
- Mejoras de arma: capacidades, cadencia, daño y su acumulación con `double_damage`.
- Abanico de la pistola: 3 proyectiles por 1 bala.
- Perforación de la SMG: hasta 3 impactos y se detiene en paredes.
- Precios y estados de la tienda: puntos insuficientes, no aplicable y límite por visita.

## 9. Fases

| Fase | Contenido | Criterio de aceptación |
|---|---|---|
| **M1** | `merchant_spot` en el mapa y `MapLoader`. Entidad mago, `merchants.ts`, aparición, teletransporte por ronda e indicador fuera de pantalla. | El mago azul aparece en la ronda 2 en la zona inicial y cambia de zona cada ronda, solo a zonas desbloqueadas. |
| **M2** | Panel de tienda y compra de munición máxima. | Se puede comprar con el juego en marcha y sin perder los controles. Los estados del botón funcionan. |
| **M3** | Mejoras temporales: ranura, botón del HUD, efectos y feedback. | Las mejoras duran 10 s, se reemplazan correctamente y se conservan entre rondas. **⏸ Detente** para que lo pruebe en iPhone y Android. |
| **M4** | Sistema de mejoras de arma (niveles y especiales), HUD de estrellas, tintes y botones de debug. | Todo se puede probar desde el debug. Los magos rojo y dorado existen en la configuración, pero no aparecen en partida normal. |

Al cerrar cada fase, sigue el cierre de fase de `CLAUDE.md`.