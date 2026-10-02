import type Phaser from 'phaser';
import { ZOMBIES } from '../../config/balance';
import { ITEM_IDS } from '../../config/items';
import { MERCHANTS } from '../../config/merchants';
import { iconDef } from '../../ui/icons';
import { COLORS } from '../../config/theme';
import { propColor, shade } from './propColors';
import { TILE_COLLIDES, TILE_VOID, TILE_WATER, type MapTileset } from '../map/MapLoader';
import {
  ASSET_KEYS,
  DIRECTIONS_4,
  DIRECTIONS_8,
  animationDirections,
  characterTextureKey,
  objectTextureKey,
  tilesetTextureKey,
  type CharacterDef,
  type ObjectDef,
} from './manifest';

/**
 * Rectangle placeholders drawn at runtime with the same sizes the final art
 * will have (spec 01 §6). Sheets follow docs/ASSETS.md: rows = directions,
 * columns = frames.
 */
export const PLACEHOLDER_COLORS = {
  floorGrid: '#2f2922',
  wallTop: '#735a45',
  windowGap: '#14120f',
  plankNail: '#2a2420',
  doorClosed: '#2b3d47',
  stepDark: '#3a332b',
  stepLight: '#8c7a62',
  player: '#4b5a36',
  playerShade: '#3d4a2c',
  playerNotch: '#d9b38c',
  zombie: '#7fa34a',
  zombieEye: '#c93a2b',
  runnerOutline: '#b5d67a',
  sprinterOutline: '#c93a2b',
  /** Rotten zombie blood: almost black at the rim, dark red-brown body, a brownish sheen (viscous). */
  bloodDark: '#2a0a08',
  blood: '#4a120e',
  bloodMid: '#621a12',
  bloodSheen: '#8c3c24',
  /** Fresh (the player's) blood: bright red. */
  freshDark: '#5c0c0d',
  fresh: '#a3161a',
  freshMid: '#c42620',
  freshSheen: '#ea6a4e',
  generic: '#8a3fa0',
} as const;

const BODY_SIZE = 14;

/** Unit-ish offsets per 8-way direction, in sheet row order (south first). */
const DIR_OFFSETS: Record<string, readonly [number, number]> = {
  south: [0, 1],
  'south-east': [1, 1],
  east: [1, 0],
  'north-east': [1, -1],
  north: [0, -1],
  'north-west': [-1, -1],
  west: [-1, 0],
  'south-west': [-1, 1],
};

type Ctx = CanvasRenderingContext2D;

function rect(ctx: Ctx, color: string, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

function createSheet(
  scene: Phaser.Scene,
  key: string,
  frameWidth: number,
  frameHeight: number,
  columns: number,
  rows: number,
  draw: (ctx: Ctx, col: number, row: number, ox: number, oy: number) => void,
): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, frameWidth * columns, frameHeight * rows);
  if (!texture) throw new Error(`Could not create placeholder texture ${key}`);
  const ctx = texture.context;
  ctx.imageSmoothingEnabled = false;
  let frame = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const ox = col * frameWidth;
      const oy = row * frameHeight;
      draw(ctx, col, row, ox, oy);
      texture.add(frame++, 0, ox, oy, frameWidth, frameHeight);
    }
  }
  texture.refresh();
}

interface CharacterLook {
  body: string;
  shade: string;
  outline?: string;
  /** Player: notch showing the facing. Zombie: two red eyes. */
  mark: 'notch' | 'eyes';
}

function characterLook(character: string): CharacterLook {
  switch (character) {
    case ASSET_KEYS.player:
      return { body: PLACEHOLDER_COLORS.player, shade: PLACEHOLDER_COLORS.playerShade, mark: 'notch' };
    case ASSET_KEYS.zombieRunner:
      return { body: PLACEHOLDER_COLORS.zombie, shade: '#5f7d35', outline: PLACEHOLDER_COLORS.runnerOutline, mark: 'eyes' };
    case ASSET_KEYS.zombieSprinter:
      return { body: PLACEHOLDER_COLORS.zombie, shade: '#5f7d35', outline: PLACEHOLDER_COLORS.sprinterOutline, mark: 'eyes' };
    default:
      return { body: PLACEHOLDER_COLORS.zombie, shade: '#5f7d35', mark: 'eyes' };
  }
}

