---
name: level-design
description: Diseñar, rehacer o decorar mapas del juego (.tmj de Tiled) para que parezcan lugares reales y no rejillas. Úsala siempre que crees o modifiques un mapa, una zona o su decoración.
---

# Level design realista para el juego

Un mapa parece real cuando se nota que **alguien vivió allí** y que **se construyó con una lógica**, no cuando está bien alineado. Esta skill define cómo diseñar, construir y revisar mapas. Sigue el flujo en orden y no te saltes la revisión con imagen.

## 1. Flujo de trabajo (obligatorio)

1. **Plano ASCII primero.** Diseña el mapa como texto en `maps/src/<mapa>.txt`, un carácter por tile, con la leyenda de la sección 7. Es mucho más fácil razonar sobre la forma así que con coordenadas. Enséñame el plano antes de seguir.
2. **Compilar.** `npm run map:build <mapa>` convierte el ASCII en `.tmj`: elige el caso del autotile de paredes por la máscara de vecinos (esquinas, uniones en T, remates), pinta las transiciones Wang por vértices (sección 3) y coloca los objetos de juego según los marcadores. Si el script no existe, créalo. Con arte nuevo de PixelLab, antes `npm run tiles:review` y mira sus hojas (sección 4).
3. **Vista previa.** `npm run map:preview <mapa>` renderiza el `.tmj` a PNG: el mapa completo a escala 1:4 y un recorte 1:1 por zona, en `maps/preview/`. **Abre las imágenes y míralas**; no des por bueno un mapa que no has visto.
4. **Autorrevisión** con la checklist de la sección 8, sobre las imágenes. Corrige y repite los pasos 2 a 4 hasta que la cumpla.
5. **Decoración zona por zona** (sección 5). Una zona por iteración, con su vista previa.
6. **Parada para mi retoque en Tiled.** El compilador nunca sobrescribe ediciones manuales: guarda el ASCII como fuente y, si el `.tmj` tiene cambios a mano, avisa en vez de pisarlos (o usa `--force`).

## 2. Arquitectura creíble

Parte de una tipología real: casa suburbana norteamericana de una planta con garaje adosado y patio trasero, o mansión de dos alas. Antes de dibujar, escribe el programa de la casa: qué habitaciones hay, para qué sirven y cuáles están junto a cuáles.

**Tamaños orientativos en tiles** (1 tile ≈ 0,6 m a escala del personaje). Varía siempre dentro del rango; nunca repitas el mismo tamaño en dos habitaciones contiguas.

| Espacio | Tamaño |
|---|---|
| Baño | 3×4 a 4×5 |
| Aseo, despensa, armario | 2×3 a 3×3 |
| Dormitorio | 5×6 a 7×8 |
| Cocina | 6×5 a 8×7 (puede ser abierta al comedor) |
| Salón | 8×7 a 12×10 |
| Pasillo | 2 a 3 de ancho, largo variable |
| Recibidor | 4×4 a 6×5 |
| Garaje doble | 9×8 a 11×9 |
| Lavadero | 3×4 a 4×5 |

**Reglas de distribución:**

- Un **pasillo** o recibidor organiza la casa. No todas las habitaciones se abren unas a otras en cadena.
- **Formas no rectangulares:** al menos un 30 % de las habitaciones en L, con un entrante, una columna o una chimenea que rompa el rectángulo.
- **Espacios abiertos:** salón, comedor y cocina pueden compartir espacio sin pared. Se separan por el cambio de suelo, un medio muro de 2 a 3 tiles o una barra de cocina.
- **Puertas descentradas:** pegadas a una esquina (1 o 2 tiles del borde), como en las casas reales. Nunca en el centro exacto de una pared, y nunca alineadas en fila de una habitación a otra.
- **Ventanas donde tienen sentido:** en fachadas exteriores, repartidas de forma irregular. Las habitaciones grandes tienen más ventanas y los baños una pequeña.
- **Fachada con relieve:** porche, entrantes y salientes. La planta exterior nunca es un rectángulo perfecto.
- **Lógica de uso:** la cocina da al jardín, el garaje a la calle, el baño está cerca de los dormitorios, el lavadero entre la cocina y el garaje y la escalera del sótano en un espacio de servicio.

## 3. Exterior natural

- **Calle:** acera a ambos lados, bordillo, el camino de entrada de hormigón desde la calzada hasta el garaje, el sendero hasta el porche y franjas de césped entre acera y calzada. Las parcelas vecinas se insinúan con sus vallas en el borde del mapa.
- **Jardín:** los bordes entre césped y patio son irregulares, con la opción *meander* de las transiciones Wang. Hay zonas de tierra donde se pisa más, setos o arbustos que forman muros naturales y rutas en curva alrededor de la piscina.
- **Nada de rectángulos perfectos en el exterior:** ninguna zona de césped, tierra o grava es un rectángulo exacto. Deforma sus bordes con ruido.

