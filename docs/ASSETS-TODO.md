# Arte pendiente

Objetos y tiles que el juego ya usa con un placeholder. Cada entrada lleva el prompt sugerido para PixelLab (vista top-down, ángulo *high top-down*, misma paleta que el jugador). Cuando llegue el export, se importa con las herramientas de `docs/ASSETS.md` y se borra de esta lista.

Al final, los sonidos que aún no se han elegido o que no convencen (spec 08).

## Personajes y efectos

| Clave | Uso | Placeholder actual | Prompt sugerido |
|---|---|---|---|
| `zombie_walker`, animación `death` | Muerte del zombi: 8 direcciones (o 4), unos 0,6 s (`ZOMBIES.corpseTime`), sin bucle, acabando tumbado | El primer fotograma de `crawl` (el zombi en el suelo), quieto y desvaneciéndose durante 0,6 s | El mismo zombi de PixelLab, animación "falls dead / dies collapsing to the ground" (el importador la normaliza a `death`) |
| `zombie_runner`, `zombie_sprinter` | Corredores y sprinters con aspecto propio (opcional) | Usan el arte de `zombie_walker` (`alsoFor` en su `import.json`), cada uno a su ritmo y con un tinte: ocre el corredor y rojizo el sprinter (`COLORS.zombieRunnerTint` y `zombieSprinterTint`) | Otro zombi de PixelLab con las mismas animaciones; se importa en su carpeta y se quita de `alsoFor` |
| `player`, animación `dash` | Esquiva del jugador: 8 direcciones, unos 0,2 s, sin bucle | El fotograma quieto de `idle` | El mismo personaje de PixelLab, animación "quick dash / dodge roll" |
| `player`, animación `death` (norte y diagonales) | Muerte mirando al norte y en diagonal | Llegan sur, este y oeste; el resto usa la más cercana (norte y diagonales del norte, el este o el oeste) | La misma animación de muerte en `north` (y, si se quiere, en las diagonales) |
| `weapon_case`, `weapon_case_v` | Vitrinas de armas básicas (spec 04 §3): un fotograma por arma (pistola, SMG, escopeta); 28×18 de frente al sur y 18×28 de frente al este (al oeste en espejo) | Mueble marrón oscuro con cristal azulado y la silueta del arma | "wooden gun display case with glass top, weapon visible inside, top-down high angle, 28x18" (y su versión vertical de 18×28) |
| `player` con escopeta | Sostener y disparar la escopeta de caza | Usa las animaciones de la pistola (`shoot` y `shoot_walk`) | El mismo personaje de PixelLab con una escopeta de caza de dos cañones: "firing a hunting shotgun" y "walking forward while aiming a shotgun", mismas direcciones y lienzo |
| `player`, animación `melee` | Cuchillada del jugador (botón CUCHILLO): 8 direcciones, unos 0,25 s, sin bucle | Ninguna: el cuerpo no cambia; el tajo `melee_slash` se dibuja igual | El mismo personaje de PixelLab, animación "knife stab / slash attack" (el importador la normaliza a `melee`) |
| `merchant_red`, `merchant_gold` | Magos vendedores rojo y dorado (spec 03). El azul ya tiene arte: personaje `merchant_blue` con `idle` (respirar) y `open_coat` (abrir la gabardina), solo hacia el sur, en 68×68 | Rectángulo de 14×20 de su color (rojo `#c93a2b`, dorado `#e8b04a`) con contorno 1 px más oscuro | El mismo mago de PixelLab con detalles rojos o dorados, con las mismas dos animaciones mirando al sur; se importa en `art-src/pixellab/merchant_red/` (o `_gold`) con su entrada de personaje de 1 dirección en el manifiesto |
| `boss_rubble` | Astillas del atrezo que aplasta un boss (spec 07 §8): 32×32 en mosaico sobre la huella del mueble, 2 variantes | Astillas marrones sueltas | "wooden splinters and broken furniture debris scattered on the floor, top-down, seamless 32x32, 2 variants" |
| `merchant_gem` | Rombo flotante sobre los magos que aún son placeholder (se tiñe con su color y oscila 2 px cada 1,2 s); los magos con arte no lo llevan | Rombo blanco de 6×6 | Desaparece cuando los tres magos tengan arte |
| `smoke_puff` | Humo al aparecer y al teletransportarse un mago (300 ms, se tiñe con su color) | Nube clara que se abre en 4 fotogramas de 24×24 | "magic smoke puff, white, 4 frames, 24x24, top-down" |
| `offscreen_arrow` | Flecha en el borde de la pantalla hacia un mago fuera de la vista (se tiñe con su color) | Triángulo blanco de 8×8 hacia la derecha con contorno oscuro | "small pixel arrow pointer, white with dark outline, facing right, 8x8" |
| `blood` | Charco de sangre podrida que deja un zombi al morir (3 formas de 16×16) | Manchas orgánicas en rojo marrón oscuro con borde casi negro y un brillo marrón | "rotten zombie blood pool, very dark red-brown, thick and glossy, top-down, 3 variants, 16x16" |
| `blood_drop` | Gota espesa de sangre en vuelo al impactar una bala o el cuchillo (redonda, estirada hacia la derecha —la vista la gira— y pequeña; 7×7) | Gotas de sangre podrida con borde oscuro y brillo | "thick rotten blood droplet, dark red-brown, glossy, 3 frames: round, stretched to the right, small, 7x7" |
| `blood_splat` | Salpicadura donde cae una gota (3 formas de 10×10; se desvanece en unos 2,6 s) | Salpicaduras pequeñas con alguna gota suelta | "small rotten blood splat on the floor, dark red-brown, top-down, 3 variants, 10x10" |
| `blood_drop_fresh`, `blood_splat_fresh` | Sangre del jugador al recibir daño: gotas en vuelo y salpicaduras (mismos tamaños y fotogramas que las de sangre podrida) | Las mismas formas en rojo vivo | "fresh red blood droplet / splat, bright red, glossy, top-down", con los mismos tamaños |
| `blood_stain` | Manchas de sangre sobre el cuerpo del jugador hasta que vuelve a tener la vida al máximo (3 formas de 6×6, una con chorreón) | Manchas pequeñas en rojo vivo | "small fresh blood stain on clothes, bright red, 6x6, 3 variants, one dripping" |
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

