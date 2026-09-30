import type Phaser from 'phaser';
import type { GameState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey, tilesetTextureKey } from '../assets/manifest';
import { DEPTH } from '../depth';
import type { MapData } from './MapLoader';

/** Draws the map from MapData and mirrors window / door state. Read-only. */
export class MapView {
  private readonly windowSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly doorSprites: Phaser.GameObjects.Sprite[][] = [];
  private readonly shownPlanks: number[] = [];
  private readonly shownDoorsOpen: boolean[] = [];

  constructor(scene: Phaser.Scene, private readonly map: MapData) {
    const ts = map.tileSize;
    const tilemap = scene.make.tilemap({ width: map.width, height: map.height, tileWidth: ts, tileHeight: ts });
    const tileset = tilemap.addTilesetImage(map.tileset.name, tilesetTextureKey(map.tileset.name), ts, ts, 0, 0, 0);
    if (!tileset) throw new Error(`Tileset "${map.tileset.name}" has no texture`);

    const layers: [string, Int16Array, number][] = [
      ['floor', map.floor, DEPTH.floor],
      ['decor', map.decor, DEPTH.decor],
      ['walls', map.walls, DEPTH.walls],
    ];
    for (const [name, data, depth] of layers) {
      const layer = tilemap.createBlankLayer(name, tileset, 0, 0);
      if (!layer) throw new Error(`Could not create layer ${name}`);
      layer.setDepth(depth);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const id = data[y * map.width + x] ?? -1;
          if (id >= 0) layer.putTileAt(id, x, y);
        }
      }
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
