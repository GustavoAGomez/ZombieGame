# Arte pendiente

Objetos y tiles que el juego ya usa con un placeholder. Cada entrada lleva el prompt sugerido para PixelLab (vista top-down, ángulo *high top-down*, misma paleta que el jugador). Cuando llegue el export, se importa con las herramientas de `docs/ASSETS.md` y se borra de esta lista.

## Personajes y efectos

| Clave | Uso | Placeholder actual | Prompt sugerido |
|---|---|---|---|
| `zombie_walker`, animación `death` | Muerte del zombi: 8 direcciones (o 4), unos 0,6 s (`ZOMBIES.corpseTime`), sin bucle, acabando tumbado | El primer fotograma de `crawl` (el zombi en el suelo), quieto y desvaneciéndose durante 0,6 s | El mismo zombi de PixelLab, animación "falls dead / dies collapsing to the ground" (el importador la normaliza a `death`) |
| `zombie_runner`, `zombie_sprinter` | Corredores y sprinters con aspecto propio (opcional) | Usan el arte de `zombie_walker` (`alsoFor` en su `import.json`), cada uno a su ritmo y con un tinte: ocre el corredor y rojizo el sprinter (`COLORS.zombieRunnerTint` y `zombieSprinterTint`) | Otro zombi de PixelLab con las mismas animaciones; se importa en su carpeta y se quita de `alsoFor` |
| `player`, animación `dash` | Esquiva del jugador: 8 direcciones, unos 0,2 s, sin bucle | El fotograma quieto de `idle` | El mismo personaje de PixelLab, animación "quick dash / dodge roll" |
| `player`, animación `death` (norte y diagonales) | Muerte mirando al norte y en diagonal | Llegan sur, este y oeste; el resto usa la más cercana (norte y diagonales del norte, el este o el oeste) | La misma animación de muerte en `north` (y, si se quiere, en las diagonales) |
| `weapon_case`, `weapon_case_v` | Vitrinas de armas básicas (spec 04 §3): un fotograma por arma (pistola, SMG, escopeta); 28×18 de frente al sur y 18×28 de frente al este (al oeste en espejo) | Mueble marrón oscuro con cristal azulado y la silueta del arma | "wooden gun display case with glass top, weapon visible inside, top-down high angle, 28x18" (y su versión vertical de 18×28) |
| `player` con escopeta | Sostener y disparar la escopeta de caza | Usa las animaciones de la pistola (`shoot` y `shoot_walk`) | El mismo personaje de PixelLab con una escopeta de caza de dos cañones: "firing a hunting shotgun" y "walking forward while aiming a shotgun", mismas direcciones y lienzo |
| `player`, animación `melee` | Cuchillada del jugador (botón CUCHILLO): 8 direcciones, unos 0,25 s, sin bucle | Ninguna: el cuerpo no cambia y se dibuja el tajo `melee_slash` | El mismo personaje de PixelLab, animación "knife stab / slash attack" (el importador la normaliza a `melee`) |
| `merchant_red`, `merchant_gold` | Magos vendedores rojo y dorado (spec 03). El azul ya tiene arte: personaje `merchant_blue` con `idle` (respirar) y `open_coat` (abrir la gabardina), solo hacia el sur, en 68×68 | Rectángulo de 14×20 de su color (rojo `#c93a2b`, dorado `#e8b04a`) con contorno 1 px más oscuro | El mismo mago de PixelLab con detalles rojos o dorados, con las mismas dos animaciones mirando al sur; se importa en `art-src/pixellab/merchant_red/` (o `_gold`) con su entrada de personaje de 1 dirección en el manifiesto |
| `boss_butcher` | El Matarife (spec 07 §2 y §8): un zombie gordo con un mazo, del tamaño de una furgoneta. Huella de 2×2 casillas (64×64) y dibujo de unos 96×110 que sobresale por arriba y por los lados, de pie sobre el borde inferior de la huella. Las variantes (rabioso, pútrido) son el mismo arte teñido | Cuerpo redondeado de 64×84 en verde grisáceo oscuro con la barriga más clara y un mazo marrón de 12×40; un fotograma por pose, en el orden de `BOSS_POSES`: andar (2), preparar embestida, embestir, aturdido, preparar mazazo, golpear, saltar, caer, rugir y morir. Mirando a cámara, en espejo hacia el oeste | Personaje de PixelLab en un lienzo de unos 128 px, 4 direcciones (el oeste, espejo del este). Animaciones: `walk`, `charge_windup` (se agacha y escarba), `charge` (carrera con el hombro por delante), `stunned` (aturdido contra la pared), `slam_windup` (mazo en alto), `slam` (mazazo al suelo), `leap` (salto), `land` (aterrizaje con polvo), `roar` (rugido), `death`. "huge fat rotten butcher zombie with a giant wooden mallet, bloated belly, apron, top-down high angle" |
| `boss_rubble` | Astillas del atrezo que aplasta un boss (spec 07 §8): 32×32 en mosaico sobre la huella del mueble, 2 variantes | Astillas marrones sueltas | "wooden splinters and broken furniture debris scattered on the floor, top-down, seamless 32x32, 2 variants" |
| charco pútrido | Charcos que deja el Matarife pútrido (spec 07 §1): al aterrizar (44 px de radio) y en rastro al embestir (24 px, uno cada 32 px), 4 s | Círculo verde enfermizo translúcido con borde, dibujado por código (`BossZones`) | "toxic green rotten slime puddle on the floor, top-down, bubbling, 88x88, 4 frames loop" |
| grieta del boss | La grieta de 3×3 casillas por la que sale un boss (spec 07 §3) | El agujero de la Mano del Demonio dibujado al doble (96×80) | Si se quiere propia: "large hellish crack in the floor with embers and fire, top-down, 96x96, opening animation 5 frames and fire loop 6 frames" |
| `merchant_gem` | Rombo flotante sobre los magos que aún son placeholder (se tiñe con su color y oscila 2 px cada 1,2 s); los magos con arte no lo llevan | Rombo blanco de 6×6 | Desaparece cuando los tres magos tengan arte |
| `smoke_puff` | Humo al aparecer y al teletransportarse un mago (300 ms, se tiñe con su color) | Nube clara que se abre en 4 fotogramas de 24×24 | "magic smoke puff, white, 4 frames, 24x24, top-down" |
| `offscreen_arrow` | Flecha en el borde de la pantalla hacia un mago fuera de la vista (se tiñe con su color) | Triángulo blanco de 8×8 hacia la derecha con contorno oscuro | "small pixel arrow pointer, white with dark outline, facing right, 8x8" |
| `blood` | Charco de sangre podrida que deja un zombi al morir (3 formas de 16×16) | Manchas orgánicas en rojo marrón oscuro con borde casi negro y un brillo marrón | "rotten zombie blood pool, very dark red-brown, thick and glossy, top-down, 3 variants, 16x16" |
| `blood_drop` | Gota espesa de sangre en vuelo al impactar una bala o el cuchillo (redonda, estirada hacia la derecha —la vista la gira— y pequeña; 7×7) | Gotas de sangre podrida con borde oscuro y brillo | "thick rotten blood droplet, dark red-brown, glossy, 3 frames: round, stretched to the right, small, 7x7" |
| `blood_splat` | Salpicadura donde cae una gota (3 formas de 10×10; se desvanece en unos 2,6 s) | Salpicaduras pequeñas con alguna gota suelta | "small rotten blood splat on the floor, dark red-brown, top-down, 3 variants, 10x10" |
| `blood_drop_fresh`, `blood_splat_fresh` | Sangre del jugador al recibir daño: gotas en vuelo y salpicaduras (mismos tamaños y fotogramas que las de sangre podrida) | Las mismas formas en rojo vivo | "fresh red blood droplet / splat, bright red, glossy, top-down", con los mismos tamaños |
| `blood_stain` | Manchas de sangre sobre el cuerpo del jugador hasta que vuelve a tener la vida al máximo (3 formas de 6×6, una con chorreón) | Manchas pequeñas en rojo vivo | "small fresh blood stain on clothes, bright red, 6x6, 3 variants, one dripping" |
| `melee_slash` | Tajo provisional delante del jugador mientras no exista la animación `melee` | Arco claro generado, 4 fotogramas de 32×32 dibujados hacia la derecha (la vista lo gira) | Opcional si la animación del personaje ya lleva el tajo: "knife slash swoosh arc, white, 4 frames, 32x32, facing right" |
| salpicadura de objeto | Un objeto que cae al agua de la piscina (spec 05 §6): unos 0,35 s | Aro claro que se abre y cuatro gotas, dibujados por código (`ThrownItem.ts`) | "small water splash ring with droplets, 4-5 frames, 24x24, top-down pixel art" |
| arte de las armas especiales | Katana (barrido), láser (rayo con destello final) y lanzallamas (llamas en abanico y anillo de las explosiones del fuego infernal), spec 06 §2 | El tajo del cuchillo escalado, una línea roja con núcleo blanco y las llamas de la quemadura, dibujados por código | "katana slash arc swoosh, wide, white-red, 4 frames"; el láser y el chorro pueden seguir siendo de código |
| burbujas de la piscina | El agua de la piscina con un objeto dentro (burbujas lentas) y al invocar al mago rojo (hierve en rojo 1,5 s) | Círculos claros que crecen y revientan sobre un tinte rojo, dibujados por código (`ActivationSite.ts`) | "bubbles rising and popping in reddish water, 4 frames, 8x8 each, top-down pixel art" |

