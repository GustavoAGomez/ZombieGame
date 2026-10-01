import type Phaser from 'phaser';
import { COLORS } from '../../config/theme';
import { TILE_COLLIDES, TILE_VOID, TILE_WATER, type MapTileset } from '../map/MapLoader';
import {
  ASSET_KEYS,
  DIRECTIONS_4,
  DIRECTIONS_8,
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
  blood: '#5e1c16',
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
  const names = def.directions === 8 ? DIRECTIONS_8 : DIRECTIONS_4;
  const anchorX = Math.round(def.frameWidth * def.anchor.x);
  const anchorY = Math.round(def.frameHeight * def.anchor.y);

  createSheet(scene, characterTextureKey(character, animation), def.frameWidth, def.frameHeight, anim.frames, names.length,
    (ctx, col, row, ox, oy) => {
      const [dx, dy] = DIR_OFFSETS[names[row] ?? 'south'] ?? [0, 1];
      const [fx, fy, alpha] = frameOffset(animation, col, dx, dy);
      ctx.globalAlpha = alpha;
      // The 14×14 body stands on the anchor (the feet / hitbox centre), like
      // the final 3/4 art, so bullets drawn at gun height cross it.
      const x = ox + anchorX - BODY_SIZE / 2 + fx;
      const y = oy + anchorY - BODY_SIZE + fy;
      rect(ctx, 'rgba(15,14,12,0.5)', x, y + BODY_SIZE, BODY_SIZE, 1);
      if (look.outline) rect(ctx, look.outline, x - 1, y - 1, BODY_SIZE + 2, BODY_SIZE + 2);
      rect(ctx, look.body, x, y, BODY_SIZE, BODY_SIZE);
      rect(ctx, look.shade, x, y + BODY_SIZE - 3, BODY_SIZE, 3);
      const cx = x + BODY_SIZE / 2;
      const cy = y + BODY_SIZE / 2;
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
function drawBlood(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number): void {
  const cx = ox + w / 2;
  const cy = oy + h / 2;
  const shapes: readonly (readonly [number, number, number, number])[][] = [
    [[-4, -2, 8, 4], [-2, -4, 4, 8], [3, 2, 3, 2], [-6, 1, 2, 2]],
    [[-5, -1, 9, 3], [-3, -3, 5, 6], [4, -4, 2, 2], [-2, 3, 3, 2]],
    [[-3, -3, 6, 6], [-5, 0, 3, 2], [2, 2, 4, 3], [0, -5, 2, 2]],
  ];
  for (const [x, y, rw, rh] of shapes[frame % shapes.length] ?? []) rect(ctx, PLACEHOLDER_COLORS.blood, cx + x, cy + y, rw, rh);
  rect(ctx, '#3f120e', cx - 1, cy - 1, 2, 2);
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
      case ASSET_KEYS.pickupAmmo:
        drawAmmoPickup(ctx, ox, oy, w, h);
        break;
      case ASSET_KEYS.pickupHealth:
        drawHealthPickup(ctx, ox, oy, w, h);
        break;
      case ASSET_KEYS.muzzleFlash:
        drawMuzzleFlash(ctx, col, ox, oy, w, h);
        break;
      default:
        rect(ctx, PLACEHOLDER_COLORS.generic, ox, oy, w, h);
        rect(ctx, COLORS.ink, ox + 1, oy + 1, w - 2, h - 2);
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