### Pares de terrenos (mandan sobre el dibujo del plano)

- El terreno se define **por vértices**, no por tiles: hay un mapa de (ancho+1)×(alto+1) vértices, cada vértice toma su terreno de las 4 casillas que lo rodean y cada tile se elige por sus 4 esquinas.
- Solo hay transición entre estos pares, porque son los únicos con tileset Wang:
  - acera ↔ asfalto (`tileset_street`, el bordillo);
  - cubierta ↔ agua (`tileset_pool`, el muro de la piscina);
  - patio ↔ césped (`tileset_garden`);
  - acera ↔ césped, con `tileset_garden` (la acera hace de patio);
  - cubierta ↔ césped, con `tileset_garden` (la cubierta hace de patio: queda un borde de losas).
- **El asfalto nunca toca el césped**, ni en diagonal: calzada → bordillo → acera → césped.
- Cualquier otro par que se toque en un vértice (cubierta con patio, patio con acera, tres terrenos en un mismo vértice…) hace fallar al compilador, con el par y el vértice. Los caminos que llegan a la acera (porche, sendero, entrada de coches) son de acera; el patio queda para el jardín. Si el diseño lo pide, hace falta un tileset nuevo: apúntalo en `docs/ASSETS-TODO.md`.
- La tierra, los suelos interiores, las paredes, las vallas y el vacío no son terrenos Wang: no cuentan para los pares.

## 4. Perspectiva 3/4 de las paredes

Los kits Building de PixelLab **no están en una rejilla**: cada pieza es un recorte de distinto tamaño sobre fondo transparente. Nunca se cortan por rejilla. Se extraen por componentes conexos del canal alfa, se revisan en una hoja de contactos (`npm run tiles:review`, en `maps/preview/tiles/`) y con ellas se compone un autotile de 16 casos (máscara de vecinos N/E/S/O) en tiles de 32×32. Las reglas de la perspectiva:

- Una pared **horizontal** siempre muestra su **cara frontal hacia el sur**.
- Una pared con un **hueco al sur** (debajo no hay pared) muestra su cara; **las demás, solo el borde superior**. Un tramo vertical es una franja de borde superior y solo enseña cara en su extremo sur.
- El **espejo horizontal** siempre está permitido.
- **Rotar 90° o voltear en vertical, solo en piezas sin cara frontal**: bordes superiores de pared y suelos.
- Si falta una orientación, se compone: borde superior (de una pieza vertical, rotada si hace falta) + franja de cara frontal recortada de un tramo horizontal.
- Una pieza del kit que no cumple estas reglas (las esquinas de PixelLab dibujan la pata vertical como cara) no se usa.
- Un muro grueso (cualquier pared dentro de un cuadrado de 2×2 paredes: chimenea, columna, fachada doble) es un bloque macizo: borde superior ancho y cara solo al sur.
- Todas las paredes de un edificio comparten el borde superior, y la cara muestra el lado al que mira: lamas si da afuera, yeso si da a una habitación. Si dos paredes que se tocan cambian de material en el borde superior, parece que no llegan a unirse.

Antes de recompilar un mapa con arte nuevo, abre las hojas de `maps/preview/tiles/` (piezas numeradas, los 16 casos y el plano de prueba con habitación en L, unión en T y huecos de puerta) y míralas.

## 5. Romper la rejilla al decorar

Esto es lo que más realismo aporta:

1. **Variantes de suelo con peso:** la variante principal de cada suelo es una **limpia** y cubre alrededor del 70 %. Las **rayadas o manchadas** son raras y nunca hay dos iguales juntas (tampoco en diagonal). Una marca que se repite en cada tile (una mancha, un arañazo) forma un patrón en cuanto ocupa el 70 % del suelo: la repetición 3×3 de `maps/preview/tiles/floors_interior-celdas.png` lo enseña. Las baldosas se recortan sin el contorno oscuro que traen del export; ese contorno dibujaba una cuadrícula. Cada baldosa va en uno de sus 4 volteos al azar.
2. **Decals como objetos, no como tiles:** van en una capa de objetos con posición en píxeles (no ajustada a la rejilla), volteo horizontal y vertical aleatorio y sin rotaciones que no sean múltiplos de 90°. Así cruzan los bordes de los tiles.
3. **Agrupados, no repartidos:** coloca los decals con ruido (Perlin o simplex) o en grupos. Si están dispersos de forma uniforme, se nota que son aleatorios.
4. **Desgaste con lógica:** más suciedad y grietas junto a las puertas, en los pasillos (las rutas de paso) y en las esquinas. Escombros, astillas y sangre junto a cada barricada. Rastros que van de una ventana rota hacia el interior.
5. **Sombras:** una capa de sombra suave, oscura y semitransparente de 4 a 8 px pegada a la base de las paredes y bajo los objetos. Genérala por código a partir de la colisión.
6. **Atrezo que cuente algo:** muebles volcados formando barricadas antiguas, un coche con la puerta abierta, cajas y bolsas apiladas. En cada zona, al menos un detalle narrativo.
7. **Densidad:** entre el 15 % y el 25 % del suelo con algún decal u objeto. Si queda vacío, parece sin terminar; si está lleno, no se lee.