function frameOffset(animation: string, frame: number, dx: number, dy: number): [number, number, number] {
  // [offsetX, offsetY, alpha] to give each placeholder animation some life.
  switch (animation) {
    case 'walk':
      return [0, frame % 2 === 0 ? 0 : -1, 1];
    case 'attack':
    case 'shoot':
      return [Math.sign(dx) * Math.min(frame, 2), Math.sign(dy) * Math.min(frame, 2), 1];
    case 'dash':
      return [0, 0, 0.75];
    case 'death':
      return [0, 0, Math.max(0.15, 1 - frame * 0.15)];
    default:
      return [0, 0, 1];
  }
}

export function createCharacterPlaceholder(
  scene: Phaser.Scene,
  character: string,
  def: CharacterDef,
  animation: string,
): void {
  const anim = def.animations[animation];
  if (!anim) return;
  const look = characterLook(character);
  const rows = animationDirections(def, animation);
  const names = rows === 8 ? DIRECTIONS_8 : rows === 4 ? DIRECTIONS_4 : (['south'] as const);
  const anchorX = Math.round(def.frameWidth * def.anchor.x);
  const anchorY = Math.round(def.frameHeight * def.anchor.y);

  createSheet(scene, characterTextureKey(character, animation), def.frameWidth, def.frameHeight, anim.frames, names.length,
    (ctx, col, row, ox, oy) => {
      const [dx, dy] = DIR_OFFSETS[names[row] ?? 'south'] ?? [0, 1];
      const [fx, fy, alpha] = frameOffset(animation, col, dx, dy);
      ctx.globalAlpha = alpha;
      // The body stands on the anchor (the feet), like the final 3/4 art. A
      // zombie is drawn exactly as big as the body bullets hit (ZOMBIES.hurtbox,
      // outline included); the player keeps the small square.
      const bodyW = look.mark === 'eyes' ? ZOMBIES.hurtbox.width - 2 : BODY_SIZE;
      const bodyH = look.mark === 'eyes' ? ZOMBIES.hurtbox.height - 2 : BODY_SIZE;
      const x = ox + anchorX - bodyW / 2 + fx;
      const y = oy + anchorY - bodyH - 1 + fy;
      rect(ctx, 'rgba(15,14,12,0.5)', x, y + bodyH + 1, bodyW, 1);
      if (look.outline) rect(ctx, look.outline, x - 1, y - 1, bodyW + 2, bodyH + 2);
      rect(ctx, look.body, x, y, bodyW, bodyH);
      rect(ctx, look.shade, x, y + bodyH - 3, bodyW, 3);
      const cx = x + bodyW / 2;
      // Eyes go on the head: the top of a tall body.
      const cy = look.mark === 'eyes' ? y + 6 : y + bodyH / 2;
      if (look.mark === 'notch') {
        // Notch on the edge (or corner) the character faces.
        rect(ctx, PLACEHOLDER_COLORS.playerNotch, cx + dx * 5 - 2, cy + dy * 5 - 2, 4, 4);
      } else {
        // Two eyes towards the facing, spread perpendicular to it.
        const len = Math.hypot(dx, dy) || 1;
        const px = -dy / len;
        const py = dx / len;
        const ex = cx + (dx / len) * 3;
        const ey = cy + (dy / len) * 3;
        rect(ctx, PLACEHOLDER_COLORS.zombieEye, ex + px * 3 - 1, ey + py * 3 - 1, 2, 2);
        rect(ctx, PLACEHOLDER_COLORS.zombieEye, ex - px * 3 - 1, ey - py * 3 - 1, 2, 2);
      }
      ctx.globalAlpha = 1;
    });
}

/**
 * Frame N = window with N planks. Horizontal walls stack planks top to
 * bottom; vertical walls (the `_v` variant) stack them left to right.
 */
