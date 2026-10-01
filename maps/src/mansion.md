# Mansión · programa de la casa

Fuente del plano: `maps/src/mansion.txt` (un carácter por tile, leyenda de la skill `level-design` §6, y las tablas de ids debajo). Mapa de **100×68 tiles** (1 tile ≈ 0,6 m).

## Tipología

Mansión de una planta en una **parcela de esquina**, con garaje doble adosado, jardín trasero con piscina, calle delantera y calle lateral. La planta alta existe pero no se juega: la escalera principal del hall está derrumbada (detalle narrativo) y por eso no hay dormitorios. El sótano y la azotea son otro nivel y se dibujan como islas aparte, unidas por escaleras.

La casa se organiza alrededor del **hall de entrada y el pasillo**: desde ellos se llega al salón (D1) y al comedor (D2). El resto se conecta en anillo como en el mapa actual: salón → biblioteca → cocina → comedor.

## Habitaciones

Cada zona de juego agrupa varias habitaciones. Dentro de una zona, las habitaciones se unen con huecos sin puerta (`o`, de 2 tiles); entre zonas solo hay puertas de pago (`D`).

| Espacio | Zona | Interior (tiles) | Uso y detalles | Junto a |
|---|---|---|---|---|
| Porche | calle | 11×2 | Columnas en las esquinas; da a la puerta principal (D8) | Hall, sendero |
| Hall de entrada | recibidor | 9×7 | Escalera principal derrumbada contra el muro del fondo | Porche (D8), salón (D1), pasillo, guardarropa, aseo |
| Pasillo | recibidor | 14×3 | Dos huecos al hall, a los lados de la escalera: se puede rodear | Hall, comedor (D2) |
| Guardarropa | recibidor | 4×2 | Abrigos y cajas | Hall |
| Aseo | recibidor | 4×3 | Ventana pequeña a la fachada (W2) | Hall |
| Salón | salón | L: 16×8 + 12×4 | Chimenea en la pared oeste con el tiro saliente en la fachada; columna en el centro; zona de estar en el brazo bajo | Hall (D1), rincón de lectura (D3), terraza lateral |
| Biblioteca | biblioteca | 10×10 + mirador 5×2 | Estanterías (atrezo); el mirador tiene la cristalera al patio (D10) | Estudio, rincón, cocina (D5), jardín |
| Estudio | biblioteca | 5×5 | Despacho con ventana al lateral (W8) | Biblioteca, rincón |
| Rincón de lectura | biblioteca | 5×4 | Forma un anillo con la biblioteca y el estudio | Biblioteca, estudio, salón (D3) |
| Cocina | cocina | L: 13×9 + 8×6 | Abierta al office (sin pared; la separa una barra) | Office, biblioteca (D5), comedor (D4), lavadero, jardín (D9) |
| Office del desayuno | cocina | 6×3 | Mirador al jardín (W10) | Cocina |
| Despensa | cocina | 4×3 | Puerta del sótano (P1), espacio de servicio | Lavadero |
| Lavadero | cocina | 4×6 | Entre la cocina y el garaje | Cocina, despensa, taller (D6) |
| Comedor | comedor | 11×10 + mirador 5×2 | Mesa larga (atrezo); mirador a la fachada (W6) | Pasillo (D2), cocina (D4) |
| Taller | garaje | 6×10 | Banco de trabajo; forma una L con el garaje | Lavadero (D6), garaje, jardín (W13) |
| Garaje doble | garaje | 12×10 | Sobresale 3 tiles de la fachada; portón a la entrada de coches (D7) | Taller, calle |

5 de las 16 habitaciones no son rectangulares (31 %): el salón y la cocina en L, la biblioteca y el comedor con mirador, y la sala del sótano en L. La zona del garaje también forma una L con el taller.

## Exterior

- **Fachada:** chimenea saliente al oeste, terraza lateral en el entrante del salón (escalera de mano a la azotea, P4), porche delante del hall, aseo y comedor retranqueados, mirador del comedor y garaje adelantado.
- **Delante:** parterres pegados a la fachada, sendero en curva del porche a la acera, camino de entrada de coches del garaje a la calzada y un atajo pisado hacia el lateral.
- **Calles:** dos calles que se cruzan en la esquina de la parcela.
  - La horizontal (delante): acera, franja de césped, bordillo, calzada de 5 tiles, bordillo, franja de césped, acera de enfrente y vallas de las parcelas vecinas.
  - La vertical (a la izquierda): igual, pero la acera del otro lado queda en el borde del mapa. Recorre el mapa de arriba abajo y cruza la horizontal; las esquinas están pavimentadas.
  - Al ser una parcela de esquina, el jardín delantero se abre también a la calle lateral. El trasero sigue vallado: el hueco de valla F3 da a la acera de la calle lateral.
- **Jardín trasero:**
  - patio irregular frente a la cristalera de la biblioteca y patio de la barbacoa frente a la puerta de la cocina;
  - piscina con cubierta que se rodea por los cuatro lados;
  - cobertizo en la esquina noreste;
  - senderos de tierra donde se pisa (barbacoa → escalera de mano, piscina → cobertizo, pasillo lateral oeste);
  - trampilla del sótano junto a la fachada (P3) y escalera de mano contra el taller (P2).