## Iconos del HUD

Iconos en píxeles provisionales en `src/ui/icons.ts` (rectángulos sobre una rejilla de 12×12 o similar). Los finales pueden llegar como SVG o PNG con el mismo nombre.

| Icono | Uso |
|---|---|
| `door`, `stairs` | Botón de acción: comprar puerta, abrir escalera o trampilla (el martillo de reparar ya tiene arte: `icon_repair`) |
| `bolt` | La mejora de velocidad (botón de la mejora y fila de la tienda). Recargar, cuchillo y dash ya tienen arte (`icon_reload`, `icon_knife`, `icon_dash`) |
| `wizard` | Botón de acción junto a un mago (sombrero de su color) |
| `mark_ammo`, `mark_rate`, `mark_damage` | Marcas de mejora del arma junto a su nombre (7×7): munición, cadencia y daño, cada una con una casilla por nivel |
| `star` | Estrellas del arma que una vitrina va a sustituir (una por nivel comprado) y fila de la mejora especial del mago dorado |
| `bolt`, `x2` | Mejoras temporales (velocidad, doble daño): botón de la mejora y fila de la tienda |
| `bullet`, `bolt`, `crosshair`, `star` | Iconos de los artículos de la tienda, en el color del mago: munición máxima y mejora de munición; mejora de la ronda y de cadencia; mejora de daño; mejora especial |
| `living_heart`, `worn_wand` | Objetos especiales (spec 05): solo mientras su sprite animado (`item_<id>`) no tiene arte; con arte, el inventario y el botón de recoger muestran la animación. Colores fijos (no variables CSS) para poder dibujarlos también en el canvas |