function drawWindowPlanks(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number, vertical: boolean): void {
  rect(ctx, PLACEHOLDER_COLORS.windowGap, ox, oy, w, h);
  const across = vertical ? w : h;
  const along = vertical ? h : w;
  const thickness = Math.max(2, Math.floor(across / 8));
  const maxPlanks = 5;
  const gap = Math.floor((across - maxPlanks * thickness) / (maxPlanks + 1));
  for (let i = 0; i < Math.min(frame, maxPlanks); i++) {
    const offset = gap + i * (thickness + gap);
    // Alternate inset so the stack reads as nailed boards.
    const inset = i % 2 === 0 ? 1 : 3;
    const color = i % 2 === 0 ? COLORS.wood : '#7a5c35';
    if (vertical) {
      rect(ctx, color, ox + offset, oy + inset, thickness, along - inset * 2);
      rect(ctx, PLACEHOLDER_COLORS.plankNail, ox + offset + 1, oy + inset + 2, 1, 1);
      rect(ctx, PLACEHOLDER_COLORS.plankNail, ox + offset + 1, oy + along - inset - 3, 1, 1);
    } else {
      rect(ctx, color, ox + inset, oy + offset, along - inset * 2, thickness);
      rect(ctx, PLACEHOLDER_COLORS.plankNail, ox + inset + 2, oy + offset + 1, 1, 1);
      rect(ctx, PLACEHOLDER_COLORS.plankNail, ox + along - inset - 3, oy + offset + 1, 1, 1);
    }
  }
}

/**
 * Frame 0 = closed (with an amber padlock), frame 1 = open (transparent).
 * Light comes from the top-left, so the highlight sits on the top edge of
 * horizontal doors and on the left edge of vertical ones.
 */
function drawDoor(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number, vertical: boolean): void {
  if (frame !== 0) return;
  rect(ctx, PLACEHOLDER_COLORS.doorClosed, ox, oy, w, h);
  if (vertical) {
    rect(ctx, COLORS.door, ox, oy, 2, h);
    rect(ctx, COLORS.door, ox + w / 2, oy, 1, h);
  } else {
    rect(ctx, COLORS.door, ox, oy, w, 2);
    rect(ctx, COLORS.door, ox, oy + h / 2, w, 1);
  }
  rect(ctx, COLORS.amber, ox + w / 2 - 2, oy + h / 2 - 2, 4, 4);
  rect(ctx, COLORS.amberDark, ox + w / 2 - 2, oy + h / 2 + 1, 4, 1);
}

/**
 * Stairs seen from above: four steps getting lighter towards the top.
 * Frame 0 = closed (dark steps and the door padlock), frame 1 = open
 * (lit steps with an amber edge so it reads as usable).
 */
function drawPortal(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number): void {
  const open = frame !== 0;
  const steps = 4;
  const stepH = h / steps;
  for (let i = 0; i < steps; i++) {
    const color = open ? PLACEHOLDER_COLORS.stepLight : PLACEHOLDER_COLORS.stepDark;
    rect(ctx, color, ox + 2, oy + i * stepH, w - 4, stepH - 1);
    rect(ctx, open ? '#b7a382' : '#4a4137', ox + 2, oy + i * stepH, w - 4, 1);
  }
  if (open) {
    rect(ctx, COLORS.amber, ox + 1, oy, 1, h);
    rect(ctx, COLORS.amber, ox + w - 2, oy, 1, h);
  } else {
    rect(ctx, COLORS.amber, ox + w / 2 - 2, oy + h / 2 - 2, 4, 4);
    rect(ctx, COLORS.amberDark, ox + w / 2 - 2, oy + h / 2 + 1, 4, 1);
  }
}

/** Irregular blood splat; each frame is a different shape. */
type Blob = readonly [cx: number, cy: number, rx: number, ry: number];

interface GorePalette {
  dark: string;
  base: string;
  mid: string;
  sheen: string;
}

const ROTTEN: GorePalette = {
  dark: PLACEHOLDER_COLORS.bloodDark,
  base: PLACEHOLDER_COLORS.blood,
  mid: PLACEHOLDER_COLORS.bloodMid,
  sheen: PLACEHOLDER_COLORS.bloodSheen,
};
const FRESH: GorePalette = {
  dark: PLACEHOLDER_COLORS.freshDark,
  base: PLACEHOLDER_COLORS.fresh,
  mid: PLACEHOLDER_COLORS.freshMid,
  sheen: PLACEHOLDER_COLORS.freshSheen,
};

/**
 * Blood drawn from ellipses (offsets from the frame's centre): a dark rim,
 * the body, a lighter patch and a 1–2 px sheen towards the top left, so it
 * reads thick and wet. `dots` are loose drops around it.
 */
