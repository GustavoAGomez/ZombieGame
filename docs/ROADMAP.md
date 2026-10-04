# Hoja de ruta de diseño

Registro de **lo que queremos añadir al juego y por qué**, para desarrollarlo poco a poco. No describe lo ya implementado (eso está en `docs/GAME-DESIGN.md`) ni cómo se programa (eso va en las specs de `docs/specs/`).

**Cómo se usa:** cada bloque de la lista pasa a ser una spec cuando toque. Al cerrar una spec, marca su bloque como hecho aquí y traslada las reglas definitivas a `GAME-DESIGN.md`.

---

## 1. La idea de fondo

El juego toma como referencia el modo Zombies de Black Ops 1. Lo que lo hacía adictivo, y lo que queremos conservar:

1. **Decisiones constantes con el dinero:** cada impacto da dinero, y siempre hay que elegir entre gastar ahora o ahorrar.
2. **Objetivos a corto, medio y largo plazo en cada partida.** Siempre falta algo por conseguir.
3. **Una apuesta barata con premio gordo,** que además obliga a moverse por el mapa.
4. **Un primer objetivo claro** que desbloquea lo demás.
5. **Ventajas que te hacen más fuerte durante la partida** y que duele perder.
6. **Golpes de suerte en mitad del caos:** premios que sueltan los zombies.
7. **Secretos que no dan ventaja,** pero dan algo que buscar y que contar.
8. **Trucos de experto que nadie explica,** como dejar un zombie vivo para ganar tiempo. El crawler ya lo permite.

**Qué no copiar:** las mecánicas se pueden usar; los nombres y los elementos reconocibles del original, no. Nada de cajas con oso de peluche, nombres de máquinas de bebidas ni armas icónicas. La mano, los magos y los altares son nuestra identidad.

## 2. El arco de una partida

| Momento | Objetivo del jugador | Estado |
|---|---|---|
| Rondas 1–2 | Sobrevivir, reparar ventanas, abrir la primera sala | Hecho |
| Ronda 2 | Aparece el **mago azul**: munición y mejoras temporales | Hecho |
| Ronda 6 | Sale el primer boss, **el Matarife**; al morir suelta el corazón vivo | Hecho (spec 07) |
| Inicio–medio | Buscar la **Mano del Demonio** y probar suerte | Hecho (spec 06) |
| Medio | **Encender la caldera** del sótano: luz y altares | Pendiente |
| Medio | Ritual de la piscina: **mago rojo**, mejoras de arma | Hecho |
| Medio–largo | Comprar **ventajas permanentes** en los altares | Pendiente |
| Largo | Abrir el **portal de la chimenea**: mago dorado y mejora especial | Pendiente |
| Siempre | Secretos, récord de ronda y grimorio | Pendiente |

## 3. Lista de trabajo, por orden

### 3.1 La Mano del Demonio y las armas especiales — *spec 06, hecho*

Implementado. Las reglas definitivas están en `GAME-DESIGN.md` (*Mano del Demonio* y *Armas*). Cambios respecto a lo previsto: la mano da 10 % nada, 10 % especial y 80 % básica; la katana alcanza 102 px y se enfría 5 s entre barridos; el lanzallamas llega a 135 px.


- Una grieta con brasas en el suelo. Por 950$, una mano sale y ofrece un arma al azar.
- Da armas básicas y **armas especiales**, que solo se consiguen aquí: láser, katana y lanzallamas infernal.
- Tras varios usos se cansa, devuelve el pago y se muda a otra sala.
- **Pacto de sangre:** si no hay dinero, acepta vida.

### 3.2 Premios que sueltan los zombies

Sobre el sistema de recogida que ya existe para la munición y los botiquines. Deben ser raros.

| Premio | Efecto |
|---|---|
| Furia | Cualquier golpe mata, durante 20 s |
| Doble botín | Puntos y dinero ×2, durante 20 s |
| Purga | Mata a todos los zombies en pantalla |
| Tablones | Repara todas las ventanas |

Hay que revisar que no pisen lo que vende el mago azul (munición máxima y mejoras temporales).

### 3.3 Encender la caldera del sótano

- Es nuestro "encender la luz": el primer objetivo claro de la partida.
- La caldera está en el cuarto de calderas del sótano, que ya existe en el mapa.
- Al encenderla: se iluminan las salas que hoy están a oscuras y se activan los altares.
- Por decidir: si cuesta dinero, si necesita un objeto o si basta con llegar.

### 3.4 Altares de ventajas permanentes

- Fijos en salas concretas, para que cada sala tenga una razón para abrirse.
- Solo funcionan con la caldera encendida.
- Máximo de 3 ventajas a la vez.
- Ventajas previstas: más vida, recarga rápida y una segunda oportunidad al morir. Como la vida no se regenera, la de más vida será la más valiosa.
- Por decidir: precios, si se pierden al usar la segunda oportunidad y cuántos altares hay.

### 3.5 El portal de la chimenea y el mago dorado

- El mago dorado **no pasea por la casa**: vive en "el Umbral", una sala aparte como el sótano o la azotea.
- **El secreto:** tres fragmentos escondidos en puntos de objeto de salas distintas. Uno lo da el mago rojo, para que el orden azul → rojo → dorado salga solo.
- Los fragmentos se colocan en la **chimenea del salón** y se abre un portal. Es otra activación del sistema que ya existe.
- **El viaje:** gratis, dura 30 s. En el Umbral no entran zombies. Después devuelve al jugador al recibidor, y el portal se recarga en una ronda.
- El mago dorado vende la mejora especial de cada arma (10000$).

### 3.6 Secretos y grimorio

- **Secretos sin premio:** tres discos escondidos que activan una canción, y notas que cuentan qué pasó en la casa y quiénes son los magos.
- **Grimorio en el menú principal:** lista de secretos descubiertos, con huecos "???" para los que faltan, y el récord de ronda. Es lo que da motivos para volver entre partidas, que en móvil es clave.
- Necesita guardar datos entre partidas, cosa que el juego aún no hace.

### 3.7 Más adelante

- ~~**Rondas especiales** cada 5 o 6 rondas, con un enemigo distinto y un premio garantizado al terminar.~~ Hechas como el sistema de bosses (spec 07): el Matarife sale en las rondas 6, 12, 18, 24 y 30 con sus variantes, y luego el ciclo se repite más fuerte. Reglas en `GAME-DESIGN.md` (*Bosses*). Siguiente paso posible: más bosses, que se intercalan en el calendario cambiando solo los datos.
- **Trampas de pago:** por ejemplo, la alarma del coche del garaje como señuelo.
- **Más armas especiales** para la mano. Candidatas descartadas por ahora: ballesta señuelo y rayo encadenado.
- **Duración de la partida en móvil:** valorar guardar y continuar, o un ritmo más rápido.

## 4. Preguntas abiertas

- ~~¿Cómo se consigue el **corazón vivo**?~~ Resuelto (spec 07): lo suelta el primer boss que muere en la partida, así que el mago rojo llega desde la ronda 6.
- ¿El pacto de sangre de la mano debe ofrecerse también cuando sí hay dinero? (Hoy solo cuando falta dinero.)
- ¿Las armas especiales tendrán algún día niveles del mago rojo, o solo la mejora dorada?