**Objetos (props):** si el MCP de PixelLab está disponible, genera los que falten como *map objects* de 32 px (o 64 px para muebles grandes y coches). Usa vista top-down con el ángulo high top-down, sin contorno en los objetos de suelo y con contorno en los interactivos. Si existe un sprite del jugador, úsalo como referencia de estilo. Guárdalos en `art-src/pixellab/objects/<nombre>/` y regístralos en el manifiesto. Si el MCP no está disponible, usa placeholders del tamaño correcto y apunta el objeto pendiente en `docs/ASSETS-TODO.md` con su prompt sugerido.

## 6. Restricciones de juego (mandan sobre la estética)

- Pasillos de 2 tiles de ancho como mínimo. Los muebles nunca dejan un paso de menos de 2 tiles.
- Ninguna zona sin salida: cada zona tiene al menos 2 salidas una vez desbloqueada, o una ruta circular dentro.
- El jugador aparece a más de 6 tiles de cualquier ventana.
- Los objetos con colisión no tapan ventanas, puertas ni portales en un radio de 2 tiles.
- Los muebles altos pueden tapar la vista, pero nunca deben esconder spawns ni barricadas.
- Respeta el esquema de capas y objetos de `docs/ASSETS.md`.
- **Puntos de mago** (spec 03 §1, tabla `## Magos` del plano): 1 o 2 por zona, incluidas las islas, en una casilla de suelo pegada a una pared o en un rincón, a más de 3 tiles de barricadas, puertas, portales y spawns, y sin estrechar un paso a menos de 2 tiles. Mejor en sitios con sentido (el rincón del estudio, contra el cobertizo) que en mitad de una pared lisa.

## 7. Leyenda del plano ASCII

```
#  pared interior        H  pared exterior (fachada)     F  valla
.  suelo de madera       k  linóleo de cocina            b  baño
c  hormigón              g  césped                       p  patio
d  tierra                a  asfalto                      s  acera
w  agua de piscina       e  cubierta de piscina          r  tejado
_  vacío (no transitable)
W  ventana / barricada   D  puerta de pago               o  hueco abierto (sin puerta)
<  portal o escalera     P  spawn del jugador            Z  spawn de zombie abierto
```

Cada `W`, `D` y `<` lleva su id y sus propiedades en una tabla debajo del plano, con id, zonas y destino. El precio va por sala, en la columna `precio` de la tabla de zonas: se desbloquean salas, no puertas.

## 8. Checklist de revisión (sobre las imágenes de vista previa)

- [ ] ¿Hay al menos 3 tamaños de habitación claramente distintos en la vista completa?
- [ ] ¿Ninguna puerta está centrada en su pared ni alineada con otra en línea recta?
- [ ] ¿Hay pasillo o recibidor? ¿Hay al menos una habitación en L o un espacio abierto?
- [ ] ¿La fachada tiene entrantes o salientes? ¿Hay porche y camino de entrada?
- [ ] ¿Ningún borde exterior entre terrenos es una línea recta de más de 6 tiles?
- [ ] ¿Las variantes de suelo no forman patrones visibles?
- [ ] ¿Los decals están agrupados y concentrados en zonas de paso, puertas y barricadas?
- [ ] ¿Cada zona tiene un detalle narrativo?
- [ ] ¿Toda pared horizontal enseña su cara al sur, y las verticales solo su borde superior salvo en su extremo sur?
- [ ] ¿Solo se tocan pares de terrenos con tileset (y el asfalto nunca toca el césped)?
- [ ] ¿Se cumplen todas las restricciones de juego de la sección 6?
- [ ] Mirando la vista completa con los ojos entornados, ¿se lee como una casa y no como una cuadrícula de cajas?

Si falla un punto, corrígelo antes de enseñarme el resultado y dime qué has cambiado.