Ruta prevista del export: `art-src/pixellab/objects/<clave>/`. Ya tienen arte 30 de los 61 (ver `docs/DECISIONS.md`, «El atrezo con arte»).

**Al pedir los que quedan:** con *Create 1-Direction Object* en vista `top-down`, los muebles de 64 px salieron en diagonal, casi en isométrica, y no casan con las paredes, que van rectas. Esa tanda se descartó: aire acondicionado, banco, barricada de muebles, cajas de provisiones, escritorio, mesa, mesa de jardín, mesa de lectura, piano y tumbona. Hay que pedirlos de frente («front-facing, axis-aligned, its front side facing south, not isometric, not rotated»). Los pequeños, de 32 px, salieron bien en una tanda de 64 huecos con una descripción por hueco (`item_descriptions`), 20 generaciones. Tamaños en px: 32 por tile; los de 64 px o más son muebles grandes o coches (skill level-design §4). Sin contorno en los objetos de suelo y con contorno en los que bloquean el paso. Cada clave tiene un solo tamaño.

| Clave | Tamaño | Colisión | Zonas | Qué es | Prompt sugerido |
|---|---|---|---|---|---|
| `prop_aire_acondicionado` | 64×32 | sí | Azotea | Aparato de aire acondicionado | "map object, high top-down view, rooftop air conditioning unit, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_alfombra` | 96×64 | no | Recibidor | Alfombra del hall, arrugada | "map object, high top-down view, crumpled persian rug, 96x64 px, no outline, abandoned house, muted palette" |
| `prop_aparador` | 32×96 | sí | Comedor | Aparador contra la pared | "map object, high top-down view, wooden sideboard, 32x96 px, with dark outline, abandoned house, muted palette" |
| `prop_banco` | 64×32 | sí | Recibidor | Banco del pasillo | "map object, high top-down view, wooden hallway bench, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_banco_trabajo` | 32×96 | sí | Garaje | Banco de trabajo del taller | "map object, high top-down view, workbench with tools, 32x96 px, with dark outline, abandoned house, muted palette" |
| `prop_barricada_muebles` | 64×64 | sí | Salón | Barricada antigua: mesas y sillas volcadas apiladas | "map object, high top-down view, pile of overturned chairs and tables used as a barricade, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_botellero` | 32×128 | sí | Sótano | Botellero de la bodega | "map object, high top-down view, tall wine rack with bottles, vertical, 32x128 px, with dark outline, abandoned house, muted palette" |
| `prop_botellero_bajo` | 96×32 | sí | Sótano | Botellero de la bodega | "map object, high top-down view, low wine rack with bottles, 96x32 px, with dark outline, abandoned house, muted palette" |
| `prop_cajas_provisiones` | 64×32 | sí | Azotea | Campamento de supervivientes: cajas de provisiones | "map object, high top-down view, supply crates and water bottles, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_coche_accidentado` | 128×64 | sí | Calle | Coche atravesado en la calle lateral tras chocar con la farola | "map object, high top-down view, crashed car with crumpled bonnet, 128x64 px, with dark outline, abandoned house, muted palette" |
| `prop_coche_puerta_abierta` | 96×160 | sí | Garaje | Coche con la puerta del conductor abierta y las llaves puestas: no llegó a salir | "map object, high top-down view, family car with the driver door open, 96x160 px, with dark outline, abandoned house, muted palette" |
| `prop_consola_volcada` | 64×32 | sí | Recibidor | Consola del hall volcada | "map object, high top-down view, overturned wooden hallway console table, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_encimera` | 96×32 | sí | Cocina | Encimera con fregadero | "map object, high top-down view, kitchen counter with sink, 96x32 px, with dark outline, abandoned house, muted palette" |
| `prop_escalera_derrumbada` | 96×64 | sí | Recibidor | La escalera principal se ha hundido: por eso no se sube a la planta alta | "map object, high top-down view, collapsed grand staircase, broken wooden steps and banister, rubble, 96x64 px, with dark outline, abandoned house, muted palette" |
| `prop_escritorio` | 64×32 | sí | Biblioteca | Escritorio del estudio | "map object, high top-down view, wooden desk with papers, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_estanteria_caida` | 96×32 | sí | Biblioteca | Estantería caída: alguien la tumbó para frenar la puerta | "map object, high top-down view, toppled bookshelf lying on its side with books spilled, 96x32 px, with dark outline, abandoned house, muted palette" |
| `prop_estanteria_larga` | 160×32 | sí | Biblioteca | Hilera de estanterías | "map object, high top-down view, long wooden bookshelf full of books, 160x32 px, with dark outline, abandoned house, muted palette" |
| `prop_estanteria_metal` | 32×128 | sí | Sótano | Estanterías del trastero | "map object, high top-down view, tall metal storage shelving with boxes, 32x128 px, with dark outline, abandoned house, muted palette" |
| `prop_farola_caida` | 64×32 | no | Calle | Farola derribada por el coche | "map object, high top-down view, knocked down street lamp, 64x32 px, no outline, abandoned house, muted palette" |
| `prop_isla_cocina` | 128×32 | sí | Cocina | Isla que separa la cocina del office | "map object, high top-down view, kitchen island counter, 128x32 px, with dark outline, abandoned house, muted palette" |
| `prop_mesa` | 64×32 | sí | Cocina | Mesa del desayuno en el office | "map object, high top-down view, small breakfast table, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_mesa_comedor` | 160×64 | sí | Comedor | Mesa larga, aún puesta | "map object, high top-down view, long dining table with plates and candles, 160x64 px, with dark outline, abandoned house, muted palette" |
| `prop_mesa_jardin` | 64×32 | sí | Jardín | Mesa del patio de la biblioteca | "map object, high top-down view, garden table, 64x32 px, with dark outline, abandoned house, muted palette" |
| `prop_mesa_lectura` | 64×64 | sí | Biblioteca | Mesa de lectura | "map object, high top-down view, wooden reading table with an open book and lamp, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_mueble_bajo` | 96×32 | sí | Salón | Mueble bajo contra la pared | "map object, high top-down view, low wooden cabinet, 96x32 px, with dark outline, abandoned house, muted palette" |
| `prop_piano` | 64×64 | sí | Salón | Piano de pared en el rincón del brazo bajo | "map object, high top-down view, upright piano, 64x64 px, with dark outline, abandoned house, muted palette" |
| `prop_saco_dormir` | 64×32 | no | Azotea | y sacos de dormir junto a la chimenea | "map object, high top-down view, two sleeping bags, 64x32 px, no outline, abandoned house, muted palette" |
| `prop_seto` | 128×32 | sí | Calle, Jardín | Seto contra la valla norte | "map object, high top-down view, trimmed hedge, horizontal, 128x32 px, with dark outline, abandoned house, muted palette" |
| `prop_seto_lateral` | 32×128 | sí | Calle | Seto hacia la calle lateral | "map object, high top-down view, trimmed hedge, vertical, 32x128 px, with dark outline, abandoned house, muted palette" |
| `prop_sofa` | 32×96 | sí | Salón | Sofá de cara a la chimenea | "map object, high top-down view, old fabric sofa, three seats, 32x96 px, with dark outline, abandoned house, muted palette" |
| `prop_tumbona` | 32×64 | sí | Jardín | Tumbona | "map object, high top-down view, pool sun lounger, 32x64 px, with dark outline, abandoned house, muted palette" |

