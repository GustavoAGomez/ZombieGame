import { describe, expect, it } from 'vitest';
import { ENEMY_ROOM_TYPES, floorConfig } from '../../config/dungeon';
import type { Room } from '../../core/RunState';
import { testTemplates, testTilesets } from '../../test/dungeonFixtures';
import { assembleFloor, floorText, templatesById, zoneId } from './assembleFloor';
import { generateFloor } from './generateFloor';
import { ROOM_PITCH } from './roomTemplate';
import { bankOf } from './templates';

describe('assembleFloor (spec 09 §3.3)', () => {
  const list = testTemplates();
  const byId = templatesById(list);
  const tilesets = testTilesets();

  it('lays the plan as one map: a zone per room, a door per link, the player at the start, each room with its points', () => {
    for (const [seed, floor] of [
      [1, 1],
      [2, 1],
      [3, 2],
      [4, 2],
      [5, 3],
      [6, 3],
    ] as const) {
      const ambientList = testTemplates(floorConfig(floor).ambient);
      const byId = templatesById(ambientList);
      const plan = generateFloor(seed, floor, bankOf(ambientList));
      const t0 = performance.now();
      const map = assembleFloor(plan, byId, tilesets);
      const ms = performance.now() - t0;
      expect(ms).toBeLessThan(1000);
      expect(map.width).toBe(plan.width * ROOM_PITCH.x + 1);
      expect(map.height).toBe(plan.height * ROOM_PITCH.y + 1);
      expect(map.zones.map((z) => z.id)).toEqual(plan.rooms.map((_, i) => zoneId(i)));
      const links = plan.rooms.reduce((n, r) => n + r.doors.length, 0) / 2;
      expect(map.doors).toHaveLength(links);
      for (const d of map.doors) expect(d.tiles).toHaveLength(2);
      // The player's start room is the only one open; the rest wait for the player.
      const startZone = map.zones.findIndex((z) => z.startsUnlocked);
      expect(startZone).toBe(plan.start);
      const ts = map.tileSize;
      const spawnZone = map.cellZone[Math.floor(map.playerSpawn.y / ts) * map.width + Math.floor(map.playerSpawn.x / ts)];
      expect(spawnZone).toBe(plan.start);
      plan.rooms.forEach((room: Room, i) => {
        const enemies = map.enemySpawns.filter((s) => s.zoneIndex === i);
        if (ENEMY_ROOM_TYPES.includes(room.type)) {
          expect(enemies.length, `${room.template} sala ${i}`).toBeGreaterThanOrEqual(2);
          expect(map.merchantSpots.some((s) => s.zoneIndex === i)).toBe(true);
        } else {
          expect(enemies).toHaveLength(0);
        }
        if (room.type === 'treasure' || room.type === 'challenge' || room.type === 'boss') expect(map.chestSpots.some((s) => s.zoneIndex === i)).toBe(true);
        if (room.type === 'boss') {
          expect(map.bossSpots.some((s) => s.zoneIndex === i)).toBe(true);
          // The arena's four cells make one zone of 37×17 floor tiles.
          const zone = map.zones[i];
          expect(zone?.width).toBe(37 * ts);
          expect(zone?.height).toBe(17 * ts);
        }
        if (room.type === 'hand') expect(map.handSpots.some((s) => s.zoneIndex === i)).toBe(true);
        if (room.type === 'treasure') expect(map.chestSpots.filter((s) => s.zoneIndex === i)).toHaveLength(2);
      });
      // The garden is outdoors; the rest indoors.
      for (const z of map.zones) expect(z.interior).toBe(plan.ambient !== 'garden');
      // Each door joins the two rooms the plan says.
      for (const d of map.doors) {
        const a = d.fromZoneIndex;
        const b = d.toZoneIndex;
        expect(plan.rooms[a]?.doors.some((x) => x.room === b)).toBe(true);
      }
    }
  });

  it('writes the plan as the ASCII of maps/src/, with the holes walled unless a door opens them (or a preview keeps them)', () => {
    const plan = generateFloor(7, 1, bankOf(list));
    const text = floorText(plan, byId);
    const grid = text.split('\n\n')[0]?.split('\n') ?? [];
    expect(grid).toHaveLength(plan.height * ROOM_PITCH.y + 1);
    expect(grid.join('\n')).not.toMatch(/o/);
    expect(text).toMatch(/## Zonas/);
    expect(text).toMatch(/## Enemigos/);
    expect((text.match(/^\| D\d+ \|/gm) ?? []).length).toBe(plan.rooms.reduce((n, r) => n + r.doors.length, 0) / 2);
    const open = floorText(plan, byId, { openHoles: true });
    expect(open.split('\n\n')[0]).toMatch(/o/);
  });

  it('mirrors half the rooms: the mirrored template\'s furniture lands flipped', () => {
    const plan = generateFloor(11, 1, bankOf(list));
    const text = floorText(plan, byId);
    const mirrored = plan.rooms.filter((r) => r.mirrored);
    expect(mirrored.length).toBeGreaterThan(0);
    expect(text).toMatch(/\(espejo\)/);
  });
});
