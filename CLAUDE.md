# Zombies Top-Down (nombre provisional)

Juego móvil (iOS + Android) top-down shooter pixel art de supervivencia por oleadas, inspirado en el modo Zombies de Black Ops 1. Sobrevives en una habitación, reparas ventanas con tablones y compras puertas para abrir más zonas del mapa.

- **MVP:** 1 jugador, con el arte en rectángulos (placeholders) y el HUD de la "Propuesta A".
- **Futuro:** cooperativo online para 4 jugadores. La arquitectura ya debe estar preparada para ello (ver reglas 1 y 2).

## Stack

- **Phaser 4** (última versión estable 4.x) + **TypeScript** en modo `strict` + **Vite**
- **Arcade Physics** para colisiones
- **HUD y controles táctiles en DOM** (HTML + CSS + TypeScript sin framework), superpuestos al canvas
- **Capacitor** (última versión estable) para empaquetar iOS y Android
- **Vitest** para la lógica pura
- Fuentes **Press Start 2P** y **Silkscreen** instaladas con `@fontsource/*`. Sin CDN: la app tiene que funcionar offline.

## Comandos (a crear en la Fase 0)

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo con `--host`, para probar en el móvil por la red local |
| `npm run build` | Build de producción |
| `npm run typecheck` / `npm run lint` / `npm test` | Comprobaciones; tienen que pasar en verde al cerrar cada fase |
| `npm run cap:sync` | Build + `npx cap sync` |
| `npm run cap:ios` / `npm run cap:android` | Abren el proyecto nativo (Xcode / Android Studio) |
| `npm run assets:import` | Importa exports crudos de PixelLab (ver `docs/ASSETS.md`) |
| `npm run assets:check` | Valida tamaños, nombres, manifiesto y paleta |
| `npm run hud:import` | Limpia las piezas del HUD de PixelLab (`art-src/pixellab/hud/`) y las deja en `public/assets/ui/`, con la hoja del antes y el después en `maps/preview/hud/` |
| `npm run tiles:review` | Hojas de revisión de los kits, los Wang y los suelos en `maps/preview/tiles/` (ábrelas antes de importar) |
| `npm run tiles:import` | Importa los tilesets, kits (autotile de paredes) y decals de PixelLab (spec 02, `docs/ASSETS.md` §7) |
| `npm run map:build [mapa]` | Compila el plano ASCII `maps/src/<mapa>.txt` a `art-src/tiled/<mapa>.tmj` (sin pisar retoques hechos en Tiled salvo con `--force`), embebe los tilesets en `public/assets/maps/` y valida |
| `npm run map:preview [mapa]` | Renderiza el mapa a PNG en `maps/preview/` (completo a 1:4, cada zona a 1:1 y el plano ASCII) |
| `npm run windows:compose` | Monta las hojas de las barricadas (hueco de PixelLab + tablones de la madera del suelo) y su hoja de revisión en `maps/preview/windows/` |

## Reglas de arquitectura

1. **Lógica separada del render.** Toda la lógica de juego vive en *sistemas* que operan sobre un estado plano (`GameState`) con paso fijo de 60 Hz. Los sprites de Phaser solo leen el estado y no guardan lógica.
2. **La entrada solo produce comandos.** Cada tick se genera un `InputCommand` (movimiento, apuntado, disparo, cambio de arma, especial, acción contextual). No hay lógica de juego en los handlers táctiles. En el online, este mismo comando se enviará al servidor.
3. **Balance centralizado.** Todos los números ajustables viven en `src/config/balance.ts`. No hay números mágicos en los sistemas.
4. **Juego → HUD por eventos.** La comunicación va por un `EventBus` tipado. El HUD nunca importa ni consulta Phaser.
5. **Assets solo por manifiesto.** Todo asset se referencia por su clave en `public/assets/manifest.json` (ver `docs/ASSETS.md`), nunca por ruta de PNG en el código. Si un asset falta, se genera en runtime un placeholder rectangular del mismo tamaño.
6. **Mapas en Tiled JSON (`.tmj`)** con el esquema de capas y objetos de `docs/ASSETS.md`.
7. **Pools de objetos** para balas, zombies, efectos y textos flotantes. Nada de crear y destruir en caliente.
8. **Dependencias mínimas.** No añadas dependencias pesadas sin justificarlo en el resumen de la fase.

## Estructura objetivo

```
src/
  main.ts                 arranque de Phaser + HUD
  config/
    balance.ts            todos los números de juego
    weapons.ts            catálogo de armas: estadísticas, mejoras propias de cada arma y especiales
    display.ts            resolución, zoom, safe areas
    theme.ts              colores y fuentes (tokens de la Propuesta A)
  core/
    EventBus.ts           eventos tipados juego → HUD
    GameState.ts          estado plano de la partida
    InputCommand.ts
    FixedStep.ts
  game/
    scenes/               BootScene, TitleScene, GameScene, GameOverScene
    entities/             Player, Zombie, Bullet (vista + referencia a su estado)
    systems/              Movement, Weapon, Bullet, ZombieAI, FlowField, Spawn,
                          Wave, Barricade, Door, Points, Health, Special
    map/MapLoader.ts      lee el .tmj y construye zonas, ventanas, puertas y spawns
    assets/               manifest.ts (tipos + carga), placeholders.ts
  input/
    VirtualJoystick.ts    joystick DOM (izquierda)
    FireStick.ts          botón de disparo con arrastre (derecha)
    ActionButtons.ts      cambiar arma, especial, acción contextual
    InputCollector.ts     une todo en un InputCommand por tick
  native/                 preferencias del dispositivo y vibración (haptics)
  ui/
    hud/                  Hud.ts, hud.css, componentes
    strings.ts            todos los textos de UI en español
  debug/DebugOverlay.ts
scripts/                  gen-placeholder-map.ts, import-pixellab.ts, check-assets.ts, build-map.ts, preview-map.ts
maps/src/                 planos ASCII de los mapas (fuente; skill level-design)
maps/preview/             vistas previas generadas por map:preview
public/assets/            manifest.json, maps/, sprites/, tiles/
docs/                     specs/, ASSETS.md, DECISIONS.md, GAME-DESIGN.md, ROADMAP.md
```

## Forma de trabajar

- Las specs están en `docs/specs/`. Se implementan **por fases**, en el orden indicado.
- Al cerrar cada fase:
  1. `typecheck`, `lint` y `test` en verde.
  2. Commit con mensaje `feat(fase-N): …`.
  3. Resumen breve: qué funciona, cómo probarlo en el móvil y qué queda pendiente.
- Si algo no está definido en la spec, elige la opción más simple y anótala en `docs/DECISIONS.md`.
- Las reglas del juego tal como están implementadas (armas y sus mejoras, vitrinas, magos, economía y precios, objetos y activaciones) viven en `docs/GAME-DESIGN.md`. Actualízalo en el mismo commit cuando cambie una regla, un precio o un número de juego, o se añada un arma, un mago, un objeto o una activación.
- Lo que queremos añadir al juego y por qué, por orden, vive en `docs/ROADMAP.md`. Cada bloque pasa a ser una spec cuando toque; al cerrar una spec, márcalo como hecho allí y lleva las reglas definitivas a `GAME-DESIGN.md`.
- **Idioma:** código, nombres y comentarios en inglés. Todos los textos visibles, en español y centralizados en `src/ui/strings.ts`.
