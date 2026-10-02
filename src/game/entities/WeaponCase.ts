import type Phaser from 'phaser';
import { WEAPON_CASES } from '../../config/balance';
import { COLORS, FONTS } from '../../config/theme';
import { WEAPON_IDS } from '../../config/weapons';
import type { GameState, PlayerState } from '../../core/GameState';
import { STRINGS } from '../../ui/strings';
import { ASSET_KEYS, objectTextureKey } from '../assets/manifest';
import { actorDepth, DEPTH } from '../depth';
import type { MapData, MapWeaponCase } from '../map/MapLoader';
import { findWeapon } from '../systems/InventorySystem';
import { ammoPrice } from '../systems/WeaponCaseSystem';

interface CaseView {
  image: Phaser.GameObjects.Image;
  price: Phaser.GameObjects.Text;
  shownPrice: number;
}

/**
 * Weapon cases on the map (spec 04 §3): the cabinet, sorted with the actors
 * like solid furniture, and its price in amber over it while the player is
 * within WEAPON_CASES.priceLabelRange (the ammo price once the weapon is
 * carried). Render only.
 */
export class WeaponCaseViews {
  private readonly views: CaseView[];

  constructor(scene: Phaser.Scene, private readonly map: MapData) {
    const ts = map.tileSize;
    this.views = map.weaponCases.map((c) => {
      const upright = c.facing !== 'south';
      const bottom = (c.tileY + 1) * ts - 1;
      const image = scene.add
        .image(c.x, bottom, objectTextureKey(upright ? ASSET_KEYS.weaponCaseV : ASSET_KEYS.weaponCase), Math.max(0, WEAPON_IDS.indexOf(c.weapon)))
        .setOrigin(0.5, 1)
        .setFlipX(c.facing === 'west')
        .setDepth(actorDepth(bottom));
      const price = scene.add
        .text(c.x, bottom - image.height - 3, '', {
          fontFamily: FONTS.display,
          fontSize: '8px',
          color: COLORS.amber,
          shadow: { offsetX: 1, offsetY: 1, color: COLORS.ink, fill: true, blur: 0 },
        })
        .setOrigin(0.5, 1)
        .setDepth(DEPTH.aimLine + 1)
        .setVisible(false);
      return { image, price, shownPrice: -1 };
    });
  }

  sync(state: GameState, player: PlayerState | undefined): void {
    this.map.weaponCases.forEach((c, i) => {
      const view = this.views[i];
      if (!view) return;
      const near = player !== undefined && player.hp > 0 && state.zonesUnlocked[c.zoneIndex] === true && within(c, player, WEAPON_CASES.priceLabelRange);
      if (!near) {
        if (view.price.visible) view.price.setVisible(false);
        return;
      }
      const price = findWeapon(player, c.weapon) >= 0 ? ammoPrice(c) : c.cost;
      if (price !== view.shownPrice) {
        view.shownPrice = price;
        view.price.setText(STRINGS.hud.money(price));
      }
      if (!view.price.visible) view.price.setVisible(true);
    });
  }
}

function within(c: MapWeaponCase, p: PlayerState, range: number): boolean {
  return (c.x - p.x) ** 2 + (c.y - p.y) ** 2 <= range * range;
}
