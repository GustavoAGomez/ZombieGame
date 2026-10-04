import { ASSET_KEYS, type ObjectDef } from '../game/assets/manifest';
import './sheetIcons.css';

/**
 * Pixel art icons from the manifest's sheets for the DOM HUD (CLAUDE.md
 * rule 5): the weapons' outlines (`weapon_icon`, one frame per weapon in
 * WEAPON_IDS order) and the round buttons' symbols (`icon_<name>`), at 1×
 * and pixelated, cut from their sheet by CSS. Both are a bit larger than
 * their buttons, so the art sticks out of them on purpose. Registered at boot; a sheet
 * still without art (placeholder) gives null and the caller keeps its SVG
 * pixel icon (ui/icons.ts). DOM only, never Phaser (CLAUDE.md rule 4).
 */
interface Sheet {
  href: string;
  width: number;
  height: number;
  frames: number;
}

/** The sheets the HUD takes its icons from. */
const SHEET_KEYS = [ASSET_KEYS.weaponIcon, ASSET_KEYS.iconReload, ASSET_KEYS.iconRepair, ASSET_KEYS.iconKnife, ASSET_KEYS.iconDash] as const;

const sheets = new Map<string, Sheet>();

/** Reads the icon sheets from the manifest's objects (skipping placeholders). */
export function registerSheetIcons(objects: Readonly<Record<string, ObjectDef>>, assetsBase: string): void {
  sheets.clear();
  for (const key of SHEET_KEYS) {
    const def = objects[key];
    if (!def || def.placeholder) continue;
    // Absolute URL: a relative url() inside a custom property may resolve against the stylesheet.
    const href = new URL(assetsBase + def.file, document.baseURI).href;
    sheets.set(key, { href, width: def.frameWidth, height: def.frameHeight, frames: def.frames });
  }
}

/** A new element showing frame `frame` of sheet `key` at 1×, or null while the sheet has no art. */
export function sheetIcon(key: string, frame = 0): HTMLSpanElement | null {
  const sheet = sheets.get(key);
  if (!sheet || frame < 0 || frame >= sheet.frames) return null;
  const el = document.createElement('span');
  el.className = 'sheet-icon';
  el.setAttribute('aria-hidden', 'true');
  const style = el.style;
  style.setProperty('--icon-sheet', `url("${sheet.href}")`);
  style.setProperty('--icon-w', `${sheet.width}px`);
  style.setProperty('--icon-h', `${sheet.height}px`);
  style.setProperty('--icon-sheet-w', `${sheet.width * sheet.frames}px`);
  style.setProperty('--icon-x', `${-frame * sheet.width}px`);
  return el;
}
