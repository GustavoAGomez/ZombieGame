import type Phaser from 'phaser';
import type { GameState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey, tilesetTextureKey } from '../assets/manifest';
import { DEPTH, actorDepth } from '../depth';
import { tilesetForGid, type MapData, type MapTileset } from './MapLoader';

/**
 * Draws the map from MapData and mirrors window / door state. Read-only.
 *  - floor and decor: tilemap layers (only grid-sized tiles);
 *  - walls, and any tile taller than the grid: sprites anchored at the
 *    bottom-left of their cell and y-sorted with the characters, so the
 *    3/4 face of a wall hides whoever stands behind it;
 *  - decals: images, drawn from their bottom-left like Tiled tile objects.
 */
export class MapView {
  private readonly windowSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly doorSprites: Phaser.GameObjects.Sprite[][] = [];
  private readonly shownPlanks: number[] = [];
  private readonly shownDoorsOpen: boolean[] = [];

  constructor(scene: Phaser.Scene, private readonly map: MapData) {
    const ts = map.tileSize;
    const tilemap = scene.make.tilemap({ width: map.width, height: map.height, tileWidth: ts, tileHeight: ts });
    const gridTilesets: Phaser.Tilemaps.Tileset[] = [];
    for (const t of map.tilesets) {
      if (t.tileWidth !== ts || t.tileHeight !== ts) continue;
      const added = tilemap.addTilesetImage(t.name, tilesetTextureKey(t.name), ts, ts, 0, 0, t.firstGid);
      if (added) gridTilesets.push(added);
    }

    const layers: [string, Int32Array, number, boolean][] = [
      ['floor', map.floor, DEPTH.floor, false],
      ['decor', map.decor, DEPTH.decor, false],
      ['walls', map.walls, DEPTH.walls, true],
    ];
    for (const [name, data, depth, ySorted] of layers) {
      const layer = gridTilesets.length > 0 ? tilemap.createBlankLayer(name, gridTilesets, 0, 0) : null;
      layer?.setDepth(depth);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const gid = data[y * map.width + x] ?? 0;
          if (gid === 0) continue;
          const tileset = tilesetForGid(map.tilesets, gid);
          if (!tileset) continue;
          const gridSized = tileset.tileWidth === ts && tileset.tileHeight === ts;
          if (gridSized && !ySorted) layer?.putTileAt(gid, x, y);
          else this.addTileSprite(scene, tileset, gid, x * ts, (y + 1) * ts, ySorted ? actorDepth((y + 1) * ts) : depth);
        }
      }
    }

    for (const decal of map.decals) {
      const tileset = tilesetForGid(map.tilesets, decal.gid);
      if (tileset) this.addTileSprite(scene, tileset, decal.gid, decal.x, decal.y, DEPTH.decor);
    }

    for (const w of map.windows) {
      // Each wall orientation has its own art (lit from the top-left): never rotate.
      const key = w.axis === 'vertical' ? ASSET_KEYS.windowPlanksV : ASSET_KEYS.windowPlanks;
      const sprite = scene.add.sprite(w.center.x, w.center.y, objectTextureKey(key), w.planks).setDepth(DEPTH.mapObjects);
      this.windowSprites.push(sprite);
      this.shownPlanks.push(w.planks);
    }

    for (const door of map.doors) {
      const key = door.axis === 'vertical' ? ASSET_KEYS.doorV : ASSET_KEYS.door;
      const sprites = door.tiles.map((t) =>
        scene.add.sprite((t.x + 0.5) * ts, (t.y + 0.5) * ts, objectTextureKey(key), 0).setDepth(DEPTH.mapObjects),
      );
      this.doorSprites.push(sprites);
      this.shownDoorsOpen.push(false);
    }
  }

  /** A tile drawn as an image from its bottom-left corner (Tiled's convention for tall tiles). */
  private addTileSprite(scene: Phaser.Scene, tileset: MapTileset, gid: number, x: number, bottom: number, depth: number): void {
    scene.add
      .image(x, bottom, tilesetTextureKey(tileset.name), gid - tileset.firstGid)
      .setOrigin(0, 1)
      .setDepth(depth);
  }

  /** Updates sprite frames only when the underlying value changed. */
  sync(state: GameState): void {
    for (let i = 0; i < this.windowSprites.length; i++) {
      const planks = state.windowPlanks[i] ?? 0;
      if (planks !== this.shownPlanks[i]) {
        this.shownPlanks[i] = planks;
        this.windowSprites[i]?.setFrame(planks);
      }
    }
    for (let i = 0; i < this.doorSprites.length; i++) {
      const open = state.doorsOpen[i] ?? false;
      if (open !== this.shownDoorsOpen[i]) {
        this.shownDoorsOpen[i] = open;
        for (const sprite of this.doorSprites[i] ?? []) sprite.setFrame(open ? 1 : 0);
      }
    }
  }

  get widthPx(): number {
    return this.map.widthPx;
  }

  get heightPx(): number {
    return this.map.heightPx;
  }
}
