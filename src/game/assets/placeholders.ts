import type Phaser from 'phaser';
import { COLORS } from '../../config/theme';
import type { MapTileset } from '../map/MapLoader';
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
      // The 14×14 body is centred on the anchor, which is the hitbox centre.
      const x = ox + anchorX - BODY_SIZE / 2 + fx;
      const y = oy + anchorY - BODY_SIZE / 2 + fy;
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

/** Frame N = window with N planks, drawn for a horizontal wall. */
function drawWindowPlanks(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number): void {
  rect(ctx, PLACEHOLDER_COLORS.windowGap, ox, oy, w, h);
  const plankHeight = Math.max(2, Math.floor(h / 8));
  const maxPlanks = 5;
  const gap = Math.floor((h - maxPlanks * plankHeight) / (maxPlanks + 1));
  for (let i = 0; i < Math.min(frame, maxPlanks); i++) {
    const y = oy + gap + i * (plankHeight + gap);
    // Alternate inset so the stack reads as nailed boards.
    const inset = i % 2 === 0 ? 1 : 3;
    rect(ctx, i % 2 === 0 ? COLORS.wood : '#7a5c35', ox + inset, y, w - inset * 2, plankHeight);
    rect(ctx, PLACEHOLDER_COLORS.plankNail, ox + inset + 2, y + 1, 1, 1);
    rect(ctx, PLACEHOLDER_COLORS.plankNail, ox + w - inset - 3, y + 1, 1, 1);
  }
}

/** Frame 0 = closed (with an amber padlock), frame 1 = open (transparent). */
function drawDoor(ctx: Ctx, frame: number, ox: number, oy: number, w: number, h: number): void {
  if (frame !== 0) return;
  rect(ctx, PLACEHOLDER_COLORS.doorClosed, ox, oy, w, h);
  rect(ctx, COLORS.door, ox, oy, w, 2);
  rect(ctx, COLORS.door, ox, oy + h / 2, w, 1);
  rect(ctx, COLORS.amber, ox + w / 2 - 2, oy + h / 2 - 2, 4, 4);
  rect(ctx, COLORS.amberDark, ox + w / 2 - 2, oy + h / 2 + 1, 4, 1);
}

export function createObjectPlaceholder(scene: Phaser.Scene, object: string, def: ObjectDef): void {
  createSheet(scene, objectTextureKey(object), def.frameWidth, def.frameHeight, def.frames, 1, (ctx, col, _row, ox, oy) => {
    if (object === ASSET_KEYS.windowPlanks) drawWindowPlanks(ctx, col, ox, oy, def.frameWidth, def.frameHeight);
    else if (object === ASSET_KEYS.door) drawDoor(ctx, col, ox, oy, def.frameWidth, def.frameHeight);
    else if (object === ASSET_KEYS.bullet || object === ASSET_KEYS.aimDot) {
      rect(ctx, COLORS.amber, ox, oy, def.frameWidth, def.frameHeight);
    } else {
      rect(ctx, PLACEHOLDER_COLORS.generic, ox, oy, def.frameWidth, def.frameHeight);
      rect(ctx, COLORS.ink, ox + 1, oy + 1, def.frameWidth - 2, def.frameHeight - 2);
    }
  });
}

/** Tiles that collide are painted as walls, everything else as floor. */
export function createTilesetPlaceholder(scene: Phaser.Scene, tilesetKey: string, tileset: MapTileset): void {
  const columns = Math.max(1, tileset.columns);
  const rows = Math.max(1, Math.ceil(tileset.tileCount / columns));
  const tw = tileset.tileWidth;
  const th = tileset.tileHeight;
  createSheet(scene, tilesetTextureKey(tilesetKey), tw, th, columns, rows, (ctx, col, row, ox, oy) => {
    const id = row * columns + col;
    if (tileset.collides.has(id)) {
      rect(ctx, COLORS.wall, ox, oy, tw, th);
      rect(ctx, PLACEHOLDER_COLORS.wallTop, ox, oy, tw, 2);
      rect(ctx, '#4a3a2c', ox, oy + th - 1, tw, 1);
    } else {
      rect(ctx, COLORS.floor, ox, oy, tw, th);
      rect(ctx, PLACEHOLDER_COLORS.floorGrid, ox, oy, tw, 1);
      rect(ctx, PLACEHOLDER_COLORS.floorGrid, ox, oy, 1, th);
      rect(ctx, '#463c30', ox + 12, oy + 14, 3, 1);
      rect(ctx, '#342d25', ox + 22, oy + 24, 2, 1);
    }
  });
}
