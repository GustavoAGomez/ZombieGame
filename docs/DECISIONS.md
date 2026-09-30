# Decisiones

Registro de lo que la spec no definía (o definía de forma ambigua) y cómo se resolvió. Siempre la opción más simple.

## Fase 0 · Setup

- **Docs dentro de `docs/`.** Los archivos venían en la raíz; se movieron a `docs/specs/01-mvp-gameplay.md` y `docs/ASSETS.md`, que es donde los referencia `CLAUDE.md`.
- **TypeScript 6.0 en lugar de 7.0.** TS 7 (compilador nativo) es la última versión, pero `typescript-eslint` solo soporta `<6.1`. Se fija `typescript@~6.0.3`.
- **Tamaño del canvas.** Phaser con `Scale.NONE`: el backing store se redimensiona a `CSS × DPR` (máx. 3) con `game.scale.resize()` y el CSS fuerza el canvas al 100 % del viewport (`!important`), así no hay errores de redondeo con zoom fraccional.
- **Phaser no escucha la entrada.** `input` desactivado en la config: todos los controles son DOM (regla 2).
- **Audio desactivado** (`noAudio`) hasta que haya sonidos; evita crear un `AudioContext` bloqueado en iOS.
- **Orientación en web.** El navegador no puede bloquear la orientación, así que en vertical se muestra un aviso a pantalla completa (`GIRA EL MÓVIL`). En nativo: iOS solo `LandscapeLeft`/`LandscapeRight` (también iPad) y Android `sensorLandscape`. El resto de ajustes nativos queda para la Fase 9.
- **appId provisional** `es.garajedeideas.zombies`, nombre `Zombies`. Cambiar antes de publicar.
- **Fuentes:** solo el subconjunto `latin` de Press Start 2P y Silkscreen (cubre el español) para no empaquetar cirílico ni griego.
- **`npm audit`:** 3 avisos moderados en `uuid`, que llega por `@capacitor/cli → xcode`. Es una herramienta de desarrollo que no se incluye en la app; se deja hasta que Capacitor lo actualice.
- **Tests junto al código** (`src/**/*.test.ts`), sin carpeta aparte.

## Fase 1 · Mapa y cámara

- **Colisiones propias en lugar de Arcade Physics.** El stack cita Arcade Physics, pero las reglas 1 y 2 (lógica separada del render y reutilizable en un servidor online) mandan: las colisiones son funciones puras sobre una rejilla de tiles (`CollisionGrid`: círculo contra tiles con deslizamiento, sub-pasos contra el túnel y raycast de rejilla para línea de visión). No se activa ningún motor de física de Phaser.
- **Flags por tile.** Paredes: bloquean todo. Ventanas: bloquean al jugador y a los zombies, pero no a las balas ni a la línea de visión (se puede disparar a los zombies que arrancan tablones, como en BO1). Puertas cerradas: bloquean todo; abiertas, nada.
- **Ventanas y puertas en el `.tmj`.** Sus celdas quedan vacías en la capa `walls`; la colisión sale del objeto. Bajo las puertas hay suelo, así que "sus tiles pasan a ser suelo" es simplemente quitar el bloqueo y mostrar el frame 1 (abierta, transparente en el placeholder).
- **Orientación.** Los frames de `window_planks` y `door` se dibujan para una pared horizontal; en paredes verticales el sprite se rota 90°. La orientación sale del suelo interior adyacente.
- **Puntos de ventana derivados.** Punto exterior (donde el zombie arranca tablones) = centro + 0,75 tiles hacia fuera. Punto interior = centro del tile de dentro justo delante. El esquema de `ASSETS.md` no tiene objetos para ellos.
- **Distribución del mapa placeholder.** `inicio` 14×9 en (4,4); `pasillo` 16×5 en (4,14); `almacen` 8×8 en (21,17), desplazado hacia abajo para que la pared derecha del pasillo tenga un tramo exterior (W5) y otro compartido con el almacén (D2). Mapa de 33×28 tiles con 3 de margen para los spawns. Fuera del edificio no hay suelo (se ve `--ink`).
- **Tileset placeholder.** Los tiles con `collides` se pintan como pared y el resto como suelo; no hace falta más información en el `.tmj`.
- **Placeholder de personaje.** El cuadrado de 14×14 se centra en el ancla del frame de 48×48 (que es el centro de la hitbox). Cada fila del sheet dibuja la muesca/ojos hacia su dirección, así el render usa el mismo código con placeholders que con arte final.
- **`zombie_sprinter`** tiene su propia entrada en el manifiesto (placeholder con contorno rojo). Si no hay arte propio, puede apuntar a los PNG del corredor.
- **Sheets de 4 direcciones:** las diagonales usan la fila horizontal más cercana (SE/NE → este, SO/NO → oeste).
- **Hitbox:** manda `balance.ts`; `assets:check` avisa si el `hitbox.radius` del manifiesto no coincide.
- **`assets:import`:** sin un export real de PixelLab no se puede saber su formato. De momento el script lista lo que encuentra en `art-src/pixellab/` y avisa; la normalización se escribirá con el primer export.
- **`assets:check`:** decodificador PNG mínimo propio (`node:zlib`) para comprobar transparencia y paleta sin dependencias. Si no existe `art-src/palette.hex`, la comprobación de paleta se omite con un aviso.