## Tiles

| Clave | Uso | Placeholder actual | Prompt sugerido |
|---|---|---|---|
| tileset de tierra (Wang, 2 terrenos: tierra / césped) | Senderos pisados `d` del plano: jardín, pasillo lateral, atajos | `map_special` id 2: ruido marrón de 32×32 con bordes duros | "Wang tileset, top-down, trodden dirt path / dry lawn, 32x32, corner wang, muted palette" |
| `floors_interior` a 32×32 | Suelos de la casa | Export de 48×48 reducido a 32×32 (se notan las juntas) | Volver a exportar el mismo set a 32×32 |
| azotea (tela asfáltica o grava) | Suelo `r` de la azotea | Hormigón de `floors_interior` | "top-down flat roof surface, gravel and tar patches, 32x32 seamless tile" |

## Atrezo (placeholders que crea map:build del tamaño de su huella)

Ruta prevista del export: `art-src/pixellab/objects/<clave>/`. Tamaños en px: 32 por tile; los de 64 px o más son muebles grandes o coches (skill level-design §4). Sin contorno en los objetos de suelo y con contorno en los que bloquean el paso. Cada clave tiene un solo tamaño.

| Clave | Tamaño | Colisión | Zonas | Qué es | Prompt sugerido |
|---|---|---|---|---|---|
| `prop_aire_acondicionado` | 64×32 | sí | Azotea | Aparato de aire acondicionado | "map object, high top-down view, rooftop air conditioning unit, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_alfombra` | 96×64 | no | Recibidor | Alfombra del hall, arrugada | "map object, high top-down view, crumpled persian rug, 96x64 px, no outline, abandoned house, muted palette" |
| `prop_alfombra_hogar` | 64×64 | no | Salón | Alfombra delante del hogar | "map object, high top-down view, small rug in front of a fireplace, 64x64 px, no outline, abandoned house, muted palette" |
| `prop_aparador` | 32×96 | sí | Comedor | Aparador contra la pared | "map object, high top-down view, wooden sideboard, 32x96 px, with dark outline, abandoned house, muted palette" |
| `prop_arbol` | 64×64 | sí | Calle, Jardín | Árbol junto a la valla | "map object, high top-down view, tree canopy, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_banco` | 64×32 | sí | Recibidor | Banco del pasillo | "map object, high top-down view, wooden hallway bench, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_banco_trabajo` | 32×96 | sí | Garaje | Banco de trabajo del taller | "map object, high top-down view, workbench with tools, 32x96 px, with dark outline, abandoned house, muted palette" |
| `prop_barbacoa_volcada` | 32×32 | sí | Jardín | Barbacoa volcada y sangre: la fiesta acabó mal | "map object, high top-down view, knocked over barbecue grill, spilled coals, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_barricada_muebles` | 64×64 | sí | Salón | Barricada antigua: mesas y sillas volcadas apiladas | "map object, high top-down view, pile of overturned chairs and tables used as a barricade, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_bidon` | 32×32 | sí | Jardín | Bidón junto al cobertizo | "map object, high top-down view, metal barrel, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_botellero` | 32×128 | sí | Sótano | Botellero de la bodega | "map object, high top-down view, tall wine rack with bottles, vertical, 32x128 px, with dark outline, abandoned house, muted palette" |
| `prop_botellero_bajo` | 96×32 | sí | Sótano | Botellero de la bodega | "map object, high top-down view, low wine rack with bottles, 96x32 px, with dark outline, abandoned house, muted palette" |
| `prop_buzon` | 32×32 | sí | Calle | Buzón junto al sendero | "map object, high top-down view, mailbox on a post, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_caja_fuerte` | 32×32 | sí | Biblioteca | Caja fuerte abierta y vacía | "map object, high top-down view, open empty steel safe, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_cajas` | 64×64 | sí | Recibidor, Sótano | Cajas apiladas en el guardarropa | "map object, high top-down view, stack of cardboard moving boxes, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_cajas_provisiones` | 64×32 | sí | Azotea | Campamento de supervivientes: cajas de provisiones | "map object, high top-down view, supply crates and water bottles, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_caldera` | 64×64 | sí | Sótano | Caldera en el cuarto de calderas | "map object, high top-down view, old boiler with pipes, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_charco_sangre` | 32×32 | no | Comedor, Jardín, Sótano | Charco de sangre junto a la mesa: la última cena | "map object, high top-down view, pool of dark blood, 32x32 px, no outline, abandoned house, muted palette" |
| `prop_coche` | 128×64 | sí | Calle | Coche aparcado | "map object, high top-down view, parked sedan, 128x64 px, with dark outline, abandoned house, muted palette" |
| `prop_coche_accidentado` | 128×64 | sí | Calle | Coche atravesado en la calle lateral tras chocar con la farola | "map object, high top-down view, crashed car with crumpled bonnet, 128x64 px, with dark outline, abandoned house, muted palette" |
| `prop_coche_puerta_abierta` | 96×160 | sí | Garaje | Coche con la puerta del conductor abierta y las llaves puestas: no llegó a salir | "map object, high top-down view, family car with the driver door open, 96x160 px, with dark outline, abandoned house, muted palette" |
| `prop_colchon` | 64×64 | no | Sótano | Refugio improvisado: colchón en el suelo | "map object, high top-down view, dirty mattress on the floor, 64x64 px, no outline, abandoned house, muted palette" |
| `prop_consola_volcada` | 64×32 | sí | Recibidor | Consola del hall volcada | "map object, high top-down view, overturned wooden hallway console table, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_cuadro_caido` | 32×32 | no | Recibidor | Retrato caído en el pasillo | "map object, high top-down view, fallen framed portrait, cracked glass, 32x32 px, no outline, abandoned house, muted palette" |
| `prop_cubo_basura` | 32×32 | sí | Calle | Cubos de basura junto a la entrada de coches | "map object, high top-down view, two wheelie bins, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_deposito_agua` | 64×64 | sí | Azotea | Depósito de agua | "map object, high top-down view, rooftop water tank, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_encimera` | 96×32 | sí | Cocina | Encimera con fregadero | "map object, high top-down view, kitchen counter with sink, 96x32 px, with dark outline, abandoned house, muted palette" |
| `prop_escalera_derrumbada` | 96×64 | sí | Recibidor | La escalera principal se ha hundido: por eso no se sube a la planta alta | "map object, high top-down view, collapsed grand staircase, broken wooden steps and banister, rubble, 96x64 px, with dark outline, abandoned house, muted palette" |
| `prop_escombros` | 32×32 | no | Recibidor | Cascotes de la escalera | "map object, high top-down view, small pile of plaster rubble and broken bricks, 32x32 px, no outline, abandoned house, muted palette" |
| `prop_escritorio` | 64×32 | sí | Biblioteca | Escritorio del estudio | "map object, high top-down view, wooden desk with papers, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_estanteria_caida` | 96×32 | sí | Biblioteca | Estantería caída: alguien la tumbó para frenar la puerta | "map object, high top-down view, toppled bookshelf lying on its side with books spilled, 96x32 px, with dark outline, abandoned house, muted palette" |
| `prop_estanteria_larga` | 160×32 | sí | Biblioteca | Hilera de estanterías | "map object, high top-down view, long wooden bookshelf full of books, 160x32 px, with dark outline, abandoned house, muted palette" |
| `prop_estanteria_metal` | 32×128 | sí | Sótano | Estanterías del trastero | "map object, high top-down view, tall metal storage shelving with boxes, 32x128 px, with dark outline, abandoned house, muted palette" |
| `prop_estanteria_metal_corta` | 32×64 | sí | Garaje | Estantería metálica | "map object, high top-down view, short metal shelving, 32x64 px, with dark outline, abandoned house, muted palette" |
| `prop_farola` | 32×32 | sí | Calle | Farola | "map object, high top-down view, street lamp, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_farola_caida` | 64×32 | no | Calle | Farola derribada por el coche | "map object, high top-down view, knocked down street lamp, 64x32 px, no outline, abandoned house, muted palette" |
| `prop_flotador` | 32×32 | no | Jardín | Flotador olvidado en la cubierta | "map object, high top-down view, inflatable pool ring, 32x32 px, no outline, abandoned house, muted palette" |
| `prop_herramientas_suelo` | 32×32 | no | Garaje | Herramientas tiradas junto al banco | "map object, high top-down view, tools scattered on the floor, 32x32 px, no outline, abandoned house, muted palette" |
| `prop_horno` | 32×32 | sí | Cocina | Horno | "map object, high top-down view, kitchen stove and oven, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_inodoro` | 32×32 | sí | Recibidor | Aseo | "map object, high top-down view, white toilet, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_isla_cocina` | 128×32 | sí | Cocina | Isla que separa la cocina del office | "map object, high top-down view, kitchen island counter, 128x32 px, with dark outline, abandoned house, muted palette" |
| `prop_latas_suelo` | 32×32 | no | Cocina, Sótano | Latas por el suelo: alguien saqueó la despensa | "map object, high top-down view, empty food cans scattered, 32x32 px, no outline, abandoned house, muted palette" |
| `prop_lavadora` | 32×32 | sí | Cocina | Lavadora del lavadero | "map object, high top-down view, washing machine, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_libros_suelo` | 32×32 | no | Biblioteca, Salón | Libros tirados del mueble | "map object, high top-down view, books scattered on the floor, 32x32 px, no outline, abandoned house, muted palette" |
| `prop_mancha_aceite` | 32×32 | no | Garaje | Mancha de aceite | "map object, high top-down view, oil stain, 32x32 px, no outline, abandoned house, muted palette" |
| `prop_mesa` | 64×32 | sí | Cocina | Mesa del desayuno en el office | "map object, high top-down view, small breakfast table, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_mesa_comedor` | 160×64 | sí | Comedor | Mesa larga, aún puesta | "map object, high top-down view, long dining table with plates and candles, 160x64 px, with dark outline, abandoned house, muted palette" |
| `prop_mesa_jardin` | 64×32 | sí | Jardín | Mesa del patio de la biblioteca | "map object, high top-down view, garden table, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_mesa_lectura` | 64×64 | sí | Biblioteca | Mesa de lectura | "map object, high top-down view, wooden reading table with an open book and lamp, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_mueble_bajo` | 96×32 | sí | Salón | Mueble bajo contra la pared | "map object, high top-down view, low wooden cabinet, 96x32 px, with dark outline, abandoned house, muted palette" |
| `prop_neumaticos` | 32×32 | sí | Garaje | Neumáticos apilados | "map object, high top-down view, stack of car tires, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_nevera` | 32×32 | sí | Cocina | Nevera abierta | "map object, high top-down view, open fridge, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_piano` | 64×64 | sí | Salón | Piano de pared en el rincón del brazo bajo | "map object, high top-down view, upright piano, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_saco_dormir` | 64×32 | no | Azotea | y sacos de dormir junto a la chimenea | "map object, high top-down view, two sleeping bags, 64x32 px, no outline, abandoned house, muted palette" |
| `prop_seto` | 128×32 | sí | Calle, Jardín | Seto contra la valla norte | "map object, high top-down view, trimmed hedge, horizontal, 128x32 px, with dark outline, abandoned house, muted palette" |
| `prop_seto_lateral` | 32×128 | sí | Calle | Seto hacia la calle lateral | "map object, high top-down view, trimmed hedge, vertical, 32x128 px, with dark outline, abandoned house, muted palette" |
| `prop_sillas_volcadas` | 32×32 | no | Comedor, Jardín | Sillas volcadas | "map object, high top-down view, two overturned wooden chairs, 32x32 px, no outline, abandoned house, muted palette" |
| `prop_sillon` | 32×32 | sí | Biblioteca, Salón | Sillón | "map object, high top-down view, worn fabric armchair, 32x32 px, with dark outline, abandoned house, muted palette" |
| `prop_sofa` | 32×96 | sí | Salón | Sofá de cara a la chimenea | "map object, high top-down view, old fabric sofa, three seats, 32x96 px, with dark outline, abandoned house, muted palette" |
| `prop_tumbona` | 32×64 | sí | Jardín | Tumbona | "map object, high top-down view, pool sun lounger, 32x64 px, with dark outline, abandoned house, muted palette" |
| `prop_vajilla_rota` | 32×32 | no | Cocina, Comedor | Vajilla rota y comida por el suelo | "map object, high top-down view, broken plates and food on the floor, 32x32 px, no outline, abandoned house, muted palette" |

## Decals y sombras generados

| Clave | Uso | Placeholder actual | Prompt sugerido |
|---|---|---|---|
| `decals_interior` (16 de 32×32) | Sangre, arrastres, polvo, escombros, astillas, grietas, pisadas y papeles en suelos interiores | Generados por `tiles:import` con ruido | "top-down decals sheet 4x4, 32x32 each, transparent: blood splats, drag marks, plaster dust, debris, wood splinters, floor cracks, footprints, paper scraps" |
| `map_shadows` | Sombra suave al pie de paredes y muebles | Generadas por `tiles:import` (negro semitransparente, 6 px) | No hace falta arte: es correcto que sean generadas |