function drawGore(
  ctx: Ctx,
  ox: number,
  oy: number,
  w: number,
  h: number,
  blobs: readonly Blob[],
  dots: readonly (readonly [number, number])[] = [],
  palette: GorePalette = ROTTEN,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const inside = (x: number, y: number): boolean =>
    blobs.some(([bx, by, rx, ry]) => ((x + 0.5 - cx - bx) / rx) ** 2 + ((y + 0.5 - cy - by) / ry) ** 2 <= 1);
  const [mx = 0, my = 0, mrx = 1, mry = 1] = blobs[0] ?? [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      const rim = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
      // Position inside the main blob: lighter towards its upper left.
      const u = (x + 0.5 - cx - mx) / mrx;
      const v = (y + 0.5 - cy - my) / mry;
      let color = palette.base;
      if (rim) color = palette.dark;
      else if (u * u + v * v < 0.35 && u + v < -0.2) color = palette.mid;
      rect(ctx, color, ox + x, oy + y, 1, 1);
    }
  }
  // The sheen: one or two light pixels on the upper left of the main blob.
  const sx = Math.round(cx + mx - mrx * 0.35);
  const sy = Math.round(cy + my - mry * 0.35);
  if (inside(sx, sy)) rect(ctx, palette.sheen, ox + sx, oy + sy, 1, 1);
  if (mrx >= 3 && inside(sx + 1, sy)) rect(ctx, palette.sheen, ox + sx + 1, oy + sy, 1, 1);
  for (const [dx, dy] of dots) rect(ctx, palette.dark, ox + Math.round(cx + dx), oy + Math.round(cy + dy), 1, 1);
}

/** Pool of rotten blood left by a dead zombie (3 shapes). */
function drawBlood(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number): void {
  const shapes: readonly { blobs: Blob[]; dots: [number, number][] }[] = [
    { blobs: [[0, 0, 5.5, 3.6], [3.5, 1.5, 2.5, 2], [-4, -1.5, 2, 1.6]], dots: [[6.5, -2], [-6.5, 3]] },
    { blobs: [[-0.5, 0.5, 4.8, 3.2], [-3, -2, 2.6, 2], [3.5, 2.5, 2, 1.5]], dots: [[5.5, -3], [-6, 2.5], [1, 5]] },
    { blobs: [[0.5, -0.5, 4.2, 3.8], [-3.5, 2, 2.4, 1.8], [4, -2.5, 1.6, 1.4]], dots: [[-5.5, -3.5], [6, 3]] },
  ];
  const shape = shapes[frame % shapes.length];
  if (shape) drawGore(ctx, ox, oy, w, h, shape.blobs, shape.dots);
}

/** A thick drop of blood in flight: round, stretched (drawn towards +x; the view turns it) and small. */
function drawBloodDrop(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number, palette: GorePalette): void {
  const shapes: readonly Blob[][] = [[[0, 0, 2.3, 2.3]], [[0.5, 0, 2.9, 1.6], [-1.5, 0, 1.4, 1.4]], [[0, 0, 1.5, 1.5]]];
  drawGore(ctx, ox, oy, w, h, shapes[frame % shapes.length] ?? [], [], palette);
}

/** Where a drop lands: a small splat with a loose drop or two (3 shapes). */
function drawBloodSplat(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number, palette: GorePalette): void {
  const shapes: readonly { blobs: Blob[]; dots: [number, number][] }[] = [
    { blobs: [[0, 0, 2.8, 2], [1.8, 0.8, 1.4, 1.2]], dots: [[4, -2]] },
    { blobs: [[0, 0, 2.2, 2.2], [-1.6, 1, 1.3, 1]], dots: [[-4, -1], [3.5, 2.5]] },
    { blobs: [[0, 0, 3, 1.6]], dots: [[3.5, -2], [-3.5, 1.5]] },
  ];
  const shape = shapes[frame % shapes.length];
  if (shape) drawGore(ctx, ox, oy, w, h, shape.blobs, shape.dots, palette);
}

/** A small stain of fresh blood on the player's body, one with a drip (3 shapes). */
function drawBloodStain(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number): void {
  const shapes: readonly Blob[][] = [[[0, 0, 2, 1.6]], [[0, -0.5, 1.6, 1.6], [0, 1.5, 0.7, 1.2]], [[-0.5, 0, 2.2, 1.2], [1.2, 0.8, 1, 1]]];
  drawGore(ctx, ox, oy, w, h, shapes[frame % shapes.length] ?? [], [], FRESH);
}

