# Arte pendiente

Objetos y tiles que el juego ya usa con un placeholder. Cada entrada lleva el prompt sugerido para PixelLab (vista top-down, ángulo *high top-down*, misma paleta que el jugador). Cuando llegue el export, se importa con las herramientas de `docs/ASSETS.md` y se borra de esta lista.

## Tiles

| Clave | Uso | Placeholder actual | Prompt sugerido |
|---|---|---|---|
| tileset de tierra (Wang, 2 terrenos: tierra / césped) | Senderos pisados `d` del plano: jardín, pasillo lateral, atajos | `map_special` id 2: ruido marrón de 32×32 con bordes duros | "Wang tileset, top-down, trodden dirt path / dry lawn, 32x32, corner wang, muted palette" |
| `floors_interior` a 32×32 | Suelos de la casa | Export de 48×48 reducido a 32×32 (se notan las juntas) | Volver a exportar el mismo set a 32×32 |
| azotea (tela asfáltica o grava) | Suelo `r` de la azotea | Hormigón de `floors_interior` | "top-down flat roof surface, gravel and tar patches, 32x32 seamless tile" |
