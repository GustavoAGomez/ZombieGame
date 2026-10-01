import type Phaser from 'phaser';
import { DISPLAY } from '../../config/display';
import { COLORS } from '../../config/theme';
import type { GameState } from '../../core/GameState';
import { ASSET_KEYS, objectTextureKey, tilesetTextureKey } from '../assets/manifest';
import { DEPTH, actorDepth } from '../depth';
import { cellHidden, fogEdges, fogOwners } from './fog';
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
  private readonly portalSprites: Phaser.GameObjects.Sprite[][] = [];
  private readonly shownPlanks: number[] = [];
  private readonly shownDoorsOpen: boolean[] = [];
  private readonly shownPortalsOpen: boolean[] = [];
  /** Darkness over each zone until it is unlocked (what lies behind a closed door stays unknown). */
  private readonly fog: Phaser.GameObjects.Graphics[] = [];
  private readonly fogShown: boolean[] = [];
  /**
   * Darkness over the borders (walls, doors, fences, land outside) of zones
   * that are all locked. Two layers: on an unlock the new one is drawn and
   * the old one fades out over it.
   */
  private readonly edgeFog: Phaser.GameObjects.Graphics[] = [];
  private edgeFront = 0;
  private readonly owners: Int16Array;
  private readonly edgeMasks: Int32Array;
  private unlockedMask: number;
  /** Map sprites and the cell they stand on: hidden while that cell is dark, so tall art never pokes out of the darkness. */
  private readonly cellObjects: { obj: Phaser.GameObjects.Components.Visible; cell: number }[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: MapData,
  ) {
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
      ['decor', map.decor, DEPTH.floorDetail, false],
      ['shadows', map.shadows, DEPTH.shadows, false],
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
          else this.onCell(this.addTileSprite(scene, tileset, gid, x * ts, (y + 1) * ts, ySorted ? actorDepth((y + 1) * ts) : depth), x, y);
        }
      }
    }

    for (const decal of map.decals) {
      const tileset = tilesetForGid(map.tilesets, decal.gid);
      if (!tileset) continue;
      const image = this.addTileSprite(scene, tileset, decal.gid, decal.x, decal.y, DEPTH.decor).setFlip(decal.flipX, decal.flipY);
      this.onCell(image, Math.floor((decal.x + tileset.tileWidth / 2) / ts), Math.floor((decal.y - tileset.tileHeight / 2) / ts));
    }

    // Furniture: anchored at the bottom of its footprint (taller art grows upwards); with collision it is y-sorted.
    for (const prop of map.props) {
      const bottom = prop.y + prop.height;
      const image = scene.add
        .image(prop.x, bottom, objectTextureKey(prop.key))
        .setOrigin(0, 1)
        .setFlip(prop.flipX, prop.flipY)
        .setDepth(prop.collides ? actorDepth(bottom) : DEPTH.floorProps);
      const tile = prop.tiles[0];
      if (tile) this.onCell(image, tile.x, tile.y);
    }

    for (const w of map.windows) {
      // Each wall orientation has its own art (lit from the top-left): never rotate.
      const key = w.axis === 'vertical' ? ASSET_KEYS.windowPlanksV : ASSET_KEYS.windowPlanks;
      const sprite = scene.add.sprite(w.center.x, w.center.y, objectTextureKey(key), w.planks).setDepth(DEPTH.mapObjects);
      this.onCell(sprite, w.tileX, w.tileY);
      this.windowSprites.push(sprite);
      this.shownPlanks.push(w.planks);
    }

    for (const door of map.doors) {
      const key = door.axis === 'vertical' ? ASSET_KEYS.doorV : ASSET_KEYS.door;
      const sprites = door.tiles.map((t) =>
        this.onCell(scene.add.sprite((t.x + 0.5) * ts, (t.y + 0.5) * ts, objectTextureKey(key), 0).setDepth(DEPTH.mapObjects), t.x, t.y),
      );
      this.doorSprites.push(sprites);
      this.shownDoorsOpen.push(false);
    }

    for (const portal of map.portals) {
      const sprites = portal.tiles.map((t) =>
        this.onCell(scene.add.sprite((t.x + 0.5) * ts, (t.y + 0.5) * ts, objectTextureKey(ASSET_KEYS.portal), 0).setDepth(DEPTH.mapObjects), t.x, t.y),
      );
      this.portalSprites.push(sprites);
      this.shownPortalsOpen.push(false);
    }

    this.owners = fogOwners(map);
    this.edgeMasks = fogEdges(map, this.owners);
    this.unlockedMask = map.zones.reduce((mask, z, i) => (z.startsUnlocked && i < 31 ? mask | (1 << i) : mask), 0);
    this.buildFog();
    this.showUnlocked(this.unlockedMask, false);
  }

  /** Remembers which cell a map sprite stands on, for hiding it while that cell is dark. */
  private onCell<T extends Phaser.GameObjects.Components.Visible>(obj: T, x: number, y: number): T {
    const cx = Math.min(Math.max(x, 0), this.map.width - 1);
    const cy = Math.min(Math.max(y, 0), this.map.height - 1);
    this.cellObjects.push({ obj, cell: cy * this.map.width + cx });
    return obj;
  }

  /**
   * One dark layer per zone, the colour of the void: its floor plus the walls
   * and obstacles inside it (partitions, pillars), so the layout of a locked
   * room cannot be guessed. Its border (walls, doors, windows) is the edge
   * layer's job.
   */
  private buildFog(): void {
    const { width, height, tileSize: ts } = this.map;
    const owner = this.owners;
    for (let i = 0; i < 2; i++) this.edgeFog.push(this.scene.add.graphics().setDepth(DEPTH.fog).setVisible(false));
    const ink = Number.parseInt(COLORS.ink.slice(1), 16);
    this.map.zones.forEach((_, zi) => {
      const g = this.scene.add.graphics().setDepth(DEPTH.fog);
      g.fillStyle(ink, 1);
      for (let y = 0; y < height; y++) {
        // Runs of cells on the row, one rectangle each.
        let x = 0;
        while (x < width) {
          if (owner[y * width + x] !== zi) {
            x++;
            continue;
          }
          const start = x;
          while (x < width && owner[y * width + x] === zi) x++;
          // The 3/4 faces of walls below poke into these cells and get covered too.
          g.fillRect(start * ts, y * ts, (x - start) * ts, ts);
        }
      }
      g.setVisible(!this.map.zones[zi]?.startsUnlocked);
      this.fog.push(g);
      this.fogShown.push(g.visible);
    });
  }

  /** A tile drawn as an image from its bottom-left corner (Tiled's convention for tall tiles). */
  private addTileSprite(scene: Phaser.Scene, tileset: MapTileset, gid: number, x: number, bottom: number, depth: number): Phaser.GameObjects.Image {
    return scene.add
      .image(x, bottom, tilesetTextureKey(tileset.name), gid - tileset.firstGid)
      .setOrigin(0, 1)
      .setDepth(depth);
  }

  /**
   * Shows what the zones of `unlockedMask` reveal: the border darkness is
   * redrawn (the old one fading out over it) and map sprites on dark cells
   * are hidden.
   */
  private showUnlocked(unlockedMask: number, fade: boolean): void {
    const { width, height, tileSize: ts } = this.map;
    const hidden = (i: number): boolean => this.owners[i] === -1 && cellHidden(i, this.owners, this.edgeMasks, unlockedMask);
    const old = this.edgeFog[this.edgeFront];
    this.edgeFront = 1 - this.edgeFront;
    const g = this.edgeFog[this.edgeFront];
    if (!old || !g) return;
    this.scene.tweens.killTweensOf(g);
    g.clear().setAlpha(1).setVisible(true);
    g.fillStyle(Number.parseInt(COLORS.ink.slice(1), 16), 1);
    for (let y = 0; y < height; y++) {
      let x = 0;
      while (x < width) {
        if (!hidden(y * width + x)) {
          x++;
          continue;
        }
        const start = x;
        while (x < width && hidden(y * width + x)) x++;
        g.fillRect(start * ts, y * ts, (x - start) * ts, ts);
      }
    }
    this.scene.tweens.killTweensOf(old);
    if (fade && old.visible) {
      this.scene.tweens.add({ targets: old, alpha: 0, duration: DISPLAY.fogFadeMs, onComplete: () => old.clear().setVisible(false) });
    } else {
      old.clear().setVisible(false);
    }
    for (const { obj, cell } of this.cellObjects) obj.setVisible(!cellHidden(cell, this.owners, this.edgeMasks, unlockedMask));
  }

  /** Updates sprite frames only when the underlying value changed. */
  sync(state: GameState): void {
    let unlockedMask = 0;
    state.zonesUnlocked.forEach((u, i) => {
      if (u && i < 31) unlockedMask |= 1 << i;
    });
    if (unlockedMask !== this.unlockedMask) {
      this.unlockedMask = unlockedMask;
      this.showUnlocked(unlockedMask, true);
    }
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
    for (let i = 0; i < this.fog.length; i++) {
      const locked = state.zonesUnlocked[i] !== true;
      if (locked === this.fogShown[i]) continue;
      this.fogShown[i] = locked;
      const g = this.fog[i];
      if (!g) continue;
      this.scene.tweens.killTweensOf(g);
      if (locked) g.setVisible(true).setAlpha(1);
      else this.scene.tweens.add({ targets: g, alpha: 0, duration: DISPLAY.fogFadeMs, onComplete: () => g.setVisible(false) });
    }
    for (let i = 0; i < this.portalSprites.length; i++) {
      const open = state.portalsOpen[this.map.portals[i]?.link ?? -1] ?? false;
      if (open !== this.shownPortalsOpen[i]) {
        this.shownPortalsOpen[i] = open;
        for (const sprite of this.portalSprites[i] ?? []) sprite.setFrame(open ? 1 : 0);
      }
    }
  }

  /** Whether the world point lies in the dark (a zone not unlocked yet, or the border of only such zones). */
  isDark(x: number, y: number): boolean {
    const { width, height, tileSize: ts } = this.map;
    const cx = Math.floor(x / ts);
    const cy = Math.floor(y / ts);
    if (cx < 0 || cy < 0 || cx >= width || cy >= height) return false;
    return cellHidden(cy * width + cx, this.owners, this.edgeMasks, this.unlockedMask);
  }

  get widthPx(): number {
    return this.map.widthPx;
  }

  get heightPx(): number {
    return this.map.heightPx;
  }
}