/** Olive ammo box with three amber rounds. */
function drawAmmoPickup(ctx: Ctx, ox: number, oy: number, w: number, h: number): void {
  const x = ox + 2;
  const y = oy + 4;
  const bw = w - 4;
  const bh = h - 6;
  rect(ctx, COLORS.ink, x - 1, y - 1, bw + 2, bh + 2);
  rect(ctx, '#4b5a36', x, y, bw, bh);
  rect(ctx, '#6a8250', x, y, bw, 1);
  for (let i = 0; i < 3; i++) {
    const bx = x + 2 + i * 4;
    rect(ctx, COLORS.amber, bx, y - 3, 2, 4);
    rect(ctx, COLORS.amberDark, bx, y + 1, 2, 1);
  }
}

/** Bone-coloured kit with a red cross. */
function drawHealthPickup(ctx: Ctx, ox: number, oy: number, w: number, h: number): void {
  const x = ox + 2;
  const y = oy + 3;
  const bw = w - 4;
  const bh = h - 5;
  rect(ctx, COLORS.ink, x - 1, y - 1, bw + 2, bh + 2);
  rect(ctx, COLORS.bone, x, y, bw, bh);
  rect(ctx, COLORS.muted, x, y + bh - 2, bw, 2);
  const cx = x + bw / 2;
  const cy = y + (bh - 2) / 2;
  rect(ctx, COLORS.red, cx - 1, cy - 4, 3, 8);
  rect(ctx, COLORS.red, cx - 4, cy - 1, 9, 3);
}

/**
 * Bullet tracer, pointing right (+x = direction of travel): hot orange tail
 * to a white head, so it never blends with the amber aim line.
 */
function drawTracer(ctx: Ctx, ox: number, oy: number, w: number, h: number): void {
  const ramp = ['#ff4a12', '#ff8a1a', '#ffd23a', '#fff3b0', '#ffffff'];
  for (let x = 0; x < w; x++) {
    const color = ramp[Math.min(ramp.length - 1, Math.floor((x / w) * ramp.length))] ?? '#ffffff';
    rect(ctx, color, ox + x, oy, 1, h);
  }
}

/** Pixel muzzle flash: frame 0 a plus-shaped burst, frame 1 an x-shaped one. */
function drawMuzzleFlash(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number): void {
  const cx = ox + Math.floor(w / 2);
  const cy = oy + Math.floor(h / 2);
  const glow = 'rgba(232, 176, 74, 0.55)';
  if (frame % 2 === 0) {
    rect(ctx, glow, cx - 3, cy - 3, 6, 6);
    rect(ctx, COLORS.amber, cx - 5, cy - 1, 10, 2);
    rect(ctx, COLORS.amber, cx - 1, cy - 5, 2, 10);
  } else {
    rect(ctx, glow, cx - 2, cy - 2, 4, 4);
    for (let i = 1; i <= 4; i++) {
      rect(ctx, COLORS.amber, cx - 1 - i, cy - 1 - i, 2, 2);
      rect(ctx, COLORS.amber, cx - 1 + i, cy - 1 - i, 2, 2);
      rect(ctx, COLORS.amber, cx - 1 - i, cy - 1 + i, 2, 2);
      rect(ctx, COLORS.amber, cx - 1 + i, cy - 1 + i, 2, 2);
    }
  }
  rect(ctx, '#fff6d8', cx - 1, cy - 1, 2, 2);
}

/**
 * Furniture and clutter: a block in the colour of its material, lit from the
 * top left (light top edge, dark bottom edge), with a darker inner panel.
 */
function drawProp(ctx: Ctx, key: string, ox: number, oy: number, w: number, h: number): void {
  const base = propColor(key);
  const css = (rgb: [number, number, number]): string => `rgb(${rgb.join(',')})`;
  rect(ctx, css(shade(base, 0.55)), ox, oy, w, h);
  rect(ctx, base, ox + 1, oy + 1, w - 2, h - 2);
  rect(ctx, css(shade(base, 1.3)), ox + 1, oy + 1, w - 2, 2);
  rect(ctx, css(shade(base, 0.75)), ox + 1, oy + h - 3, w - 2, 2);
  if (w >= 12 && h >= 12) rect(ctx, css(shade(base, 0.85)), ox + 4, oy + 5, w - 8, h - 10);
}

