import { PLAYER } from '../../config/balance';
import { DISPLAY } from '../../config/display';
import { dir8FromAngle } from '../../core/math';
import { directionRow, type CharacterDef } from '../assets/manifest';

/**
 * Where the gun's muzzle is drawn, relative to the character's feet (its
 * logical position), for a facing angle. Comes from the manifest's
 * per-direction `muzzle` points; without them, a point at gun height in
 * front of the character.
 */
export function muzzleOffset(def: CharacterDef | undefined, facing: number, out: { x: number; y: number }): { x: number; y: number } {
  const dir = dir8FromAngle(facing);
  const point = def?.muzzle?.[directionRow(dir, def.directions)];
  if (def && point) {
    out.x = point[0] - def.frameWidth * def.anchor.x;
    out.y = point[1] - def.frameHeight * def.anchor.y;
  } else {
    out.x = Math.cos(facing) * PLAYER.muzzleDistance;
    out.y = Math.sin(facing) * PLAYER.muzzleDistance - DISPLAY.shotHeight;
  }
  return out;
}