## Decals y sombras generados

| Clave | Uso | Placeholder actual | Prompt sugerido |
|---|---|---|---|
| `decals_interior` (16 de 32×32) | Sangre, arrastres, polvo, escombros, astillas, grietas, pisadas y papeles en suelos interiores | Generados por `tiles:import` con ruido | "top-down decals sheet 4x4, 32x32 each, transparent: blood splats, drag marks, plaster dust, debris, wood splinters, floor cracks, footprints, paper scraps" |
| `map_shadows` | Sombra suave al pie de paredes y muebles | Generadas por `tiles:import` (negro semitransparente, 6 px) | No hace falta arte: es correcto que sean generadas |

## Mazmorra (spec 09)

Placeholders dibujados por código hasta que tengan arte. Todos a 32 px de casilla, vista top-down, la paleta del jugador.

| Clave / vista | Uso | Placeholder actual | Prompt sugerido |
|---|---|---|---|
| `pickup_key` | Llave normal en el suelo (§6.1) | Rectángulo 16×16 del manifiesto | "map object, high top-down view, small brass key on the floor, 16x16 px, no outline, muted palette" |
| `pickup_boss_key` | Llave del boss (§6.1) | Rectángulo 16×16 | "map object, high top-down view, heavy red iron key with a skull bow, 16x16 px, no outline" |
| Cofres (`DungeonViews`) | Cofre abierto, cerrado (con candado), grande del reto, del boss (§6.2–§6.4, §7.3) | Caja marrón con tapa dibujada por código; candado ámbar; marco ámbar el grande; rojo oscuro el del boss | "map object, high top-down view, wooden treasure chest 32x24 px, closed / open lid / with golden padlock / large ornate / dark red skull chest, with dark outline" |
| Vitrina del tesoro (`DungeonViews`) | El arma gratis de la sala del tesoro (§6.3) | Marco oscuro con cristal pálido y borde ámbar | Reutilizar el arte de las vitrinas (spec 04) con el precio tapado |
| Trampilla (`DungeonViews`) | Bajar de planta (§4) | Cuadrado oscuro con marco de madera | "map object, high top-down view, open wooden trapdoor in the floor with a ladder going down, 32x32 px, with dark outline" |
| Puertas de la mazmorra (`MapView`) | Normal, con llave, del boss, de reto (§4.1) | La puerta de madera teñida: ámbar, roja, marco rojo | "door sprites 2 frames (closed/open): plain wood / golden with keyhole / red with skull / wooden with red frame" |
| Aura de élite (`Zombie`) | Enemigo de élite (§5.2) | Tinte dorado del sprite | Un aro de luz dorada bajo los pies, 24×12 px, animado |
| Iconos del minimapa (`Hud`) | Tesoro, mano, reto, boss, mago (§4.2) | Cuadrados de color de 3×3 px | Iconos de 5×5 px: cofre, mano, calavera roja, exclamación, sombrero |
| Sombra de aparición (`SpawnMarks`) | Aviso de oleada (§4) | Elipse negra que oscurece | Una sombra con un aro que se cierra |
| Escupidor (`zombie_spitter`) | Enemigo que escupe a distancia (§5.2) | El caminante teñido de verde, hinchándose antes de escupir | "pixel art zombie, bloated green throat, 8 directions, idle / walk / spit (puffs up and spits) / attack / death, same size and style as the walker" |
| Explosivo (`zombie_exploder`) | Enemigo que estalla (§5.2) | El corredor teñido de rojo latiendo; se hincha con la mecha | "pixel art zombie, red glowing veins, 8 directions, idle / run / fuse (swells and glows) / death explosion, same style as the runner" |
| Bruto (`zombie_brute`) | Enemigo grande y lento (§5.2) | El caminante a escala 1,5 y tinte gris oscuro | "pixel art huge zombie, 1.5× the walker, grey dead skin, heavy arms, 8 directions, idle / walk / smash attack / death" |
| Escupitajo (`DungeonEffects`) | Proyectil del escupidor | Círculo verde con núcleo claro | "projectile sprite 8x8 px, green acid glob, 2 frames" |
| Explosión (`DungeonEffects`) | Estallido del explosivo | Anillo rojo que crece y se apaga | "explosion animation 64x64 px, 6 frames, red and orange, no outline" |
| Iconos de mejoras (`ShopPanel`, `PauseMenu`) | Las 18 mejoras y las 4 maldiciones (§7.2, §9) | Estrella en el color de la rareza (azul, rojo, ámbar) y el nombre | "pixel art icon set 16x16 px, one per upgrade: heart (vitality), hands (quick hands), boot (light feet), magnet, coin bag (greed), pockets, knife, arrow through (piercing), bounce, flame bullet, burst, leech, wind, syringe (adrenaline), fan of bullets, shadow, amulet, axe (executioner); skull variants for the curses" |
| Mago en la mazmorra (`Merchant`) | El mago de la rareza de su oferta (§7.1) | Los tres magos de Supervivencia sin cambios | Nada nuevo: la rareza se lee por el color del mago |
| Cofre del boss (`DungeonViews`, `ShopPanel`) | Elegir una de tres mejoras gratis (§7.3) | El cofre rojo oscuro; el panel de tienda en ámbar con «COFRE DEL BOSS» | "map object, high top-down view, dark red chest with golden glow seeping from the lid, 32x24 px" |
| Rastro del dash (`DungeonEffects`) | Paso de sombra (§7.2) | Brasas naranjas por código que se apagan en 1,5 s | "fire trail animation 16x16 px, 4 frames, embers dying down, no outline" |
| Altar del pacto (`DungeonViews`) | Una legendaria por una maldición (§9) | Círculo oscuro con seis velas rojas por código; apagadas al sellar el pacto | "map object, high top-down view, ring of six red candles on a dark stone circle with a pentagram, 32x24 px, lit / extinguished" |
| Golpe crítico, Amuleto, Sanguijuela | Verdugo ×3, el primer golpe absorbido, la cura por bajas (§7.2) | Sin señal propia (eventos `dungeon:ward`, `dungeon:leech` listos para el HUD y el audio) | Texto flotante «¡CRÍTICO!», destello ámbar en el jugador, «+5» verde |