/**
 * Provisional knife slash, drawn pointing right (+x; the view rotates it to
 * the slash's direction): an arc that sweeps from top to bottom and fades.
 * Pixel by pixel on a ring, so it reads as a swoosh rather than a box.
 */
function drawMeleeSlash(ctx: Ctx, frame: number, frames: number, ox: number, oy: number, w: number, h: number): void {
  const cx = ox + Math.floor(w * 0.3);
  const cy = oy + Math.floor(h / 2);
  // Frame f shows the sweep at (f + 1) / frames, so the first frame already shows a quarter of it.
  const t = (frame + 1) / Math.max(1, frames);
  // The lit part of the arc grows during the first half and the tail fades during the second.
  const from = -70 + Math.max(0, t - 0.5) * 2 * 120;
  const to = -70 + Math.min(1, t * 2) * 140;
  const fade = 1 - Math.max(0, t - 0.5) * 1.4;
  for (let deg = from; deg <= to; deg += 4) {
    const a = (deg * Math.PI) / 180;
    const edge = (deg - from) / Math.max(1, to - from); // brighter towards the leading edge
    for (let r = 9; r <= 13; r++) {
      const inner = r === 9 || r === 13;
      const alpha = (inner ? 0.35 : 0.85) * fade * (0.4 + 0.6 * edge);
      rect(ctx, `rgba(255, 246, 216, ${alpha.toFixed(2)})`, Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r), 1, 1);
    }
  }
}

/** Merchant placeholder (spec 03 §2): a rectangle of its colour with a 1 px darker outline. */
function drawMerchant(ctx: Ctx, color: string, ox: number, oy: number, w: number, h: number): void {
  rect(ctx, `rgb(${shade(color, 0.55).join(',')})`, ox, oy, w, h);
  rect(ctx, color, ox + 1, oy + 1, w - 2, h - 2);
}

/** A diamond in white, tinted with the merchant's colour at runtime. */
function drawGem(ctx: Ctx, ox: number, oy: number, w: number, h: number): void {
  for (let y = 0; y < h; y++) {
    const half = Math.ceil(Math.min(y + 1, h - y) * (w / h));
    rect(ctx, '#ffffff', ox + Math.floor(w / 2) - half, oy + y, half * 2, 1);
  }
}

/** Smoke puff in light greys (tinted at runtime): blobs that spread out and thin away over the frames. */
/**
 * A weapon case: dark brown cabinet with bluish glass and the weapon's
 * silhouette inside (frame = weapon in WEAPON_IDS order: pistol, SMG,
 * shotgun). Upright (`vertical`) for cases facing east or west, the front
 * on the right.
 */
function drawWeaponCase(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number, vertical: boolean): void {
  rect(ctx, '#2e1d12', ox, oy, w, h);
  rect(ctx, '#523522', ox + 1, oy + 1, w - 2, h - 2);
  // Glass on the front: the bottom part seen from above, or the right side when upright.
  const gx = vertical ? ox + 5 : ox + 2;
  const gy = vertical ? oy + 2 : oy + 4;
  const gw = vertical ? w - 7 : w - 4;
  const gh = vertical ? h - 4 : h - 6;
  rect(ctx, '#5f8ca8', gx, gy, gw, gh);
  rect(ctx, '#a6d2e6', gx + 1, gy + 1, vertical ? 2 : gw - 2, vertical ? gh - 2 : 2);
  // The weapon lying inside, dark against the glass.
  const silhouette = '#1d2226';
  const cx = gx + Math.floor(gw / 2);
  const cy = gy + Math.floor(gh / 2);
  const long = [8, 14, 18][frame] ?? 10;
  if (vertical) {
    rect(ctx, silhouette, cx - 1, cy - Math.floor(long / 2), 2, long);
    rect(ctx, silhouette, cx + 1, cy + 1, 2, 3);
  } else {
    rect(ctx, silhouette, cx - Math.floor(long / 2), cy - 1, long, 2);
    rect(ctx, silhouette, cx - Math.floor(long / 2), cy + 1, 3, 2);
    if (frame === 1) rect(ctx, silhouette, cx, cy + 1, 2, 3); // the SMG's magazine
    if (frame === 2) rect(ctx, silhouette, cx - Math.floor(long / 2) + 4, cy - 2, long - 4, 1); // the second barrel
  }
}