- **Pasillos laterales:** una valla a cada lado separa el jardín de la parte delantera, para que el jardín solo se abra por la casa o por la azotea, como ahora.
- **Fuera de la parcela:** callejón trasero (cerrado con una cancela hacia la calle lateral) y parcelas vecinas valladas; no se pueden pisar. En el callejón aparecen los zombies de los huecos de valla F1 y F2.

## Islas

- **Sótano** (16 tiles de ancho, para dejar sitio a la calle lateral): sala principal en L, cuarto de calderas (llegada de la trampilla, P3), trastero y bodega, unidos por huecos que forman varios anillos. Rejillas S1 (norte) y S2 (sur; al este ya no hay sitio en el mapa). Llegada de la escalera de la cocina (P1) en la esquina suroeste.
- **Azotea** (16 tiles de ancho): forma de L, dos chimeneas y una caseta de máquinas. Llegada de las dos escaleras de mano (P2 y P4) y 3 spawns abiertos (O3–O5).

## Lo que se conserva del mapa actual

Las 10 zonas con sus propiedades, las 10 puertas con sus costes y zonas, las 18 barricadas con su zona, los 4 portales con su par, coste, `secondary` y tipo, los 5 spawns abiertos y el jugador en la zona inicial. Solo cambian las posiciones. La lista de ids y coordenadas está en las tablas de `mansion.txt`.

## Decisiones

- **El salón y el hall son más grandes que en la tabla de la skill** (salón hasta 12×10, recibidor hasta 6×5) porque son zonas de combate: la zona inicial tiene que aguantar las primeras rondas y la escalera da una ruta circular. El salón es salón y zona de estar, separados por la columna.
- **Las zonas se calculan rellenando desde una semilla:** el compilador las convierte en rectángulos con el mismo id (las zonas en L necesitan varios). El `MapLoader` tendrá que unir los rectángulos que comparten id.
- **Lo construido es recto y lo natural no:** la calzada, las aceras, la entrada de coches y el porche son obra; el césped, los patios, la cubierta de la piscina y la tierra tienen bordes irregulares. La línea entre el césped delantero y la acera es la linde de la parcela; la romperé con atrezo (setos, buzón, árboles) al decorar.
- **Spawns abiertos de la calle:** O1 en la calzada de la calle lateral, a la altura del jardín delantero, y O2 en la acera de enfrente de la calle horizontal. Están más cerca de la casa que en el mapa actual, así entran dentro del corte de distancia de la Fase M7.
- **Calle lateral:** ocupa las 11 primeras columnas. Para que quepa en los 100 tiles de ancho, la parcela se desplaza 9 tiles a la derecha y las islas pasan de 21 a 16 tiles de ancho.
- **Pendiente de arte:** la tierra (`d`) no tiene tileset; mientras tanto se pinta con un suelo provisional y se apunta en `docs/ASSETS-TODO.md`. La azotea (`r`) usa hormigón.

## Decoración

Zona por zona, con su vista previa en `maps/preview/`. El atrezo está en la tabla `## Atrezo` de `mansion.txt`; los decals, las variantes de suelo y las sombras las pone `map:build` con las reglas de la skill. Densidad de cada zona: 20–21 %.

| Zona | Atrezo principal | Detalle narrativo |
|---|---|---|
| Recibidor | Consola volcada, alfombra, cajas en el guardarropa, inodoro, banco, retrato caído | La escalera principal hundida, con cascotes: por eso no se sube a la planta alta. Rastro de sangre desde W1 |
| Salón | Sofá frente a la chimenea, alfombra, sillón, piano, mueble bajo, libros por el suelo | Barricada antigua de mesas y sillas volcadas junto a la columna |
| Comedor | Mesa larga aún puesta, sillas volcadas, vajilla rota, aparador | Charco de sangre junto a la mesa: la última cena |
| Biblioteca | Dos hileras de estanterías, mesa de lectura, escritorio, caja fuerte abierta, sillón | Estantería tumbada con los libros esparcidos |
| Cocina | Encimera, isla, nevera abierta, horno, mesa del office, lavadora | Despensa saqueada: latas por el suelo |
| Garaje | Banco de trabajo, estanterías, neumáticos, herramientas, mancha de aceite | Coche con la puerta abierta y las llaves puestas: no llegó a salir |
| Jardín | Árboles, setos contra la valla, mesa de exterior, tumbonas, flotador, bidón | Barbacoa volcada con sangre: la fiesta acabó mal |
| Calle | Coches aparcados, farolas, buzón, cubos, árboles y setos en la linde | Coche atravesado en la calle lateral tras derribar una farola |
| Sótano | Caldera, botelleros, estanterías, cajas | Refugio improvisado (colchón, latas, sangre) que no aguantó |
| Azotea | Aires acondicionados, depósito de agua | Campamento de supervivientes junto a la chimenea |

Todo el atrezo es provisional (rectángulos del color de su material) hasta que llegue el arte: la lista con tamaños y prompts está en `docs/ASSETS-TODO.md`.
