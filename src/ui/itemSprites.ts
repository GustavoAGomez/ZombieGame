import { ITEM_IDS, itemDef, type ItemId } from '../config/items';
import { itemSpriteKey, type ObjectDef } from '../game/assets/manifest';
import './itemSprites.css';

/**
 * The special items' animated sprites in the DOM HUD (spec 05): their
 * inventory slots and the pick-up button show the same sheets as the map,
 * by their manifest key (`item_<id>`, CLAUDE.md rule 5), played with CSS
 * steps at the item's fps and at 1× (pixelated). Registered at boot; an
 * item still without art keeps its pixel icon (ui/icons.ts). DOM only,
 * never Phaser (CLAUDE.md rule 4).
 */
interface ItemSprite {
  href: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
}

const sprites = new Map<ItemId, ItemSprite>();

/** Reads every item's sheet from the manifest's objects (skipping placeholders). */
export function registerItemSprites(objects: Readonly<Record<string, ObjectDef>>, assetsBase: string): void {
  sprites.clear();
  for (const id of ITEM_IDS) {
    const def = objects[itemSpriteKey(id)];
    if (!def || def.placeholder) continue;
    // Absolute URL: a relative url() inside a custom property may resolve against the stylesheet.
    const href = new URL(assetsBase + def.file, document.baseURI).href;
    sprites.set(id, { href, width: def.frameWidth, height: def.frameHeight, frames: def.frames, fps: itemDef(id).fps });
  }
}

/** A new element playing item `id`'s animation, or null while it has no art. */
export function itemSprite(id: ItemId): HTMLSpanElement | null {
  const sprite = sprites.get(id);
  if (!sprite) return null;
  const el = document.createElement('span');
  el.className = 'item-sprite';
  el.setAttribute('aria-hidden', 'true');
  const style = el.style;
  style.setProperty('--item-sheet', `url("${sprite.href}")`);
  style.setProperty('--item-w', `${sprite.width}px`);
  style.setProperty('--item-h', `${sprite.height}px`);
  style.setProperty('--item-frames', String(sprite.frames));
  style.setProperty('--item-duration', `${sprite.frames / sprite.fps}s`);
  return el;
}