/** A small flame tongue: yellow core, orange body, dark red tip (3 shapes for the flicker). */
function drawFlame(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number): void {
  const lean = [0, 1, -1][frame % 3] ?? 0;
  const cx = Math.floor(w / 2);
  // From the bottom up: wide base, narrowing to a leaning tip.
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const half = Math.max(0, Math.round((w / 2) * (1 - t * 0.85)) - (y === h - 1 ? 1 : 0));
    const shift = Math.round(lean * t * 1.5);
    const row = oy + h - 1 - y;
    const color = t < 0.35 ? COLORS.fireLight : t < 0.8 ? COLORS.fire : '#8a1f0e';
    if (half > 0) rect(ctx, color, ox + cx - half + shift, row, half * 2, 1);
    else rect(ctx, color, ox + cx + shift, row, 1, 1);
  }
}

function drawSmokePuff(ctx: Ctx, frame: number, frames: number, ox: number, oy: number, w: number, h: number): void {
  const t = (frame + 1) / Math.max(1, frames);
  const cx = ox + w / 2;
  const cy = oy + h / 2;
  const spread = 2 + t * (w / 2 - 6);
  const radius = Math.max(1, 5 - t * 2.5);
  const alpha = 0.95 - t * 0.6;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + frame * 0.4;
    const bx = cx + Math.cos(a) * spread;
    const by = cy + Math.sin(a) * spread * 0.8;
    for (let y = -radius; y <= radius; y++) {
      for (let x = -radius; x <= radius; x++) {
        if (x * x + y * y > radius * radius) continue;
        const grey = y < 0 ? 255 : 215;
        rect(ctx, `rgba(${grey}, ${grey}, ${grey}, ${alpha.toFixed(2)})`, Math.round(bx + x), Math.round(by + y), 1, 1);
      }
    }
  }
}

/**
 * A special item (spec 05 §3): its HUD icon (ui/icons.ts) at 1×, centred in
 * the frame, frame `index` in ITEM_IDS order.
 */
function drawItemIcon(ctx: Ctx, index: number, ox: number, oy: number, w: number, h: number): void {
  const id = ITEM_IDS[index];
  if (!id) return;
  const def = iconDef(id);
  const dx = ox + Math.floor((w - def.w) / 2);
  const dy = oy + Math.floor((h - def.h) / 2);
  for (const [x, y, rw, rh, color] of def.rects) rect(ctx, color ?? def.fill, dx + x, dy + y, rw, rh);
}

/** Off-screen pointer: a white triangle towards +x with a dark outline, tinted at runtime. */
function drawOffscreenArrow(ctx: Ctx, ox: number, oy: number, w: number, h: number): void {
  for (let x = 0; x < w; x++) {
    const half = ((w - x) / w) * (h / 2);
    const y0 = Math.round(h / 2 - half);
    const y1 = Math.round(h / 2 + half);
    rect(ctx, COLORS.ink, ox + x, oy + y0, 1, Math.max(1, y1 - y0));
    if (x > 0 && x < w - 1 && y1 - y0 > 2) rect(ctx, '#ffffff', ox + x, oy + y0 + 1, 1, y1 - y0 - 2);
  }
}