## Sonidos (spec 08)

Ninguna de las 75 recetas tiene todavía un candidato elegido (`"chosen": null`), así que el juego suena con el A de cada una.

**Cómo se elige:**

1. Escucha los candidatos en PRUEBA DE SONIDOS (`docs/AUDIO.md`, sección 7).
2. Pasa la letra por el chat; COPIAR ELECCIÓN da el texto.
3. La letra se pone en `chosen` de la receta y se ejecuta `npm run audio:gen`.
4. El sonido se borra de esta lista.

**Pedidos por el usuario y aún sin su visto bueno:**

| Sonido | Qué se pidió | Qué hay ahora |
|---|---|---|
| `jingle.round.start` | Una alternativa al cambio de ronda | Le gusta, pero falta decir qué letra |
| `jingle.round.clear` | Un final de ronda nuevo | Cuerno, glockenspiel o caja de música con coro; los tres resuelven en La |
| `impact.flesh` | Que el acierto sea solo un impacto de bala en carne | Balas en carne, golpes de carne o golpes a zombis |
| `reward.repair` | Un tablón de madera seca, sin metal | Tres golpes de madera secos, de unos 200 ms, y la racha con un «toc» de bloque de madera |
| `boss.slam`, `boss.stunned` | Un golpe seco y destructivo, sin metal | Roca, piedra, ladrillo y escombros |
| `boss.dizzy.loop` | Un gruñido confuso, como una queja | Tres lamentos o quejas de zombi más graves, en bucle con un respiro |
| `music.title`, `music.calm`, `music.round`, `music.boss` | La música (fase S5) | Tres pistas CC0 por estado |

**Pendiente de fuentes:**

- `audio-src/generated/` está vacía. Si algún sonido no aparece en las bibliotecas CC0, se puede generar con IA, pero solo con el permiso del usuario (`docs/AUDIO.md`, sección 4).
- `audio-src/music/` está vacía. Las pistas que elija el usuario van ahí, con su ficha en `credits.json`.
- La música del título apenas se oye si el primer toque es JUGAR. Para que se oiga, la pantalla de título tendría que pedir un toque antes de JUGAR.