export function createObjectPlaceholder(scene: Phaser.Scene, object: string, def: ObjectDef): void {
  createSheet(scene, objectTextureKey(object), def.frameWidth, def.frameHeight, def.frames, 1, (ctx, col, _row, ox, oy) => {
    const { frameWidth: w, frameHeight: h } = def;
    switch (object) {
      case ASSET_KEYS.windowPlanks:
      case ASSET_KEYS.windowPlanksV:
        drawWindowPlanks(ctx, col, ox, oy, w, h, object === ASSET_KEYS.windowPlanksV);
        break;
      case ASSET_KEYS.door:
      case ASSET_KEYS.doorV:
        drawDoor(ctx, col, ox, oy, w, h, object === ASSET_KEYS.doorV);
        break;
      case ASSET_KEYS.portal:
        drawPortal(ctx, col, ox, oy, w, h);
        break;
      case ASSET_KEYS.bullet:
        drawTracer(ctx, ox, oy, w, h);
        break;
      case ASSET_KEYS.aimDot:
        rect(ctx, COLORS.amber, ox, oy, w, h);
        break;
      case ASSET_KEYS.blood:
        drawBlood(ctx, col, ox, oy, w, h);
        break;
      case ASSET_KEYS.bloodDrop:
      case ASSET_KEYS.bloodDropFresh:
        drawBloodDrop(ctx, col, ox, oy, w, h, object === ASSET_KEYS.bloodDrop ? ROTTEN : FRESH);
        break;
      case ASSET_KEYS.bloodSplat:
      case ASSET_KEYS.bloodSplatFresh:
        drawBloodSplat(ctx, col, ox, oy, w, h, object === ASSET_KEYS.bloodSplat ? ROTTEN : FRESH);
        break;
      case ASSET_KEYS.bloodStain:
        drawBloodStain(ctx, col, ox, oy, w, h);
        break;
      case ASSET_KEYS.pickupAmmo:
        drawAmmoPickup(ctx, ox, oy, w, h);
        break;
      case ASSET_KEYS.pickupHealth:
        drawHealthPickup(ctx, ox, oy, w, h);
        break;
      case ASSET_KEYS.muzzleFlash:
        drawMuzzleFlash(ctx, col, ox, oy, w, h);
        break;
      case ASSET_KEYS.meleeSlash:
        drawMeleeSlash(ctx, col, def.frames, ox, oy, w, h);
        break;
      case ASSET_KEYS.merchantGem:
        drawGem(ctx, ox, oy, w, h);
        break;
      case ASSET_KEYS.smokePuff:
        drawSmokePuff(ctx, col, def.frames, ox, oy, w, h);
        break;
      case ASSET_KEYS.flame:
        drawFlame(ctx, col, ox, oy, w, h);
        break;
      case ASSET_KEYS.weaponCase:
      case ASSET_KEYS.weaponCaseV:
        drawWeaponCase(ctx, col, ox, oy, w, h, object === ASSET_KEYS.weaponCaseV);
        break;
      case ASSET_KEYS.offscreenArrow:
        drawOffscreenArrow(ctx, ox, oy, w, h);
        break;
      case ASSET_KEYS.item:
        drawItemIcon(ctx, col, ox, oy, w, h);
        break;
      default: {
        const merchant = MERCHANTS.find((m) => object === `merchant_${m.id}`);
        if (merchant) {
          drawMerchant(ctx, merchant.color, ox, oy, w, h);
          break;
        }
        if (object.startsWith('prop_')) {
          drawProp(ctx, object, ox, oy, w, h);
          break;
        }
        rect(ctx, PLACEHOLDER_COLORS.generic, ox, oy, w, h);
        rect(ctx, COLORS.ink, ox + 1, oy + 1, w - 2, h - 2);
      }
    }
  });
}

/** Tiles are painted from their properties: walls, water, void, or floor for the rest. */
export function createTilesetPlaceholder(scene: Phaser.Scene, tilesetKey: string, tileset: MapTileset): void {
  const columns = Math.max(1, tileset.columns);
  const rows = Math.max(1, Math.ceil(tileset.tileCount / columns));
  const tw = tileset.tileWidth;
  const th = tileset.tileHeight;
  createSheet(scene, tilesetTextureKey(tilesetKey), tw, th, columns, rows, (ctx, col, row, ox, oy) => {
    const flags = tileset.flags[row * columns + col] ?? 0;
    if (flags & TILE_COLLIDES) {
      rect(ctx, COLORS.wall, ox, oy, tw, th);
      rect(ctx, PLACEHOLDER_COLORS.wallTop, ox, oy, tw, 2);
      rect(ctx, '#4a3a2c', ox, oy + th - 1, tw, 1);
    } else if (flags & TILE_WATER) {
      rect(ctx, '#2b4530', ox, oy, tw, th);
      rect(ctx, '#3c5c40', ox + 6, oy + 9, 8, 1);
      rect(ctx, '#3c5c40', ox + 18, oy + 21, 7, 1);
    } else if (flags & TILE_VOID) {
      rect(ctx, '#090807', ox, oy, tw, th);
    } else {
      rect(ctx, COLORS.floor, ox, oy, tw, th);
      rect(ctx, PLACEHOLDER_COLORS.floorGrid, ox, oy, tw, 1);
      rect(ctx, PLACEHOLDER_COLORS.floorGrid, ox, oy, 1, th);
      rect(ctx, '#463c30', ox + 12, oy + 14, 3, 1);
      rect(ctx, '#342d25', ox + 22, oy + 24, 2, 1);
    }
  });
}
